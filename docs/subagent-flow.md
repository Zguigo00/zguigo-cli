# SubAgent 子代理实现流程

## 一、功能概述

SubAgent 允许主 Agent 启动独立的子代理来执行特定任务。子代理拥有自己的对话历史，与主对话隔离，完成后将结果返回。

### 两种触发方式

| 方式 | 入口 | 说明 |
|------|------|------|
| 用户手动 | `/agent <任务描述>` | 用户在 REPL 中直接启动子代理 |
| 工具自动 | `spawn_agent` 工具 | 主 Agent 自动判断需要拆分任务时调用 |

---

## 二、新增文件

### 1. `src/agent/subagent.ts` — SubAgentRunner

核心模块，负责创建和运行子代理。

**导出：**
- `runSubAgent(options: SubAgentOptions): Promise<string>` — 运行子代理，返回结果文本
- `SubAgentOptions` 接口 — 子代理配置选项

**SubAgentOptions 参数：**

```typescript
interface SubAgentOptions {
  task: string;                    // 子代理要执行的任务描述
  client: ModelClient;             // 模型客户端，继承父 agent 的
  tools: ToolRegistry;             // 工具注册表，继承父 agent 的
  writeLine: (text: string) => void;  // 输出到 TUI
  onEvent?: AgentEventCallback;    // 事件回调
  context?: string;                // 从父对话传递的上下文
  maxIterations?: number;          // 最大迭代轮数，默认 8
  depth?: number;                  // 当前嵌套深度，防递归
  debug?: boolean;                 // 调试模式
}
```

**核心逻辑：**

```
runSubAgent()
    │
    ├─ 检查嵌套深度 (depth >= 2 → 拒绝)
    │
    ├─ 构建子代理系统提示
    │   └─ 独立的 system prompt，说明子代理角色和规则
    │
    ├─ 构建初始消息
    │   ├─ system: 子代理系统提示
    │   └─ user: 任务描述 + 可选上下文
    │
    ├─ 调用 runAgent() 执行循环
    │   └─ 使用 maxIterations 限制迭代轮数
    │
    └─ 返回 finalAnswer
```

### 2. `src/agent/subagent-tool.ts` — spawn_agent 工具

将子代理封装为工具，主 Agent 可通过工具调用自动触发。

**导出：**
- `createSpawnAgentTool(options: SpawnAgentToolOptions): Tool` — 工厂函数

**SpawnAgentToolOptions 参数：**

```typescript
interface SpawnAgentToolOptions {
  client: ModelClient;       // 模型客户端
  tools: ToolRegistry;       // 工具注册表
  writeLine: (text: string) => void;  // 输出到 TUI
  depth?: number;            // 当前嵌套深度
  debug?: boolean;           // 调试模式
}
```

**工具定义：**

```typescript
{
  name: 'spawn_agent',
  description: '启动一个子代理来执行特定任务...',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '子代理要执行的任务描述' },
      context: { type: 'string', description: '从当前对话传递的上下文（可选）' }
    },
    required: ['task']
  }
}
```

---

## 三、修改文件

### 1. `src/agent/loop.ts` — maxIterations 参数化

`RunAgentOptions` 新增 `maxIterations?: number` 字段（默认 8），替换原来硬编码的 `MAX_ITERATIONS = 8` 常量。

```diff
 export interface RunAgentOptions {
   // ... 其他字段不变
+  /** 最大迭代轮数，默认 8 */
+  maxIterations?: number;
 }

 export async function runAgent(options: RunAgentOptions): Promise<AgentState> {
-  const { client, tools, onEvent, debug, readOnlyTools } = options;
+  const { client, tools, onEvent, debug, readOnlyTools, maxIterations = MAX_ITERATIONS } = options;
   // ...
-  if (state.iteration > MAX_ITERATIONS) {
+  if (state.iteration > maxIterations) {
```

### 2. `src/cli/repl.ts` — 注册工具 + /agent 命令

**新增导入：**

```typescript
import { createSpawnAgentTool } from '../agent/subagent-tool.js';
import { runSubAgent } from '../agent/subagent.js';
```

**注册 spawn_agent 工具（初始化服务段）：**

```typescript
// 注册 spawn_agent 工具（主对话层 depth=0）
tools.register(createSpawnAgentTool({
  client,
  tools,
  writeLine,
  depth: 0,
  debug: debugMode,
}));
```

**/agent 命令处理（主循环中，/run 之后）：**

```typescript
if (trimmed.startsWith('/agent ')) {
  const task = trimmed.slice(7).trim();
  if (!task) {
    writeLine('{red-fg}用法: /agent <任务描述>{/red-fg}');
    continue;
  }
  const result = await runSubAgent({ task, client, tools, writeLine, depth: 0, debug: debugMode });
  // 将结果写回主对话消息
  messages.push(
    { role: 'assistant', content: `[调用了子 agent 执行任务: ${task}]` },
    { role: 'user', content: `子 agent 执行完毕，结果如下:\n${result}` },
  );
  continue;
}
```

**命令菜单注册：**

```typescript
const agentItem: CommandItem = {
  name: 'agent',
  description: '启动子代理执行任务',
  readOnly: false,
};
return [agentItem, ...builtinItems, ...skillItems];
```

### 3. `src/cli/commands.ts` — 帮助列表

`/help` 输出新增子代理命令段：

```
子代理命令:
  /agent <任务>  启动子代理执行独立任务（独立对话历史）
```

### 4. `CLAUDE.md` — 架构文档

新增 SubAgent 段落，更新 Tools 列表和 Core Loop 说明。

---

## 四、运行流程

### 4.1 /agent 命令流程

```
用户输入: /agent 分析 src/tools 目录的代码结构
    │
    ▼
repl.ts 检测到 /agent 命令
    │
    ▼
调用 runSubAgent({ task, client, tools, writeLine, depth: 0 })
    │
    ├─ 检查 depth (0 < 2 ✓)
    │
    ├─ 构建子代理消息
    │   ├─ system: "你是一个专注执行特定任务的子代理（深度 0）..."
    │   └─ user: "分析 src/tools 目录的代码结构"
    │
    ├─ 调用 runAgent()（独立循环，最多 8 轮）
    │   ├─ 第 1 轮: 模型决定调用 list_files 工具
    │   │   └─ 子代理输出: [子 agent] 调用工具: list_files
    │   ├─ 第 2 轮: 模型决定调用 read_file 工具
    │   │   └─ 子代理输出: [子 agent] 调用工具: read_file
    │   └─ 第 3 轮: 模型输出分析结果
    │       └─ 子代理输出: [子 agent] 分析结果文本...
    │
    └─ 返回 finalAnswer
        │
        ▼
结果写回主对话消息
    ├─ assistant: "[调用了子 agent 执行任务: 分析 src/tools 目录...]"
    └─ user: "子 agent 执行完毕，结果如下: ..."
        │
        ▼
主 Agent 继续对话，可以看到子代理的结论
```

### 4.2 spawn_agent 工具流程

```
用户: 帮我重构 src/tools 目录
    │
    ▼
主 Agent (runAgent 循环)
    │
    ├─ 第 1 轮: 模型思考后决定调用 spawn_agent
    │   └─ 工具调用: spawn_agent({ task: "分析 src/tools 现有结构" })
    │       │
    │       ▼
    │   子 Agent (runSubAgent, depth=1)
    │       ├─ list_files → read_file → ...
    │       └─ 返回: "当前有 6 个工具文件..."
    │
    ├─ 工具结果写回主对话 messages
    │
    ├─ 第 2 轮: 模型根据子代理结果继续推理
    │   └─ 可能再次调用 spawn_agent 执行下一个子任务
    │
    └─ 第 N 轮: 模型输出最终重构方案
```

---

## 五、递归保护机制

```
深度 0: 主对话（用户直接交互）
    │
    └─ spawn_agent / /agent
        │
        深度 1: 子代理
            │
            └─ spawn_agent（子代理也可以调用）
                │
                深度 2: 子子代理
                    │
                    └─ spawn_agent → 拒绝！返回错误消息
```

**检查位置：** `src/agent/subagent.ts` 的 `runSubAgent()` 函数开头

```typescript
const MAX_SUBAGENT_DEPTH = 2;

if (depth >= MAX_SUBAGENT_DEPTH) {
  const msg = `嵌套深度超限 (${depth}/${MAX_SUBAGENT_DEPTH})，无法启动子 agent`;
  writeLine(`{red-fg}[子 agent] ${msg}{/red-fg}`);
  return msg;
}
```

**深度传递：**

- 主对话注册 spawn_agent 时设置 `depth: 0`
- 子代理调用 spawn_agent 时传入 `depth: (options.depth ?? 0) + 1`
- 超过 2 层时直接返回错误，不启动新的子代理

---

## 六、输出样式

子代理的输出通过 blessed 标签与主对话区分：

| 内容 | 颜色 | 示例 |
|------|------|------|
| 子代理启动 | cyan + bold | `[子 agent 启动] 分析 src/tools 目录...` |
| 子代理输出 | gray | `[子 agent] 调用工具: list_files` |
| 子代理完成 | green + bold | `[子 agent 完成]` |
| 子代理错误 | red | `[子 agent] 嵌套深度超限...` |

---

## 七、关键设计决策

### 7.1 为什么子代理有独立的对话历史？

子代理与主对话隔离，避免：
- 子代理的中间过程（工具调用、试错）污染主对话上下文
- 子代理的系统提示干扰主 Agent 的行为
- 主对话上下文过长导致 token 浪费

### 7.2 为什么 spawn_agent 在 repl.ts 中动态注册？

`spawn_agent` 需要运行时参数（`client`、`tools`、`writeLine`），这些在 `createDefaultToolRegistry()` 调用时还不存在。因此在 `startRepl()` 中创建 blessed 界面后、主循环开始前动态注册。

### 7.3 /agent 结果为什么写回 messages？

子代理的结果写回主对话的 messages 数组，让主 Agent 在后续对话中能看到子代理的结论。这样用户可以：

```
用户: /agent 分析 src/tools 目录
[子 agent 启动] ...
[子 agent 完成]

用户: 根据刚才的分析，帮我重构
主 Agent: （可以看到子代理的结果，基于它继续推理）
```

### 7.4 子代理继承父的工具集

子代理通过 `tools: ToolRegistry` 继承父 Agent 的所有工具，包括：
- `list_files`、`read_file` — 基础读取
- `write_file`、`edit_file`、`create_directory` — 写入操作
- `run_command` — 执行命令
- `spawn_agent` — 子代理自身也可以调用（受深度限制）

---

## 八、文件依赖关系

```
src/agent/subagent.ts
  ├── 依赖: src/agent/loop.ts (runAgent)
  ├── 依赖: src/model/types.ts (Message, ModelClient)
  ├── 依赖: src/tools/protocol.ts (ToolRegistry)
  └── 依赖: src/agent/types.ts (AgentEvent, AgentEventCallback)

src/agent/subagent-tool.ts
  ├── 依赖: src/agent/subagent.ts (runSubAgent)
  ├── 依赖: src/tools/protocol.ts (Tool, ToolRegistry)
  └── 依赖: src/model/types.ts (ModelClient)

src/cli/repl.ts
  ├── 导入: src/agent/subagent-tool.ts (createSpawnAgentTool)
  └── 导入: src/agent/subagent.ts (runSubAgent)
```

---

## 九、测试验证

### 手动测试

```bash
# 启动 CLI
npx tsx src/index.ts

# 测试 1: /agent 命令
> /agent 列出当前目录的文件结构
# 期望: 看到 [子 agent 启动]、工具调用、结果、[子 agent 完成]

# 测试 2: spawn_agent 工具自动触发
> 帮我分析 src/tools 目录的代码结构
# 期望: 主 Agent 自动调用 spawn_agent，子代理执行后结果返回

# 测试 3: 嵌套深度
# 在子代理中让它调用 spawn_agent（depth=1），应该正常工作
# 深度超过 2 时应返回错误消息
```

### 构建验证

```bash
npm run build   # TypeScript 编译通过
npm test        # 所有测试通过（90 个）
```
