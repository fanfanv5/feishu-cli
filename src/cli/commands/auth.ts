/**
 * Auth commands: device-flow OAuth, status check, revoke.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getConfig } from './shared';
import { getEnabledLarkAccounts } from '../../core/accounts';
import { requestDeviceAuthorization, pollDeviceToken } from '../../core/device-flow';
import { setStoredToken, findTokenForApp, tokenStatus } from '../../core/token-store';
import { feishuFetch } from '../../core/feishu-fetch';
import { openPlatformDomain } from '../../core/domains';

export function registerAuthCommands(parent: Command): void {
  const auth = parent.command('auth').description('Authentication management');

  auth
    .command('device-flow')
    .description('Start OAuth device authorization flow')
    .option('--scope <scope>', 'Scopes to request (space-separated)')
    .action(async (opts) => {
      try {
        const config = getConfig();
        const accounts = getEnabledLarkAccounts(config);
        if (accounts.length === 0) {
          outputError(new Error('No enabled Feishu accounts found'));
          return;
        }
        const account = accounts[0];
        if (!account.appId || !account.appSecret) {
          outputError(new Error('Account missing appId or appSecret'));
          return;
        }

        console.error(`Starting device authorization for account: ${account.accountId}`);
        console.error(`Brand: ${account.brand}`);

        const deviceAuth = await requestDeviceAuthorization({
          appId: account.appId,
          appSecret: account.appSecret,
          brand: account.brand,
          scope: opts.scope,
        });

        console.error('');
        console.error('=== Device Authorization ===');
        console.error(`User code: ${deviceAuth.userCode}`);
        console.error(`Verification URL: ${deviceAuth.verificationUriComplete}`);
        console.error(`Expires in: ${Math.round(deviceAuth.expiresIn / 60)} minutes`);
        console.error('');
        console.error('Please open the URL above and enter the user code to authorize.');
        console.error('Waiting for authorization...');

        const tokenResult = await pollDeviceToken({
          appId: account.appId,
          appSecret: account.appSecret,
          brand: account.brand,
          deviceCode: deviceAuth.deviceCode,
          interval: deviceAuth.interval,
          expiresIn: deviceAuth.expiresIn,
        });

        if (tokenResult.ok) {
          let userOpenId: string | undefined;
          try {
            const baseUrl = openPlatformDomain(account.brand);
            const meResp = await feishuFetch(`${baseUrl}/open-apis/authen/v1/user_info`, {
              headers: { Authorization: `Bearer ${tokenResult.token.accessToken}` },
            });
            const meData = (await meResp.json()) as Record<string, unknown>;
            if (meData.code === 0 && meData.data) {
              userOpenId = (meData.data as Record<string, unknown>).open_id as string;
            }
          } catch (infoErr) {
            console.error(`Warning: failed to fetch user info: ${infoErr instanceof Error ? infoErr.message : infoErr}`);
          }

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

          outputResult({
            success: true,
            user_open_id: userOpenId,
            scope: tokenResult.token.scope,
            expires_in: tokenResult.token.expiresIn,
            refresh_expires_in: tokenResult.token.refreshExpiresIn,
          });
        } else {
          const fail = tokenResult as { ok: false; error: string; message: string };
          outputError(new Error(`Authorization failed: ${fail.error} - ${fail.message}`));
        }
      } catch (err) { outputError(err); }
    });

  auth
    .command('status')
    .description('Check authentication status')
    .action(async () => {
      try {
        const config = getConfig();
        const accounts = getEnabledLarkAccounts(config);
        if (accounts.length === 0) {
          outputResult({ authenticated: false, error: 'No enabled accounts' });
          return;
        }

        const results = [];
        for (const account of accounts) {
          if (!account.appId) {
            results.push({
              account_id: account.accountId,
              authenticated: false,
              error: 'Missing appId',
            });
            continue;
          }

          const stored = await findTokenForApp(account.appId);
          if (!stored) {
            results.push({
              account_id: account.accountId,
              brand: account.brand,
              authenticated: false,
              token_status: 'none',
            });
            continue;
          }

          const status = tokenStatus(stored);
          results.push({
            account_id: account.accountId,
            brand: account.brand,
            authenticated: status !== 'expired',
            token_status: status,
            user_open_id: stored.userOpenId,
            scope: stored.scope,
            access_token_expires_at: new Date(stored.expiresAt).toISOString(),
            refresh_token_expires_at: new Date(stored.refreshExpiresAt).toISOString(),
          });
        }
        outputResult(results);
      } catch (err) { outputError(err); }
    });
}
