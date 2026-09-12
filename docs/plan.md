# zguigo Agent CLI 实现计划

## Context

基于 `docs/zguigo-agent-cli-design.md` 设计文档，从零实现一个终端 AI 编程助手。
当前项目只有 `.gitignore` 和设计文档，需要完整搭建 TypeScript 项目并实现阶段 0-5 的所有功能。

## 阶段 0：工程骨架

**创建文件：**
- `package.json` — 项目配置、脚本、依赖
- `tsconfig.json` — TypeScript 配置
- `vitest.config.ts` — 测试配置
- `src/index.ts` — 主入口，解析命令行参数
- `src/errors/index.ts` — 基础错误类型

**关键实现：**
- `bin` 入口指向 `dist/index.js`
- 开发用 `npx tsx src/index.ts` 运行
- 脚本：`dev`（tsx 运行）、`build`（tsc 编译）、`test`（vitest）
- 依赖：`openai`、`dotenv`
- devDependencies：`typescript`、`tsx`、`vitest`、`@types/node`
- 自定义错误类：`ConfigError`、`ToolError`、`ModelError`

## 阶段 1：单轮模型调用

**创建文件：**
- `src/model/config.ts` — 环境变量读取与校验
- `src/model/client.ts` — OpenAI 兼容客户端
- `src/model/types.ts` — 模型层内部类型（不暴露 SDK 类型）
- `src/model/index.ts` — 导出
- `tests/model/client.test.ts` — 模型客户端测试

**关键实现：**
- 从 `process.env` 读取 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
- 用 `dotenv` 加载项目根目录 `.env`
- `createClient()` 返回自定义接口：`chat(messages, options?)` 和 `chatStream(messages, options?)`
- `chatStream` 返回 `AsyncIterable<string>`，逐 chunk yield 文本
- 不支持流式的服务 fallback 到 `chat()`
- SDK 类型不暴露给 Agent 层
- 配置缺失时抛出 `ConfigError`，错误消息不得包含 API Key

## 阶段 2：内存会话与 REPL

**创建文件：**
- `src/cli/repl.ts` — REPL 主循环
- `src/cli/commands.ts` — 内置命令 `/help`、`/clear`、`/exit`
- `src/cli/render.ts` — 终端输出渲染（流式文本）
- `src/cli/index.ts` — 导出
- `tests/cli/repl.test.ts` — REPL 命令测试

**关键实现：**
- 使用 Node.js `readline` 模块
- 维护 `messages` 数组（内存中）
- `/help` 显示可用命令说明
- `/clear` 清空消息历史
- `/exit` 退出进程
- `Ctrl+C` 优雅退出
- 非 `/` 开头的输入作为用户消息
- 流式输出直接写 `process.stdout`

## 阶段 3：最小 Agent Loop

**创建文件：**
- `src/agent/loop.ts` — Agent Loop 核心
- `src/agent/types.ts` — Agent 层类型
- `src/agent/index.ts` — 导出
- `tests/agent/loop.test.ts` — Agent Loop 测试

**关键实现：**
- 显式状态对象：`{ messages, iteration, pendingToolCalls, lastError, finalAnswer }`
- 最大 8 轮模型调用（`MAX_ITERATIONS = 8`）
- 纯文本回答 → 结束循环
- 工具调用 → 执行工具 → 结果写回 messages → 继续
- 工具参数错误 → 回传给模型修正
- 达到上限 → 向用户说明已停止
- 每轮支持流式输出用户可见文本

## 阶段 4：只读工具

**创建文件：**
- `src/tools/protocol.ts` — 工具协议定义（Tool 接口、注册表）
- `src/tools/list-files.ts` — list_files 实现
- `src/tools/read-file.ts` — read_file 实现
- `src/workspace/root.ts` — workspace 根目录管理
- `src/workspace/filter.ts` — 文件过滤（跳过 .git/node_modules/dist/build）
- `src/workspace/safety.ts` — 路径安全检查（禁止 .. 穿越）
- `src/tools/index.ts` — 导出
- `src/workspace/index.ts` — 导出
- `tests/tools/list-files.test.ts`
- `tests/tools/read-file.test.ts`

**关键实现：**
- `Tool` 接口：`name`、`description`、`parameters`（JSON Schema）、`execute(args)`
- `ToolRegistry` 管理工具注册和调用
- `list_files(path?)` — 返回目录树，默认 workspace 根，跳过过滤目录
- `read_file(path)` — 读取文本文件，上限 200KB，二进制拒绝
- 路径解析后必须在 workspace 内，否则返回 `ToolError`
- 工具以 OpenAI function calling 格式传给模型
- 结果以结构化 `{ success, data?, error? }` 返回

## 阶段 5：调试与测试

**创建/修改文件：**
- 修改 `src/cli/repl.ts` — 添加 `--debug` 支持
- 修改 `src/agent/loop.ts` — 添加调试日志
- `src/debug/logger.ts` — 调试日志输出（写 stderr）
- `tests/agent/loop.test.ts` — 补充边界测试
- `tests/tools/*.test.ts` — 补充边界测试
- `tests/cli/repl.test.ts` — 补充命令测试

**调试输出内容（写入 stderr）：**
- 每轮消息类型和摘要
- 工具名、参数、执行耗时、结果大小
- 循环编号
- 模型停止原因
- 供应商错误或错误堆栈

**测试覆盖（使用 mock 模型）：**
- read_file：路径越界、文件过大、二进制文件
- list_files：目录过滤
- 模型响应和流式事件解析
- 工具调用成功与失败
- 工具错误回传后的下一轮
- 达到 8 轮上限的停止行为
- /clear、/exit、一次性命令入口

## 最终项目结构

```
zguigo-cli/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .env.example
├── docs/
│   └── zguigo-agent-cli-design.md
├── src/
│   ├── index.ts              # 主入口
│   ├── cli/
│   │   ├── index.ts
│   │   ├── repl.ts           # REPL 主循环
│   │   ├── commands.ts       # /help, /clear, /exit
│   │   └── render.ts         # 流式输出渲染
│   ├── agent/
│   │   ├── index.ts
│   │   ├── loop.ts           # Agent Loop 核心
│   │   └── types.ts
│   ├── model/
│   │   ├── index.ts
│   │   ├── client.ts         # OpenAI 兼容客户端
│   │   ├── config.ts         # 环境变量
│   │   └── types.ts
│   ├── tools/
│   │   ├── index.ts
│   │   ├── protocol.ts       # Tool 接口和注册表
│   │   ├── list-files.ts
│   │   └── read-file.ts
│   ├── workspace/
│   │   ├── index.ts
│   │   ├── root.ts
│   │   ├── filter.ts
│   │   └── safety.ts
│   ├── debug/
│   │   └── logger.ts
│   └── errors/
│       └── index.ts
└── tests/
    ├── agent/
    │   └── loop.test.ts
    ├── model/
    │   └── client.test.ts
    ├── tools/
    │   ├── list-files.test.ts
    │   └── read-file.test.ts
    └── cli/
        └── repl.test.ts
```

## 实现顺序

按阶段 0 → 1 → 2 → 3 → 4 → 5 顺序实现。每个阶段完成后可独立测试。

## 验证方式

1. 每阶段完成后运行 `npx vitest` 确认测试通过
2. 阶段 2 完成后可 `npx tsx src/index.ts` 启动 REPL
3. 配置 `.env` 后连接真实模型验证完整流程
4. `--debug` 模式验证调试输出
