# src 流程详解

## 启动入口 `src/index.ts`

1. 加载 .env 配置（API Key、Base URL、Model）
2. 解析命令行参数（--help、--debug）
3. 创建 Model Client（连接 MiMo API）
4. 创建 Tool Registry，注册 list_files 和 read_file
5. 启动 REPL 交互循环

## 交互流程 `src/cli/`

**repl.ts** — 用户输入循环：
- 是 / 命令？ → commands.ts 处理（/help、/clear、/exit）
- 否 → 调用 runAgent() 进入 Agent Loop → render.ts 流式输出

**render.ts** — 接收 StreamEvent 流，把 text_delta 实时写到 stdout

**commands.ts** — 三个内置命令：
- `/help` — 显示帮助
- `/clear` — 清空对话历史
- `/exit` — 退出程序

## 核心循环 `src/agent/loop.ts`

第 1 轮：用户消息 → 调用模型（流式）→ 纯文本则输出结束，tool_calls 则执行工具后写回 messages
第 2 轮：带工具结果再次调用模型，同上判断
最多 8 轮，超出强制停止

## 模型客户端 `src/model/`

**config.ts** — 从 .env 读取 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`

**client.ts** — 封装 OpenAI SDK：
- `chat()` — 一次性返回完整回复
- `chatStream()` — 异步生成器，逐块 yield StreamEvent
  - `text_delta` — 文本片段
  - `tool_call_delta` — 工具调用（累积后一次性 yield）
  - `done` — 流结束

**types.ts** — 定义 Message、StreamEvent、ModelClient 接口等

## 工具系统 `src/tools/`

**protocol.ts** — 工具协议：
- Tool 接口：name、description、parameters（JSON Schema）、execute()
- ToolRegistry：register()、getDefinitions()、call()

**list-files.ts** — 递归列出目录，跳过 `.git` `node_modules` 等

**read-file.ts** — 读取文本文件，限制 200KB，检测二进制文件

## 路径安全 `src/workspace/`

**safety.ts** — `safeResolve()` 禁止 `..` 遍历，确保路径在工作区根目录内

**filter.ts** — `shouldSkipDir()` 过滤不需要遍历的目录

## 调试 `src/debug/logger.ts`

`--debug` 模式下，所有日志输出到 stderr，不干扰 stdout 的模型输出

## 完整调用链

```
用户: "帮我看看 src/index.ts 写了什么"
  ↓
repl.ts 接收输入
  ↓
agent/loop.ts 第 1 轮调用模型
  ↓
model/client.ts 流式请求 MiMo API
  ↓
模型返回: tool_call read_file({ path: "src/index.ts" })
  ↓
tools/protocol.ts 执行 read_file
  ↓
workspace/safety.ts 验证路径安全
  ↓
tools/read-file.ts 读取文件内容
  ↓
结果写回 messages，进入第 2 轮
  ↓
模型根据文件内容生成回复
  ↓
cli/render.ts 流式输出到终端
```
