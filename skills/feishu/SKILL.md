---
name: feishu
description: Feishu/Lark full-capability CLI — messaging, documents, bitable, calendar, tasks, drive, wiki, sheets, search, auth. Use this skill when the user asks to interact with Feishu (飞书) APIs: send messages, manage calendar events, create/read/update documents, manage tasks, query bitable records, search across docs/wiki, manage drive files, etc.
alwaysActive: false
---

# Feishu CLI Skill

Standalone Feishu/Lark CLI tool. All commands output JSON to stdout.

## Prerequisites

- Config file at `~/.feishu-cli/config.json` or `.feishu-cli.json` in project root, OR env vars `FEISHU_APP_ID` / `FEISHU_APP_SECRET`
- User OAuth authorization: run `feishu auth device-flow` first for user-identity APIs

## Config Format

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "domain": "feishu"
    }
  }
}
```

## Command Reference

### Auth

```bash
feishu auth device-flow          # Start OAuth device flow (user identity)
feishu auth status               # Check account config status
```

### Calendar

```bash
# Calendar management
feishu calendar calendar list [--page_size 50]
feishu calendar calendar get <calendar_id>
feishu calendar calendar primary

# Event CRUD
feishu calendar event list --start_time "2026-03-25T00:00:00+08:00" --end_time "2026-03-26T00:00:00+08:00" [--calendar_id "cal_xxx"]
feishu calendar event create --start_time "2026-03-25T10:00:00+08:00" --end_time "2026-03-25T11:00:00+08:00" --summary "Meeting" [--description "..." --attendees '[{"type":"user","id":"ou_xxx"}]' --location "Room 1" --visibility default --free_busy_status busy --recurrence "FREQ=WEEKLY;COUNT=5" --reminders '[{"minutes":15}]']
feishu calendar event get <event_id> [--calendar_id "cal_xxx"]
feishu calendar event patch <event_id> [--summary "New title" --start_time "..." --end_time "..." --description "..." --location "..." --calendar_id "cal_xxx"]
feishu calendar event delete <event_id> [--calendar_id "cal_xxx" --no_notification]
feishu calendar event search --query "meeting" [--calendar_id "cal_xxx" --page_size 20]
feishu calendar event reply <event_id> --status "accept" [--calendar_id "cal_xxx"]
feishu calendar event instances <event_id> --start_time "..." --end_time "..." [--calendar_id "cal_xxx"]

# Attendee management
feishu calendar event-attendee create <event_id> --attendees '[{"type":"user","attendee_id":"ou_xxx"}]' [--calendar_id "cal_xxx" --no_notification]
feishu calendar event-attendee list <event_id> [--calendar_id "cal_xxx" --page_size 50]

# Free/busy query
feishu calendar freebusy --time_min "2026-03-25T00:00:00+08:00" --time_max "2026-03-26T00:00:00+08:00" --user_ids '["ou_xxx","ou_yyy"]'
```

### Task

```bash
# Task CRUD
feishu task task create --summary "Buy groceries" [--description "..." --due "2026-04-01T18:00:00+08:00" --start "2026-03-28T09:00:00+08:00" --repeat "FREQ=DAILY" --members '[{"id":"ou_xxx"}]' --tasklists '[{"tasklist_guid":"tl_xxx"}]']
feishu task task list [--completed --page_size 50 --page_token "..."]
feishu task task get <task_guid>
feishu task task patch <task_guid> [--summary "New title" --description "..." --due "..." --start "..." --completed_at "1711000000000" --repeat "..." --members '[...]']

# Tasklist management
feishu task tasklist create --name "Sprint 1" [--members '[{"id":"ou_xxx"}]']
feishu task tasklist get <tasklist_guid>
feishu task tasklist list [--page_size 50]
feishu task tasklist tasks <tasklist_guid> [--completed --page_size 50]
feishu task tasklist patch <tasklist_guid> --name "New Name"
feishu task tasklist add-members <tasklist_guid> --members '[{"id":"ou_xxx","role":"editor"}]'

# Subtask
feishu task subtask create <task_guid> --summary "Sub item" [--description "..." --due "..." --start "..." --members '[{"id":"ou_xxx"}]']
feishu task subtask list <task_guid> [--page_size 50]
```

### Bitable (Multi-dimensional Tables)

```bash
# App
feishu bitable create --name "CRM" [--folder_token "fld_xxx"]
feishu bitable get <app_token>
feishu bitable list [--folder_token "fld_xxx"]
feishu bitable patch <app_token> [--name "New Name" --is_advanced true]
feishu bitable copy <app_token> --name "CRM Copy" [--folder_token "fld_xxx"]

# Table
feishu bitable table list <app_token>
feishu bitable table create <app_token> --name "Sheet1" [--default_view_name "Grid" --fields '[{"field_name":"Name","type":1}]']
feishu bitable table patch <app_token> <table_id> [--name "New Name"]
feishu bitable table batch_create <app_token> --tables '[{"name":"T1"},{"name":"T2"}]'

# Record
feishu bitable record list <app_token> <table_id> [--view_id "viwxxx" --filter '{"conjunction":"and","conditions":[{"field_name":"Status","operator":"is","value":["进行中"]}]}' --sort '[{"field_name":"Created","desc":true}]' --field_names '["Name","Age"]' --page_size 20]
feishu bitable record create <app_token> <table_id> --fields '{"Name":"Alice","Age":25}'
feishu bitable record update <app_token> <table_id> <record_id> --fields '{"Age":26}'
feishu bitable record delete <app_token> <table_id> <record_id>
feishu bitable record batch_create <app_token> <table_id> --records '[{"fields":{"Name":"A"}},{"fields":{"Name":"B"}}]'
feishu bitable record batch_update <app_token> <table_id> --records '[{"record_id":"recxxx","fields":{"Age":30}}]'
feishu bitable record batch_delete <app_token> <table_id> --records '[{"record_id":"recxxx"}]'

# Field
feishu bitable field list <app_token> <table_id>
feishu bitable field create <app_token> <table_id> --field_name "Status" --type 3 [--property '{"options":[{"name":"Todo"},{"name":"Done"}]}']
feishu bitable field update <app_token> <table_id> <field_id> [--field_name "New Name" --type 3 --property '{...}']
feishu bitable field delete <app_token> <table_id> <field_id>

# View
feishu bitable view list <app_token> <table_id>
feishu bitable view get <app_token> <table_id> <view_id>
feishu bitable view create <app_token> <table_id> --view_name "Kanban" [--view_type kanban]
feishu bitable view patch <app_token> <table_id> <view_id> [--view_name "New Name" --config '{...}']
```

### IM (Instant Messaging)

```bash
feishu im send --receive_id_type open_id --receive_id "ou_xxx" --msg_type text --content '"hello"'
feishu im reply <message_id> --msg_type text --content '"reply"' [--reply_in_thread]
feishu im get-messages --chat_id "oc_xxx" [--page_size 50 --sort create_time_desc --start_time "2026-03-01T00:00:00+08:00" --end_time "2026-03-28T00:00:00+08:00" --relative_time "last_7_days"]
feishu im get-messages --open_id "ou_xxx" [--page_size 20]
feishu im get-thread-messages --thread_id "omt_xxx" [--page_size 50 --sort create_time_asc]
feishu im search-messages [--query "keyword" --chat_id "oc_xxx" --sender_ids '["ou_xxx"]' --mention_ids '["ou_yyy"]' --message_type file --sender_type user --chat_type group --start_time "..." --end_time "..." --relative_time "this_week"]
feishu im fetch-resource --message_id "om_xxx" --file_key "img_v3_xxx" --type image [--output_path "./photo.png"]
```

### Drive

```bash
# File operations
feishu drive list [--folder_token "fld_xxx" --page_size 200 --order_by EditedTime --direction DESC]
feishu drive get-meta --docs '[{"doc_token":"docuxxx","doc_type":"sheet"}]'
feishu drive upload --file_path "./report.pdf" [--parent_node "fld_xxx"]
feishu drive download <file_token> [--output_path "./report.pdf"]
feishu drive copy <file_token> --name "Copy" --type doc [--folder_token "fld_xxx"]
feishu drive move <file_token> --type doc --folder_token "fld_xxx"
feishu drive delete <file_token> --type doc

# Document media (insert images/files into documents)
feishu drive doc-media insert <doc_id> --file_path "./image.png" [--type image --align center --caption "Figure 1"]
feishu drive doc-media download <resource_token> --resource_type media --output_path "./out"

# Document comments
feishu drive doc-comments list <file_token> --file_type docx [--is_whole --is_solved --page_size 50]
feishu drive doc-comments create <file_token> --file_type docx --elements '[{"type":"text","text":"Nice work!"}]'
feishu drive doc-comments patch <file_token> --file_type docx --comment_id "cmt_xxx" --is_solved_value true
```

### Wiki

```bash
# Space
feishu wiki space list [--page_size 50]
feishu wiki space get <space_id>
feishu wiki space create [--name "Knowledge Base" --description "..."]

# Node
feishu wiki node list <space_id> [--parent_node_token "nodexxx" --page_size 50]
feishu wiki node get <token> [--obj_type docx]
feishu wiki node create <space_id> --obj_type docx --node_type origin [--parent_node_token "nodexxx" --title "New Page"]
feishu wiki node move <space_id> <node_token> [--target_parent_token "nodexxx"]
feishu wiki node copy <space_id> <node_token> [--target_space_id "spcexxx" --target_parent_token "nodexxx" --title "Copy"]
```

### Doc

```bash
feishu doc fetch <doc_id> [--offset 0 --limit 5000]
feishu doc create --title "New Doc" --content "# Hello" [--file ./content.md --folder_token "fld_xxx" --wiki_node "nodexxx" --wiki_space "spcexxx"]
feishu doc update --token <doc_id> --mode overwrite --content "# Updated" [--file ./content.md --selection "start...end" --selection_by_title "## Section" --new_title "New Title"]
```

Update modes for `doc update`:
- `overwrite` — Replace entire document body
- `append` — Append to end of document
- `replace_range` — Replace selected range (requires `--selection` or `--selection_by_title`)
- `replace_all` — Find and replace all occurrences
- `insert_before` — Insert before selected range
- `insert_after` — Insert after selected range
- `delete_range` — Delete selected range (no `--content` needed)

### Sheets

```bash
feishu sheets info --spreadsheet_token "shtxxx"
feishu sheets read --spreadsheet_token "shtxxx" --range "Sheet1!A1:C10" [--value_render_option ToString]
feishu sheets write --spreadsheet_token "shtxxx" --range "Sheet1!A1" --values '[["Name","Age"],["Alice",25]]'
feishu sheets append --spreadsheet_token "shtxxx" --range "Sheet1" --values '[["Bob",30]]'
feishu sheets find --spreadsheet_token "shtxxx" --sheet_id "sheetId" --find "Alice" [--range "A1:Z100" --match_case --match_entire_cell --search_by_regex]
feishu sheets create --title "New Sheet" [--folder_token "fld_xxx" --headers '["Name","Age","City"]' --data '[["Alice",25,"BJ"]]']
feishu sheets export --spreadsheet_token "shtxxx" --file_extension xlsx [--output_path "./out.xlsx" --sheet_id "sheetId"]
```

### Search

```bash
feishu search doc-wiki --query "project plan" [--doc_types "DOC,SHEET,WIKI,DOCX" --only_title --creator_ids "ou_xxx,ou_yyy" --sort_type EDIT_TIME --open_time_start "2026-01-01T00:00:00Z" --create_time_start "2025-01-01T00:00:00Z" --page_size 20]
```

### Chat

```bash
feishu chat get <chat_id>
feishu chat search --query "project" [--page_size 20]
feishu chat members <chat_id> [--member_id_type open_id --page_size 100]
```

### User

```bash
feishu user get                    # Get current user info
feishu user get <user_id>          # Get specific user info
feishu user search --query "Alice" [--page_size 20]
```

### Send (Convenience)

```bash
feishu send text --to "ou_xxx" --text "Hello"
feishu send text --to "oc_xxx" --type chat_id --text "Hello group"
feishu send card --to "ou_xxx" --content '{"elements":[...]}'
feishu send media --to "ou_xxx" --msg_type image --key "img_v3_xxx"
```

## Sub-agent Knowledge Files

按需加载详细领域知识。当用户请求涉及以下领域时，**先读取对应 reference 获取完整约束和指导**：

| 领域 | 文件 | 触发场景 |
|------|------|---------|
| 多维表格 | `references/bitable.md` | bitable 记录 CRUD、字段类型、筛选、27 种字段配置 |
| 日历 | `references/calendar.md` | 日程创建/查询、忙闲查询、参会人管理、循环事件 |
| 读取文档 | `references/doc-fetch.md` | 获取 doc/wiki/sheets 内容、图片/文件处理 |
| 创建文档 | `references/doc-create.md` | 从 Markdown 创建新文档、Lark-flavored 格式 |
| 更新文档 | `references/doc-update.md` | 7 种更新模式：追加/覆盖/定位替换/全文替换 |
| IM 消息 | `references/im-read.md` | 历史消息、话题回复、搜索、资源下载 |
| 任务 | `references/task.md` | 任务 CRUD、清单管理、子任务、负责人/关注人 |
| 排障 | `references/troubleshoot.md` | 错误排查、FAQ、诊断步骤 |
| 输出规则 | `references/channel-rules.md` | 飞书消息格式规范、Markdown 差异 |

**导航规则**：
1. 简单查询（如 list、get）→ 直接用上方 Command Reference 执行，无需加载 reference
2. 涉及字段类型、约束、高级操作 → 先读取对应 reference
3. 用户提到"多维表格"、"bitable"、"数据表" → 加载 `references/bitable.md`
4. 创建/更新文档 → 加载 `references/doc-create.md` 或 `references/doc-update.md`
5. 出现 API 错误 → 加载 `references/troubleshoot.md`

## Reference Data Files

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `references/field-properties.md` | 27 种字段类型配置详解 | 创建/修改 bitable 字段时 |
| `references/record-values.md` | 记录值数据格式详解 | 写入 bitable 记录时 |
| `references/examples.md` | 使用场景完整示例 | 需要用法参考时 |
| `references/markdown-syntax.md` | 飞书 Markdown 与标准差异 | 生成飞书格式内容时 |

## Error Handling

All commands output JSON. On error:
```json
{"error": "Error message here"}
```
Exit code 1 on error.

## Common Error Codes

- **99991672** — App missing required scope (admin needs to enable in Feishu Open Platform)
- **99991679** — User missing required scope (run `feishu auth device-flow` to authorize)
- **99991668** — Token invalid/expired (re-authorize)
- **99991663** — Rate limited (retry after delay)

## Notes

- All timestamps use **ISO 8601** format for calendar/task APIs
- All `*_id` fields require proper prefixes: `ou_` (open_id), `oc_` (chat_id), `om_` (message_id)
- Filter operators for bitable: `is`, `isNot`, `contains`, `notContains`, `isEmpty`, `isNotEmpty`, `gt`, `gte`, `lt`, `lte`
- JSON string arguments (like `--content`, `--fields`, `--filter`) should be properly quoted for shell
- Positional arguments (shown as `<arg>`) must appear **after** the subcommand, **before** any options
