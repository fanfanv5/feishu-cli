/**
 * Sheets commands: info, read, write, append, find, create, export.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, parseJsonArg, withAutoAuth } from './shared.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MAX_READ_ROWS = 200;
const MAX_WRITE_ROWS = 5000;
const MAX_WRITE_COLS = 100;

export function registerSheetsCommands(parent: Command): void {
  const sheets = parent.command('sheets').description('Spreadsheet operations');

  sheets
    .command('info')
    .description('Get spreadsheet info and sheet list')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);
        const [spreadsheetRes, sheetsRes] = await Promise.all([
          client.invoke(
            'feishu_sheet.info',
            (sdk, sdkOpts) =>
              sdk.sheets.spreadsheet.get({ path: { spreadsheet_token: token } }, sdkOpts || {}),
            { as: 'user' },
          ),
          client.invoke(
            'feishu_sheet.info',
            (sdk, sdkOpts) =>
              sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, sdkOpts || {}),
            { as: 'user' },
          ),
        ]);
        const spreadsheet = spreadsheetRes.data?.spreadsheet;
        const sheetList = (sheetsRes.data?.sheets ?? []).map((s: any) => ({
          sheet_id: s.sheet_id,
          title: s.title,
          index: s.index,
          row_count: s.grid_properties?.row_count,
          column_count: s.grid_properties?.column_count,
          frozen_row_count: s.grid_properties?.frozen_row_count,
          frozen_column_count: s.grid_properties?.frozen_column_count,
        }));
        outputResult({
          title: spreadsheet?.title,
          spreadsheet_token: token,
          sheets: sheetList,
        });
      });
    });

  sheets
    .command('read')
    .description('Read cell values')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .option('--range <range>', 'Range (e.g. sheetId!A1:D10)')
    .option('--sheet_id <id>', 'Sheet ID (used when no range)')
    .option('--value_render_option <opt>', 'ToString|FormattedValue|Formula|UnformattedValue')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);
        const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
        const query: Record<string, string> = {
          valueRenderOption: opts.value_render_option ?? 'ToString',
          dateTimeRenderOption: 'FormattedString',
        };
        const res = await client.invokeByPath<{
          code?: number;
          msg?: string;
          data?: { valueRange?: { range?: string; values?: unknown[][] } };
        }>('feishu_sheet.read', `/open-apis/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(range)}`, {
          method: 'GET',
          query,
          as: 'user',
        });
        if (res.code && res.code !== 0) {
          outputError(new Error(res.msg || `API error code: ${res.code}`));
          return;
        }

        // Flatten rich text and truncate rows
        let values = flattenValues(res.data?.valueRange?.values);
        const totalRows = values?.length || 0;
        let truncated = false;
        if (values && values.length > MAX_READ_ROWS) {
          values = values.slice(0, MAX_READ_ROWS);
          truncated = true;
        }

        outputResult({
          range: res.data?.valueRange?.range,
          values,
          ...(truncated
            ? {
                truncated: true,
                total_rows: totalRows,
                hint: `Data exceeds ${MAX_READ_ROWS} rows, truncated. Please narrow the range and read again.`,
              }
            : {}),
        });
      });
    });

  sheets
    .command('write')
    .description('Write cell values (overwrite)')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .option('--range <range>', 'Range')
    .option('--sheet_id <id>', 'Sheet ID')
    .requiredOption('--values <json>', 'Values as 2D JSON array', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const values = opts.values as unknown[][];
        if (values.length > MAX_WRITE_ROWS) {
          outputError(new Error(`write row count ${values.length} exceeds limit ${MAX_WRITE_ROWS}`));
          return;
        }
        if (values.some((row) => Array.isArray(row) && row.length > MAX_WRITE_COLS)) {
          outputError(new Error(`write column count exceeds limit ${MAX_WRITE_COLS}`));
          return;
        }

        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);
        const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
        const res = await client.invokeByPath<{ code?: number; msg?: string; data?: any }>(
          'feishu_sheet.write',
          `/open-apis/sheets/v2/spreadsheets/${token}/values`,
          {
            method: 'PUT',
            body: { valueRange: { range, values } },
            as: 'user',
          },
        );
        if (res.code && res.code !== 0) {
          outputError(new Error(res.msg || `API error code: ${res.code}`));
          return;
        }
        outputResult(res.data);
      });
    });

  sheets
    .command('append')
    .description('Append rows to a sheet')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .option('--range <range>', 'Range')
    .option('--sheet_id <id>', 'Sheet ID')
    .requiredOption('--values <json>', 'Values as 2D JSON array', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const values = opts.values as unknown[][];
        if (values.length > MAX_WRITE_ROWS) {
          outputError(new Error(`append row count ${values.length} exceeds limit ${MAX_WRITE_ROWS}`));
          return;
        }

        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);
        const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
        const res = await client.invokeByPath<{ code?: number; msg?: string; data?: any }>(
          'feishu_sheet.append',
          `/open-apis/sheets/v2/spreadsheets/${token}/values_append`,
          {
            method: 'POST',
            body: { valueRange: { range, values } },
            as: 'user',
          },
        );
        if (res.code && res.code !== 0) {
          outputError(new Error(res.msg || `API error code: ${res.code}`));
          return;
        }
        outputResult(res.data);
      });
    });

  sheets
    .command('find')
    .description('Find cells in a sheet')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .requiredOption('--sheet_id <id>', 'Sheet ID')
    .requiredOption('--find <text>', 'Search text or regex')
    .option('--range <range>', 'Search range (without sheetId prefix)')
    .option('--match_case', 'Case sensitive (default true)')
    .option('--match_entire_cell', 'Match entire cell only')
    .option('--search_by_regex', 'Use regex')
    .option('--include_formulas', 'Search formulas instead of values')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);
        const findCondition: Record<string, unknown> = {
          range: opts.range ? `${opts.sheet_id}!${opts.range}` : opts.sheet_id,
        };
        if (opts.match_case !== undefined) findCondition.match_case = !opts.match_case;
        if (opts.match_entire_cell !== undefined) findCondition.match_entire_cell = opts.match_entire_cell;
        if (opts.search_by_regex !== undefined) findCondition.search_by_regex = opts.search_by_regex;
        if (opts.include_formulas !== undefined) findCondition.include_formulas = opts.include_formulas;

        const result = await client.invoke(
          'feishu_sheet.find',
          (sdk, sdkOpts) =>
            sdk.sheets.spreadsheetSheet.find(
              {
                path: { spreadsheet_token: token, sheet_id: opts.sheet_id },
                data: { find_condition: findCondition as any, find: opts.find },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data?.find_result);
      });
    });

  sheets
    .command('create')
    .description('Create a new spreadsheet')
    .requiredOption('--title <title>', 'Spreadsheet title')
    .option('--folder_token <token>', 'Parent folder token')
    .option('--headers <json>', 'Header row as JSON array', parseJsonArg)
    .option('--data <json>', 'Initial data as 2D JSON array', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_sheet.create',
          (sdk, sdkOpts) =>
            sdk.sheets.spreadsheet.create(
              { data: { title: opts.title, folder_token: opts.folder_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        const spreadsheet = result.data?.spreadsheet;
        const token = spreadsheet?.spreadsheet_token;
        if (!token) {
          outputError(new Error('failed to create spreadsheet: no token returned'));
          return;
        }

        // Write headers and data if provided
        if (opts.headers || opts.data) {
          const allRows: unknown[][] = [];
          if (opts.headers) allRows.push(opts.headers as string[]);
          if (opts.data) allRows.push(...(opts.data as unknown[][]));

          if (allRows.length > 0) {
            const sheetsRes = await client.invoke(
              'feishu_sheet.create',
              (sdk, sdkOpts) =>
                sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, sdkOpts || {}),
              { as: 'user' },
            );
            const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
            if (firstSheet?.sheet_id) {
              const numRows = allRows.length;
              const numCols = Math.max(...allRows.map((r) => r.length));
              const range = `${firstSheet.sheet_id}!A1:${colLetter(numCols)}${numRows}`;

              await client.invokeByPath<{ code?: number; msg?: string }>(
                'feishu_sheet.create',
                `/open-apis/sheets/v2/spreadsheets/${token}/values`,
                {
                  method: 'PUT',
                  body: { valueRange: { range, values: allRows } },
                  as: 'user',
                },
              );
            }
          }
        }

        outputResult({
          spreadsheet_token: token,
          title: opts.title,
        });
      });
    });

  sheets
    .command('export')
    .description('Export spreadsheet to file')
    .option('--spreadsheet_token <token>', 'Spreadsheet token')
    .option('--url <url>', 'Spreadsheet URL')
    .requiredOption('--file_extension <ext>', 'Export format: xlsx or csv')
    .option('--output_path <path>', 'Local save path (with filename)')
    .option('--sheet_id <id>', 'Sheet ID (required for CSV export)')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        if (opts.file_extension === 'csv' && !opts.sheet_id) {
          outputError(new Error('sheet_id is required for CSV export (CSV can only export one worksheet at a time)'));
          return;
        }

        const client = getToolClient();
        const token = await resolveSheetToken(opts, client);

        // Step 1: Create export task
        const createRes = await client.invoke(
          'feishu_sheet.export',
          (sdk, sdkOpts) =>
            sdk.drive.exportTask.create(
              {
                data: {
                  file_extension: opts.file_extension,
                  token,
                  type: 'sheet',
                  sub_id: opts.sheet_id,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        const ticket = createRes.data?.ticket;
        if (!ticket) {
          outputError(new Error('failed to create export task: no ticket returned'));
          return;
        }

        // Step 2: Poll for completion
        let fileToken: string | undefined;
        let fileName: string | undefined;
        let fileSize: number | undefined;

        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const pollRes = await client.invoke(
            'feishu_sheet.export',
            (sdk, sdkOpts) => sdk.drive.exportTask.get({ path: { ticket }, params: { token } }, sdkOpts || {}),
            { as: 'user' },
          );
          const result = pollRes.data?.result;
          const jobStatus = result?.job_status;

          if (jobStatus === 0) {
            fileToken = result?.file_token;
            fileName = result?.file_name;
            fileSize = result?.file_size;
            break;
          }
          if (jobStatus !== undefined && jobStatus >= 3) {
            outputError(new Error(result?.job_error_msg || `export failed (status=${jobStatus})`));
            return;
          }
        }

        if (!fileToken) {
          outputError(new Error('export timeout: task did not complete within 30 seconds'));
          return;
        }

        // Step 3: Download if output_path provided
        if (opts.output_path) {
          const dlRes: any = await client.invoke(
            'feishu_sheet.export',
            (sdk, sdkOpts) => sdk.drive.exportTask.download({ path: { file_token } }, sdkOpts || {}),
            { as: 'user' },
          );
          const stream = dlRes.getReadableStream();
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          await fs.mkdir(path.dirname(opts.output_path), { recursive: true });
          await fs.writeFile(opts.output_path, Buffer.concat(chunks));

          outputResult({
            file_path: opts.output_path,
            file_name: fileName,
            file_size: fileSize,
          });
        } else {
          outputResult({
            file_token: fileToken,
            file_name: fileName,
            file_size: fileSize,
            hint: 'File exported. Provide output_path parameter to download locally.',
          });
        }
      });
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Known token type prefixes for detecting wiki tokens.
 */
const KNOWN_TOKEN_TYPES = new Set([
  'dox', 'doc', 'sht', 'bas', 'app', 'sld', 'bmn', 'fld', 'nod', 'box', 'jsn', 'img', 'isv',
  'wik', 'wia', 'wib', 'wic', 'wid', 'wie', 'dsb',
]);

function getTokenType(token: string): string | null {
  if (token.length >= 15) {
    const prefix = token[4] + token[9] + token[14];
    if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
  }
  if (token.length >= 3) {
    const prefix = token.substring(0, 3);
    if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
  }
  return null;
}

async function resolveSheetToken(
  opts: { spreadsheet_token?: string; url?: string },
  client: any,
): Promise<string> {
  let token: string;
  if (opts.spreadsheet_token) {
    token = opts.spreadsheet_token;
  } else if (opts.url) {
    try {
      const u = new URL(opts.url);
      const match = u.pathname.match(/\/(?:sheets|wiki)\/([^/?#]+)/);
      if (match) token = match[1];
      else throw new Error(`Failed to parse spreadsheet_token from URL: ${opts.url}`);
    } catch {
      throw new Error(`Failed to parse spreadsheet_token from URL: ${opts.url}`);
    }
  } else {
    throw new Error('--spreadsheet_token or --url is required');
  }

  // Detect and resolve wiki token
  const tokenType = getTokenType(token);
  if (tokenType === 'wik') {
    const wikiNodeRes = await client.invoke(
      'feishu_sheet.info',
      (sdk: any, opts: any) =>
        sdk.wiki.space.getNode(
          {
            params: { token, obj_type: 'wiki' },
          },
          opts,
        ),
      { as: 'user' },
    );
    const objToken = wikiNodeRes.data?.node?.obj_token;
    if (!objToken) {
      throw new Error(`Failed to resolve spreadsheet token from wiki token: ${token}`);
    }
    return objToken;
  }

  return token;
}

async function resolveSheetRange(
  token: string,
  range: string | undefined,
  sheetId: string | undefined,
  client: any,
): Promise<string> {
  if (range) return range;
  if (sheetId) return sheetId;
  // Auto-detect first sheet
  const sheetsRes = await client.invoke(
    'feishu_sheet.info',
    (sdk: any, opts: any) =>
      sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, opts),
    { as: 'user' },
  );
  const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
  if (!firstSheet?.sheet_id) throw new Error('Spreadsheet has no worksheets');
  return firstSheet.sheet_id;
}

function colLetter(n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Flatten rich text cell values to plain strings.
 * Feishu returns [{type:"text", text:"...", segmentStyle:{...}}, ...] for styled cells.
 */
function flattenCellValue(cell: unknown): unknown {
  if (!Array.isArray(cell)) return cell;
  // Check if it's a rich text segment array
  if (cell.length > 0 && cell.every((seg) => seg != null && typeof seg === 'object' && 'text' in seg)) {
    return cell.map((seg: any) => seg.text).join('');
  }
  return cell;
}

function flattenValues(values: unknown[][] | undefined): unknown[][] | undefined {
  if (!values) return values;
  return values.map((row) => row.map(flattenCellValue));
}
