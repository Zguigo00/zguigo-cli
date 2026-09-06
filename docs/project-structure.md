# 项目结构

## 功能概述

zguigo 是一个终端 AI 编程助手，通过 OpenAI 兼容接口接入小米 MiMo 模型，实现流式对话、工具调用、上下文压缩、文件写入、Shell 命令执行和 Skill 命令系统。

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
│   │   ├── index.ts      # 公共导出
│   │   ├── loop.ts       # Agent Loop 核心循环
│   │   └── types.ts      # Agent 状态和事件类型
│   ├── cli/
│   │   ├── index.ts      # 公共导出
│   │   ├── repl.ts       # REPL 交互界面（含确认提示、Skill 触发）
│   │   ├── commands.ts   # 内置命令（/help, /clear, /compact, /commands, /exit）
│   │   └── render.ts     # 输出渲染
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

## 功能实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| REPL 交互 | ✅ | readline + Tab 补全 + 内置命令 |
| 流式对话 | ✅ | 通过 MiMo 模型实时输出 |
| 只读工具 | ✅ | list_files + read_file |
| 写入工具 | ✅ | write_file + edit_file + create_directory |
| Shell 命令 | ✅ | run_command，30秒超时 |
| 工具确认 | ✅ | 写入/Shell 工具执行前弹出 y/n 确认 |
| 路径安全 | ✅ | 防止 `../` 越界访问 |
| 上下文压缩 | ✅ | 滑动窗口 + 模型摘要，自动/手动触发 |
| Skill 命令 | ✅ | /review, /test, /explain, /refactor + 自定义命令 |
| Skills 知识 | ✅ | 启动时自动加载 `.zguigo/skills/*.md` |
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
