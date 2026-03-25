/**
 * Calendar commands: event and calendar management.
 *
 * Time parsing utilities ported from openclaw-lark for proper ISO 8601 validation.
 */
import type { Command } from 'commander';
import { outputResult, getToolClient, parseJsonArg, withAutoAuth } from './shared';

// ---------------------------------------------------------------------------
// Time parsing utilities (from openclaw-lark/src/tools/oapi/helpers.ts)
// ---------------------------------------------------------------------------

/**
 * Parse time string to Unix timestamp (seconds).
 * Supports ISO 8601 with timezone or assumes UTC+8 (Beijing time).
 */
function parseTimeToTimestamp(input: string): string | null {
  try {
    const trimmed = input.trim();
    const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);

    if (hasTimezone) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / 1000).toString();
    }

    // No timezone: assume Beijing time (UTC+8)
    const normalized = trimmed.replace('T', ' ');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / 1000).toString();
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
    return Math.floor(utcDate.getTime() / 1000).toString();
  } catch {
    return null;
  }
}

/**
 * Convert Unix timestamp (seconds or milliseconds) to ISO 8601 in Asia/Shanghai timezone.
 */
function unixTimestampToISO8601(raw: string | number | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const text = typeof raw === 'number' ? String(raw) : String(raw).trim();
  if (!/^-?\d+$/.test(text)) return null;

  const num = Number(text);
  if (!Number.isFinite(num)) return null;

  const utcMs = Math.abs(num) >= 1e12 ? num : num * 1000;
  const offset = 8 * 60 * 60 * 1000; // UTC+8
  const date = new Date(utcMs + offset);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+08:00`;
}

/**
 * Normalize event time fields to ISO 8601 format.
 */
function normalizeEventTimeFields(event: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!event) return event;
  const normalized: Record<string, unknown> = { ...event };

  const normalizeTime = (value: unknown): string | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const iso = unixTimestampToISO8601(value);
      return iso ?? value;
    }
    if (typeof value === 'object') {
      const timeObj = value as { timestamp?: unknown; date?: unknown };
      const fromTimestamp = unixTimestampToISO8601(timeObj.timestamp as string | number | undefined);
      if (fromTimestamp) return fromTimestamp;
      if (typeof timeObj.date === 'string') return timeObj.date;
    }
    return undefined;
  };

  const startTime = normalizeTime(event.start_time);
  if (startTime) normalized.start_time = startTime;

  const endTime = normalizeTime(event.end_time);
  if (endTime) normalized.end_time = endTime;

  const createTime = unixTimestampToISO8601(event.create_time as string | number | undefined);
  if (createTime) normalized.create_time = createTime;

  return normalized;
}

/**
 * Normalize a list of events.
 */
function normalizeEventList(events: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> | undefined {
  if (!events) return events;
  return events.map((e) => normalizeEventTimeFields(e) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// assertLarkOk helper
// ---------------------------------------------------------------------------

function assertLarkOk(res: { code?: number }): void {
  if (res.code !== undefined && res.code !== 0) {
    throw new Error(`Lark API error: code=${res.code}`);
  }
}

// ---------------------------------------------------------------------------
// Calendar commands registration
// ---------------------------------------------------------------------------

export function registerCalendarCommands(parent: Command): void {
  const cal = parent.command('calendar').description('Calendar and event management');

  // ---- calendar sub-group ----
  const calendar = cal.command('calendar').description('Calendar management');

  calendar
    .command('list')
    .description('List calendars')
    .option('--page_size <n>', 'Page size', '50')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_calendar_calendar.list',
          (sdk, sdkOpts) =>
            sdk.calendar.calendar.list(
              { params: { page_size: Number(opts.page_size), page_token: opts.page_token } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  calendar
    .command('get <calendar_id>')
    .description('Get calendar info')
    .action(async (calendarId) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_calendar_calendar.get',
          (sdk, sdkOpts) =>
            sdk.calendar.calendar.get({ path: { calendar_id: calendarId } }, sdkOpts || {}),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  calendar
    .command('primary')
    .description('Get primary calendar')
    .action(async () => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        const result = await client.invoke(
          'feishu_calendar_calendar.primary',
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- event sub-group ----
  const event = cal.command('event').description('Calendar event operations');

  event
    .command('list')
    .description('List events in a time range (uses instance_view)')
    .requiredOption('--start_time <time>', 'Start time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--end_time <time>', 'End time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();

        // Parse and validate times
        const startTs = parseTimeToTimestamp(opts.start_time);
        const endTs = parseTimeToTimestamp(opts.end_time);
        if (!startTs || !endTs) {
          throw new Error('Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm');
        }

        // Resolve calendar_id
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }

        const result = await client.invoke(
          'feishu_calendar_event.instance_view',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.instanceView(
              {
                path: { calendar_id: calendarId },
                params: { start_time: startTs, end_time: endTs, user_id_type: 'open_id' },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        // Normalize times in response
        const data = result.data as any;
        outputResult({
          events: normalizeEventList(data?.items),
          has_more: data?.has_more,
          page_token: data?.page_token,
        });
      });
    });

  event
    .command('create')
    .description('Create a calendar event')
    .requiredOption('--start_time <time>', 'Start time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--end_time <time>', 'End time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--summary <title>', 'Event title')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--description <desc>', 'Event description')
    .option('--attendees <json>', 'Attendees JSON array: [{"type":"user","id":"ou_xxx"}]', parseJsonArg)
    .option('--user_open_id <id>', 'User open_id to add as attendee ( SenderId from message context)')
    .option('--visibility <visibility>', 'Visibility: default|public|private')
    .option('--free_busy_status <status>', 'Free/busy status: busy|free')
    .option('--attendee_ability <ability>', 'Attendee ability: none|can_see_others|can_invite_others|can_modify_event')
    .option('--location <name>', 'Location name')
    .option('--location_address <address>', 'Location address')
    .option('--location_lat <lat>', 'Location latitude')
    .option('--location_lng <lng>', 'Location longitude')
    .option('--vc_type <type>', 'Video conference type: vc|third_party|no_meeting')
    .option('--vc_icon <icon>', 'Video conference icon: vc|live|default')
    .option('--vc_desc <desc>', 'Video conference description')
    .option('--vc_url <url>', 'Video conference meeting URL')
    .option('--reminders <json>', 'Reminders JSON array: [{"minutes":15}]', parseJsonArg)
    .option('--recurrence <rrule>', 'Recurrence rule (RFC 5545 RRULE)')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();

        // Parse and validate times
        const startTs = parseTimeToTimestamp(opts.start_time);
        const endTs = parseTimeToTimestamp(opts.end_time);
        if (!startTs || !endTs) {
          throw new Error('Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm');
        }

        // Resolve calendar_id
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }

        // Build event data
        const eventData: Record<string, unknown> = {
          summary: opts.summary,
          start_time: { timestamp: startTs },
          end_time: { timestamp: endTs },
          need_notification: true,
          attendee_ability: opts.attendee_ability ?? 'can_modify_event',
        };

        if (opts.description) eventData.description = opts.description;
        if (opts.visibility) eventData.visibility = opts.visibility;
        if (opts.free_busy_status) eventData.free_busy_status = opts.free_busy_status;

        // Location
        if (opts.location || opts.location_address || opts.location_lat || opts.location_lng) {
          const location: Record<string, unknown> = {};
          if (opts.location) location.name = opts.location;
          if (opts.location_address) location.address = opts.location_address;
          if (opts.location_lat !== undefined) location.latitude = Number(opts.location_lat);
          if (opts.location_lng !== undefined) location.longitude = Number(opts.location_lng);
          eventData.location = location;
        }

        // Video conference
        if (opts.vc_type || opts.vc_icon || opts.vc_desc || opts.vc_url) {
          const vchat: Record<string, unknown> = {};
          if (opts.vc_type) vchat.vc_type = opts.vc_type;
          if (opts.vc_icon) vchat.icon_type = opts.vc_icon;
          if (opts.vc_desc) vchat.description = opts.vc_desc;
          if (opts.vc_url) vchat.meeting_url = opts.vc_url;
          eventData.vchat = vchat;
        }

        // Reminders
        if (opts.reminders && Array.isArray(opts.reminders)) {
          eventData.reminders = opts.reminders.map((r: any) => ({ minutes: r.minutes }));
        }

        // Recurrence
        if (opts.recurrence) eventData.recurrence = opts.recurrence;

        // Create event
        const result = await client.invoke(
          'feishu_calendar_event.create',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.create(
              { path: { calendar_id: calendarId }, data: eventData as any },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        assertLarkOk(result);

        const eventId = (result.data as any)?.event?.event_id;

        // Two-step attendee creation
        const attendees: Array<{ type: string; id: string }> = [];

        // Add explicit attendees
        if (opts.attendees && Array.isArray(opts.attendees)) {
          for (const a of opts.attendees as Array<{ type: string; id: string }>) {
            attendees.push({ type: a.type, id: a.id });
          }
        }

        // Add user_open_id as attendee
        if (opts.user_open_id) {
          const alreadyIncluded = attendees.some((a) => a.type === 'user' && a.id === opts.user_open_id);
          if (!alreadyIncluded) {
            attendees.push({ type: 'user', id: opts.user_open_id });
          }
        }

        // Create attendees via API
        if (attendees.length > 0 && eventId) {
          const attendeeData = attendees.map((a) => ({
            type: a.type as 'user' | 'chat' | 'resource' | 'third_party',
            user_id: a.type === 'user' ? a.id : undefined,
            chat_id: a.type === 'chat' ? a.id : undefined,
            room_id: a.type === 'resource' ? a.id : undefined,
            third_party_email: a.type === 'third_party' ? a.id : undefined,
            operate_id: opts.user_open_id ?? attendees.find((x) => x.type === 'user')?.id,
          }));

          try {
            const attendeeRes = await client.invoke(
              'feishu_calendar_event.create',
              (sdk, sdkOpts) =>
                sdk.calendar.calendarEventAttendee.create(
                  {
                    path: { calendar_id: calendarId, event_id: eventId },
                    params: { user_id_type: 'open_id' as any },
                    data: { attendees: attendeeData, need_notification: true },
                  },
                  sdkOpts || {},
                ),
              { as: 'user' },
            );
            assertLarkOk(attendeeRes);
          } catch (attendeeErr) {
            // Log but don't fail - event was created successfully
            console.error(JSON.stringify({ warning: 'Event created but attendees failed to add', error: String(attendeeErr) }, null, 2));
          }
        }

        // Output result with normalized times
        outputResult({
          event: {
            event_id: eventId,
            summary: opts.summary,
            start_time: unixTimestampToISO8601(startTs) ?? opts.start_time,
            end_time: unixTimestampToISO8601(endTs) ?? opts.end_time,
          },
          attendees_added: attendees.length,
        });
      });
    });

  event
    .command('get <event_id>')
    .description('Get event details')
    .option('--calendar_id <id>', 'Calendar ID')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }
        const result = await client.invoke(
          'feishu_calendar_event.get',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.get(
              { path: { calendar_id: calendarId, event_id: eventId } },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        // Normalize times in response
        outputResult({
          event: normalizeEventTimeFields(result.data as any),
        });
      });
    });

  event
    .command('patch <event_id>')
    .description('Update an event')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--summary <title>', 'New title')
    .option('--description <desc>', 'New description')
    .option('--start_time <time>', 'New start time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .option('--end_time <time>', 'New end time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .option('--location <loc>', 'New location')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }
        const updateData: Record<string, unknown> = {};
        if (opts.summary) updateData.summary = opts.summary;
        if (opts.description) updateData.description = opts.description;
        if (opts.start_time) {
          const ts = parseTimeToTimestamp(opts.start_time);
          if (!ts) throw new Error('Invalid start_time format');
          updateData.start_time = { timestamp: ts };
        }
        if (opts.end_time) {
          const ts = parseTimeToTimestamp(opts.end_time);
          if (!ts) throw new Error('Invalid end_time format');
          updateData.end_time = { timestamp: ts };
        }
        if (opts.location) updateData.location = { name: opts.location };
        const result = await client.invoke(
          'feishu_calendar_event.patch',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.patch(
              { path: { calendar_id: calendarId, event_id: eventId }, data: updateData },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult({
          event: normalizeEventTimeFields(result.data as any),
        });
      });
    });

  event
    .command('delete <event_id>')
    .description('Delete an event')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--no_notification', 'Do not notify attendees')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }
        const result = await client.invoke(
          'feishu_calendar_event.delete',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.delete(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                params: { need_notification: (!opts.no_notification ? 'true' : 'false') as 'true' | 'false' },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        assertLarkOk(result);
        outputResult({ success: true, event_id: eventId });
      });
    });

  event
    .command('search')
    .description('Search events')
    .requiredOption('--query <query>', 'Search keyword')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }
        const result = await client.invoke(
          'feishu_calendar_event.search',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.search(
              {
                path: { calendar_id: calendarId },
                params: { page_size: opts.page_size, page_token: opts.page_token },
                data: { query: opts.query },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        // Normalize times in response
        const data = result.data as any;
        outputResult({
          events: normalizeEventList(data?.items),
          has_more: data?.has_more,
          page_token: data?.page_token,
        });
      });
    });

  event
    .command('reply <event_id>')
    .description('Reply to an event invitation')
    .requiredOption('--status <status>', 'RSVP status: accept|decline|tentative')
    .option('--calendar_id <id>', 'Calendar ID')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }
        const result = await client.invoke(
          'feishu_calendar_event.reply',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.reply(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                data: { rsvp_status: opts.status },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        assertLarkOk(result);
        outputResult({ success: true, event_id: eventId, rsvp_status: opts.status });
      });
    });

  // ---- event instances command (new) ----
  event
    .command('instances <event_id>')
    .description('List instances of a recurring event')
    .requiredOption('--start_time <time>', 'Start time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--end_time <time>', 'End time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();

        // Parse and validate times
        const startTs = parseTimeToTimestamp(opts.start_time);
        const endTs = parseTimeToTimestamp(opts.end_time);
        if (!startTs || !endTs) {
          throw new Error('Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm');
        }

        // Resolve calendar_id
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }

        const result = await client.invoke(
          'feishu_calendar_event.instances',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEvent.instances(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                params: {
                  start_time: startTs,
                  end_time: endTs,
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );

        // Normalize times in response
        const data = result.data as any;
        outputResult({
          instances: normalizeEventList(data?.items),
          has_more: data?.has_more,
          page_token: data?.page_token,
        });
      });
    });

  // ---- event-attendee sub-group (new) ----
  const eventAttendee = cal.command('event-attendee').description('Event attendee management');

  eventAttendee
    .command('create <event_id>')
    .description('Add attendees to an event')
    .option('--calendar_id <id>', 'Calendar ID')
    .requiredOption('--attendees <json>', 'Attendees JSON array: [{"type":"user","attendee_id":"ou_xxx"}]', parseJsonArg)
    .option('--no_notification', 'Do not notify attendees')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }

        const attendees = opts.attendees as Array<{ type: string; attendee_id: string }>;
        const attendeeData = attendees.map((a) => {
          const base: Record<string, unknown> = { type: a.type, is_optional: false };
          if (a.type === 'user') base.user_id = a.attendee_id;
          else if (a.type === 'chat') base.chat_id = a.attendee_id;
          else if (a.type === 'resource') base.room_id = a.attendee_id;
          else if (a.type === 'third_party') base.third_party_email = a.attendee_id;
          return base;
        });

        const result = await client.invoke(
          'feishu_calendar_event.create',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEventAttendee.create(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                params: { user_id_type: 'open_id' as any },
                data: {
                  attendees: attendeeData,
                  need_notification: !opts.no_notification,
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

  eventAttendee
    .command('list <event_id>')
    .description('List attendees of an event')
    .option('--calendar_id <id>', 'Calendar ID')
    .option('--page_size <n>', 'Page size')
    .option('--page_token <token>', 'Page token')
    .action(async (eventId, opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();
        let calendarId = opts.calendar_id;
        if (!calendarId) {
          const primary = await client.invoke(
            'feishu_calendar_calendar.primary',
            (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
            { as: 'user' },
          );
          calendarId = (primary.data as any)?.calendars?.[0]?.calendar?.calendar_id;
          if (!calendarId) throw new Error('Could not determine primary calendar');
        }

        const result = await client.invoke(
          'feishu_calendar_event_attendee.list',
          (sdk, sdkOpts) =>
            sdk.calendar.calendarEventAttendee.list(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                params: {
                  page_size: opts.page_size,
                  page_token: opts.page_token,
                  user_id_type: 'open_id' as any,
                },
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });

  // ---- freebusy command (new) ----
  cal
    .command('freebusy')
    .description('Query free/busy status for users')
    .requiredOption('--time_min <time>', 'Query start time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--time_max <time>', 'Query end time (ISO 8601 or YYYY-MM-DD HH:mm)')
    .requiredOption('--user_ids <json>', 'User IDs JSON array: ["ou_xxx", "ou_yyy"]', parseJsonArg)
    .action(async (opts) => {
      await withAutoAuth(async () => {
        const client = getToolClient();

        const userIds = opts.user_ids as string[];
        if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 10) {
          throw new Error('user_ids must be an array with 1-10 user IDs');
        }

        // Parse times to RFC 3339 format (required by freebusy API)
        const parseToRFC3339 = (input: string): string => {
          const trimmed = input.trim();
          const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);
          if (hasTimezone) return trimmed;

          // No timezone: assume UTC+8 and add it
          const normalized = trimmed.replace('T', ' ');
          const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
          if (match) {
            const [, year, month, day, hour, minute, second] = match;
            const sec = second ?? '00';
            return `${year}-${month}-${day}T${hour}:${minute}:${sec}+08:00`;
          }
          return trimmed;
        };

        const timeMin = parseToRFC3339(opts.time_min);
        const timeMax = parseToRFC3339(opts.time_max);

        const result = await client.invoke(
          'feishu_calendar_freebusy.list',
          (sdk, sdkOpts) =>
            sdk.calendar.freebusy.batch(
              {
                data: {
                  time_min: timeMin,
                  time_max: timeMax,
                  user_ids: userIds,
                  include_external_calendar: true,
                  only_busy: true,
                } as any,
              },
              sdkOpts || {},
            ),
          { as: 'user' },
        );
        outputResult(result.data);
      });
    });
}
