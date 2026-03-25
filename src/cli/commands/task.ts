/**
 * Task commands: task and tasklist management.
 */
import type { Command } from 'commander';
import { outputResult, outputError, getToolClient, parseJsonArg, withAutoAuth } from './shared';

// Time parsing utility (matching openclaw-lark helpers.ts)
function parseTimeToTimestampMs(input: string): string | null {
  try {
    const trimmed = input.trim();
    const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);

    if (hasTimezone) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return date.getTime().toString();
    }

    // No timezone - treat as Beijing time (UTC+8)
    const normalized = trimmed.replace('T', ' ');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return date.getTime().toString();
    }

    const [, year, month, day, hour, minute, second] = match;
    const utcDate = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour) - 8,
        parseInt(minute),
        parseInt(second ?? '0'),
      ),
    );

    return utcDate.getTime().toString();
  } catch {
    return null;
  }
}

function parseDueTime(dueArg: string): { timestamp: string; is_all_day: boolean } {
  // Try JSON first
  if (dueArg.startsWith('{')) {
    const parsed = JSON.parse(dueArg);
    if (parsed.timestamp) {
      const ts = parseTimeToTimestampMs(parsed.timestamp);
      if (!ts) {
        throw new Error(`Invalid due time format: ${parsed.timestamp}`);
      }
      return { timestamp: ts, is_all_day: parsed.is_all_day ?? false };
    }
  }
  // Simple string
  const ts = parseTimeToTimestampMs(dueArg);
  if (!ts) {
    throw new Error(`Invalid due time format: ${dueArg}`);
  }
  return { timestamp: ts, is_all_day: false };
}

function parseStartTime(startArg: string): { timestamp: string; is_all_day: boolean } {
  if (startArg.startsWith('{')) {
    const parsed = JSON.parse(startArg);
    if (parsed.timestamp) {
      const ts = parseTimeToTimestampMs(parsed.timestamp);
      if (!ts) {
        throw new Error(`Invalid start time format: ${parsed.timestamp}`);
      }
      return { timestamp: ts, is_all_day: parsed.is_all_day ?? false };
    }
  }
  const ts = parseTimeToTimestampMs(startArg);
  if (!ts) {
    throw new Error(`Invalid start time format: ${startArg}`);
  }
  return { timestamp: ts, is_all_day: false };
}

function parseCompletedAt(value: string): string {
  if (value === '0') return '0';
  if (/^\d+$/.test(value)) return value;
  const ts = parseTimeToTimestampMs(value);
  if (!ts) {
    throw new Error(`Invalid completed_at format: ${value}`);
  }
  return ts;
}

export function registerTaskCommands(parent: Command): void {
  const task = parent.command('task').description('Task management');

  // ---- task sub-group ----
  const taskCmd = task.command('task').description('Task CRUD operations');

  taskCmd
    .command('create')
    .description('Create a task')
    .requiredOption('--summary <title>', 'Task title')
    .option('--description <desc>', 'Task description')
    .option('--due <time|json>', 'Due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--start <time|json>', 'Start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--repeat <rrule>', 'Repeat rule (RRULE format)')
    .option('--members <json>', 'Members JSON array', parseJsonArg)
    .option('--tasklists <json>', 'Tasklists JSON array', parseJsonArg)
    .option('--current-user-id <id>', 'Current user open_id')
    .option('--user-id-type <type>', 'User ID type (open_id|union_id|user_id)', 'open_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = { summary: opts.summary };
        if (opts.description) data.description = opts.description;
        if (opts.due) {
          data.due = parseDueTime(opts.due);
        }
        if (opts.start) {
          data.start = parseStartTime(opts.start);
        }
        if (opts.repeat) data.repeat_rule = opts.repeat;
        if (opts.members) data.members = opts.members;
        if (opts.tasklists) data.tasklists = opts.tasklists;
        if (opts.current_user_id) data.current_user_id = opts.current_user_id;
        const result = await client.invoke(
          'feishu_task_task.create',
          (sdk, sdkOpts) =>
            sdk.task.v2.task.create(
              { data: data as any, params: { user_id_type: opts.userIdType || 'open_id' } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  taskCmd
    .command('get <task_guid>')
    .description('Get task details')
    .option('--user-id-type <type>', 'User ID type (open_id|union_id|user_id)', 'open_id')
    .action(async (taskGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_task.get',
          (sdk, sdkOpts) =>
            sdk.task.v2.task.get(
              { path: { task_guid: taskGuid }, params: { user_id_type: opts.userIdType || 'open_id' } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  taskCmd
    .command('list')
    .description('List tasks')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--completed', 'Show only completed tasks')
    .option('--user-id-type <type>', 'User ID type (open_id|union_id|user_id)', 'open_id')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_task.list',
          (sdk, sdkOpts) =>
            sdk.task.v2.task.list(
              {
                params: {
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                  completed: opts.completed,
                  user_id_type: opts.userIdType || 'open_id',
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  taskCmd
    .command('patch <task_guid>')
    .description('Update a task')
    .option('--summary <title>', 'New title')
    .option('--description <desc>', 'New description')
    .option('--due <time|json>', 'New due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--start <time|json>', 'New start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--completed_at <val>', 'Complete time (ISO 8601, "0" to uncomplete, or ms timestamp)')
    .option('--repeat <rrule>', 'Repeat rule (RRULE format)')
    .option('--members <json>', 'New members JSON array', parseJsonArg)
    .option('--user-id-type <type>', 'User ID type (open_id|union_id|user_id)', 'open_id')
    .action(async (taskGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const updateData: Record<string, unknown> = {};
        if (opts.summary) updateData.summary = opts.summary;
        if (opts.description !== undefined) updateData.description = opts.description;
        if (opts.due) {
          updateData.due = parseDueTime(opts.due);
        }
        if (opts.start) {
          updateData.start = parseStartTime(opts.start);
        }
        if (opts.completed_at !== undefined) {
          updateData.completed_at = parseCompletedAt(opts.completed_at);
        }
        if (opts.repeat) updateData.repeat_rule = opts.repeat;
        if (opts.members) updateData.members = opts.members;
        const updateFields = Object.keys(updateData);
        if (updateFields.length === 0) {
          outputError(new Error('No fields to update'));
          return;
        }
        const result = await client.invoke(
          'feishu_task_task.patch',
          (sdk, sdkOpts) =>
            sdk.task.v2.task.patch(
              {
                path: { task_guid: taskGuid },
                data: { task: updateData, update_fields: updateFields },
                params: { user_id_type: opts.userIdType || 'open_id' },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- tasklist sub-group ----
  const tasklist = task.command('tasklist').description('Tasklist operations');

  tasklist
    .command('create')
    .description('Create a tasklist')
    .requiredOption('--name <name>', 'Tasklist name')
    .option('--members <json>', 'Members JSON array', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = { name: opts.name };
        if (opts.members) {
          data.members = (opts.members as Array<{ id: string; role?: string }>).map((m) => ({
            id: m.id, type: 'user', role: m.role || 'editor',
          }));
        }
        const result = await client.invoke(
          'feishu_task_tasklist.create',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.create(
              { params: { user_id_type: 'open_id' }, data: data as any },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  tasklist
    .command('get <tasklist_guid>')
    .description('Get tasklist details')
    .action(async (tasklistGuid) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_tasklist.get',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.get(
              { path: { tasklist_guid: tasklistGuid }, params: { user_id_type: 'open_id' } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  tasklist
    .command('list')
    .description('List tasklists')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_tasklist.list',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.list(
              {
                params: { page_size: opts.page_size, page_token: opts.page_token, user_id_type: 'open_id' },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  tasklist
    .command('tasks <tasklist_guid>')
    .description('List tasks in a tasklist')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .option('--completed', 'Show only completed tasks')
    .action(async (tasklistGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_tasklist.tasks',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.tasks(
              {
                path: { tasklist_guid: tasklistGuid },
                params: {
                  page_size: opts.page_size, page_token: opts.page_token,
                  completed: opts.completed, user_id_type: 'open_id',
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  tasklist
    .command('patch <tasklist_guid>')
    .description('Update a tasklist')
    .requiredOption('--name <name>', 'New name')
    .action(async (tasklistGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_tasklist.patch',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.patch(
              {
                path: { tasklist_guid: tasklistGuid },
                params: { user_id_type: 'open_id' },
                data: { tasklist: { name: opts.name }, update_fields: ['name'] },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  tasklist
    .command('add-members <tasklist_guid>')
    .description('Add members to a tasklist')
    .requiredOption('--members <json>', 'Members JSON array', parseJsonArg)
    .action(async (tasklistGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const memberData = (opts.members as Array<{ id: string; role?: string }>).map((m) => ({
          id: m.id, type: 'user', role: m.role || 'editor',
        }));
        const result = await client.invoke(
          'feishu_task_tasklist.add_members',
          (sdk, sdkOpts) =>
            sdk.task.v2.tasklist.addMembers(
              {
                path: { tasklist_guid: tasklistGuid },
                params: { user_id_type: 'open_id' },
                data: { members: memberData },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- subtask sub-group ----
  const subtask = task.command('subtask').description('Subtask operations');

  subtask
    .command('create <task_guid>')
    .description('Create a subtask')
    .requiredOption('--summary <title>', 'Subtask title')
    .option('--description <desc>', 'Subtask description')
    .option('--due <time|json>', 'Due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--start <time|json>', 'Start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}')
    .option('--members <json>', 'Members JSON array', parseJsonArg)
    .action(async (taskGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const data: Record<string, unknown> = { summary: opts.summary };
        if (opts.description) data.description = opts.description;
        if (opts.due) {
          data.due = parseDueTime(opts.due);
        }
        if (opts.start) {
          data.start = parseStartTime(opts.start);
        }
        if (opts.members) {
          data.members = (opts.members as Array<{ id: string; role?: string }>).map((m) => ({
            id: m.id, type: 'user', role: m.role || 'assignee',
          }));
        }
        const result = await client.invoke(
          'feishu_task_subtask.create',
          (sdk, sdkOpts) =>
            sdk.task.v2.taskSubtask.create(
              {
                path: { task_guid: taskGuid },
                params: { user_id_type: 'open_id' },
                data: data as any,
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  subtask
    .command('list <task_guid>')
    .description('List subtasks of a task')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (taskGuid, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_task_subtask.list',
          (sdk, sdkOpts) =>
            sdk.task.v2.taskSubtask.list(
              {
                path: { task_guid: taskGuid },
                params: {
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                  user_id_type: 'open_id',
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
