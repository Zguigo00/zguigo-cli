# zguigo

终端 AI 编程助手 — 基于 OpenAI 兼容 API的代码编写/调试/优化工具。

运行在终端里，拥有文件读写和命令执行能力，可以直接操作你的项目。

## 功能特性

- **对话式编程** — 在终端中与 AI 对话，直接编写、调试、优化代码
- **工具调用** — 自动读写文件、创建目录、执行命令，无需手动复制粘贴
- **计划模式** — 先生成执行计划，确认后再逐步执行
- **子代理（SubAgent）** — 支持并行执行隔离子任务，可递归嵌套
- **技能系统** — 内置 `/review`、`/test`、`/explain`、`/refactor`，支持自定义 `.md` 命令
- **任务管理** — 内置 todo list，管理当前会话的任务
- **对话历史** — 自动保存会话记录，支持恢复历史对话
- **上下文压缩** — 对话过长时自动压缩，避免超出模型窗口
- **安全防护** — 文件操作限制在项目目录内，危险命令拦截

## 快速开始

### 环境要求

- Node.js >= 18
- 一个 OpenAI 兼容的 API 服务

### 安装

```bash
git clone https://github.com/Zguigo00/zguigo-cli.git
cd zguigo-cli
npm install
npm run build
npm link          # 全局注册 zguigo 命令
```

### 配置

在项目根目录创建 `.env` 文件：

```env
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=model-name
```

也可以放在用户主目录 `~/.zguigo/.env`，作为全局配置。

可选参数：

```env
CONTEXT_WINDOW_SIZE=65536         # 上下文窗口大小（token）
COMPRESSION_THRESHOLD=0.8         # 压缩触发阈值（0-1）
RECENT_MESSAGE_COUNT=5            # 压缩后保留的最近消息数
```

### 使用

```bash
zguigo                    # 启动交互式 REPL
zguigo "你的问题"          # 执行一次任务并退出
zguigo --debug            # 启动 REPL 并开启调试模式
zguigo --help             # 显示帮助信息
```

## 命令列表

在 REPL 中输入 `/` 会弹出命令菜单，支持过滤和键盘导航。

### 计划与执行

| 命令 | 说明 |
|------|------|
| `/plan <描述>` | 生成执行计划（显示任务步骤和文件清单） |
| `/run` | 逐步执行已生成的计划（每步确认） |
| `/run <描述>` | 直接执行任务（不经过计划阶段） |

### 子代理

| 命令 | 说明 |
|------|------|
| `/agent <任务>` | 启动隔离子代理执行任务，结果返回主对话 |

### 任务管理

| 命令 | 说明 |
|------|------|
| `/task add <描述>` | 添加任务 |
| `/task done <编号>` | 标记任务完成 |
| `/task show` | 显示任务列表 |
| `/task clear` | 清空任务列表 |

### 对话与历史

| 命令 | 说明 |
|------|------|
| `/new <名称>` | 创建新会话（支持命名） |
| `/resume [名称]` | 恢复历史会话（不带名称则列出所有会话） |
| `/clear` | 清屏 |

### 技能

| 命令 | 说明 |
|------|------|
| `/review <文件>` | 代码评审 |
| `/test <文件>` | 生成测试用例 |
| `/explain <文件>` | 解释代码逻辑 |
| `/refactor <文件>` | 重构建议 |

### 其他

| 命令 | 说明 |
|------|------|
| `/mode plan\|act\|auto` | 切换模式（auto 默认，先确认再执行） |
| `/readonly on\|off` | 切换只读模式（禁止写入和执行） |
| `/info` | 显示 session/config/info |
| `/debug` | 切换调试日志 |
| `/version` | 显示版本 |
| `/help` | 命令列表 |

## 工具列表

AI 助手可以自动调用以下工具：

| 工具 | 说明 |
|------|------|
| `list_files` | 列出目录中的文件，忽略 `.git`、`node_modules` 等 |
| `read_file` | 读取文件内容（支持行号范围） |
| `write_file` | 创建或覆盖文件 |
| `edit_file` | 搜索替换编辑文件（支持正则） |
| `create_directory` | 创建目录（自动创建父目录） |
| `run_command` | 执行 shell 命令 |
| `spawn_agent` | 启动隔离子代理 |

## 项目结构

```
zguigo_cli/
├── src/
│   ├── index.ts              # 入口：加载 .env、初始化客户端
│   ├── model/                # 模型通信
│   │   ├── client.ts         #   OpenAI 兼容客户端（流式请求 + 工具调用）
│   │   ├── config.ts         #   环境变量读取
│   │   └── types.ts          #   类型定义
│   ├── agent/                # Agent 循环
│   │   ├── loop.ts           #   核心循环（流式解析 → 工具执行 → 回写结果）
│   │   ├── plan-loop.ts      #   计划执行循环
│   │   ├── subagent.ts       #   子代理运行器
│   │   └── subagent-tool.ts  #   spawn_agent 工具定义
│   ├── tools/                # 工具协议与实现
│   │   ├── protocol.ts       #   Tool/ToolResult 接口 + ToolRegistry
│   │   ├── list-files.ts     #   文件列表
│   │   ├── read-file.ts      #   读文件
│   │   ├── write-file.ts     #   写文件
│   │   ├── edit-file.ts      #   编辑文件
│   │   ├── create-directory.ts
│   │   └── run-command.ts    #   执行命令
│   ├── context/              # 上下文管理
│   │   ├── compress.ts       #   上下文压缩（摘要策略）
│   │   └── prompt.ts         #   Prompt 模板
│   ├── skills/               # 技能系统
│   │   ├── registry.ts       #   命令注册表（内置 + .md 文件加载）
│   │   ├── knowledge.ts      #   知识文档加载
│   │   ├── protocol.ts       #   Command 接口
│   │   └── built-in/         #   内置技能
│   │       ├── review.ts     #     /review
│   │       ├── test.ts       #     /test
│   │       ├── explain.ts    #     /explain
│   │       └── refactor.ts   #     /refactor
│   ├── cli/                  # CLI 界面（blessed TUI）
│   │   ├── repl.ts           #   主交互循环
│   │   ├── box.ts            #   Unicode 边框渲染
│   │   ├── commands.ts       #   /help /new /resume 等命令处理
│   │   ├── command-menu.ts   #   命令选择菜单
│   │   ├── render.ts         #   流式渲染
│   │   └── plan-runner.ts    #   计划执行器
│   ├── workspace/            # 工作区安全
│   │   ├── safety.ts         #   路径安全检查（限制在项目内）
│   │   └── filter.ts         #   目录过滤（.git、node_modules 等）
│   ├── history/              # 对话历史
│   │   ├── chat-history.ts   #   JSON 持久化
│   │   └── git-snapshot.ts   #   git commit + tag 快照
│   ├── tasks/                # 任务管理器
│   ├── errors/               # 自定义错误
│   └── debug/                # 调试日志
├── .zguigo/commands/         # 项目级自定义命令
├── docs/                     # 文档
├── tests/                    # 测试
└── .env                      # 配置（不提交 git）
```

## 自定义命令

在 `.zguigo/commands/` 目录下创建 `.md` 文件即可添加自定义命令：

```markdown
# api-check

检查 API 路由是否符合 RESTful 规范

检查以下内容：
- HTTP 方法是否正确（GET/POST/PUT/DELETE）
- URL 命名是否使用名词复数
- 状态码是否符合规范
- 错误格式是否统一
```

保存为 `.zguigo/commands/api-check.md` 后，即可通过 `/api-check` 调用。

## 运行流程

```
用户输入 → startRepl()
             ↓
         输入前缀？
        / | 纯文本
       ↓       ↓
   命令处理   构造 user Message
                ↓
          runAgent() 主循环
                ↓
         ModelClient.chatStream() ← 流式请求
                ↓
         解析 SSE 事件
          ┌─ text → 输出（助手回复）
          └─ tool_calls → executeToolCall()
                           ↓
                     写入 tool 结果到 messages
                           ↓
                     循环（直到无工具调用或达到上限）
```

## 许可证

MIT
