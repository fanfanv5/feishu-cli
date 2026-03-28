# feishu-cli 安装使用手册 v2.0.10

feishu-cli 安装使用手册

本 CLI 由 openclaw-lark 官方插件源码改造而来，不局限于 openclaw，适配大多数 AI 工具场景使用

包名：**@fanfanv5/feishu-cli**
版本：**2.0.10**
命令：**feishu**（别名 `feishu-cli`）
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
> CLI v2.0.3+ 已修复：自动授权时会查询应用已开通的 user scope 并一并传给 device flow，无需手动指定。

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
feishu --help      # 主命令
feishu-cli --help  # 别名
```

### 2.3 验证安装

```bash
feishu -V
# 输出: 2.0.10
```

### 2.4 安装 AI Skill

@fanfanv5/feishu-cli 内置了 AI Skill 文件，安装后 AI 工具可直接用自然语言操作飞书。

```bash
# 默认安装到当前目录 skills/feishu/
feishu skill install
feishu skill install --force                  # 强制覆盖已有安装

# 安装到指定 AI 工具
feishu skill install --tool claude            # Claude Code
feishu skill install --tool cursor            # Cursor（当前项目）
feishu skill install --tool windsurf          # Windsurf（当前项目）
feishu skill install --tool copilot           # GitHub Copilot（合并为单文件）

# 安装到自定义目录
feishu skill install --target /path/to/custom/dir
```

各工具安装位置：

| 命令 | 安装位置 |
|------|---------|
| `feishu skill install` | `<cwd>/skills/feishu/` |
| `--tool claude` | `~/.claude/skills/feishu/` |
| `--tool cursor` | `<cwd>/.cursor/skills/feishu/` |
| `--tool windsurf` | `<cwd>/.windsurf/skills/feishu/` |
| `--tool copilot` | `<cwd>/.github/instructions/feishu.instructions.md` |

安装内容：
```
skills/feishu/
├── SKILL.md              # Skill 定义（命令参考 + 导航表）
└── references/           # 按需加载的领域知识
    ├── bitable.md        ← 多维表格字段类型、筛选语法
    ├── calendar.md       ← 日历忙闲、循环事件、参会人
    ├── doc-create.md     ← 飞书 Markdown 语法
    ├── doc-fetch.md      ← 文档内容获取
    ├── doc-update.md     ← 7 种更新模式
    ├── im-read.md        ← 消息搜索、资源下载
    ├── task.md           ← 任务 CRUD、清单管理
    ├── troubleshoot.md   ← 错误排查
    ├── channel-rules.md  ← 消息格式规范
    ├── field-properties.md ← 27 种字段类型配置
    ├── record-values.md  ← 记录值数据格式
    ├── examples.md       ← 使用场景示例
    └── markdown-syntax.md ← 飞书 Markdown 差异
```

### 2.5 Skill 管理

```bash
# 检查安装状态
feishu skill list

# 更新（强制重新安装）
feishu skill update --tool claude

# 卸载
feishu skill uninstall --tool claude
```

> 安装时如已存在会提示使用 `--force`。使用 `--force` 会直接覆盖安装，无需确认。

### 2.6 Skill 使用方式

安装后在 AI 工具中直接用自然语言操作飞书：
- "帮我查一下明天的日程"
- "把这个多维表格的记录导出来"
- "在知识库创建一个新文档，标题是xxx"
- "搜索包含'项目计划'的文档"

Skill 会自动识别意图，调用 feishu 命令执行操作。

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
feishu auth device-flow
```

执行后会自动打开浏览器，在飞书页面确认授权即可。Token 自动存储，后续命令无需重复授权。

### 3.4 查看授权状态

```bash
feishu auth status
```

### 3.5 Token 自动刷新

- **Access Token**：有效期 2 小时，到期前 5 分钟自动刷新
- **Refresh Token**：有效期 7 天，CLI 自动处理
- 当 Refresh Token 也过期时，命令会自动触发 Device Flow 重新授权

## 四、命令参考

### 4.1 消息 (IM)

```bash
# 发送文本消息
feishu im send --receive_id_type open_id --receive_id "ou_xxx" --msg_type text --content '"hello"'

# 发送消息到群聊
feishu im send --receive_id_type chat_id --receive_id "oc_xxx" --msg_type text --content '"hello"'

# 回复消息（message_id 为位置参数）
feishu im reply "om_xxx" --msg_type text --content '"reply"'

# 获取历史消息（支持 relative_time）
feishu im get-messages --open_id "ou_xxx" --page_size 20
feishu im get-messages --open_id "ou_xxx" --relative_time today

# 获取线程消息
feishu im get-thread-messages --thread_id "omt_xxx" --page_size 20

# 搜索消息（支持多种过滤条件）
feishu im search-messages --query "keyword"
feishu im search-messages --query "keyword" --message_type file --sender_type user --chat_type group

# 下载消息中的资源
feishu im fetch-resource --message_id "om_xxx" --file_key "img_v3_xxx" --type image
```

### 4.2 便捷发送 (Send)

```bash
feishu send text --to "ou_xxx" --text "Hello"
feishu send text --to "oc_xxx" --type chat_id --text "Hello group"
feishu send card --to "ou_xxx" --content '{"elements":[...]}'
feishu send media --to "ou_xxx" --msg_type image --key "img_v3_xxx"
```

### 4.3 文档 (Doc)

```bash
# 获取文档内容（doc_id 为位置参数，支持 URL 自动解析）
feishu doc fetch "doxcnxxx"
feishu doc fetch "https://xxx.feishu.cn/docx/doxcnxxx"

# 创建文档
feishu doc create --title "标题" --content "# Hello\n正文"
feishu doc create --title "标题" --file ./doc.md
feishu doc create --title "标题" --wiki_space "7571432965511987201"  # 创建到知识库

# 更新文档（7 种模式）
feishu doc update --token "doxcnxxx" --mode overwrite --content "全部内容"
feishu doc update --token "doxcnxxx" --mode append --content "## 新章节"
feishu doc update --token "doxcnxxx" --mode replace_range --selection "旧文本...旧文本" --content "新文本"
feishu doc update --token "doxcnxxx" --mode replace_all --content "全局替换"
feishu doc update --token "doxcnxxx" --mode insert_before --selection "锚点文本" --content "插入内容"
feishu doc update --token "doxcnxxx" --mode insert_after --selection "锚点文本" --content "插入内容"
feishu doc update --token "doxcnxxx" --mode delete_range --selection "要删除的文本...结束"
feishu doc update --token "doxcnxxx" --mode append --file ./extra.md
```

### 4.4 日历 (Calendar)

```bash
# 日历管理
feishu calendar calendar list
feishu calendar calendar get "cal_xxx"           # calendar_id 为位置参数
feishu calendar calendar primary

# 日程 CRUD（event_id 为位置参数）
feishu calendar event list --start_time "2026-03-26T00:00:00+08:00" --end_time "2026-03-27T00:00:00+08:00"
feishu calendar event create --start_time "2026-03-26T10:00:00+08:00" --end_time "2026-03-26T11:00:00+08:00" --summary "Meeting"
feishu calendar event get "ev_xxx"
feishu calendar event patch "ev_xxx" --summary "New title"
feishu calendar event delete "ev_xxx"
feishu calendar event search --query "meeting"
feishu calendar event reply "ev_xxx" --status "accept"     # 选项是 --status，不是 --rsvp_status

# 日程高级功能
feishu calendar event create --summary "周会" --recurrence "FREQ=WEEKLY;BYDAY=MO,WE,FR" --reminders '[{"minutes":15}]'
feishu calendar event instances "ev_xxx" --start_time "2026-03-01T00:00:00+08:00" --end_time "2026-03-31T23:59:59+08:00"

# 参会人管理（event_id 为位置参数）
feishu calendar event-attendee create "ev_xxx" --attendees '[{"type":"user","id":"ou_xxx"}]'
feishu calendar event-attendee list "ev_xxx"

# 忙闲查询
feishu calendar freebusy --user_ids '["ou_xxx","ou_yyy"]' --time_min "2026-03-26T00:00:00+08:00" --time_max "2026-03-26T23:59:59+08:00"
```

### 4.5 任务 (Task)

```bash
# 任务 CRUD（task_guid 为位置参数）
feishu task task create --summary "Buy groceries" --start "2026-03-26T09:00:00+08:00" --due "2026-03-26T18:00:00+08:00"
feishu task task list
feishu task task list --completed
feishu task task get "task_xxx"
feishu task task patch "task_xxx" --completed_at "1710000000000" --repeat "FREQ=DAILY"

# 子任务（task_guid 为位置参数）
feishu task subtask create "task_xxx" --summary "Sub task 1"
feishu task subtask list "task_xxx"

# 任务清单（tasklist_guid 为位置参数）
feishu task tasklist create --name "Sprint 1"
feishu task tasklist list
feishu task tasklist tasks "tl_xxx"
feishu task tasklist add-members "tl_xxx" --members '["ou_xxx"]'
```

### 4.6 多维表格 (Bitable)

```bash
# 应用管理（app_token 为位置参数）
feishu bitable create --name "CRM"
feishu bitable list
feishu bitable get "basexxx"
feishu bitable patch "basexxx" --name "New Name"
feishu bitable copy "basexxx" --name "Copy" --folder_token "fld_xxx"

# 数据表管理（app_token 为位置参数）
feishu bitable table list "basexxx"
feishu bitable table create "basexxx" --name "Sheet1"
feishu bitable table patch "basexxx" "tblxxx" --name "Renamed"
feishu bitable table batch_create "basexxx" --tables '[{"name":"S1"},{"name":"S2"}]'

# 记录操作（app_token, table_id, record_id 均为位置参数）
feishu bitable record list "basexxx" "tblxxx"
feishu bitable record list "basexxx" "tblxxx" --filter '{"conjunction":"and","conditions":[{"field_name":"Status","operator":"is","value":["进行中"]}]}'
feishu bitable record create "basexxx" "tblxxx" --fields '{"Name":"Alice","Age":25}'
feishu bitable record update "basexxx" "tblxxx" "recxxx" --fields '{"Age":26}'

# 字段和视图（app_token, table_id 为位置参数）
feishu bitable field list "basexxx" "tblxxx"
feishu bitable field create "basexxx" "tblxxx" --field_name "Phone" --type 1
feishu bitable view list "basexxx" "tblxxx"
feishu bitable view create "basexxx" "tblxxx" --view_name "Grid View"
```

### 4.7 云空间 (Drive)

```bash
feishu drive list --folder_token "fld_xxx"
feishu drive get-meta --docs '[{"doc_token":"docuxxx"}]'
feishu drive upload --file_path "./report.pdf" --parent_node "fld_xxx"        # 自动分块上传大文件
feishu drive download "docuxxx" --output_path "./report.pdf"                  # file_token 为位置参数
feishu drive copy "docuxxx" --name "Copy" --type doc                          # file_token 为位置参数
feishu drive move "docuxxx" --folder_token "fld_xxx" --type doc
feishu drive delete "docuxxx" --type doc

# 文档媒体（位置参数：doc_id / resource_token）
feishu drive doc-media insert "doxcnxxx" --file_path "./image.png"
feishu drive doc-media download "boxcnxxx" --resource_type image --output_path "./image.png"

# 文档评论（file_token 为位置参数，需指定 --file_type）
feishu drive doc-comments list "doxcnxxx" --file_type docx
feishu drive doc-comments create "doxcnxxx" --file_type docx --elements '[{"type":"textRun","textRun":{"text":"评论内容"}}]'
feishu drive doc-comments patch "doxcnxxx" --file_type docx --comment_id "com_xxx" --is_solved_value true
```

### 4.8 知识库 (Wiki)

```bash
feishu wiki space list
feishu wiki space get "spcexxx"                     # space_id 为位置参数
feishu wiki space create --name "New Space"

feishu wiki node list "spcexxx"                     # space_id 为位置参数
feishu wiki node get "wiknxxx" --obj_type docx      # token 为位置参数
feishu wiki node create "spcexxx" --obj_type docx --node_type origin --title "New Page"
feishu wiki node move "spcexxx" "wiknxxx" --target_parent_token "newparent"
feishu wiki node copy "spcexxx" "wiknxxx" --target_parent_token "target"
```

### 4.9 电子表格 (Sheets)

```bash
feishu sheets info --spreadsheet_token "shtxxx"
feishu sheets read --spreadsheet_token "shtxxx" --range "Sheet1!A1:C10"
feishu sheets write --spreadsheet_token "shtxxx" --range "Sheet1!A1" --values '[["Name","Age"],["Alice",25]]'
feishu sheets append --spreadsheet_token "shtxxx" --range "Sheet1" --values '[["Bob",30]]'
feishu sheets find --spreadsheet_token "shtxxx" --sheet_id "sheetId" --find "Alice"   # 选项是 --find 和 --sheet_id（必选）
feishu sheets create --title "New Sheet" --headers '["Name","Age"]' --data '[["Alice",25]]'
feishu sheets export --spreadsheet_token "shtxxx" --file_extension xlsx --output_path "./data.xlsx"  # 选项是 --file_extension
```

### 4.10 搜索 (Search)

```bash
feishu search doc-wiki --query "project plan"
feishu search doc-wiki --query "项目计划" --sort_type EDIT_TIME --doc_types '["doc"]'
feishu search doc-wiki --query "周报" --open_time_start "2026-03-01T00:00:00+08:00" --open_time_end "2026-03-26T23:59:59+08:00"
```

### 4.11 群聊 (Chat)

```bash
feishu chat get "oc_xxx"                   # chat_id 为位置参数
feishu chat search --query "project"
feishu chat members "oc_xxx"               # chat_id 为位置参数
```

### 4.12 用户 (User)

```bash
feishu user get                              # 不传参数查当前用户
feishu user get "ou_xxx" --user_id_type open_id   # user_id 为可选位置参数
feishu user search --query "Alice"
```

### 4.13 授权 (Auth)

```bash
feishu auth device-flow
feishu auth status
```

## 五、错误处理

所有命令输出 JSON，出错时：

```json
{"error": "错误信息"}
```

**常见错误码**

| 错误码 | 含义 | 解决方案 |
|-------|------|---------|
| 99991672 | 应用缺少权限 | 在飞书开放平台为应用启用对应 API 权限 |
| 99991679 | 用户缺少权限 | 执行 `feishu auth device-flow` 重新授权 |
| 99991668 | Token 无效/过期 | CLI 会自动刷新或触发重新授权 |
| 99991663 | 请求频率限制 | 等待后重试 |
| 41050 | 用户组织可见性限制 | 该用户对调用者不可见，非 CLI 问题 |

**输出控制**
- 所有正常输出到 stdout（JSON 格式）
- 日志和错误输出到 stderr
- 使用 `2>/dev/null` 可抑制日志行：`feishu calendar event list 2>/dev/null`

## 六、通用约定

- 时间戳使用 **ISO 8601** 格式（日历/任务 API）
- ID 字段需带前缀：`ou_`（用户）、`oc_`（群聊）、`om_`（消息）
- JSON 参数需在 shell 中正确转义（建议用单引号包裹）
- MCP 相关命令（doc create/update）通过飞书 MCP 网关调用，需要网络访问 `mcp.feishu.cn`
- 大文件上传（>15MB）自动使用分块上传
