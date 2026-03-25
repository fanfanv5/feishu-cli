/**
 * IM commands: send/reply messages, get/search messages, fetch resources.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, withAutoAuth } from './shared.js';
import { parseTimeRangeToSeconds } from '../../tools/oapi/im/time-utils.js';

// Re-export assertLarkOk from core/api-error
import { assertLarkOk } from '../../core/api-error.js';

// User name cache for UAT
const userNameCache = new Map<string, Map<string, { name: string; expireAt: number }>>();
const USER_NAME_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 500;

function getUserNameCache(accountId: string): Map<string, { name: string; expireAt: number }> {
  let cache = userNameCache.get(accountId);
  if (!cache) {
    cache = new Map();
    userNameCache.set(accountId, cache);
  }
  return cache;
}

function getUserNameFromCache(accountId: string, openId: string): string | undefined {
  const cache = getUserNameCache(accountId);
  const entry = cache.get(openId);
  if (!entry) return undefined;
  if (entry.expireAt <= Date.now()) {
    cache.delete(openId);
    return undefined;
  }
  // LRU refresh
  cache.delete(openId);
  cache.set(openId, entry);
  return entry.name;
}

function setUserNameCache(accountId: string, entries: Map<string, string>): void {
  const cache = getUserNameCache(accountId);
  const now = Date.now();
  for (const [openId, name] of entries) {
    cache.delete(openId);
    cache.set(openId, { name, expireAt: now + USER_NAME_TTL_MS });
  }
  // Evict if over limit
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function batchResolveUserNames(client: any, openIds: string[], accountId: string): Promise<void> {
  if (openIds.length === 0) return;

  const BATCH_SIZE = 10;
  const cache = getUserNameCache(accountId);
  const missing = openIds.filter((id) => getUserNameFromCache(accountId, id) === undefined);

  if (missing.length === 0) return;

  const uniqueMissing = [...new Set(missing)];
  const result = new Map<string, string>();

  for (let i = 0; i < uniqueMissing.length; i += BATCH_SIZE) {
    const chunk = uniqueMissing.slice(i, i + BATCH_SIZE);
    try {
      const res: any = await client.invoke(
        'feishu_get_user.basic_batch',
        (sdk: any, opts: any) =>
          (sdk as any).request(
            {
              method: 'POST',
              url: '/open-apis/contact/v3/users/basic_batch',
              data: { user_ids: chunk },
              params: { user_id_type: 'open_id' },
            },
            opts,
          ),
        { as: 'user' },
      );

      const users: any[] = res?.data?.users ?? [];
      for (const user of users) {
        const openId: string | undefined = user.user_id;
        const rawName = user.name;
        const name: string | undefined = typeof rawName === 'string' ? rawName : rawName?.value;
        if (openId && name) {
          cache.delete(openId);
          cache.set(openId, { name, expireAt: Date.now() + USER_NAME_TTL_MS });
          result.set(openId, name);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve user names: ${err}`);
    }
  }
}

// MIME type to extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'text/plain': '.txt',
  'application/json': '.json',
};

export function registerImCommands(parent: Command): void {
  const im = parent.command('im').description('IM message operations');

  im
    .command('send')
    .description('Send a message')
    .requiredOption('--receive_id_type <type>', 'Receiver ID type: open_id|chat_id')
    .requiredOption('--receive_id <id>', 'Receiver ID')
    .requiredOption('--msg_type <type>', 'Message type: text|post|image|file|audio|media|interactive|share_chat|share_user')
    .requiredOption('--content <json>', 'Message content JSON string')
    .option('--uuid <id>', 'Idempotency UUID')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_im_user_message.send',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.create(
              {
                params: { receive_id_type: opts.receive_id_type },
                data: {
                  receive_id: opts.receive_id,
                  msg_type: opts.msg_type,
                  content: opts.content,
                  uuid: opts.uuid,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        assertLarkOk(result);
        outputResult(result.data);
      });
    });

  im
    .command('reply <message_id>')
    .description('Reply to a message')
    .requiredOption('--msg_type <type>', 'Message type: text|post|image|file|audio|media|interactive|share_chat|share_user')
    .requiredOption('--content <json>', 'Message content JSON string')
    .option('--reply_in_thread', 'Reply in thread')
    .option('--uuid <id>', 'Idempotency UUID')
    .action(async (messageId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_im_user_message.reply',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.reply(
              {
                path: { message_id: messageId },
                data: {
                  content: opts.content,
                  msg_type: opts.msg_type,
                  reply_in_thread: opts.reply_in_thread,
                  uuid: opts.uuid,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        assertLarkOk(result);
        outputResult(result.data);
      });
    });

  im
    .command('get-messages')
    .description('Get conversation messages')
    .option('--chat_id <id>', 'Chat ID (oc_xxx)')
    .option('--open_id <id>', 'User open_id for P2P chat')
    .option('--page_size <n>', 'Page size (1-50, default 50)')
    .option('--page_token <token>', 'Page token')
    .option('--sort <rule>', 'Sort: create_time_asc|create_time_desc')
    .option('--start_time <time>', 'Start time (ISO 8601)')
    .option('--end_time <time>', 'End time (ISO 8601)')
    .option('--relative_time <range>', 'Relative time: today|yesterday|day_before_yesterday|this_week|last_week|this_month|last_month|last_{N}_{minutes|hours|days}')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        if (opts.chat_id && opts.open_id) {
          outputError(new Error('Cannot provide both --chat_id and --open_id'));
          return;
        }
        if (!opts.chat_id && !opts.open_id) {
          outputError(new Error('Either --chat_id or --open_id is required'));
          return;
        }
        if (opts.relative_time && (opts.start_time || opts.end_time)) {
          outputError(new Error('Cannot use both --relative_time and --start_time/--end_time'));
          return;
        }

        const client = getToolClient();
        let containerId = opts.chat_id ?? '';
        if (opts.open_id) {
          // Resolve P2P chat_id from open_id
          const p2pRes = await client.invokeByPath<{
            data?: { p2p_chats?: Array<{ chat_id: string }> };
          }>('feishu_im_user_get_messages.default', '/open-apis/im/v1/chat_p2p/batch_query', {
            method: 'POST',
            body: { chatter_ids: [opts.open_id] },
            query: { user_id_type: 'open_id' },
            as: 'user',
          });
          const chats = p2pRes.data?.p2p_chats;
          if (!chats?.length) throw new Error(`No 1-on-1 chat found with open_id=${opts.open_id}`);
          containerId = chats[0].chat_id;
        }

        // Resolve time range
        let startTime: string | undefined;
        let endTime: string | undefined;
        if (opts.relative_time) {
          const range = parseTimeRangeToSeconds(opts.relative_time);
          startTime = range.start;
          endTime = range.end;
        } else {
          if (opts.start_time) startTime = Math.floor(new Date(opts.start_time).getTime() / 1000).toString();
          if (opts.end_time) endTime = Math.floor(new Date(opts.end_time).getTime() / 1000).toString();
        }

        const sortType = opts.sort === 'create_time_asc' ? 'ByCreateTimeAsc' : 'ByCreateTimeDesc';
        const params: Record<string, unknown> = {
          container_id_type: 'chat',
          container_id: containerId,
          sort_type: sortType,
          page_size: opts.page_size ?? 50,
          page_token: opts.page_token,
          card_msg_content_type: 'raw_card_content',
        };
        if (startTime) params.start_time = startTime;
        if (endTime) params.end_time = endTime;

        const result = await client.invoke(
          'feishu_im_user_get_messages.default',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.list({ params: params as any }, sdkOpts || {}),
          { as: 'user' },
        );
        assertLarkOk(result);

        // Format messages with user names
        const items = (result.data as any)?.items ?? [];
        const accountId = client.account.accountId;

        // Collect sender IDs and mention names
        const senderIds = new Set<string>();
        const mentionNames = new Map<string, string>();
        for (const item of items) {
          if (item.sender?.sender_type === 'user' && item.sender?.id) {
            senderIds.add(item.sender.id);
          }
          for (const m of item.mentions ?? []) {
            const id = typeof m.id === 'string' ? m.id : m.id?.open_id;
            if (id && m.name) {
              mentionNames.set(id, m.name);
            }
          }
        }

        // Cache mention names
        if (mentionNames.size > 0) {
          setUserNameCache(accountId, mentionNames);
        }

        // Batch resolve user names
        await batchResolveUserNames(client, Array.from(senderIds), accountId);

        // Format messages
        const messages = items.map((item: any) => {
          const senderId = item.sender?.id ?? '';
          const senderName = item.sender?.sender_type === 'user'
            ? getUserNameFromCache(accountId, senderId)
            : undefined;

          // Convert create_time from milliseconds to ISO 8601
          const createTime = item.create_time
            ? new Date(parseInt(item.create_time, 10)).toISOString().replace('Z', '+08:00')
            : '';

          // Extract content based on msg_type
          let content = '';
          try {
            const contentObj = JSON.parse(item.body?.content ?? '{}');
            if (item.msg_type === 'text') {
              content = contentObj.text ?? '';
            } else if (item.msg_type === 'post') {
              // Extract text from post content
              const extractPostText = (post: any): string => {
                if (typeof post !== 'object' || !post) return '';
                // Handle multi-locale post
                for (const locale of ['zh_cn', 'en_us', 'ja_jp']) {
                  if (post[locale]?.content) {
                    return post[locale].content
                      .map((line: any[]) => line.map((block: any) => {
                        if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                        if (block.tag === 'a') return block.href ?? '';
                        if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                        if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                        if (block.tag === 'emotion') return block.emoji_id ?? '';
                        return '';
                      }).join(''))
                      .join('\n');
                  }
                }
                // Fallback: try direct content
                if (post.content) {
                  return post.content
                    .map((line: any[]) => line.map((block: any) => {
                      if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                      if (block.tag === 'a') return block.href ?? '';
                      if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                      if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                      return '';
                    }).join(''))
                    .join('\n');
                }
                return '';
              };
              content = extractPostText(contentObj);
            } else if (item.msg_type === 'image') {
              content = `[image: ${contentObj.image_key ?? ''}]`;
            } else if (item.msg_type === 'file') {
              content = `[file: ${contentObj.file_key ?? ''}, name: ${contentObj.fileName ?? ''}]`;
            } else if (item.msg_type === 'audio') {
              content = `[audio: ${contentObj.file_key ?? ''}]`;
            } else if (item.msg_type === 'media') {
              content = `[media: ${contentObj.file_key ?? ''}]`;
            } else if (item.msg_type === 'share_chat') {
              content = `[share_chat: ${contentObj.chat_id ?? ''}]`;
            } else if (item.msg_type === 'share_user') {
              content = `[share_user: ${contentObj.user_id ?? ''}]`;
            } else if (item.msg_type === 'interactive') {
              content = `[interactive card]`;
            } else if (item.msg_type === 'merge_forward') {
              // For merge_forward, we need to fetch sub-messages
              // This is a simplified version that shows the summary
              const entries = contentObj.entries ?? [];
              content = `[forwarded messages: ${entries.length} messages]`;
            } else {
              content = item.body?.content ?? '';
            }
          } catch {
            content = item.body?.content ?? '';
          }

          const formatted: any = {
            message_id: item.message_id ?? '',
            msg_type: item.msg_type ?? 'unknown',
            content,
            sender: {
              id: senderId,
              sender_type: item.sender?.sender_type ?? 'unknown',
            },
            create_time: createTime,
            deleted: item.deleted ?? false,
            updated: item.updated ?? false,
          };

          if (senderName) formatted.sender.name = senderName;
          if (item.thread_id) formatted.thread_id = item.thread_id;
          else if (item.parent_id) formatted.reply_to = item.parent_id;
          if (item.mentions && item.mentions.length > 0) {
            formatted.mentions = item.mentions.map((m: any) => ({
              key: m.key ?? '',
              id: typeof m.id === 'string' ? m.id : m.id?.open_id ?? '',
              name: m.name ?? '',
            }));
          }

          return formatted;
        });

        outputResult({
          messages,
          has_more: (result.data as any)?.has_more ?? false,
          page_token: (result.data as any)?.page_token,
        });
      });
    });

  im
    .command('get-thread-messages')
    .description('Get messages within a thread')
    .requiredOption('--thread_id <id>', 'Thread ID (omt_xxx)')
    .option('--page_size <n>', 'Page size (1-50, default 50)')
    .option('--page_token <token>', 'Page token')
    .option('--sort <rule>', 'Sort: create_time_asc|create_time_desc')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const sortType = opts.sort === 'create_time_asc' ? 'ByCreateTimeAsc' : 'ByCreateTimeDesc';

        const params: Record<string, unknown> = {
          container_id_type: 'thread',
          container_id: opts.thread_id,
          sort_type: sortType,
          page_size: opts.page_size ?? 50,
          page_token: opts.page_token,
          card_msg_content_type: 'raw_card_content',
        };

        const result = await client.invoke(
          'feishu_im_user_get_thread_messages.default',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.list({ params: params as any }, sdkOpts || {}),
          { as: 'user' },
        );
        assertLarkOk(result);

        // Format messages with user names (same logic as get-messages)
        const items = (result.data as any)?.items ?? [];
        const accountId = client.account.accountId;

        const senderIds = new Set<string>();
        const mentionNames = new Map<string, string>();
        for (const item of items) {
          if (item.sender?.sender_type === 'user' && item.sender?.id) {
            senderIds.add(item.sender.id);
          }
          for (const m of item.mentions ?? []) {
            const id = typeof m.id === 'string' ? m.id : m.id?.open_id;
            if (id && m.name) {
              mentionNames.set(id, m.name);
            }
          }
        }

        if (mentionNames.size > 0) {
          setUserNameCache(accountId, mentionNames);
        }

        await batchResolveUserNames(client, Array.from(senderIds), accountId);

        const messages = items.map((item: any) => {
          const senderId = item.sender?.id ?? '';
          const senderName = item.sender?.sender_type === 'user'
            ? getUserNameFromCache(accountId, senderId)
            : undefined;

          const createTime = item.create_time
            ? new Date(parseInt(item.create_time, 10)).toISOString().replace('Z', '+08:00')
            : '';

          let content = '';
          try {
            const contentObj = JSON.parse(item.body?.content ?? '{}');
            if (item.msg_type === 'text') {
              content = contentObj.text ?? '';
            } else if (item.msg_type === 'post') {
              const extractPostText = (post: any): string => {
                if (typeof post !== 'object' || !post) return '';
                for (const locale of ['zh_cn', 'en_us', 'ja_jp']) {
                  if (post[locale]?.content) {
                    return post[locale].content
                      .map((line: any[]) => line.map((block: any) => {
                        if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                        if (block.tag === 'a') return block.href ?? '';
                        if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                        if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                        return '';
                      }).join(''))
                      .join('\n');
                  }
                }
                if (post.content) {
                  return post.content
                    .map((line: any[]) => line.map((block: any) => {
                      if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                      if (block.tag === 'a') return block.href ?? '';
                      if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                      if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                      return '';
                    }).join(''))
                    .join('\n');
                }
                return '';
              };
              content = extractPostText(contentObj);
            } else if (item.msg_type === 'image') {
              content = `[image: ${contentObj.image_key ?? ''}]`;
            } else if (item.msg_type === 'file') {
              content = `[file: ${contentObj.file_key ?? ''}]`;
            } else if (item.msg_type === 'merge_forward') {
              const entries = contentObj.entries ?? [];
              content = `[forwarded messages: ${entries.length} messages]`;
            } else {
              content = item.body?.content ?? '';
            }
          } catch {
            content = item.body?.content ?? '';
          }

          const formatted: any = {
            message_id: item.message_id ?? '',
            msg_type: item.msg_type ?? 'unknown',
            content,
            sender: {
              id: senderId,
              sender_type: item.sender?.sender_type ?? 'unknown',
            },
            create_time: createTime,
            deleted: item.deleted ?? false,
            updated: item.updated ?? false,
          };

          if (senderName) formatted.sender.name = senderName;
          if (item.thread_id) formatted.thread_id = item.thread_id;

          return formatted;
        });

        outputResult({
          messages,
          has_more: (result.data as any)?.has_more ?? false,
          page_token: (result.data as any)?.page_token,
        });
      });
    });

  im
    .command('search-messages')
    .description('Search messages across conversations')
    .option('--query <text>', 'Search keyword')
    .option('--chat_id <id>', 'Limit to chat')
    .option('--sender_ids <json>', 'Sender open_id list JSON array')
    .option('--mention_ids <json>', 'Mentioned user open_id list JSON array')
    .option('--message_type <type>', 'Message type filter: file|image|media')
    .option('--sender_type <type>', 'Sender type: user|bot|all')
    .option('--chat_type <type>', 'Chat type: group|p2p')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--start_time <time>', 'Start time (ISO 8601)')
    .option('--end_time <time>', 'End time (ISO 8601)')
    .option('--relative_time <range>', 'Relative time: today|yesterday|day_before_yesterday|this_week|last_week|this_month|last_month|last_{N}_{minutes|hours|days}')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        if (opts.relative_time && (opts.start_time || opts.end_time)) {
          outputError(new Error('Cannot use both --relative_time and --start_time/--end_time'));
          return;
        }

        const client = getToolClient();
        const accountId = client.account.accountId;

        // Resolve time range
        let startTime: string;
        let endTime: string;
        if (opts.relative_time) {
          const range = parseTimeRangeToSeconds(opts.relative_time);
          startTime = range.start;
          endTime = range.end;
        } else {
          startTime = opts.start_time
            ? Math.floor(new Date(opts.start_time).getTime() / 1000).toString()
            : '978307200';
          endTime = opts.end_time
            ? Math.floor(new Date(opts.end_time).getTime() / 1000).toString()
            : Math.floor(Date.now() / 1000).toString();
        }

        // Build search data
        const searchData: Record<string, unknown> = {
          query: opts.query ?? '',
          start_time: startTime,
          end_time: endTime,
        };

        if (opts.sender_ids) {
          try {
            searchData.from_ids = typeof opts.sender_ids === 'string'
              ? JSON.parse(opts.sender_ids)
              : opts.sender_ids;
          } catch {
            outputError(new Error('Invalid JSON for --sender_ids'));
            return;
          }
        }

        if (opts.chat_id) searchData.chat_ids = [opts.chat_id];

        if (opts.mention_ids) {
          try {
            searchData.at_chatter_ids = typeof opts.mention_ids === 'string'
              ? JSON.parse(opts.mention_ids)
              : opts.mention_ids;
          } catch {
            outputError(new Error('Invalid JSON for --mention_ids'));
            return;
          }
        }

        if (opts.message_type && ['file', 'image', 'media'].includes(opts.message_type)) {
          searchData.message_type = opts.message_type;
        }

        if (opts.sender_type && opts.sender_type !== 'all') {
          searchData.from_type = opts.sender_type;
        }

        if (opts.chat_type) {
          searchData.chat_type = opts.chat_type === 'group' ? 'group_chat' : 'p2p_chat';
        }

        // Phase 1: Search for message IDs
        const searchRes = await client.invoke(
          'feishu_im_user_search_messages.default',
          (sdk, sdkOpts) =>
            sdk.search.message.create(
              {
                data: searchData as any,
                params: { user_id_type: 'open_id', page_size: opts.page_size ?? 50, page_token: opts.page_token },
              },
              sdkOpts!,
            ),
          { as: 'user' },
        );
        assertLarkOk(searchRes as any);

        const messageIds: string[] = (searchRes as any).data?.items ?? [];
        const hasMore: boolean = (searchRes as any).data?.has_more ?? false;
        const pageToken: string | undefined = (searchRes as any).data?.page_token;

        if (messageIds.length === 0) {
          outputResult({
            messages: [],
            has_more: hasMore,
            page_token: pageToken,
          });
          return;
        }

        // Phase 2: Batch GET for full details
        const queryStr = messageIds.map((id) => `message_ids=${encodeURIComponent(id)}`).join('&');
        const mgetRes = await client.invokeByPath<{
          code?: number;
          data?: { items?: any[] };
        }>('feishu_im_user_search_messages.default', `/open-apis/im/v1/messages/mget?${queryStr}`, {
          method: 'GET',
          query: { user_id_type: 'open_id', card_msg_content_type: 'raw_card_content' },
          as: 'user',
        });

        const items = mgetRes.data?.items ?? [];

        // Phase 3: Batch query chat contexts
        const chatIds = [...new Set(items.map((i: any) => i.chat_id).filter(Boolean))] as string[];
        const chatMap = new Map<string, { name: string; chat_mode: string; p2p_target_id?: string }>();

        if (chatIds.length > 0) {
          try {
            const chatRes = await client.invokeByPath<{
              data?: { items?: Array<{ chat_id?: string; name?: string; chat_mode?: string; p2p_target_id?: string }> };
            }>('feishu_im_user_search_messages.default', '/open-apis/im/v1/chats/batch_query', {
              method: 'POST',
              body: { chat_ids: chatIds },
              query: { user_id_type: 'open_id' },
              as: 'user',
            });

            for (const c of chatRes.data?.items ?? []) {
              if (c.chat_id) {
                chatMap.set(c.chat_id, {
                  name: c.name ?? '',
                  chat_mode: c.chat_mode ?? '',
                  p2p_target_id: c.p2p_target_id,
                });
              }
            }
          } catch (err) {
            console.error(`Failed to fetch chat contexts: ${err}`);
          }
        }

        // Collect P2P target IDs for name resolution
        const p2pTargetIds = [...new Set(
          [...chatMap.values()]
            .filter((c) => c.chat_mode === 'p2p' && c.p2p_target_id)
            .map((c) => c.p2p_target_id!)
        )];
        await batchResolveUserNames(client, p2pTargetIds, accountId);

        // Phase 4: Format messages with sender names and chat context
        const senderIds = new Set<string>();
        const mentionNames = new Map<string, string>();

        for (const item of items) {
          if (item.sender?.sender_type === 'user' && item.sender?.id) {
            senderIds.add(item.sender.id);
          }
          for (const m of item.mentions ?? []) {
            const id = typeof m.id === 'string' ? m.id : m.id?.open_id;
            if (id && m.name) {
              mentionNames.set(id, m.name);
            }
          }
        }

        if (mentionNames.size > 0) {
          setUserNameCache(accountId, mentionNames);
        }

        await batchResolveUserNames(client, Array.from(senderIds), accountId);

        const messages = items.map((item: any) => {
          const chatId = item.chat_id;
          const chatCtx = chatId ? chatMap.get(chatId) : undefined;

          const senderId = item.sender?.id ?? '';
          const senderName = item.sender?.sender_type === 'user'
            ? getUserNameFromCache(accountId, senderId)
            : undefined;

          const createTime = item.create_time
            ? new Date(parseInt(item.create_time, 10)).toISOString().replace('Z', '+08:00')
            : '';

          let content = '';
          try {
            const contentObj = JSON.parse(item.body?.content ?? '{}');
            if (item.msg_type === 'text') {
              content = contentObj.text ?? '';
            } else if (item.msg_type === 'post') {
              const extractPostText = (post: any): string => {
                if (typeof post !== 'object' || !post) return '';
                for (const locale of ['zh_cn', 'en_us', 'ja_jp']) {
                  if (post[locale]?.content) {
                    return post[locale].content
                      .map((line: any[]) => line.map((block: any) => {
                        if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                        if (block.tag === 'a') return block.href ?? '';
                        if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                        if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                        return '';
                      }).join(''))
                      .join('\n');
                  }
                }
                if (post.content) {
                  return post.content
                    .map((line: any[]) => line.map((block: any) => {
                      if (block.tag === 'text' || block.tag === 'md') return block.text ?? '';
                      if (block.tag === 'a') return block.href ?? '';
                      if (block.tag === 'at') return `@${block.user_name ?? block.user_id ?? ''}`;
                      if (block.tag === 'img') return `[image: ${block.image_key ?? ''}]`;
                      return '';
                    }).join(''))
                    .join('\n');
                }
                return '';
              };
              content = extractPostText(contentObj);
            } else if (item.msg_type === 'image') {
              content = `[image: ${contentObj.image_key ?? ''}]`;
            } else if (item.msg_type === 'file') {
              content = `[file: ${contentObj.file_key ?? ''}]`;
            } else if (item.msg_type === 'merge_forward') {
              const entries = contentObj.entries ?? [];
              content = `[forwarded messages: ${entries.length} messages]`;
            } else {
              content = item.body?.content ?? '';
            }
          } catch {
            content = item.body?.content ?? '';
          }

          const formatted: any = {
            message_id: item.message_id ?? '',
            msg_type: item.msg_type ?? 'unknown',
            content,
            sender: {
              id: senderId,
              sender_type: item.sender?.sender_type ?? 'unknown',
            },
            create_time: createTime,
            deleted: item.deleted ?? false,
            updated: item.updated ?? false,
          };

          if (senderName) formatted.sender.name = senderName;
          if (item.thread_id) formatted.thread_id = item.thread_id;
          else if (item.parent_id) formatted.reply_to = item.parent_id;

          // Add chat context
          if (chatCtx) {
            formatted.chat_id = chatId;
            if (chatCtx.chat_mode === 'p2p' && chatCtx.p2p_target_id) {
              const partnerName = getUserNameFromCache(accountId, chatCtx.p2p_target_id);
              formatted.chat_type = 'p2p';
              formatted.chat_name = partnerName ?? undefined;
              formatted.chat_partner = {
                open_id: chatCtx.p2p_target_id,
                name: partnerName ?? undefined,
              };
            } else {
              formatted.chat_type = chatCtx.chat_mode;
              formatted.chat_name = chatCtx.name || undefined;
            }
          }

          return formatted;
        });

        outputResult({
          messages,
          has_more: hasMore,
          page_token: pageToken,
        });
      });
    });

  im
    .command('fetch-resource')
    .description('Download a message resource (image/file)')
    .requiredOption('--message_id <id>', 'Message ID (om_xxx)')
    .requiredOption('--file_key <key>', 'Resource key (image_key or file_key)')
    .requiredOption('--type <type>', 'Resource type: image|file')
    .option('--output_path <path>', 'Local save path (auto-generated if not provided)')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const res: any = await client.invoke(
          'feishu_im_user_fetch_resource.default',
          (sdk, sdkOpts) =>
            sdk.im.v1.messageResource.get(
              {
                params: { type: opts.type },
                path: { message_id: opts.message_id, file_key: opts.file_key },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        // Response is a binary stream
        const stream = res.getReadableStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Detect Content-Type and determine extension
        const contentType = (res.headers?.['content-type'] as string) || '';
        const mimeType = contentType ? contentType.split(';')[0].trim() : '';
        const mimeExt = mimeType ? MIME_TO_EXT[mimeType] : undefined;

        // Determine output path
        let outputPath = opts.output_path;
        if (!outputPath) {
          const { join } = await import('node:path');
          const os = await import('node:os');
          const { tmpdir } = await import('node:os');

          // Auto-generate path in temp directory
          const tmpDir = os.tmpdir();
          const ext = mimeExt || `.${opts.type}`;
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          outputPath = join(tmpDir, `feishu-${opts.type}-${timestamp}-${random}${ext}`);
        }

        const { mkdir, writeFile } = await import('node:fs/promises');
        const { dirname } = await import('node:path');
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, buffer);

        outputResult({
          saved_path: outputPath,
          size: buffer.length,
          content_type: contentType,
          mime_type: mimeType,
        });
      });
    });
}
