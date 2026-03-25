/**
 * Doc commands: fetch, create, update document content.
 */
import fs from 'node:fs';
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, withAutoAuth } from './shared';
import { callMcpTool } from '../../core/mcp-client';

/**
 * 从文档 URL 或纯 ID 中提取 document_id
 * 支持格式：
 * - https://xxx.feishu.cn/docx/xxxxx
 * - https://xxx.larksuite.com/docx/xxxxx
 * - 纯 token 字符串
 */
function extractDocumentId(input: string): string {
  const trimmed = input.trim();
  // 匹配 feishu.cn 或 larksuite.com 的文档 URL
  const urlMatch = trimmed.match(/(?:feishu\.cn|larksuite\.com)\/docx\/([A-Za-z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

/**
 * doc create 参数验证
 */
function validateCreateDocParams(params: {
  task_id?: string;
  markdown?: string;
  title?: string;
  folder_token?: string;
  wiki_node?: string;
  wiki_space?: string;
}): void {
  if (params.task_id) return;
  if (!params.markdown || !params.title) {
    throw new Error('create-doc：未提供 task_id 时，必须提供 markdown 和 title');
  }
  const flags = [params.folder_token, params.wiki_node, params.wiki_space].filter(Boolean);
  if (flags.length > 1) {
    throw new Error('create-doc：folder_token / wiki_node / wiki_space 三者互斥，请只提供一个');
  }
}

/**
 * doc update 参数验证
 */
function validateUpdateDocParams(params: {
  task_id?: string;
  doc_id?: string;
  mode?: string;
  selection_with_ellipsis?: string;
  selection_by_title?: string;
  markdown?: string;
}): void {
  if (params.task_id) return;
  if (!params.doc_id) {
    throw new Error('update-doc：未提供 task_id 时必须提供 doc_id');
  }
  const needSelection =
    params.mode === 'replace_range' ||
    params.mode === 'insert_before' ||
    params.mode === 'insert_after' ||
    params.mode === 'delete_range';

  if (needSelection) {
    const hasEllipsis = Boolean(params.selection_with_ellipsis);
    const hasTitle = Boolean(params.selection_by_title);
    if ((hasEllipsis && hasTitle) || (!hasEllipsis && !hasTitle)) {
      throw new Error(
        'update-doc：mode 为 replace_range/insert_before/insert_after/delete_range 时，selection_with_ellipsis 与 selection_by_title 必须二选一',
      );
    }
  }

  const needMarkdown = params.mode !== 'delete_range';
  if (needMarkdown && !params.markdown) {
    throw new Error(`update-doc：mode=${params.mode} 时必须提供 markdown`);
  }
}

export function registerDocCommands(parent: Command): void {
  const doc = parent.command('doc').description('Document operations');

  // doc fetch — read document content via SDK
  doc
    .command('fetch <doc_id>')
    .description('Fetch document content (title + markdown)')
    .option('--offset <n>', 'Character offset for pagination')
    .option('--limit <n>', 'Max characters to return')
    .option('--task_id <id>', 'Async task ID for polling')
    .action(async (docId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        // URL 自动解析 doc_id
        const documentId = extractDocumentId(docId);
        const params: Record<string, unknown> = {};
        if (opts.offset !== undefined) params.offset = Number(opts.offset);
        if (opts.limit !== undefined) params.limit = Number(opts.limit);
        if (opts.task_id) params.task_id = opts.task_id;

        const result = await client.invoke(
          'feishu_fetch_doc.default',
          (sdk, sdkOpts) => {
            const sdkWithOpts = sdkOpts || {};
            return (sdk as any).docx.document.rawContent(
              { path: { document_id: documentId }, params },
              sdkWithOpts,
            );
          },
          { as: 'user' },
        );
        outputResult((result as any).data);
      });
    });

  // doc create — create document from markdown via MCP
  doc
    .command('create')
    .description('Create a new document from markdown')
    .option('--title <title>', 'Document title')
    .option('--content <markdown>', 'Markdown content')
    .option('--file <path>', 'Read markdown content from file')
    .option('--folder_token <token>', 'Parent folder token')
    .option('--wiki_node <token>', 'Wiki node token or URL')
    .option('--wiki_space <id>', 'Wiki space ID (use "my_library" for personal)')
    .option('--task_id <id>', 'Async task ID for polling')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let markdown = opts.content;
        if (opts.file) {
          if (!fs.existsSync(opts.file)) {
            outputError(`File not found: ${opts.file}`);
            return;
          }
          markdown = fs.readFileSync(opts.file, 'utf8');
        }

        const args: Record<string, unknown> = {
          markdown,
          title: opts.title,
          task_id: opts.task_id,
        };
        if (opts.folder_token) args.folder_token = opts.folder_token;
        if (opts.wiki_node) args.wiki_node = opts.wiki_node;
        if (opts.wiki_space) args.wiki_space = opts.wiki_space;

        // 参数验证
        try {
          validateCreateDocParams(args);
        } catch (err) {
          outputError(err instanceof Error ? err.message : String(err));
          return;
        }

        const result = await client.invoke(
          'feishu_create_doc.default',
          async (_sdk, _sdkOpts, uat) => {
            if (!uat) throw new Error('UAT not available');
            return callMcpTool('create-doc', args, 'doc-create', uat, client.account.brand);
          },
          { as: 'user' },
        );

        // MCP returns { content: [{ type: "text", text: "..." }] }
        if ((result as any)?.content?.[0]?.type === 'text') {
          try {
            outputResult(JSON.parse((result as any).content[0].text));
          } catch {
            outputResult((result as any).content[0].text);
          }
        } else {
          outputResult(result);
        }
      });
    });

  // doc update — update document via MCP
  doc
    .command('update')
    .description('Update a document (overwrite/append/replace/insert/delete)')
    .option('--token <doc_id>', 'Document ID or URL')
    .requiredOption('--mode <mode>', 'Update mode: overwrite|append|replace_range|replace_all|insert_before|insert_after|delete_range')
    .option('--content <markdown>', 'Markdown content')
    .option('--file <path>', 'Read markdown content from file')
    .option('--selection <text>', 'Selection locator: "start...end" or "exact text"')
    .option('--selection_by_title <title>', 'Selection by title: "## Section Title"')
    .option('--new_title <title>', 'New document title')
    .option('--task_id <id>', 'Async task ID for polling')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let markdown = opts.content;
        if (opts.file) {
          if (!fs.existsSync(opts.file)) {
            outputError(`File not found: ${opts.file}`);
            return;
          }
          markdown = fs.readFileSync(opts.file, 'utf8');
        }

        // URL 自动解析 doc_id
        const docId = opts.token ? extractDocumentId(opts.token) : undefined;

        const args: Record<string, unknown> = {
          doc_id: docId,
          mode: opts.mode,
          markdown,
          selection_with_ellipsis: opts.selection,
          selection_by_title: opts.selection_by_title,
          new_title: opts.new_title,
          task_id: opts.task_id,
        };

        // 参数验证
        try {
          validateUpdateDocParams(args);
        } catch (err) {
          outputError(err instanceof Error ? err.message : String(err));
          return;
        }

        const result = await client.invoke(
          'feishu_update_doc.default',
          async (_sdk, _sdkOpts, uat) => {
            if (!uat) throw new Error('UAT not available');
            return callMcpTool('update-doc', args, 'doc-update', uat, client.account.brand);
          },
          { as: 'user' },
        );

        if ((result as any)?.content?.[0]?.type === 'text') {
          try {
            outputResult(JSON.parse((result as any).content[0].text));
          } catch {
            outputResult((result as any).content[0].text);
          }
        } else {
          outputResult(result);
        }
      });
    });
}
