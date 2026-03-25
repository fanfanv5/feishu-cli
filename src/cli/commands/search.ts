/**
 * Search commands: document and wiki search.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, withAutoAuth } from './shared.js';

/**
 * Convert ISO 8601 time range to API format (seconds since epoch).
 */
function convertTimeRange(timeRange: { start?: string; end?: string } | undefined): { start?: string; end?: string } | undefined {
  if (!timeRange) return undefined;
  const result: { start?: string; end?: string } = {};
  if (timeRange.start) {
    const date = new Date(timeRange.start);
    if (!isNaN(date.getTime())) {
      result.start = String(Math.floor(date.getTime() / 1000));
    }
  }
  if (timeRange.end) {
    const date = new Date(timeRange.end);
    if (!isNaN(date.getTime())) {
      result.end = String(Math.floor(date.getTime() / 1000));
    }
  }
  if (Object.keys(result).length === 0) return undefined;
  return result;
}

/**
 * Convert Unix timestamp to ISO 8601 string.
 */
function unixTimestampToISO8601(ts: string | number | undefined): string | undefined {
  if (ts === undefined || ts === null || ts === '') return undefined;
  const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(num)) return undefined;
  // Check if already looks like ISO format (has 'T' or '-')
  if (typeof ts === 'string' && (ts.includes('T') || ts.includes('-'))) return ts;
  return new Date(num * 1000).toISOString();
}

/**
 * Recursively normalize timestamp fields in search results.
 */
function normalizeSearchResultTimeFields<T>(value: T, converted: { count: number }): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSearchResultTimeFields(item, converted)) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key.endsWith('_time')) {
      const iso = unixTimestampToISO8601(item as string | number | undefined);
      if (iso) {
        normalized[key] = iso;
        converted.count += 1;
        continue;
      }
    }
    normalized[key] = normalizeSearchResultTimeFields(item, converted);
  }
  return normalized as T;
}

export function registerSearchCommands(parent: Command): void {
  const search = parent.command('search').description('Search documents and wikis');

  search
    .command('doc-wiki')
    .description('Search documents and wikis')
    .option('--query <text>', 'Search keyword')
    .option('--doc_types <types>', 'Comma-separated doc types: DOC,SHEET,BITABLE,WIKI,DOCX,etc.')
    .option('--only_title', 'Search titles only')
    .option('--creator_ids <ids>', 'Comma-separated creator open_ids')
    .option('--sort_type <type>', 'Sort type: DEFAULT_TYPE|OPEN_TIME|EDIT_TIME|EDIT_TIME_ASC|CREATE_TIME')
    .option('--open_time_start <iso>', 'Open time range start (ISO 8601)')
    .option('--open_time_end <iso>', 'Open time range end (ISO 8601)')
    .option('--create_time_start <iso>', 'Create time range start (ISO 8601)')
    .option('--create_time_end <iso>', 'Create time range end (ISO 8601)')
    .option('--page_size <n>', 'Page size (max 20)')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const query = opts.query ?? '';

        const requestData: Record<string, unknown> = {
          query,
          page_size: opts.page_size,
          page_token: opts.page_token,
        };

        // Build filter for both doc and wiki
        const filter: Record<string, unknown> = {};
        if (opts.doc_types) filter.doc_types = opts.doc_types.split(',');
        if (opts.only_title) filter.only_title = true;
        if (opts.creator_ids) filter.creator_ids = opts.creator_ids.split(',');
        if (opts.sort_type) filter.sort_type = opts.sort_type;

        // Time range filters
        if (opts.open_time_start || opts.open_time_end) {
          filter.open_time = convertTimeRange({
            start: opts.open_time_start,
            end: opts.open_time_end,
          });
        }
        if (opts.create_time_start || opts.create_time_end) {
          filter.create_time = convertTimeRange({
            start: opts.create_time_start,
            end: opts.create_time_end,
          });
        }

        // API requires doc_filter and wiki_filter even if empty
        requestData.doc_filter = { ...filter };
        requestData.wiki_filter = { ...filter };

        const res = await client.invoke(
          'feishu_search_doc_wiki.search',
          async (sdk, _opts, uat) => {
            return sdk.request(
              {
                method: 'POST',
                url: '/open-apis/search/v2/doc_wiki/search',
                data: requestData,
                headers: {
                  Authorization: `Bearer ${uat}`,
                  'Content-Type': 'application/json; charset=utf-8',
                },
              },
              _opts,
            );
          },
          { as: 'user' },
        );

        if ((res as any).code !== 0) {
          throw new Error(`API Error: code=${(res as any).code}, msg=${(res as any).msg}`);
        }

        const data = res.data || {};
        const converted = { count: 0 };
        const normalizedResults = normalizeSearchResultTimeFields(data.res_units, converted);

        outputResult({
          total: data.total,
          has_more: data.has_more,
          results: normalizedResults,
          page_token: data.page_token,
        });
      });
    });
}
