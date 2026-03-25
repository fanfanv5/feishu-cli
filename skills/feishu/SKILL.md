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
feishu calendar event list --start_time "2026-03-25T00:00:00+08:00" --end_time "2026-03-26T00:00:00+08:00" [--calendar_id "cal_xxx"]
feishu calendar event create --start_time "2026-03-25T10:00:00+08:00" --end_time "2026-03-25T11:00:00+08:00" --summary "Meeting" [--description "..." --attendees '[{"user_id":"ou_xxx"}]' --location '{"name":"Room 1"}']
feishu calendar event get --event_id "ev_xxx"
feishu calendar event patch --event_id "ev_xxx" [--summary "New title" --start_time "..."]
feishu calendar event delete --event_id "ev_xxx"
feishu calendar event search --query "meeting" [--calendar_id "cal_xxx"]
feishu calendar event reply --event_id "ev_xxx" --rsvp_status "accept"
```

### Task

```bash
feishu task task create --summary "Buy groceries" [--description "..." --due '{"timestamp":"1711000000000"}']
feishu task task list [--completed] [--page_size 50]
feishu task task get --task_guid "task_xxx"
feishu task task patch --task_guid "task_xxx" --completed_at "1711000000000"
feishu task tasklist create --name "Sprint 1"
feishu task tasklist list
feishu task tasklist tasks --tasklist_guid "tl_xxx"
```

### Bitable (Multi-dimensional Tables)

```bash
# App
feishu bitable create --name "CRM" [--folder_token "fld_xxx"]
feishu bitable list
feishu bitable get <app_token>

# Table
feishu bitable table list <app_token>
feishu bitable table create --name "Sheet1" <app_token>

# Record
feishu bitable record list --app_token "basexxx" --table_id "tblxxx" [--view_id "viwxxx" --filter '{"conjunction":"and","conditions":[{"field_name":"Status","operator":"is","value":["进行中"]}]}' --sort '[{"field_name":"Created","desc":true}]']
feishu bitable record create --app_token "basexxx" --table_id "tblxxx" --fields '{"Name":"Alice","Age":25}'
feishu bitable record update --app_token "basexxx" --table_id "tblxxx" --record_id "recxxx" --fields '{"Age":26}'
feishu bitable record delete <app_token> <table_id> <record_id>

# Field
feishu bitable field list <app_token> <table_id>

# View
feishu bitable view list <app_token> <table_id>
```

### IM (Instant Messaging)

```bash
feishu im send --receive_id_type open_id --receive_id "ou_xxx" --msg_type text --content '"hello"'
feishu im reply --message_id "om_xxx" --msg_type text --content '"reply"'
feishu im get-messages --open_id "ou_xxx" [--count 20]
feishu im search-messages --query "keyword" [--open_id "ou_xxx"]
feishu im fetch-resource --message_id "om_xxx" --file_key "img_v3_xxx" --type image [--output_path "./photo.png"]
```

### Drive

```bash
feishu drive list [--folder_token "fld_xxx"]
feishu drive get-meta --docs '[{"doc_token":"docuxxx"}]'
feishu drive upload --file_path "./report.pdf" [--parent_node "fld_xxx"]
feishu drive download --file_token "docuxxx" [--output_path "./report.pdf"]
feishu drive copy --file_token "docuxxx" --name "Copy" --type doc
feishu drive move --file_token "docuxxx" --folder_token "fld_xxx" --type doc
feishu drive delete --file_token "docuxxx" --type doc
```

### Wiki

```bash
feishu wiki space list
feishu wiki space get --space_id "spcexxx"
feishu wiki node list --space_id "spcexxx" [--parent_node_token "nodexxx"]
feishu wiki node get --token "wiknxxx" [--obj_type docx]
feishu wiki node create --space_id "spcexxx" --obj_type docx --title "New Page" [--parent_node_token "nodexxx"]
```

### Doc

```bash
feishu doc fetch --doc_id "docuxxx" [--offset 0 --limit 5000]
```

### Sheets

```bash
feishu sheets info --spreadsheet_token "shtxxx"
feishu sheets read --spreadsheet_token "shtxxx" --range "Sheet1!A1:C10"
feishu sheets write --spreadsheet_token "shtxxx" --range "Sheet1!A1" --values '[["Name","Age"],["Alice",25]]'
feishu sheets append --spreadsheet_token "shtxxx" --range "Sheet1" --values '[["Bob",30]]'
feishu sheets find --spreadsheet_token "shtxxx" --query "Alice"
```

### Search

```bash
feishu search doc-wiki --query "project plan" [--type doc]
```

### Chat

```bash
feishu chat get --chat_id "oc_xxx"
feishu chat search --query "project"
feishu chat members --chat_id "oc_xxx"
```

### User

```bash
feishu user get [--user_id "ou_xxx"]
feishu user search --query "Alice"
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
| 任务 | `references/task.md` | 任务 CRUD、清单管理、负责人/关注人 |
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
