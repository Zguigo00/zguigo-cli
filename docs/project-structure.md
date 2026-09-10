# 项目结构

## 功能概述

zguigo 是一个终端 AI 编程助手，通过 OpenAI 兼容接口接入小米 MiMo 模型，实现流式对话、工具调用、上下文压缩、文件写入、Shell 命令执行、Skill 命令系统和 Plan and Execute 模式。

## 目录结构

```
zguigo_Cli/
├── .env.example          # 环境变量模板
├── .gitignore            # Git 忽略规则
├── CLAUDE.md             # Claude Code 项目指引
├── package.json          # 项目依赖
├── tsconfig.json         # TypeScript 配置
├── vitest.config.ts      # 测试配置
├── src/
│   ├── index.ts          # 入口：加载配置 → 初始化 → 启动 REPL
│   ├── agent/
│   │   ├── index.ts          # 公共导出
│   │   ├── loop.ts           # Agent Loop 核心循环
│   │   ├── plan-loop.ts      # Plan and Execute 模式循环
│   │   ├── tool-executor.ts  # 共享工具执行函数（JSON 解析 + 只读检查 + 确认 + 执行）
│   │   └── types.ts          # Agent 状态和事件类型
│   ├── cli/
│   │   ├── index.ts          # 公共导出
│   │   ├── repl.ts           # blessed TUI 主循环（screen + 按键路由 + Agent 调用）
│   │   ├── command-menu.ts   # 浮动命令菜单（CommandProvider 接口 + blessed List）
│   │   ├── plan-runner.ts    # /plan 和 /run 的执行逻辑（从 repl.ts 拆分）
│   │   ├── box.ts            # 对话框渲染器（Unicode 边框 + 思考动画）
│   │   └── commands.ts       # 20 个内置命令定义
│   ├── history/          # 聊天记录与快照回滚
│   │   ├── index.ts      # 公共导出
│   │   ├── protocol.ts   # ChatSession、SnapshotEntry 等接口
│   │   ├── chat-history.ts # JsonChatHistory（JSON 文件存储）
│   │   └── git-snapshot.ts # GitSnapshot（Git 快照回滚）
│   ├── context/
│   │   ├── index.ts      # 公共导出
│   │   ├── compress.ts   # 上下文压缩核心逻辑
│   │   └── prompt.ts     # 摘要用提示词模板
│   ├── debug/
│   │   └── logger.ts     # 调试日志输出
│   ├── errors/
│   │   └── index.ts      # 统一错误类型（ConfigError, ToolError, ModelError）
│   ├── model/
│   │   ├── index.ts      # 公共导出
│   │   ├── config.ts     # 环境变量读取（API Key, URL, 压缩配置）
│   │   ├── client.ts     # OpenAI SDK 封装，支持流式/非流式调用
│   │   └── types.ts      # Message, ModelClient, StreamEvent 等类型
│   ├── skills/           # Skill 系统
│   │   ├── index.ts      # 公共导出
│   │   ├── protocol.ts   # Command 接口定义
│   │   ├── registry.ts   # CommandRegistry（命令查找：项目级 > 用户级 > 内置）
│   │   ├── knowledge.ts  # KnowledgeLoader（Skills 知识自动加载）
│   │   └── built-in/
│   │       ├── review.ts   # /review 代码审查（只读）
│   │       ├── test.ts     # /test 生成测试
│   │       ├── explain.ts  # /explain 解释代码（只读）
│   │       └── refactor.ts # /refactor 重构代码
│   ├── tasks/            # 任务系统
│   │   ├── index.ts      # 公共导出
│   │   ├── protocol.ts   # Task 接口定义
│   │   ├── manager.ts    # TaskManager 任务管理器
│   │   └── prompts.ts    # 任务生成/执行 Prompt 模板
│   ├── tools/
│   │   ├── index.ts      # 工具注册表（6个工具）
│   │   ├── protocol.ts   # ToolRegistry 接口 + Tool 接口
│   │   ├── list-files.ts # list_files（只读）
│   │   ├── read-file.ts  # read_file（只读）
│   │   ├── write-file.ts # write_file（写入，需确认）
│   │   ├── edit-file.ts  # edit_file（写入，需确认）
│   │   ├── create-directory.ts # create_directory（写入，需确认）
│   │   └── run-command.ts # run_command（Shell，需确认）
│   └── workspace/
│       ├── index.ts      # 公共导出
│       ├── safety.ts     # 路径安全检查（safeResolve）
│       └── filter.ts     # 目录过滤（.git, node_modules 等）
├── tests/
│   ├── agent/
│   │   ├── errors.test.ts    # 错误处理测试
│   │   └── loop.test.ts      # Agent 循环测试
│   ├── cli/
│   │   └── commands.test.ts  # REPL 命令测试
│   ├── context/
│   │   └── compress.test.ts  # 上下文压缩测试（15个用例）
│   ├── skills/               # Skill 系统测试
│   │   ├── registry.test.ts  # CommandRegistry 测试
│   │   ├── knowledge.test.ts # KnowledgeLoader 测试
│   │   └── built-in.test.ts  # 内置命令测试
│   └── tools/
│       ├── read-files.test.ts    # 文件读取测试
│       ├── safety.test.ts        # 路径安全测试
│       ├── write-tools.test.ts   # 写入工具测试（17个用例）
│       └── run-command.test.ts   # Shell 命令测试（6个用例）
├── .zguigo/              # Skill 配置目录
│   ├── README.md         # 使用说明
│   ├── commands/         # 自定义命令（/command-name 触发）
│   └── skills/           # 背景知识（启动时自动加载）
└── docs/
    ├── zguigo-agent-cli-design.md  # 原始设计文档
    ├── project-structure.md        # 项目结构（本文件）
    ├── src-flow.md                 # src 目录流程详解
    ├── context-compression.md      # 上下文压缩设计与实现
    ├── context-compression-flow.md # 压缩流程详解
    ├── write-tools-flow.md         # 写入工具与 Shell 命令流程
    ├── skill-flow.md               # Skill 系统实现流程
    ├── skill-plan.md               # Skill 系统设计计划
    ├── global-install.md           # 全局安装与配置指南
    ├── plan-execute-design.md      # Plan and Execute 模式设计
    ├── plan-execute-flow.md        # Plan and Execute 实现流程
    ├── agent-paradigms.md          # Agent 范式对比（ReAct/Plan/Reflection）
    ├── skill-vs-plan-execute.md    # Skill vs Plan and Execute 方案对比
    ├── history-rollback-flow.md    # 聊天记录与 Git 快照回滚实现流程
    ├── blessed-tui-architecture.md # blessed TUI 架构设计
    └── testing.md                  # 测试机制说明
```

## 工具列表

| 工具 | 类型 | 需确认 | 说明 |
|------|------|--------|------|
| `list_files` | 只读 | ❌ | 查看目录结构 |
| `read_file` | 只读 | ❌ | 读取文件内容（≤200KB） |
| `write_file` | 写入 | ✅ | 创建/覆写文件，自动创建父目录 |
| `edit_file` | 写入 | ✅ | 查找替换编辑，要求唯一匹配 |
| `create_directory` | 写入 | ✅ | 递归创建目录 |
| `run_command` | Shell | ✅ | 执行命令，30秒超时，50KB输出截断 |

## Skill 命令

| 命令 | 类型 | 只读 | 说明 |
|------|------|------|------|
| `/review` | 内置 | ✅ | 代码审查，找出问题并给出建议 |
| `/test` | 内置 | ❌ | 为指定代码生成单元测试 |
| `/explain` | 内置 | ✅ | 解释代码功能和逻辑 |
| `/refactor` | 内置 | ❌ | 重构代码，提升可读性 |
| 自定义命令 | 文件 | 可选 | `.zguigo/commands/*.md`，使用 `$ARGUMENTS` 占位符 |

## Plan and Execute 命令

| 命令 | 说明 |
|------|------|
| `/plan` | 启动 Plan 模式，生成任务列表 |
| `/tasks` | 显示当前任务列表 |
| `/run` | 开始执行任务列表 |
| `/task-done` | 标记当前任务完成 |
| `/task-fail` | 标记当前任务失败 |
| `/task-skip` | 跳过当前任务 |
| `/task-add` | 添加新任务 |
| `/task-remove` | 删除任务 |
| `/clear-tasks` | 清空任务列表 |

## 聊天记录与快照命令

| 命令 | 说明 |
|------|------|
| `/history` | 显示历史会话列表 |
| `/load` | 加载历史会话 |
| `/save` | 保存当前会话 |
| `/new` | 创建新会话 |
| `/delete` | 删除历史会话 |
| `/undo` | 撤销最近一次文件变更 |
| `/rollback` | 查看快照历史 |

## 功能实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| REPL 交互 | ✅ | blessed TUI（浮动命令菜单 + 逐字符输入 + 可滚动日志） |
| 流式对话 | ✅ | 通过 MiMo 模型实时输出 |
| 只读工具 | ✅ | list_files + read_file |
| 写入工具 | ✅ | write_file + edit_file + create_directory |
| Shell 命令 | ✅ | run_command，30秒超时 |
| 工具确认 | ✅ | 写入/Shell 工具执行前弹出 y/n 确认 |
| 路径安全 | ✅ | 防止 `../` 越界访问 |
| 上下文压缩 | ✅ | 滑动窗口 + 模型摘要，自动/手动触发 |
| Skill 命令 | ✅ | /review, /test, /explain, /refactor + 自定义命令 |
| Skills 知识 | ✅ | 启动时自动加载 `.zguigo/skills/*.md` |
| Plan and Execute | ✅ | 任务规划与执行，支持依赖关系 |
| 聊天记录 | ✅ | JSON 文件存储，多会话支持 |
| Git 快照回滚 | ✅ | 写入工具执行前自动创建快照 |
| --debug 模式 | ✅ | 输出调用细节、耗时、token 数 |

## 测试覆盖

| 测试文件 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| agent/errors.test.ts | 3 | 错误处理 |
| agent/loop.test.ts | 4 | Agent 循环 |
| cli/commands.test.ts | 4 | REPL 命令 |
| context/compress.test.ts | 15 | 上下文压缩 |
| skills/registry.test.ts | 6 | CommandRegistry |
| skills/knowledge.test.ts | 4 | KnowledgeLoader |
| skills/built-in.test.ts | 13 | 内置命令 |
| tools/read-files.test.ts | 7 | 文件读取 |
| tools/safety.test.ts | 11 | 路径安全 |
| tools/write-tools.test.ts | 17 | 写入工具 |
| tools/run-command.test.ts | 6 | Shell 命令 |
| **总计** | **90** | |
