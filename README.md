# feishu-cli 安装使用手册 v2.0.3

feishu-cli 安装使用手册

本cli是openclaw-lark官方插件源码改造而来，不局限于openclaw，适配大多数AI工具场景使用

包名：**@fanfanv5/feishu-cli**
版本：**2.0.3**
命令：**feishu-cli**（别名 `feishu`）
适用平台：**Windows / macOS / Linux**

## 一、飞书应用创建与权限配置

### 1.1 创建企业自建应用

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 点击「创建企业自建应用」
3. 填写应用名称（如 feishu-cli）和描述
4. 记录 App ID 和 App Secret

### 1.2 申请 API 权限

在应用后台 → 「权限管理」页面，搜索并开通以下权限：

**权限快速导入json**

```json
{
  "scopes": {
    "tenant": [
      "im:message",
      "im:message:send_as_bot",
      "im:resource",
      "im:chat:read",
      "im:chat:update",
      "im:chat.members:read",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "docs:document.media:upload",
      "docs:document.media:download",
      "docs:document.comment:create",
      "docs:document.comment:read",
      "docs:document.comment:update",
      "docs:document:copy",
      "docs:document:export",
      "space:document:delete",
      "space:document:move",
      "wiki:node:read",
      "wiki:node:retrieve",
      "wiki:node:create",
      "wiki:node:move",
      "wiki:node:copy",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:space:write_only",
      "calendar:calendar:read",
      "calendar:calendar.event:create",
      "calendar:calendar.event:update",
      "calendar:calendar.event:delete",
      "calendar:calendar.event:read",
      "base:app:create",
      "base:app:read",
      "base:app:update",
      "base:app:copy",
      "base:table:create",
      "base:table:read",
      "base:table:update",
      "base:table:delete",
      "base:record:create",
      "base:record:retrieve",
      "base:record:update",
      "base:record:delete",
      "base:field:create",
      "base:field:read",
      "base:field:update",
      "base:field:delete",
      "base:view:read",
      "base:view:write_only",
      "drive:file:upload",
      "drive:file:download",
      "drive:drive.metadata:readonly",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "sheets:spreadsheet:create",
      "sheets:spreadsheet:read",
      "sheets:spreadsheet.meta:read",
      "sheets:spreadsheet:write_only",
      "application:application:self_manage",
      "contact:contact.base:readonly",
      "space:document:retrieve",
      "cardkit:card:read",
      "cardkit:card:write"
    ],
    "user": [
      "im:chat:read",
      "calendar:calendar:read",
      "calendar:calendar.event:read",
      "space:document:retrieve",
      "wiki:space:retrieve",
      "contact:contact.base:readonly",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "docs:document.media:upload",
      "wiki:node:read",
      "wiki:node:create",
      "board:whiteboard:node:create",
      "im:message.p2p_msg:get_as_user",
      "im:message.group_msg:get_as_user",
      "search:message",
      "calendar:calendar.event:reply",
      "calendar:calendar.free_busy:read",
      "task:task:read",
      "task:task:write",
      "task:task:writeonly",
      "task:tasklist:read",
      "task:tasklist:write",
      "task:comment:read",
      "task:comment:write",
      "search:docs:read",
      "contact:user.basic_profile:readonly",
      "contact:user.base:readonly",
      "contact:user:search",
      "offline_access"
    ]
  }
}
```

#### 消息相关（12 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 获取与发送单聊、群组消息（含群信息查询） | im:message | 消息收发 |
| 以应用的身份发消息 | im:message:send_as_bot | 机器人发消息 |
| 以用户身份发消息 | im:message:send_as_user | 代用户发消息 |
| 获取用户发给机器人的单聊消息 | im:message.p2p_msg:get_as_user | 读取单聊记录 |
| 获取群组中所有消息 | im:message.group_msg:get_as_user | 读取群聊记录 |
| 获取消息中@信息 | im:message.group_at_msg:readonly | @提及解析 |
| 获取消息中的资源文件 | im:resource | 下载图片/文件 |
| 获取群组信息 | im:chat:read | 群信息查询 |
| 修改群组信息 | im:chat:update | 群设置 |
| 获取群成员列表 | im:chat.members:read | 成员管理 |
| 消息搜索 | search:message | 搜索历史消息 |
| 消息表情回应 | im:message.reactions:read / im:message.reactions:write_only | 表情回应 |

> **注意：** 以下权限需同时开通用户身份授权类型（不仅仅是应用身份），否则 CLI 自动授权时无法获取完整权限：
> - im:chat:read
> - calendar:calendar:read
> - calendar:calendar.event:read
> - space:document:retrieve
> - wiki:space:retrieve
> - contact:contact.base:readonly
>
> CLI v2.0.3 已修复：自动授权时会查询应用已开通的 user scope 并一并传给 device flow，无需手动指定。

#### 文档相关（10 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 创建云文档 | docx:document:create | 新建文档 |
| 读取云文档 | docx:document:readonly | 获取文档内容 |
| 编辑云文档 | docx:document:write_only | 修改文档 |
| 上传文档素材 | docs:document.media:upload | 插入图片/文件 |
| 下载文档素材 | docs:document.media:download | 下载文档资源 |
| 文档评论 | docs:document.comment:create / read / update | 评论管理 |
| 复制文档 | docs:document:copy | 文档复制 |
| 导出文档 | docs:document:export | 导出为文件 |
| 删除云空间文件 | space:document:delete | 文件删除 |
| 移动云空间文件 | space:document:move | 文件移动 |

#### 知识库相关（5 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 获取知识库节点（含 wiki:space:retrieve，需用户身份） | wiki:node:read / wiki:node:retrieve | 读取知识库内容 |
| 创建知识库节点 | wiki:node:create | 新建知识库页面 |
| 移动知识库节点 | wiki:node:move | 移动页面 |
| 复制知识库节点 | wiki:node:copy | 复制页面 |
| 获取知识空间信息 | wiki:space:read / wiki:space:retrieve / wiki:space:write_only | 空间管理 |

#### 日历相关（8 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 获取日历列表（需用户身份） | calendar:calendar:read | 日历查询 |
| 创建/修改/删除日程 | calendar:calendar.event:create / update / delete | 日程管理 |
| 获取日程详情 | calendar:calendar.event:read | 日程查询 |
| 回复日程邀请 | calendar:calendar.event:reply | RSVP |
| 查询忙闲状态 | calendar:calendar.free_busy:read | 会议室查询 |

#### 任务相关（5 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 读取任务 | task:task:read | 查看任务 |
| 创建/修改任务 | task:task:write / task:task:writeonly | 任务管理 |
| 读取任务清单 | task:tasklist:read | 查看清单 |
| 修改任务清单 | task:tasklist:write | 清单管理 |
| 任务评论 | task:comment:read / task:comment:write | 评论读写 |

#### 多维表格相关（12 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 创建多维表格 | base:app:create | 创建 bitable |
| 读取/更新/复制多维表格 | base:app:read / base:app:update / base:app:copy | 应用管理 |
| 创建/读取/更新/删除数据表 | base:table:create / read / update / delete | 表格管理 |
| 记录增删改查 | base:record:create / retrieve / update / delete | 记录操作 |
| 字段管理 | base:field:create / read / update / delete | 字段操作 |
| 视图管理 | base:view:read / base:view:write_only | 视图操作 |

#### 云空间相关（4 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 上传文件 | drive:file:upload | 文件上传 |
| 下载文件 | drive:file:download | 文件下载 |
| 获取文件元信息（含 space:document:retrieve，需用户身份） | drive:drive.metadata:readonly | 文件信息查询 |
| 创空白板 | board:whiteboard:node:create / board:whiteboard:node:read | 画板操作 |

#### 电子表格相关（4 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 创建电子表格 | sheets:spreadsheet:create | 新建表格 |
| 读取表格 | sheets:spreadsheet:read / sheets:spreadsheet.meta:read | 读取数据 |
| 编辑表格 | sheets:spreadsheet:write_only | 写入数据 |

#### 搜索相关（2 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 搜索文档 | search:docs:read | 文档/知识库搜索 |
| 获取应用信息 | application:application:self_manage | 应用自管理 |

#### 通讯录相关（4 个）

| 权限名称 | Scope ID | 用途 |
|---------|---------|---------|
| 获取用户基本信息（含 contact:contact.base:readonly，需用户身份） | contact:user.basic_profile:readonly | 用户名解析 |
| 获取用户 ID | contact:user.base:readonly | ID 查询 |
| 搜索用户 | contact:user:search | 用户搜索 |
| 卡片读取 | cardkit:card:read / cardkit:card:write | 消息卡片 |

### 1.3 发布应用

1. 在应用后台点击「版本管理与发布」
2. 创建版本，填写版本号和更新说明
3. 提交审核（需要企业管理员审批）

> 注意：部分权限需要管理员在「权限管理 → API 权限」中逐个审批通过。

## 二、安装

### 2.1 环境要求

Node.js >= 18

### 2.2 安装

```bash
npm install -g @fanfanv5/feishu-cli
```

安装后提供两个命令（等价）：
```bash
feishu-cli --help    # 或
feishu --help
```

### 2.3 验证安装

```bash
feishu-cli -V
# 输出: 2.0.3
```

## 三、配置与授权

### 3.1 创建配置文件

创建 `~/.feishu-cli/config.json`：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxxxxx",
      "appSecret": "xxxxxxxxxxxxxxxxxx",
      "domain": "feishu"
    }
  }
}
```

`domain` 可选值：`feishu`（国内）、`lark`（海外）
海外版需同时将 API 域名指向 open.larksuite.com

### 3.2 环境变量方式（可选）

```bash
export FEISHU_APP_ID="cli_xxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxx"
```

优先级：**环境变量 > 配置文件**。

### 3.3 用户授权

```bash
feishu-cli auth device-flow
```

执行后会自动打开浏览器，在飞书页面确认授权即可。Token 自动存储，后续命令无需重复授权。

### 3.4 查看授权状态

```bash
feishu-cli auth status
```

### 3.5 Token 自动刷新

- **Access Token**：有效期 2 小时，到期前 5 分钟自动刷新
- **Refresh Token**：有效期 7 天，CLI 自动处理
- 当 Refresh Token 也过期时，命令会自动触发 Device Flow 重新授权

## 四、命令参考

### 4.1 消息 (IM)

```bash
# 发送文本消息
feishu-cli im send --receive_id_type open_id --receive_id "ou_xxx" --msg_type text --content '"hello"'

# 发送消息到群聊
feishu-cli im send --receive_id_type chat_id --receive_id "oc_xxx" --msg_type text --content '"hello"'

# 回复消息
feishu-cli im reply --message_id "om_xxx" --msg_type text --content '"reply"'

# 获取历史消息（支持 relative_time）
feishu-cli im get-messages --open_id "ou_xxx" --count 20
feishu-cli im get-messages --open_id "ou_xxx" --relative_time today

# 获取线程消息
feishu-cli im get-thread-messages --thread_id "omt_xxx" --count 20

# 搜索消息（支持多种过滤条件）
feishu-cli im search-messages --query "keyword"
feishu-cli im search-messages --query "keyword" --message_type file --sender_type user --chat_type group

# 下载消息中的资源
feishu-cli im fetch-resource --message_id "om_xxx" --file_key "img_v3_xxx" --type image
```

### 4.2 便捷发送 (Send)

```bash
feishu-cli send text --to "ou_xxx" --text "Hello"
feishu-cli send text --to "oc_xxx" --type chat_id --text "Hello group"
feishu-cli send card --to "ou_xxx" --content '{"elements":[...]}'
feishu-cli send media --to "ou_xxx" --msg_type image --key "img_v3_xxx"
```

### 4.3 文档 (Doc)

```bash
# 获取文档内容（支持 URL 自动解析）
feishu-cli doc fetch "doxcnxxx"
feishu-cli doc fetch "https://xxx.feishu.cn/docx/doxcnxxx"

# 创建文档
feishu-cli doc create --title "标题" --content "# Hello\n正文"
feishu-cli doc create --title "标题" --file ./doc.md
feishu-cli doc create --title "标题" --wiki_space "7571432965511987201"  # 创建到知识库

# 更新文档（7 种模式）
feishu-cli doc update --token "doxcnxxx" --mode overwrite --content "全部内容"
feishu-cli doc update --token "doxcnxxx" --mode append --content "## 新章节"
feishu-cli doc update --token "doxcnxxx" --mode replace_range --selection "旧文本...旧文本" --content "新文本"
feishu-cli doc update --token "doxcnxxx" --mode replace_all --content "全局替换"
feishu-cli doc update --token "doxcnxxx" --mode insert_before --selection "锚点文本" --content "插入内容"
feishu-cli doc update --token "doxcnxxx" --mode insert_after --selection "锚点文本" --content "插入内容"
feishu-cli doc update --token "doxcnxxx" --mode delete_range --selection "要删除的文本...结束"
feishu-cli doc update --token "doxcnxxx" --mode append --file ./extra.md
```

### 4.4 日历 (Calendar)

```bash
# 日历管理
feishu-cli calendar calendar list
feishu-cli calendar calendar get --calendar_id "cal_xxx"
feishu-cli calendar calendar primary

# 日程 CRUD
feishu-cli calendar event list --start_time "2026-03-26T00:00:00+08:00" --end_time "2026-03-27T00:00:00+08:00"
feishu-cli calendar event create --start_time "2026-03-26T10:00:00+08:00" --end_time "2026-03-26T11:00:00+08:00" --summary "Meeting"
feishu-cli calendar event get --event_id "ev_xxx"
feishu-cli calendar event patch --event_id "ev_xxx" --summary "New title"
feishu-cli calendar event delete --event_id "ev_xxx"
feishu-cli calendar event search --query "meeting"
feishu-cli calendar event reply --event_id "ev_xxx" --rsvp_status "accept"

# 日程高级功能
feishu-cli calendar event create --summary "周会" --recurrence "FREQ=WEEKLY;BYDAY=MO,WE,FR" --reminders '[{"minutes":15}]'
feishu-cli calendar event instances --event_id "ev_xxx"

# 参会人管理
feishu-cli calendar event-attendee create --event_id "ev_xxx" --attendees '[{"type":"user","id":"ou_xxx"}]'
feishu-cli calendar event-attendee list --event_id "ev_xxx"

# 忙闲查询
feishu-cli calendar freebusy --user_ids '["ou_xxx","ou_yyy"]' --time_min "2026-03-26T00:00:00+08:00" --time_max "2026-03-26T23:59:59+08:00"
```

### 4.5 任务 (Task)

```bash
# 任务 CRUD
feishu-cli task task create --summary "Buy groceries" --start "2026-03-26T09:00:00+08:00" --due "2026-03-26T18:00:00+08:00"
feishu-cli task task list
feishu-cli task task list --completed
feishu-cli task task get --task_guid "task_xxx"
feishu-cli task task patch --task_guid "task_xxx" --completed_at "1710000000000" --repeat "FREQ=DAILY"

# 子任务
feishu-cli task subtask create --task_guid "task_xxx" --summary "Sub task 1"
feishu-cli task subtask list --task_guid "task_xxx"

# 任务清单
feishu-cli task tasklist create --name "Sprint 1"
feishu-cli task tasklist list
feishu-cli task tasklist tasks --tasklist_guid "tl_xxx"
feishu-cli task tasklist add-members --tasklist_guid "tl_xxx" --member_open_ids '["ou_xxx"]'
```

### 4.6 多维表格 (Bitable)

```bash
# 应用管理
feishu-cli bitable create --name "CRM"
feishu-cli bitable list
feishu-cli bitable get <app_token>
feishu-cli bitable patch <app_token> --name "New Name"
feishu-cli bitable copy <app_token> --name "Copy" --folder_token "fld_xxx"

# 数据表管理
feishu-cli bitable table list <app_token>
feishu-cli bitable table create --name "Sheet1" <app_token>
feishu-cli bitable table patch <app_token> --table_id "tblxxx" --name "Renamed"
feishu-cli bitable table batch_create --tables '[{"name":"S1"},{"name":"S2"}]' <app_token>

# 记录操作
feishu-cli bitable record list --app_token "basexxx" --table_id "tblxxx"
feishu-cli bitable record list --app_token "basexxx" --table_id "tblxxx" --filter '{"conjunction":"and","conditions":[{"field_name":"Status","operator":"is","value":["进行中"}]}'
feishu-cli bitable record create --app_token "basexxx" --table_id "tblxxx" --fields '{"Name":"Alice","Age":25}'
feishu-cli bitable record update --app_token "basexxx" --table_id "tblxxx" --record_id "recxxx" --fields '{"Age":26}'

# 字段和视图
feishu-cli bitable field list <app_token> <table_id>
feishu-cli bitable field create <app_token> <table_id> --field_name "Phone" --type 1
feishu-cli bitable view list <app_token> <table_id>
feishu-cli bitable view create <app_token> <table_id> --name "Grid View"
```

### 4.7 云空间 (Drive)

```bash
feishu-cli drive list --folder_token "fld_xxx"
feishu-cli drive get-meta --docs '[{"doc_token":"docuxxx"}]'
feishu-cli drive upload --file_path "./report.pdf" --parent_node "fld_xxx"        # 自动分块上传大文件
feishu-cli drive download --file_token "docuxxx" --output_path "./report.pdf"
feishu-cli drive copy --file_token "docuxxx" --name "Copy" --type doc
feishu-cli drive move --file_token "docuxxx" --folder_token "fld_xxx" --type doc
feishu-cli drive delete --file_token "docuxxx" --type doc

# 文档媒体（插入图片/文件到文档）
feishu-cli drive doc-media insert --doc_token "doxcnxxx" --file_path "./image.png"
feishu-cli drive doc-media download --doc_token "doxcnxxx" --file_token "boxcnxxx"

# 文档评论
feishu-cli drive doc-comments list --doc_token "doxcnxxx"
feishu-cli drive doc-comments create --doc_token "doxcnxxx" --content "评论内容"
feishu-cli drive doc-comments patch --comment_id "com_xxx" --is_resolved true
```

### 4.8 知识库 (Wiki)

```bash
feishu-cli wiki space list
feishu-cli wiki space get --space_id "spcexxx"
feishu-cli wiki space create --name "New Space"

feishu-cli wiki node list <space_id>
feishu-cli wiki node get --token "wiknxxx" --obj_type docx
feishu-cli wiki node create <space_id> --obj_type docx --title "New Page"
feishu-cli wiki node move <space_id> <node_token> --parent_node_token "newparent"
feishu-cli wiki node copy <space_id> <node_token> --parent_node_token "target"
```

### 4.9 电子表格 (Sheets)

```bash
feishu-cli sheets info --spreadsheet_token "shtxxx"
feishu-cli sheets read --spreadsheet_token "shtxxx" --range "Sheet1!A1:C10"
feishu-cli sheets write --spreadsheet_token "shtxxx" --range "Sheet1!A1" --values '[["Name","Age"],["Alice",25]]'
feishu-cli sheets append --spreadsheet_token "shtxxx" --range "Sheet1" --values '[["Bob",30]]'
feishu-cli sheets find --spreadsheet_token "shtxxx" --query "Alice"
feishu-cli sheets create --title "New Sheet" --headers '["Name","Age"]' --data '[["Alice",25]]'
feishu-cli sheets export --spreadsheet_token "shtxxx" --type xlsx --output_path "./data.xlsx"
```

### 4.10 搜索 (Search)

```bash
feishu-cli search doc-wiki --query "project plan"
feishu-cli search doc-wiki --query "项目计划" --sort_type EDIT_TIME --doc_types '["doc"]'
feishu-cli search doc-wiki --query "周报" --open_time "2026-03-01T00:00:00+08:00/2026-03-26T23:59:59+08:00"
```

### 4.11 群聊 (Chat)

```bash
feishu-cli chat get --chat_id "oc_xxx"
feishu-cli chat search --query "project"
feishu-cli chat members --chat_id "oc_xxx"
```

### 4.12 用户 (User)

```bash
feishu-cli user get
feishu-cli user get "ou_xxx" --user_id_type open_id
feishu-cli user search --query "Alice"
```

### 4.13 授权 (Auth)

```bash
feishu-cli auth device-flow
feishu-cli auth status
```

## 五、Skill 安装与配置

@fanfanv5/feishu-cli npm 包内置了 Claude Code Skill 文件，安装后可一键部署到各种 AI 工具。

### 5.1 安装到 Claude Code

```bash
feishu-cli skill install
# 或指定工具
feishu-cli skill install --tool claude --force
```

安装位置：`~/.claude/skills/feishu/`

安装内容：
```
~/.claude/skills/feishu/
├── SKILL.md              # Skill 定义（命令参考 + 导航表）
└── references/           # 按需加载的领域知识
    ├── bitable.md
    ├── calendar.md
    ├── channel-rules.md
    ├── doc-create.md
    ├── doc-fetch.md
    ├── doc-update.md
    ├── examples.md
    ├── field-properties.md
    ├── im-read.md
    ├── markdown-syntax.md
    ├── record-values.md
    ├── task.md
    └── troubleshoot.md
```

### 5.2 安装到 Cursor

```bash
feishu-cli skill install --tool cursor --cwd /path/to/project
```

安装位置：`/path/to/project/.cursor/skills/feishu/`

### 5.3 安装到 Windsurf

```bash
feishu-cli skill install --tool windsurf --cwd /path/to/project
```

安装位置：`/path/to/project/.windsurf/skills/feishu/`

### 5.4 安装到 GitHub Copilot

```bash
feishu-cli skill install --tool copilot --cwd /path/to/project
```

安装位置：`/path/to/project/.github/instructions/feishu.instructions.md`

Copilot 安装会将所有内容合并为单个文件。

### 5.5 安装到自定义目录

```bash
feishu-cli skill install --target /path/to/custom/dir
```

### 5.6 检查安装状态

```bash
feishu-cli skill list
```

输出示例：
```
  claude:   installed (C:\Users\xxx\.claude\skills\feishu)
  cursor:  not installed (G:\project\.cursor\skills\feishu)
  windsurf: not installed (G:\project\.windsurf\skills\feishu)
  copilot: not installed (G:\project\.github\instructions)
```

### 5.7 更新与卸载

```bash
# 更新（强制重新安装）
feishu-cli skill update --tool claude

# 卸载
feishu-cli skill uninstall --tool claude
```

> 注意：安装和更新时会检测已有安装，--force 模式会提示用户确认后再清理旧版本。

### 5.8 Skill 使用方式

安装后在 Claude Code 中直接用自然语言操作飞书：
- "帮我查一下明天的日程"
- "把这个多维表格的记录导出来"
- "在知识库创建一个新文档，标题是xxx"
- "搜索包含'项目计划'的文档"

Skill 会自动识别意图，调用 feishu-cli 命令执行操作。

### 5.9 Skill 架构

```
skills/feishu/              ← 唯一入口
├── SKILL.md               ← 命令快速参考 + 导航表
└── references/            ← 按需加载的领域知识
    ├── bitable.md         ← 多维表格字段类型、筛选语法
    ├── calendar.md        ← 日历忙闲、循环事件、参会人
    ├── doc-create.md      ← 飞书 Markdown 语法
    ├── doc-fetch.md       ← 文档内容获取
    ├── doc-update.md      ← 7 种更新模式
    ├── im-read.md         ← 消息搜索、资源下载
    ├── task.md            ← 任务 CRUD、清单管理
    ├── troubleshoot.md    ← 错误排查
    ├── channel-rules.md   ← 消息格式规范
    ├── field-properties.md ← 27 种字段类型配置
    ├── record-values.md   ← 记录值数据格式
    ├── examples.md        ← 使用场景示例
    └── markdown-syntax.md ← 飞书 Markdown 差异
```

## 六、错误处理

所有命令输出 JSON，出错时：

```json
{"error": "错误信息"}
```

**常见错误码**

| 错误码 | 含义 | 解决方案 |
|-------|------|---------|
| 99991672 | 应用缺少权限 | 在飞书开放平台为应用启用对应 API 权限 |
| 99991679 | 用户缺少权限 | 执行 `feishu-cli auth device-flow` 重新授权 |
| 99991668 | Token 无效/过期 | CLI 会自动刷新或触发重新授权 |
| 99991663 | 请求频率限制 | 等待后重试 |
| 41050 | 用户组织可见性限制 | 该用户对调用者不可见，非 CLI 问题 |

**输出控制**
- 所有正常输出到 stdout（JSON 格式）
- 日志和错误输出到 stderr
- 使用 `2>/dev/null` 可抑制日志行：`feishu-cli calendar event list 2>/dev/null`

## 七、通用约定

- 时间戳使用 **ISO 8601** 格式（日历/任务 API）
- ID 字段需带前缀：`ou_`（用户）、`oc_`（群聊）、`om_`（消息）
- JSON 参数需在 shell 中正确转义（建议用单引号包裹）
- MCP 相关命令（doc create/update）通过飞书 MCP 网关调用，需要网络访问 `mcp.feishu.cn`
- 大文件上传（>15MB）自动使用分块上传
