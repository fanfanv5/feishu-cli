/**
 * User commands: get user info, search users.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, withAutoAuth } from './shared.js';

export function registerUserCommands(parent: Command): void {
  const user = parent.command('user').description('User operations');

  user
    .command('get [user_id]')
    .description('Get user info (own info if user_id omitted)')
    .option('--user_id_type <type>', 'User ID type: open_id|union_id|user_id')
    .action(async (userId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        if (!userId) {
          // Get current user info
          try {
            const result = await client.invoke(
              'feishu_get_user.default',
              (sdk, sdkOpts) => sdk.authen.userInfo.get({}, sdkOpts || {}),
              { as: 'user' },
            );
            outputResult(result.data);
          } catch (invokeErr: unknown) {
            if (isErrorCode41050(invokeErr)) {
              outputResult({
                error:
                  '无权限查询该用户信息。\n\n' +
                  '说明：使用用户身份调用通讯录 API 时，可操作的权限范围不受应用的通讯录权限范围影响，' +
                  '而是受当前用户的组织架构可见范围影响。该范围限制了用户在企业内可见的组织架构数据范围。',
              });
              return;
            }
            throw invokeErr;
          }
        } else {
          // Get specific user info
          const userIdType = opts.user_id_type || 'open_id';
          try {
            const result = await client.invoke(
              'feishu_get_user.default',
              (sdk, sdkOpts) =>
                sdk.contact.v3.user.get(
                  {
                    path: { user_id: userId },
                    params: { user_id_type: userIdType as any },
                  },
                  sdkOpts || {},
                ),
              { as: 'user' },
            );
            outputResult({ user: result.data?.user });
          } catch (invokeErr: unknown) {
            if (isErrorCode41050(invokeErr)) {
              outputResult({
                error:
                  '无权限查询该用户信息。\n\n' +
                  '说明：使用用户身份调用通讯录 API 时，可操作的权限范围不受应用的通讯录权限范围影响，' +
                  '而是受当前用户的组织架构可见范围影响。该范围限制了用户在企业内可见的组织架构数据范围。\n\n' +
                  '建议：请联系管理员调整当前用户的组织架构可见范围，或使用应用身份（tenant_access_token）调用 API。',
              });
              return;
            }
            throw invokeErr;
          }
        }
      });
    });

  user
    .command('search')
    .description('Search users by keyword')
    .requiredOption('--query <text>', 'Search keyword (name, phone, email)')
    .option('--page_size <n>', 'Page size (max 200)')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const query: Record<string, string> = {
          query: opts.query,
          page_size: String(opts.page_size ?? 20),
        };
        if (opts.page_token) query.page_token = opts.page_token;
        const result = await client.invokeByPath(
          'feishu_search_user.default',
          '/open-apis/search/v1/user',
          { method: 'GET', query, as: 'user' },
        );
        outputResult(result.data);
      });
    });
}

/**
 * Check if error is code 41050 (user organization visibility restriction).
 */
function isErrorCode41050(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Check common error response structures
    if (e.response && typeof e.response === 'object') {
      const response = e.response as Record<string, unknown>;
      if (response.data && typeof response.data === 'object') {
        const data = response.data as Record<string, unknown>;
        return data.code === 41050;
      }
    }
    // Check direct error code
    if (e.code === 41050) return true;
  }
  return false;
}
