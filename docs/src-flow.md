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

## Plan and Execute 模式

### 核心文件

**src/agent/plan-loop.ts** — Plan and Execute 循环：
- `runPlan()` 函数：执行完整的 Plan and Execute 流程
- Phase 1: 调用模型生成任务计划（JSON 格式）
- Phase 2: 逐个执行任务，更新状态

**src/tasks/protocol.ts** — 任务接口：
- `Task` 接口：id、title、description、status、dependencies
- `TaskStatus` 类型：pending/in_progress/completed/failed/skipped
- `TaskPlan` 接口：tasks 数组 + 原始任务描述

**src/tasks/manager.ts** — 任务管理器：
- `TaskManager` 类：管理任务生命周期
- 核心方法：addTask()、nextTask()、completeCurrentTask()、failCurrentTask()
- 依赖关系检查：确保前置任务完成后才执行后续任务

**src/tasks/prompts.ts** — Prompt 模板：
- `PLAN_SYSTEM_PROMPT`：引导模型拆分任务为 JSON 格式
- `EXECUTE_SYSTEM_PROMPT`：引导模型执行单个任务
- `getPlanUserPrompt()`：生成 Plan 阶段的用户消息
- `getExecuteUserPrompt()`：生成 Execute 阶段的用户消息

### 调用链

```
用户: /plan 重构认证模块
  ↓
repl.ts 检测到 /plan 命令
  ↓
调用 runPlan() 函数
  ↓
agent/plan-loop.ts Phase 1: 生成任务计划
  ↓
model/client.ts 调用模型，使用 PLAN_SYSTEM_PROMPT
  ↓
模型返回 JSON 格式的任务列表
  ↓
parsePlanFromText() 解析 JSON
  ↓
TaskManager.loadFromPlan() 加载任务
  ↓
agent/plan-loop.ts Phase 2: 执行任务
  ↓
循环调用 agent/loop.ts 执行每个任务
  ↓
TaskManager 更新任务状态
  ↓
任务全部完成后返回
```

### 任务状态流转

```
pending → in_progress → completed
                     → failed
                     → skipped
```

- `pending`: 待执行
- `in_progress`: 正在执行
- `completed`: 执行完成
- `failed`: 执行失败（停止后续任务）
- `skipped`: 跳过

### 依赖关系

任务之间可以有依赖关系：

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  dependencies: string[];  // 依赖的任务 ID 列表
}
```

`TaskManager.nextTask()` 会检查依赖是否满足：
- 只有当所有依赖任务都已完成时，才会执行当前任务
- 如果依赖任务失败，后续任务不会执行
