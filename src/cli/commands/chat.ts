/**
 * Chat commands: get chat info, search chats, list/add/remove members.
 */
import type { Command } from 'commander';
import { outputResult, getToolClient, withAutoAuth } from './shared.js';

export function registerChatCommands(parent: Command): void {
  const chat = parent.command('chat').description('Chat (group) management');

  chat
    .command('get <chat_id>')
    .description('Get chat info')
    .option('--user_id_type <type>', 'User ID type: open_id|union_id|user_id')
    .action(async (chatId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const userIdType = opts.user_id_type || 'open_id';
        const result = await client.invoke(
          'feishu_chat.get',
          (sdk, sdkOpts) =>
            sdk.im.v1.chat.get(
              {
                path: { chat_id: chatId },
                params: { user_id_type: userIdType },
              },
              {
                ...(sdkOpts || {}),
                headers: {
                  ...((sdkOpts as any)?.headers ?? {}),
                  'X-Chat-Custom-Header': 'enable_chat_list_security_check',
                },
              } as any,
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  chat
    .command('search')
    .description('Search chats by keyword')
    .requiredOption('--query <text>', 'Search keyword')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--user_id_type <type>', 'User ID type: open_id|union_id|user_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_chat.search',
          (sdk, sdkOpts) =>
            sdk.im.v1.chat.search(
              {
                params: {
                  user_id_type: opts.user_id_type || 'open_id',
                  query: opts.query,
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  chat
    .command('members <chat_id>')
    .description('List chat members')
    .option('--member_id_type <type>', 'Member ID type: open_id|union_id|user_id')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (chatId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_chat_members.default',
          (sdk, sdkOpts) =>
            sdk.im.v1.chatMembers.get(
              {
                path: { chat_id: chatId },
                params: {
                  member_id_type: opts.member_id_type || 'open_id',
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                },
              },
              {
                ...(sdkOpts || {}),
                headers: {
                  ...((sdkOpts as any)?.headers ?? {}),
                  'X-Chat-Custom-Header': 'enable_chat_list_security_check',
                },
              } as any,
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });
}
