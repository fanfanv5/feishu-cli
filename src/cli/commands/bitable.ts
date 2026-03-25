/**
 * Bitable commands: app, table, record, field, view management.
 */
import type { Command } from 'commander';
import { outputResult, getToolClient, parseJsonArg, withAutoAuth } from './shared';

export function registerBitableCommands(parent: Command): void {
  const bitable = parent.command('bitable').description('Bitable (multidimensional table) management');

  // ---- app ----
  bitable
    .command('create')
    .description('Create a bitable app')
    .requiredOption('--name <name>', 'App name')
    .option('--folder_token <token>', 'Parent folder token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app.create',
          (sdk, sdkOpts) =>
            sdk.bitable.app.create(
              { data: { name: opts.name, folder_token: opts.folder_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  bitable
    .command('get <app_token>')
    .description('Get bitable app info')
    .action(async (appToken) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app.get',
          (sdk, sdkOpts) =>
            sdk.bitable.app.get({ path: { app_token: appToken } }, sdkOpts || {}),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  bitable
    .command('list')
    .description('List bitable apps')
    .option('--folder_token <token>', 'Parent folder token')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app.list',
          (sdk, sdkOpts) =>
            sdk.drive.file.list(
              {
                params: {
                  folder_token: opts.folder_token as any,
                  page_size: opts.page_size as any,
                  page_token: opts.page_token,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        // Filter to only bitable type files (BUG FIX #3)
        const files = (result.data?.files as Array<{ type?: string }>) || [];
        const bitables = files.filter((f) => f.type === 'bitable');
        outputResult({ apps: bitables, has_more: result.data?.has_more, page_token: result.data?.page_token });
      });
    });

  // bitable patch command (MISSING FEATURE)
  bitable
    .command('patch <app_token>')
    .description('Update bitable app metadata')
    .option('--name <name>', 'New app name')
    .option('--is_advanced <bool>', 'Enable advanced permissions', parseJsonArg)
    .action(async (appToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = {};
        if (opts.name !== undefined) data.name = opts.name;
        if (opts.is_advanced !== undefined) data.is_advanced = opts.is_advanced;
        const result = await client.invoke(
          'feishu_bitable_app.patch',
          (sdk, sdkOpts) =>
            sdk.bitable.app.update(
              { path: { app_token: appToken }, data },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // bitable copy command (MISSING FEATURE)
  bitable
    .command('copy <app_token>')
    .description('Copy a bitable app')
    .requiredOption('--name <name>', 'New app name')
    .option('--folder_token <token>', 'Target folder token')
    .action(async (appToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = { name: opts.name };
        if (opts.folder_token) data.folder_token = opts.folder_token;
        const result = await client.invoke(
          'feishu_bitable_app.copy',
          (sdk, sdkOpts) =>
            sdk.bitable.app.copy(
              { path: { app_token: appToken }, data },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- table ----
  const table = bitable.command('table').description('Table operations');

  table
    .command('list <app_token>')
    .description('List tables in a bitable app')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (appToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table.list',
          (sdk, sdkOpts) =>
            sdk.bitable.appTable.list(
              { path: { app_token: appToken }, params: { page_size: opts.page_size, page_token: opts.page_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  table
    .command('create <app_token>')
    .description('Create a table')
    .requiredOption('--name <name>', 'Table name')
    .option('--default_view_name <name>', 'Default view name')
    .option('--fields <json>', 'Fields JSON array', parseJsonArg)
    .action(async (appToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const tableData: Record<string, unknown> = { name: opts.name };
        if (opts.default_view_name) tableData.default_view_name = opts.default_view_name;
        // Special field type handling: strip property from Checkbox (type=7) and URL (type=15)
        if (opts.fields) {
          tableData.fields = (opts.fields as Array<{ type?: number; property?: unknown }>).map((field) => {
            if ((field.type === 7 || field.type === 15) && field.property !== undefined) {
              const { property, ...fieldWithoutProperty } = field;
              return fieldWithoutProperty;
            }
            return field;
          });
        }
        const result = await client.invoke(
          'feishu_bitable_app_table.create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTable.create(
              { path: { app_token: appToken }, data: { table: tableData } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // table patch command (MISSING FEATURE)
  table
    .command('patch <app_token> <table_id>')
    .description('Update a table')
    .option('--name <name>', 'New table name')
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table.patch',
          (sdk, sdkOpts) =>
            sdk.bitable.appTable.patch(
              { path: { app_token: appToken, table_id: tableId }, data: { name: opts.name } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // table batch_create command (MISSING FEATURE)
  table
    .command('batch_create <app_token>')
    .description('Batch create tables')
    .requiredOption('--tables <json>', 'Tables JSON array with names', parseJsonArg)
    .action(async (appToken, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table.batch_create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTable.batchCreate(
              { path: { app_token: appToken }, data: { tables: opts.tables } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- record ----
  const record = bitable.command('record').description('Record operations');

  record
    .command('list <app_token> <table_id>')
    .description('Search/list records')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--view_id <id>', 'View ID')
    .option('--field_names <json>', 'Field names JSON array', parseJsonArg)
    .option('--filter <json>', 'Filter condition JSON', parseJsonArg)
    .option('--sort <json>', 'Sort condition JSON', parseJsonArg)
    .option('--automatic_fields <bool>', 'Return automatic fields', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = {};
        if (opts.view_id !== undefined) data.view_id = opts.view_id;
        if (opts.field_names !== undefined) data.field_names = opts.field_names;
        if (opts.filter) {
          // isEmpty/isNotEmpty auto-fix: add value=[] (MISSING FEATURE)
          const filter = opts.filter as { conjunction?: string; conditions?: Array<{ operator?: string; value?: unknown }> };
          if (filter.conditions) {
            filter.conditions = filter.conditions.map((cond) => {
              if ((cond.operator === 'isEmpty' || cond.operator === 'isNotEmpty') && !cond.value) {
                cond.value = [];
              }
              return cond;
            });
          }
          data.filter = filter;
        }
        if (opts.sort) data.sort = opts.sort;
        if (opts.automatic_fields !== undefined) data.automatic_fields = opts.automatic_fields;
        // BUG FIX #2: Use search API instead of deprecated list API
        // BUG FIX #1: Pass filter/sort data to API (was dead code before)
        const result = await client.invoke(
          'feishu_bitable_app_table_record.list',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.search(
              {
                path: { app_token: appToken, table_id: tableId },
                params: { user_id_type: 'open_id' as any, page_size: opts.page_size, page_token: opts.page_token },
                data,
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({ records: result.data?.items, has_more: result.data?.has_more, page_token: result.data?.page_token, total: result.data?.total });
      });
    });

  record
    .command('create <app_token> <table_id>')
    .description('Create a record')
    .requiredOption('--fields <json>', 'Record fields JSON object', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const fields = opts.fields as Record<string, unknown>;
        // Validate fields is non-empty (MISSING FEATURE)
        if (!fields || Object.keys(fields).length === 0) {
          outputResult({ error: 'fields is required and cannot be empty' });
          return;
        }
        const result = await client.invoke(
          'feishu_bitable_app_table_record.create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.create(
              {
                path: { app_token: appToken, table_id: tableId },
                params: { user_id_type: 'open_id' as any },
                data: { fields },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  record
    .command('update <app_token> <table_id> <record_id>')
    .description('Update a record')
    .requiredOption('--fields <json>', 'Record fields JSON object', parseJsonArg)
    .action(async (appToken, tableId, recordId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const fields = opts.fields as Record<string, unknown>;
        // Validate fields is non-empty (MISSING FEATURE)
        if (!fields || Object.keys(fields).length === 0) {
          outputResult({ error: 'fields is required and cannot be empty' });
          return;
        }
        const result = await client.invoke(
          'feishu_bitable_app_table_record.update',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.update(
              {
                path: { app_token: appToken, table_id: tableId, record_id: recordId },
                params: { user_id_type: 'open_id' as any },
                data: { fields },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  record
    .command('delete <app_token> <table_id> <record_id>')
    .description('Delete a record')
    .action(async (appToken, tableId, recordId) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_record.delete',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.delete(
              { path: { app_token: appToken, table_id: tableId, record_id: recordId } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({ success: true });
      });
    });

  record
    .command('batch_create <app_token> <table_id>')
    .description('Batch create records')
    .requiredOption('--records <json>', 'Records JSON array', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_record.batch_create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.batchCreate(
              { path: { app_token: appToken, table_id: tableId }, params: { user_id_type: 'open_id' as any }, data: { records: opts.records } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  record
    .command('batch_update <app_token> <table_id>')
    .description('Batch update records')
    .requiredOption('--records <json>', 'Records JSON array with record_id and fields', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_record.batch_update',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.batchUpdate(
              { path: { app_token: appToken, table_id: tableId }, params: { user_id_type: 'open_id' as any }, data: { records: opts.records } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  record
    .command('batch_delete <app_token> <table_id>')
    .description('Batch delete records')
    .requiredOption('--records <json>', 'Records JSON array with record_id', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const records = (opts.records as Array<Record<string, string>>).map((r) => r.record_id);
        const result = await client.invoke(
          'feishu_bitable_app_table_record.batch_delete',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableRecord.batchDelete(
              { path: { app_token: appToken, table_id: tableId }, data: { records } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- field ----
  const field = bitable.command('field').description('Field (column) operations');

  field
    .command('list <app_token> <table_id>')
    .description('List fields')
    .option('--view_id <id>', 'View ID')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_field.list',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableField.list(
              { path: { app_token: appToken, table_id: tableId }, params: { view_id: opts.view_id, page_size: opts.page_size, page_token: opts.page_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  field
    .command('create <app_token> <table_id>')
    .description('Create a field')
    .requiredOption('--field_name <name>', 'Field name')
    .requiredOption('--type <n>', 'Field type number')
    .option('--property <json>', 'Field property JSON', parseJsonArg)
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const fieldType = Number(opts.type);
        const data: Record<string, unknown> = {
          field_name: opts.field_name, type: fieldType,
        };
        // Special field type handling: strip property from Checkbox (type=7) and URL (type=15)
        if (opts.property !== undefined && fieldType !== 7 && fieldType !== 15) {
          data.property = opts.property;
        }
        const result = await client.invoke(
          'feishu_bitable_app_table_field.create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableField.create(
              { path: { app_token: appToken, table_id: tableId }, data: data as any },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  field
    .command('update <app_token> <table_id> <field_id>')
    .description('Update a field')
    .option('--field_name <name>', 'New field name')
    .option('--type <n>', 'Field type number')
    .option('--property <json>', 'New field property JSON', parseJsonArg)
    .action(async (appToken, tableId, fieldId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let finalFieldName = opts.field_name;
        let finalType = opts.type !== undefined ? Number(opts.type) : undefined;
        let finalProperty = opts.property;
        // Auto-query fallback when type/field_name missing (MISSING FEATURE)
        if (!finalType || !finalFieldName) {
          const listResult = await client.invoke(
            'feishu_bitable_app_table_field.list',
            (sdk, sdkOpts) =>
              sdk.bitable.appTableField.list(
                { path: { app_token: appToken, table_id: tableId }, params: { page_size: 500 } },
                sdkOpts || {},
              ),
            { as: 'user' },
          );
          const currentField = listResult.data?.items?.find((f: { field_id?: string }) => f.field_id === fieldId);
          if (!currentField) {
            outputResult({ error: `field ${fieldId} does not exist` });
            return;
          }
          finalFieldName = opts.field_name || currentField.field_name;
          finalType = finalType ?? currentField.type;
          finalProperty = finalProperty !== undefined ? finalProperty : currentField.property;
        }
        const data: Record<string, unknown> = {
          field_name: finalFieldName, type: finalType,
        };
        if (finalProperty !== undefined) data.property = finalProperty;
        const result = await client.invoke(
          'feishu_bitable_app_table_field.update',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableField.update(
              { path: { app_token: appToken, table_id: tableId, field_id: fieldId }, data: data as any },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  field
    .command('delete <app_token> <table_id> <field_id>')
    .description('Delete a field')
    .action(async (appToken, tableId, fieldId) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_field.delete',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableField.delete(
              { path: { app_token: appToken, table_id: tableId, field_id: fieldId } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({ success: true });
      });
    });

  // ---- view ----
  const view = bitable.command('view').description('View operations');

  view
    .command('list <app_token> <table_id>')
    .description('List views')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_view.list',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableView.list(
              { path: { app_token: appToken, table_id: tableId }, params: { page_size: opts.page_size, page_token: opts.page_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  view
    .command('get <app_token> <table_id> <view_id>')
    .description('Get view details')
    .action(async (appToken, tableId, viewId) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_view.get',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableView.get(
              { path: { app_token: appToken, table_id: tableId, view_id: viewId } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  view
    .command('create <app_token> <table_id>')
    .description('Create a view')
    .requiredOption('--view_name <name>', 'View name')
    .option('--view_type <type>', 'View type (grid/kanban/gallery/gantt/form)')
    .action(async (appToken, tableId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_bitable_app_table_view.create',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableView.create(
              { path: { app_token: appToken, table_id: tableId }, data: { view_name: opts.view_name, view_type: (opts.view_type || 'grid') as any } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  view
    .command('patch <app_token> <table_id> <view_id>')
    .description('Update a view')
    .option('--view_name <name>', 'New view name')
    .option('--config <json>', 'View config JSON', parseJsonArg)
    .action(async (appToken, tableId, viewId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = {};
        if (opts.view_name) data.view_name = opts.view_name;
        if (opts.config) data.config = opts.config;
        const result = await client.invoke(
          'feishu_bitable_app_table_view.patch',
          (sdk, sdkOpts) =>
            sdk.bitable.appTableView.patch(
              { path: { app_token: appToken, table_id: tableId, view_id: viewId }, data },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });
}
