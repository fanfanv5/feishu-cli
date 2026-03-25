/**
 * Wiki commands: space and space-node management.
 */
import type { Command } from 'commander';
import { outputResult, getToolClient, withAutoAuth } from './shared.js';

export function registerWikiCommands(parent: Command): void {
  const wiki = parent.command('wiki').description('Wiki (knowledge base) management');

  // ---- space ----
  const space = wiki.command('space').description('Wiki space operations');

  space
    .command('list')
    .description('List wiki spaces')
    .option('--page_size <n>', 'Page size (max 50)')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space.list',
          (sdk, sdkOpts) =>
            sdk.wiki.space.list(
              { params: { page_size: opts.page_size as any, page_token: opts.page_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  space
    .command('get <space_id>')
    .description('Get wiki space info')
    .action(async (spaceId) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space.get',
          (sdk, sdkOpts) =>
            sdk.wiki.space.get({ path: { space_id: spaceId } }, sdkOpts || {}),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  space
    .command('create')
    .description('Create a wiki space')
    .option('--name <name>', 'Space name')
    .option('--description <desc>', 'Space description')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space.create',
          (sdk, sdkOpts) =>
            sdk.wiki.space.create(
              { data: { name: opts.name, description: opts.description } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- space-node ----
  const node = wiki.command('node').description('Wiki space node operations');

  node
    .command('list <space_id>')
    .description('List nodes in a space')
    .option('--parent_node_token <token>', 'Parent node token')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (spaceId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space_node.list',
          (sdk, sdkOpts) =>
            sdk.wiki.spaceNode.list(
              {
                path: { space_id: spaceId },
                params: {
                  page_size: opts.page_size as any,
                  page_token: opts.page_token,
                  parent_node_token: opts.parent_node_token,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  node
    .command('get <token>')
    .description('Get a node (resolve node_token to obj_token)')
    .option('--obj_type <type>', 'Object type (default: wiki)')
    .action(async (token, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space_node.get',
          (sdk, sdkOpts) =>
            sdk.wiki.space.getNode(
              { params: { token, obj_type: (opts.obj_type || 'wiki') as any } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  node
    .command('create <space_id>')
    .description('Create a node in a space')
    .requiredOption('--obj_type <type>', 'Object type: sheet|bitable|file|docx|slides')
    .requiredOption('--node_type <type>', 'Node type: origin|shortcut')
    .option('--parent_node_token <token>', 'Parent node token')
    .option('--origin_node_token <token>', 'Origin node token (for shortcut)')
    .option('--title <title>', 'Node title')
    .action(async (spaceId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space_node.create',
          (sdk, sdkOpts) =>
            sdk.wiki.spaceNode.create(
              {
                path: { space_id: spaceId },
                data: {
                  obj_type: opts.obj_type as any,
                  parent_node_token: opts.parent_node_token,
                  node_type: opts.node_type as any,
                  origin_node_token: opts.origin_node_token,
                  title: opts.title,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  node
    .command('move <space_id> <node_token>')
    .description('Move a node')
    .option('--target_parent_token <token>', 'Target parent token')
    .action(async (spaceId, nodeToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space_node.move',
          (sdk, sdkOpts) =>
            sdk.wiki.spaceNode.move(
              {
                path: { space_id: spaceId, node_token: nodeToken },
                data: { target_parent_token: opts.target_parent_token },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  node
    .command('copy <space_id> <node_token>')
    .description('Copy a node')
    .option('--target_space_id <id>', 'Target space ID')
    .option('--target_parent_token <token>', 'Target parent token')
    .option('--title <title>', 'New title')
    .action(async (spaceId, nodeToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_wiki_space_node.copy',
          (sdk, sdkOpts) =>
            sdk.wiki.spaceNode.copy(
              {
                path: { space_id: spaceId, node_token: nodeToken },
                data: {
                  target_space_id: opts.target_space_id,
                  target_parent_token: opts.target_parent_token,
                  title: opts.title,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });
}
