# 项目结构

## 功能概述

zguigo 是一个终端 AI 编程助手，通过 OpenAI 兼容接口接入小米 MiMo 模型，实现流式对话、工具调用和上下文压缩。

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
│   │   ├── repl.ts       # REPL 交互界面
│   │   ├── commands.ts   # 内置命令（/help, /clear, /compact, /exit）
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
│   ├── tools/
│   │   ├── index.ts      # 工具注册表
│   │   ├── protocol.ts   # ToolRegistry 接口
│   │   ├── list-files.ts # list_files 工具实现
│   │   └── read-file.ts  # read_file 工具实现
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
│   └── tools/
│       ├── read-files.test.ts # 文件读取工具测试
│       └── safety.test.ts     # 路径安全测试
└── docs/
    ├── zguigo-agent-cli-design.md  # 原始设计文档
    ├── project-structure.md        # 项目结构（本文件）
    ├── src-flow.md                 # src 目录流程详解
    ├── context-compression.md      # 上下文压缩设计与实现
    ├── context-compression-flow.md # 压缩流程详解
    └── testing.md                  # 测试机制说明
```

## 功能实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| REPL 交互 | ✅ | readline + Tab 补全 + 内置命令 |
| 流式对话 | ✅ | 通过 MiMo 模型实时输出 |
| 工具调用 | ✅ | list_files + read_file（只读） |
| 路径安全 | ✅ | 防止 `../` 越界访问 |
| 上下文压缩 | ✅ | 滑动窗口 + 模型摘要，自动/手动触发 |
| --debug 模式 | ✅ | 输出调用细节、耗时、token 数 |
| 写入工具 | ❌ | Phase 5 未实现（需要权限控制） |
| Shell 命令 | ❌ | Phase 5 未实现 |
