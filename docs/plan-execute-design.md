# Plan and Execute 模式设计

## 一、概述

Plan and Execute 模式将复杂任务分解为两个阶段：
1. **Plan（规划）**：模型分析任务，生成任务列表
2. **Execute（执行）**：按任务列表逐步执行

## 二、核心概念

### 2.1 任务状态

```typescript
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependencies?: string[];  // 依赖的任务 ID
  result?: string;          // 执行结果
  error?: string;           // 失败原因
}
```

### 2.2 工作流

```
用户输入: 重构认证模块
    │
    ▼
┌─────────────────────────────────────┐
│  Plan 阶段                           │
│  模型分析任务，生成任务列表:            │
│  1. 分析现有代码结构                   │
│  2. 设计新的模块接口                   │
│  3. 实现认证逻辑                       │
│  4. 更新调用方代码                     │
│  5. 测试验证                          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Execute 阶段                        │
│  逐个执行任务:                        │
│  [✓] 1. 分析现有代码结构              │
│  [→] 2. 设计新的模块接口  ← 当前      │
│  [ ] 3. 实现认证逻辑                  │
│  [ ] 4. 更新调用方代码                │
│  [ ] 5. 测试验证                      │
└─────────────────────────────────────┘
    │
    ▼
完成所有任务
```

## 三、命令设计

### 3.1 Plan 模式命令

| 命令 | 描述 |
|------|------|
| `/plan` | 启动 Plan 模式，生成任务列表 |
| `/tasks` | 显示当前任务列表 |
| `/run` | 开始执行任务列表 |
| `/task-done` | 手动标记当前任务完成 |
| `/task-fail` | 标记当前任务失败 |
| `/task-skip` | 跳过当前任务 |
| `/task-add` | 添加新任务 |
| `/task-remove` | 删除任务 |
| `/clear-tasks` | 清空任务列表 |

### 3.2 使用流程

```
用户: /plan 重构认证模块
模型: 分析后生成任务列表
用户: /tasks  查看任务列表
用户: /run    开始执行
...执行过程中...
用户: /task-done  (手动确认完成)
...继续执行...
模型: 所有任务完成
```

## 四、实现方案

### 4.1 新增文件

```
src/
├── tasks/
│   ├── protocol.ts    # Task 接口定义
│   ├── manager.ts     # TaskManager 类
│   ├── prompts.ts     # 任务生成/执行的 prompt 模板
│   └── index.ts       # 导出
├── agent/
│   └── plan-loop.ts   # Plan and Execute 循环
```

### 4.2 TaskManager

```typescript
class TaskManager {
  private tasks: Task[] = [];
  private currentIndex: number = -1;

  // 添加任务
  addTask(title: string, description: string): Task;

  // 获取当前任务
  getCurrentTask(): Task | null;

  // 推进到下一个任务
  nextTask(): Task | null;

  // 更新任务状态
  updateStatus(taskId: string, status: TaskStatus): void;

  // 获取任务列表
  getTasks(): Task[];

  // 清空任务列表
  clear(): void;
}
```

### 4.3 Plan 循环

```typescript
// src/agent/plan-loop.ts

interface PlanOptions {
  client: ModelClient;
  tools: ToolRegistry;
  messages: Message[];
  onEvent?: AgentEventCallback;
  debug?: boolean;
  compressionConfig?: CompressionConfig;
  confirmToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  readOnlyTools?: string[];
}

/**
 * 执行 Plan and Execute 模式
 * 1. Plan 阶段：生成任务列表
 * 2. Execute 阶段：逐个执行任务
 */
export async function runPlan(options: PlanOptions): Promise<Task[]>;
```

## 五、事件扩展

在 `AgentEvent` 中添加新事件类型：

```typescript
type AgentEvent =
  | ... // 现有事件
  | { type: 'plan_start' }
  | { type: 'plan_complete'; tasks: Task[] }
  | { type: 'task_start'; task: Task }
  | { type: 'task_complete'; task: Task }
  | { type: 'task_failed'; task: Task; error: string }
  | { type: 'task_skipped'; task: Task };
```

## 六、Prompt 设计

### 6.1 Plan 阶段 Prompt

```typescript
const PLAN_SYSTEM_PROMPT = `你是一个任务规划专家。用户会给你一个复杂的任务，你需要：

1. 分析任务，拆分为可执行的子任务
2. 确定任务之间的依赖关系
3. 输出 JSON 格式的任务列表

输出格式：
{
  "tasks": [
    {
      "id": "1",
      "title": "任务标题",
      "description": "具体要做什么",
      "dependencies": []
    }
  ]
}`;

const PLAN_USER_PROMPT = (task: string) => `请将以下任务拆分为可执行的子任务：

${task}`;
```

### 6.2 Execute 阶段 Prompt

```typescript
const EXECUTE_SYSTEM_PROMPT = `你是一个任务执行专家。用户会给你一个任务列表和当前要执行的任务。

你需要：
1. 执行当前任务
2. 使用提供的工具完成工作
3. 执行完成后，输出 "TASK_COMPLETE: [任务完成总结]"

如果任务失败，输出 "TASK_FAILED: [失败原因]"
如果需要跳过，输出 "TASK_SKIP: [跳过原因]"`;
```

## 七、集成到 REPL

在 `src/cli/commands.ts` 中添加：

```typescript
// /plan 命令
{
  name: 'plan',
  description: '启动 Plan 模式，生成任务列表',
  handler: async (args, context) => {
    const taskManager = new TaskManager();
    await runPlan({
      client: context.client,
      tools: context.tools,
      messages: context.messages,
      onEvent: context.onEvent,
      debug: context.debug,
    });
  }
}
```

## 八、示例流程

### 输入
```
用户: /plan 重构认证模块，将 JWT 验证逻辑提取到独立模块
```

### Plan 阶段输出
```
我来分析这个任务并制定执行计划：

任务列表：
1. [ ] 分析现有认证代码结构
2. [ ] 设计新的 Auth 模块接口
3. [ ] 实现 JWT 验证逻辑
4. [ ] 创建新的 auth.ts 文件
5. [ ] 更新用户路由中的调用
6. [ ] 更新测试文件
7. [ ] 运行测试验证

依赖关系：1 → 2 → 3 → 4 → 5 → 6 → 7

输入 /run 开始执行任务
```

### Execute 阶段输出
```
开始执行任务列表...

[1/7] 分析现有认证代码结构
执行工具: read_file("src/routes/user.ts")
执行工具: read_file("src/middleware/auth.ts")
...
✓ 任务 1 完成：找到认证逻辑在 src/middleware/auth.ts

[2/7] 设计新的 Auth 模块接口
...
```

## 九、下一步

1. 实现 `src/tasks/` 目录
2. 实现 `src/agent/plan-loop.ts`
3. 添加 CLI 命令
4. 编写测试
5. 更新文档
