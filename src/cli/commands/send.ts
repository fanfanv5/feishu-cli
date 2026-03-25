/**
 * Send commands: simplified message sending (text, card, media).
 */
import type { Command } from 'commander';
import { outputResult, getToolClient, withAutoAuth } from './shared.js';

export function registerSendCommands(parent: Command): void {
  const send = parent.command('send').description('Send messages (convenience wrappers)');

  send
    .command('text')
    .description('Send a text message')
    .requiredOption('--to <id>', 'Receiver ID (open_id or chat_id)')
    .requiredOption('--text <message>', 'Text content')
    .option('--type <type>', 'ID type: open_id|chat_id', 'open_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const content = JSON.stringify({ text: opts.text });
        const result = await client.invoke(
          'feishu_im_user_message.send',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.create(
              {
                params: { receive_id_type: opts.type },
                data: { receive_id: opts.to, msg_type: 'text', content },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  send
    .command('card')
    .description('Send an interactive card message')
    .requiredOption('--to <id>', 'Receiver ID')
    .requiredOption('--content <json>', 'Card content JSON')
    .option('--type <type>', 'ID type: open_id|chat_id', 'open_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_im_user_message.send',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.create(
              {
                params: { receive_id_type: opts.type },
                data: { receive_id: opts.to, msg_type: 'interactive', content: opts.content },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  send
    .command('media')
    .description('Send an image or file message')
    .requiredOption('--to <id>', 'Receiver ID')
    .requiredOption('--msg_type <type>', 'Message type: image|file')
    .requiredOption('--key <key>', 'Image key (img_xxx) or file key (file_xxx)')
    .option('--type <type>', 'ID type: open_id|chat_id', 'open_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const content = JSON.stringify({ [`${opts.msg_type}_key`]: opts.key });
        const result = await client.invoke(
          'feishu_im_user_message.send',
          (sdk, sdkOpts) =>
            sdk.im.v1.message.create(
              {
                params: { receive_id_type: opts.type },
                data: { receive_id: opts.to, msg_type: opts.msg_type, content },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });
}
