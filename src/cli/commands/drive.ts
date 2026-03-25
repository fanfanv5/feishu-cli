/**
 * Drive commands: file list/get_meta/copy/move/delete/upload/download.
 * Sub-groups: doc-media (insert/download), doc-comments (list/create/patch).
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, withAutoAuth, parseJsonArg } from './shared.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createReadStream } from 'node:fs';

const SMALL_FILE_THRESHOLD = 15 * 1024 * 1024; // 15MB

export function registerDriveCommands(parent: Command): void {
  const drive = parent.command('drive').description('Drive (cloud storage) operations');

  // ---------------------------------------------------------------------
  // File commands
  // ---------------------------------------------------------------------

  drive
    .command('list')
    .description('List files in a folder')
    .option('--folder_token <token>', 'Folder token (root if omitted)')
    .option('--page_size <n>', 'Page size (max 200)')
    .option('--page_token <token>', 'Page token')
    .option('--order_by <field>', 'Sort: EditedTime|CreatedTime')
    .option('--direction <dir>', 'Direction: ASC|DESC')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_drive_file.list',
          (sdk, sdkOpts) =>
            sdk.drive.file.list(
              {
                params: {
                  folder_token: opts.folder_token as any,
                  page_size: opts.page_size as any,
                  page_token: opts.page_token,
                  order_by: opts.order_by as any,
                  direction: opts.direction as any,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({
          files: result.data?.files,
          has_more: result.data?.has_more,
          page_token: result.data?.next_page_token,
        });
      });
    });

  drive
    .command('get-meta')
    .description('Batch query file metadata')
    .requiredOption('--docs <json>', 'Request docs JSON array', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const docs = opts.docs as Array<{ doc_token: string; doc_type: string }>;
        if (!docs || !Array.isArray(docs) || docs.length === 0) {
          outputError(new Error('request_docs must be a non-empty array. Format: [{"doc_token":"...","doc_type":"sheet"}]'));
          return;
        }
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_drive_file.get_meta',
          (sdk, sdkOpts) =>
            sdk.drive.meta.batchQuery(
              { data: { request_docs: docs as any } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({ metas: result.data?.metas ?? [] });
      });
    });

  drive
    .command('copy <file_token>')
    .description('Copy a file')
    .requiredOption('--name <name>', 'New file name')
    .requiredOption('--type <type>', 'Doc type: doc|sheet|file|bitable|docx|folder|mindnote|slides')
    .option('--folder_token <token>', 'Target folder token')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_drive_file.copy',
          (sdk, sdkOpts) =>
            sdk.drive.file.copy(
              {
                path: { file_token: fileToken },
                data: { name: opts.name, type: opts.type as any, folder_token: opts.folder_token as any },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({ file: result.data?.file });
      });
    });

  drive
    .command('move <file_token>')
    .description('Move a file')
    .requiredOption('--type <type>', 'Doc type')
    .requiredOption('--folder_token <token>', 'Target folder token')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_drive_file.move',
          (sdk, sdkOpts) =>
            sdk.drive.file.move(
              {
                path: { file_token: fileToken },
                data: { type: opts.type as any, folder_token: opts.folder_token },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        const data = result.data as any;
        outputResult({
          success: true,
          ...(data?.task_id ? { task_id: data.task_id } : {}),
          file_token: fileToken,
          target_folder_token: opts.folder_token,
        });
      });
    });

  drive
    .command('delete <file_token>')
    .description('Delete a file')
    .requiredOption('--type <type>', 'Doc type')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_drive_file.delete',
          (sdk, sdkOpts) =>
            sdk.drive.file.delete(
              { path: { file_token: fileToken }, params: { type: opts.type as any } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        const data = result.data as any;
        outputResult({
          success: true,
          ...(data?.task_id ? { task_id: data.task_id } : {}),
          file_token: fileToken,
        });
      });
    });

  drive
    .command('upload')
    .description('Upload a file')
    .option('--file_path <path>', 'Local file path to upload')
    .option('--file_content_base64 <base64>', 'File content as base64 (alternative to file_path)')
    .option('--file_name <name>', 'File name (required when using file_content_base64)')
    .option('--size <n>', 'File size in bytes (required when using file_content_base64)')
    .option('--parent_node <token>', 'Parent folder token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        if (!opts.file_path && !opts.file_content_base64) {
          outputError(new Error('Either --file_path or --file_content_base64 is required'));
          return;
        }
        if (opts.file_content_base64 && (!opts.file_name || !opts.size)) {
          outputError(new Error('--file_name and --size are required when using --file_content_base64'));
          return;
        }

        const client = getToolClient();
        let fileBuffer: Buffer;
        let fileName: string;
        let fileSize: number;

        if (opts.file_path) {
          fileBuffer = await fs.readFile(opts.file_path);
          fileName = opts.file_name || path.basename(opts.file_path);
          fileSize = opts.size || fileBuffer.length;
        } else {
          fileBuffer = Buffer.from(opts.file_content_base64!, 'base64');
          fileName = opts.file_name!;
          fileSize = opts.size!;
        }

        if (fileSize <= SMALL_FILE_THRESHOLD) {
          // Small file: uploadAll
          const result: any = await client.invoke(
            'feishu_drive_file.upload',
            (sdk, sdkOpts) =>
              sdk.drive.file.uploadAll(
                {
                  data: {
                    file_name: fileName,
                    parent_type: 'explorer' as any,
                    parent_node: opts.parent_node || '',
                    size: fileSize,
                    file: fileBuffer as any,
                  },
                },
                sdkOpts || {},
              ),
            { as: 'user' },
          );
          outputResult({ file_token: result.data?.file_token, file_name: fileName, size: fileSize });
        } else {
          // Large file: chunked upload
          const prepareRes: any = await client.invoke(
            'feishu_drive_file.upload',
            (sdk, sdkOpts) =>
              sdk.drive.file.uploadPrepare(
                {
                  data: {
                    file_name: fileName,
                    parent_type: 'explorer' as any,
                    parent_node: opts.parent_node || '',
                    size: fileSize,
                  },
                },
                sdkOpts || {},
              ),
            { as: 'user' },
          );
          const { upload_id, block_size, block_num } = prepareRes.data;

          for (let seq = 0; seq < block_num; seq++) {
            const start = seq * block_size;
            const end = Math.min(start + block_size, fileSize);
            const chunkBuffer = fileBuffer.subarray(start, end);
            await client.invoke(
              'feishu_drive_file.upload',
              (sdk, sdkOpts) =>
                sdk.drive.file.uploadPart(
                  {
                    data: {
                      upload_id: String(upload_id),
                      seq: Number(seq),
                      size: Number(chunkBuffer.length),
                      file: chunkBuffer,
                    },
                  },
                  sdkOpts || {},
                ),
              { as: 'user' },
            );
          }

          const finishRes: any = await client.invoke(
            'feishu_drive_file.upload',
            (sdk, sdkOpts) =>
              sdk.drive.file.uploadFinish(
                {
                  data: { upload_id, block_num },
                },
                sdkOpts || {},
              ),
            { as: 'user' },
          );
          outputResult({
            file_token: finishRes.data?.file_token,
            file_name: fileName,
            size: fileSize,
            upload_method: 'chunked',
            chunks_uploaded: block_num,
          });
        }
      });
    });

  drive
    .command('download <file_token>')
    .description('Download a file')
    .option('--output_path <path>', 'Local save path (with filename)')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const res: any = await client.invoke(
          'feishu_drive_file.download',
          (sdk, sdkOpts) =>
            sdk.drive.file.download(
              { path: { file_token: fileToken } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        const stream = res.getReadableStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        if (opts.output_path) {
          await fs.mkdir(path.dirname(opts.output_path), { recursive: true });
          await fs.writeFile(opts.output_path, buffer);
          outputResult({ saved_path: opts.output_path, size: buffer.length });
        } else {
          outputResult({ file_content_base64: buffer.toString('base64'), size: buffer.length });
        }
      });
    });

  // ---------------------------------------------------------------------
  // Doc media sub-group
  // ---------------------------------------------------------------------

  const docMedia = drive.command('doc-media').description('Document media operations (insert/download)');

  docMedia
    .command('insert <doc_id>')
    .description('Insert media (image/file) into a document')
    .requiredOption('--file_path <path>', 'Local file path to insert')
    .option('--type <type>', 'Media type: image (default) or file', 'image')
    .option('--align <align>', 'Alignment for image: left|center|right', 'center')
    .option('--caption <text>', 'Image caption/description')
    .action(async (docId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const filePath = opts.file_path;
        const fileName = path.basename(filePath);
        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        const mediaType = opts.type || 'image';

        // Block types: image=27, file=23
        const blockType = mediaType === 'file' ? 23 : 27;
        const parentType = mediaType === 'file' ? 'docx_file' : 'docx_image';

        // Step 1: Create empty block
        const createRes: any = await client.invoke(
          'feishu_doc_media.insert',
          (sdk, sdkOpts) =>
            (sdk.docx.documentBlockChildren as any).create(
              {
                path: { document_id: docId, block_id: docId },
                data: {
                  children: [
                    mediaType === 'file'
                      ? { block_type: 23, file: { token: '' } }
                      : { block_type: 27, image: {} },
                  ],
                },
                params: { document_revision_id: -1 },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        let blockId: string;
        if (mediaType === 'file') {
          blockId = createRes.data?.children?.[0]?.children?.[0];
        } else {
          blockId = createRes.data?.children?.[0]?.block_id;
        }
        if (!blockId) {
          outputError(new Error(`Failed to create ${mediaType} block: no block_id returned`));
          return;
        }

        // Step 2: Upload media
        const uploadRes: any = await client.invoke(
          'feishu_doc_media.insert',
          (sdk, sdkOpts) =>
            (sdk.drive.v1.media as any).uploadAll(
              {
                data: {
                  file_name: fileName,
                  parent_type: parentType as any,
                  parent_node: blockId,
                  size: fileSize,
                  file: createReadStream(filePath),
                  extra: JSON.stringify({ drive_route_token: docId }),
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        const fileToken = uploadRes?.file_token ?? uploadRes?.data?.file_token;
        if (!fileToken) {
          outputError(new Error(`Failed to upload ${mediaType}: no file_token returned`));
          return;
        }

        // Step 3: Patch block with token
        const patchRequest: any = { block_id: blockId };
        if (mediaType === 'image') {
          const alignMap: Record<string, number> = { left: 1, center: 2, right: 3 };
          patchRequest.replace_image = {
            token: fileToken,
            align: alignMap[opts.align] || 2,
            ...(opts.caption ? { caption: { content: opts.caption } } : {}),
          };
        } else {
          patchRequest.replace_file = { token: fileToken };
        }

        await client.invoke(
          'feishu_doc_media.insert',
          (sdk, sdkOpts) =>
            sdk.docx.documentBlock.batchUpdate(
              {
                path: { document_id: docId },
                data: { requests: [patchRequest] },
                params: { document_revision_id: -1 },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        outputResult({
          success: true,
          type: mediaType,
          document_id: docId,
          block_id: blockId,
          file_token: fileToken,
          file_name: fileName,
        });
      });
    });

  docMedia
    .command('download <resource_token>')
    .description('Download media or whiteboard')
    .requiredOption('--resource_type <type>', 'Resource type: media or whiteboard')
    .requiredOption('--output_path <path>', 'Local save path (can omit extension)')
    .action(async (resourceToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let res: any;
        if (opts.resource_type === 'media') {
          res = await client.invoke(
            'feishu_doc_media.download',
            (sdk, sdkOpts) => sdk.drive.v1.media.download({ path: { file_token: resourceToken } }, sdkOpts || {}),
            { as: 'user' },
          );
        } else {
          res = await client.invoke(
            'feishu_doc_media.download',
            (sdk, sdkOpts) =>
              sdk.board.v1.whiteboard.downloadAsImage({ path: { whiteboard_id: resourceToken } }, sdkOpts || {}),
            { as: 'user' },
          );
        }

        const stream = res.getReadableStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Auto-detect extension from Content-Type
        const contentType = res.headers?.['content-type'] || '';
        let finalPath = opts.output_path;
        if (!path.extname(opts.output_path) && contentType) {
          const mimeType = contentType.split(';')[0].trim();
          const extMap: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'application/pdf': '.pdf',
          };
          const ext = extMap[mimeType] || (opts.resource_type === 'whiteboard' ? '.png' : '');
          if (ext) finalPath = opts.output_path + ext;
        }

        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.writeFile(finalPath, buffer);

        outputResult({
          resource_type: opts.resource_type,
          resource_token: resourceToken,
          size_bytes: buffer.length,
          content_type: contentType,
          saved_path: finalPath,
        });
      });
    });

  // ---------------------------------------------------------------------
  // Doc comments sub-group
  // ---------------------------------------------------------------------

  const docComments = drive.command('doc-comments').description('Document comment operations (list/create/patch)');

  docComments
    .command('list <file_token>')
    .description('List document comments')
    .requiredOption('--file_type <type>', 'File type: doc|docx|sheet|file|slides|wiki')
    .option('--is_whole', 'Only whole comments')
    .option('--is_solved', 'Only solved comments')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--user_id_type <type>', 'User ID type: open_id|union_id|user_id')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const { actualFileToken, actualFileType } = await resolveDocToken(
          client,
          fileToken,
          opts.file_type,
        );

        const result = await client.invoke(
          'feishu_doc_comments.list',
          (sdk, sdkOpts) =>
            sdk.drive.v1.fileComment.list(
              {
                path: { file_token: actualFileToken },
                params: {
                  file_type: actualFileType,
                  is_whole: opts.is_whole,
                  is_solved: opts.is_solved,
                  page_size: opts.page_size || 50,
                  page_token: opts.page_token,
                  user_id_type: opts.user_id_type || 'open_id',
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        // Assemble full replies for each comment
        const items = result.data?.items || [];
        const assembled = await assembleCommentReplies(
          client,
          actualFileToken,
          actualFileType,
          items,
          opts.user_id_type || 'open_id',
        );

        outputResult({
          items: assembled,
          has_more: result.data?.has_more ?? false,
          page_token: result.data?.page_token,
        });
      });
    });

  docComments
    .command('create <file_token>')
    .description('Create a document comment')
    .requiredOption('--file_type <type>', 'File type: doc|docx|sheet|file|slides|wiki')
    .requiredOption('--elements <json>', 'Comment elements JSON array', parseJsonArg)
    .option('--user_id_type <type>', 'User ID type: open_id|union_id|user_id')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const elements = opts.elements as Array<{ type: string; text?: string; open_id?: string; url?: string }>;
        if (!elements || elements.length === 0) {
          outputError(new Error('elements parameter is required and cannot be empty'));
          return;
        }

        const client = getToolClient();
        const { actualFileToken, actualFileType } = await resolveDocToken(
          client,
          fileToken,
          opts.file_type,
        );

        const sdkElements = elements.map((el) => {
          if (el.type === 'text') {
            return { type: 'text_run', text_run: { text: el.text || '' } };
          } else if (el.type === 'mention') {
            return { type: 'person', person: { user_id: el.open_id || '' } };
          } else if (el.type === 'link') {
            return { type: 'docs_link', docs_link: { url: el.url || '' } };
          }
          return { type: 'text_run', text_run: { text: '' } };
        });

        const result = await client.invoke(
          'feishu_doc_comments.create',
          (sdk, sdkOpts) =>
            sdk.drive.v1.fileComment.create(
              {
                path: { file_token: actualFileToken },
                params: {
                  file_type: actualFileType,
                  user_id_type: opts.user_id_type || 'open_id',
                },
                data: {
                  reply_list: {
                    replies: [{ content: { elements: sdkElements } }],
                  },
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        outputResult(result.data);
      });
    });

  docComments
    .command('patch <file_token>')
    .description('Patch a comment (solve/unsolve)')
    .requiredOption('--file_type <type>', 'File type: doc|docx|sheet|file|slides|wiki')
    .requiredOption('--comment_id <id>', 'Comment ID')
    .requiredOption('--is_solved_value <bool>', 'Solve status: true or false', (v) => v === 'true')
    .action(async (fileToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const { actualFileToken, actualFileType } = await resolveDocToken(
          client,
          fileToken,
          opts.file_type,
        );

        await client.invoke(
          'feishu_doc_comments.patch',
          (sdk, sdkOpts) =>
            sdk.drive.v1.fileComment.patch(
              {
                path: { file_token: actualFileToken, comment_id: opts.comment_id },
                params: { file_type: actualFileType },
                data: { is_solved: opts.is_solved_value },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        outputResult({ success: true });
      });
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveDocToken(
  client: any,
  fileToken: string,
  fileType: string,
): Promise<{ actualFileToken: string; actualFileType: string }> {
  if (fileType === 'wiki') {
    const wikiNodeRes = await client.invoke(
      'feishu_doc_comments.resolve',
      (sdk: any, opts: any) =>
        sdk.wiki.space.getNode(
          {
            params: { token: fileToken, obj_type: 'wiki' },
          },
          opts,
        ),
      { as: 'user' },
    );
    const node = wikiNodeRes.data?.node;
    if (!node?.obj_token || !node?.obj_type) {
      throw new Error(`Failed to resolve wiki token "${fileToken}" to document object`);
    }
    return { actualFileToken: node.obj_token, actualFileType: node.obj_type };
  }
  return { actualFileToken: fileToken, actualFileType: fileType };
}

async function assembleCommentReplies(
  client: any,
  fileToken: string,
  fileType: string,
  comments: any[],
  userIdType: string,
): Promise<any[]> {
  const result = [];
  for (const comment of comments) {
    const assembled: any = { ...comment };
    if (comment.reply_list?.replies?.length > 0 || comment.has_more) {
      try {
        const replies: any[] = [];
        let pageToken: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const replyRes = await client.invoke(
            'drive.v1.fileCommentReply.list',
            (sdk: any, opts: any) =>
              sdk.drive.v1.fileCommentReply.list(
                {
                  path: { file_token, comment_id: comment.comment_id },
                  params: {
                    file_type: fileType,
                    page_token: pageToken,
                    page_size: 50,
                    user_id_type: userIdType,
                  },
                },
                opts,
              ),
            { as: 'user' },
          );

          const replyData = replyRes.data;
          if (replyRes.code === 0 && replyData?.items) {
            replies.push(...(replyData.items || []));
            hasMore = replyData.has_more || false;
            pageToken = replyData.page_token;
          } else {
            break;
          }
        }
        assembled.reply_list = { replies };
      } catch {
        // Keep original replies on error
      }
    }
    result.push(assembled);
  }
  return result;
}
