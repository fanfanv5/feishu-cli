/**
 * Shared utilities for CLI commands.
 */

import type { Command } from 'commander';
import type { ClawdbotConfig } from '../../shim/plugin-sdk';
import { loadConfig } from '../config';
import { getEnabledLarkAccounts, getLarkAccount } from '../../core/accounts';
import { LarkClient } from '../../core/lark-client';
import { createToolClient, ToolClient } from '../../core/tool-client';
import { NeedAuthorizationError, UserAuthRequiredError, UserScopeInsufficientError } from '../../core/auth-errors';
import { requestDeviceAuthorization, pollDeviceToken } from '../../core/device-flow';
import { setStoredToken } from '../../core/token-store';
import { feishuFetch } from '../../core/feishu-fetch';
import { getAppGrantedScopes } from '../../core/app-scope-checker';
import { openPlatformDomain } from '../../core/domains';

/**
 * Output a result as JSON to stdout.
 */
export function outputResult(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Output an error and exit.
 */
export function outputError(error: unknown, exitCode = 1): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: msg }, null, 2));
  process.exit(exitCode);
}

/**
 * Execute an async action with automatic OAuth device flow on auth errors.
 * All CLI commands should use this wrapper.
 */
export async function withAutoAuth(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (shouldTriggerDeviceFlow(err)) {
      console.error(`Auth error: ${err instanceof Error ? err.message : String(err)}`);
      const ok = await runDeviceFlow();
      if (ok) {
        try {
          await action();
          return;
        } catch (retryErr) {
          outputError(retryErr);
          return;
        }
      }
    }
    outputError(err);
  }
}

/**
 * Get the loaded config.
 */
export function getConfig(): ClawdbotConfig {
  return loadConfig();
}

/**
 * Create a ToolClient for the specified (or default) account.
 */
export function getToolClient(accountId?: string, accountIndex = 0): ToolClient {
  const config = loadConfig();
  return createToolClient(config, accountIndex);
}

/**
 * Get the first enabled LarkClient.
 */
export function getLarkClientInstance(accountIndex = 0) {
  const config = loadConfig();
  const accounts = getEnabledLarkAccounts(config);
  if (accounts.length === 0) {
    throw new Error('No enabled Feishu accounts. Check your config.');
  }
  const account = accounts[accountIndex];
  return LarkClient.fromAccount(account);
}

/**
 * Parse a JSON string from a CLI argument.
 */
export function parseJsonArg(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Run OAuth device flow and return true on success.
 * Queries the app's user-level scopes from the API and passes them to the
 * device flow so the user authorizes all required permissions at once.
 */
async function runDeviceFlow(): Promise<boolean> {
  try {
    const config = loadConfig();
    const accounts = getEnabledLarkAccounts(config);
    if (accounts.length === 0) return false;
    const account = accounts[0];
    if (!account.appId || !account.appSecret) return false;

    // Query app's user-level scopes to pass to device flow
    let userScopes = '';
    try {
      const sdk = LarkClient.fromAccount(account).sdk;
      const scopes = await getAppGrantedScopes(sdk, account.appId, 'user');
      if (scopes.length > 0) {
        userScopes = scopes.join(' ');
      }
    } catch {
      // If query fails, fall back to no specific scope
    }

    console.error('Authorization required. Starting device flow...');
    const deviceAuth = await requestDeviceAuthorization({
      appId: account.appId,
      appSecret: account.appSecret,
      brand: account.brand,
      scope: userScopes || undefined,
    });

    console.error(`User code: ${deviceAuth.userCode}`);
    console.error(`URL: ${deviceAuth.verificationUriComplete}`);
    console.error('Waiting for authorization...');

    // Open browser automatically
    const { exec } = await import('child_process');
    const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${deviceAuth.verificationUriComplete}"`);

    const tokenResult = await pollDeviceToken({
      appId: account.appId,
      appSecret: account.appSecret,
      brand: account.brand,
      deviceCode: deviceAuth.deviceCode,
      interval: deviceAuth.interval,
      expiresIn: deviceAuth.expiresIn,
    });

    if (tokenResult.ok) {
      // Store token: need userOpenId from authen API
      try {
        const baseUrl = openPlatformDomain(account.brand);
        const meResp = await feishuFetch(`${baseUrl}/open-apis/authen/v1/user_info`, {
          headers: { Authorization: `Bearer ${tokenResult.token.accessToken}` },
        });
        const meData = (await meResp.json()) as Record<string, unknown>;
        if (meData.code === 0 && meData.data) {
          const userInfo = meData.data as Record<string, unknown>;
          const userOpenId = userInfo.open_id as string;
          if (userOpenId) {
            await setStoredToken({
              userOpenId,
              appId: account.appId,
              accessToken: tokenResult.token.accessToken,
              refreshToken: tokenResult.token.refreshToken,
              expiresAt: Date.now() + tokenResult.token.expiresIn * 1000,
              refreshExpiresAt: Date.now() + tokenResult.token.refreshExpiresIn * 1000,
              scope: tokenResult.token.scope,
              grantedAt: Date.now(),
            });
            console.error(`Token stored for user ${userOpenId}`);
          }
        }
      } catch (storeErr) {
        console.error(`Warning: failed to store token: ${storeErr instanceof Error ? storeErr.message : storeErr}`);
      }
      console.error('Authorization successful! Retrying...');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if an error means "user not logged in" or "token expired beyond refresh".
 *
 * ONLY these two cases should trigger device flow:
 *   1. No stored token at all (user never logged in)
 *   2. Token AND refresh_token both expired (need re-login)
 *
 * Everything else (API errors, insufficient scope, SDK bugs, network issues)
 * must be reported directly — NEVER trigger auth.
 */
function shouldTriggerDeviceFlow(err: unknown): boolean {
  // No token or refresh_token expired → uat-client throws this
  if (err instanceof NeedAuthorizationError) return true;
  // Same condition, thrown from tool-client when UAT unavailable
  if (err instanceof UserAuthRequiredError) return true;
  // String form of the same error (e.g. from JSON-serialized context)
  if (err instanceof Error && err.message === 'need_user_authorization') return true;
  // Scope insufficient = app needs more permissions from admin, NOT an auth issue
  // API errors / SDK bugs / network issues = never trigger auth
  return false;
}

/**
 * Register a sub-command with common error handling wrapper.
 * Automatically triggers device flow on auth errors.
 */
export function registerSubCommand(
  parent: Command,
  name: string,
  description: string,
  action: (...args: any[]) => Promise<void>,
): Command {
  return parent.command(name).description(description).action(async (...args) => {
    try {
      await action(...args);
    } catch (err) {
      if (shouldTriggerDeviceFlow(err)) {
        console.error(`Auth error: ${err instanceof Error ? err.message : String(err)}`);
        const ok = await runDeviceFlow();
        if (ok) {
          try {
            await action(...args);
            return;
          } catch (retryErr) {
            outputError(retryErr);
            return;
          }
        }
      }
      outputError(err);
    }
  });
}
