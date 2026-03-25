/**
 * Auth commands: device-flow OAuth, status check, revoke.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getConfig } from './shared';
import { getEnabledLarkAccounts } from '../../core/accounts';
import { requestDeviceAuthorization, pollDeviceToken } from '../../core/device-flow';
import { getStoredToken } from '../../core/token-store';

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
          outputResult({
            success: true,
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
          // Try to find any stored token for this account
          const stored = await getStoredToken(account.appId, '');
          // Note: getStoredToken needs userOpenId which we don't have in CLI context.
          // For status check, we just report account config.
          results.push({
            account_id: account.accountId,
            configured: !!(account.appId && account.appSecret),
            brand: account.brand,
          });
        }
        outputResult(results);
      } catch (err) { outputError(err); }
    });
}
