# Plan and Execute 模式实现流程

## 一、新增文件

### 1. 任务系统 (`src/tasks/`)

**protocol.ts** - 任务接口定义
- `TaskStatus`: 任务状态类型（pending/in_progress/completed/failed/skipped）
- `Task`: 任务接口，包含 id、title、description、status、dependencies 等
- `TaskPlan`: 任务计划接口

**manager.ts** - 任务管理器
- `TaskManager` 类：管理任务生命周期
- 核心方法：
  - `addTask()`: 添加任务
  - `nextTask()`: 推进到下一个待执行任务
  - `completeCurrentTask()`: 标记当前任务完成
  - `failCurrentTask()`: 标记当前任务失败
  - `skipCurrentTask()`: 跳过当前任务
  - `getTasks()`: 获取所有任务
  - `getStats()`: 获取统计信息
  - `isAllDone()`: 检查是否所有任务完成

**prompts.ts** - Prompt 模板
- `PLAN_SYSTEM_PROMPT`: Plan 阶段的系统提示
- `EXECUTE_SYSTEM_PROMPT`: Execute 阶段的系统提示
- `getPlanUserPrompt()`: 生成 Plan 阶段的用户消息
- `getExecuteUserPrompt()`: 生成 Execute 阶段的用户消息

**index.ts** - 导出

### 2. Agent 计划循环 (`src/agent/plan-loop.ts`)

- `runPlan()` 函数：执行 Plan and Execute 模式
- `TaskEvent` 类型：任务相关事件类型
- `PlanOptions` 接口：Plan 模式选项

---

## 二、修改文件

### 1. Agent 类型 (`src/agent/types.ts`)

新增事件类型：
- `plan_start`: 开始生成计划
- `plan_complete`: 计划生成完成
- `task_start`: 开始执行任务
- `task_complete`: 任务完成
- `task_failed`: 任务失败
- `task_skipped`: 任务跳过
- `all_done`: 所有任务执行完成

### 2. Agent 导出 (`src/agent/index.ts`)

新增导出：
- `runPlan` 函数
- `PlanOptions` 和 `TaskEvent` 类型

### 3. CLI 命令 (`src/cli/commands.ts`)

新增命令：
- `/tasks`: 显示当前任务列表
- `/run`: 开始执行任务列表
- `/task-done`: 标记当前任务完成
- `/task-fail`: 标记当前任务失败
- `/task-skip`: 跳过当前任务
- `/task-add`: 添加新任务
- `/task-remove`: 删除任务
- `/clear-tasks`: 清空任务列表

更新 `CommandContext` 接口，添加 `taskManager` 属性。

### 4. REPL (`src/cli/repl.ts`)

- 导入 `runPlan` 和 `TaskManager`
- 初始化 `TaskManager`
- 处理 `/plan` 命令：调用 `runPlan()` 生成任务计划
- 处理 `/run` 命令：逐个执行任务列表
- 传递 `taskManager` 到命令上下文

---

## 三、工作流程

### 3.1 Plan 阶段

```
用户输入: /plan 重构认证模块
    │
    ▼
repl.ts 检测到 /plan 命令
    │
    ▼
调用 runPlan() 函数
    │
    ├─ Phase 1: 生成任务计划
    │   ├─ 调用模型，使用 PLAN_SYSTEM_PROMPT
    │   ├─ 模型返回 JSON 格式的任务列表
    │   └─ 解析 JSON，创建 TaskPlan
    │
    ├─ Phase 2: 执行任务（可选）
    │   ├─ 逐个执行任务
    │   ├─ 每个任务使用 EXECUTE_SYSTEM_PROMPT
    │   └─ 更新任务状态
    │
    └─ 返回 TaskManager 包含所有任务
```

### 3.2 Execute 阶段（手动执行）

```
用户输入: /run
    │
    ▼
repl.ts 检测到 /run 命令
    │
    ▼
循环调用 runAgent() 执行每个任务
    │
    ├─ 获取下一个待执行任务
    ├─ 将任务描述添加到消息历史
    ├─ 调用 runAgent() 执行
    ├─ 更新任务状态
    └─ 重复直到所有任务完成
```

---

## 四、任务状态流转

```
pending → in_progress → completed
                     → failed
                     → skipped
```

- `pending`: 待执行
- `in_progress`: 正在执行
- `completed`: 执行完成
- `failed`: 执行失败
- `skipped`: 跳过

---

## 五、依赖关系

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

---

## 六、事件系统

### 6.1 Agent 事件

新增的任务相关事件类型：

```typescript
type AgentEvent =
  | ... // 现有事件
  | { type: 'plan_start' }
  | { type: 'plan_complete'; tasks: Task[] }
  | { type: 'task_start'; taskId: string; taskTitle: string; index: number; total: number }
  | { type: 'task_complete'; taskId: string; taskTitle: string; result: string }
  | { type: 'task_failed'; taskId: string; taskTitle: string; error: string }
  | { type: 'task_skipped'; taskId: string; taskTitle: string; reason: string }
  | { type: 'all_done'; stats: { total: number; completed: number; failed: number; skipped: number } };
```

### 6.2 Task 事件

`runPlan()` 函数支持 `onTaskEvent` 回调：

```typescript
type TaskEvent =
  | { type: 'plan_start'; task: string }
  | { type: 'plan_complete'; plan: TaskPlan }
  | { type: 'task_start'; task: { id: string; title: string; index: number; total: number } }
  | { type: 'task_complete'; task: { id: string; title: string; result: string } }
  | { type: 'task_failed'; task: { id: string; title: string; error: string } }
  | { type: 'task_skipped'; task: { id: string; title: string; reason: string } }
  | { type: 'all_done'; stats: { total: number; completed: number; failed: number; skipped: number } };
```

---

## 七、Prompt 设计

### 7.1 Plan 阶段 Prompt

```typescript
const PLAN_SYSTEM_PROMPT = `你是一个任务规划专家。用户会给你一个复杂的任务，你需要：

1. 分析任务，拆分为可执行的子任务（2-10 个）
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
```

### 7.2 Execute 阶段 Prompt

```typescript
const EXECUTE_SYSTEM_PROMPT = `你是一个任务执行专家。用户会给你一个任务列表和当前要执行的任务。

你的职责：
1. 专注于执行当前任务
2. 使用提供的工具（读取文件、执行命令等）完成工作
3. 完成后输出结果`;
```

---

## 八、测试

### 8.1 任务管理器测试

```typescript
describe('TaskManager', () => {
  it('应该添加任务', () => {
    const manager = new TaskManager();
    const task = manager.addTask('任务标题', '任务描述');
    expect(task.title).toBe('任务标题');
    expect(task.status).toBe('pending');
  });

  it('应该推进到下一个任务', () => {
    const manager = new TaskManager();
    manager.addTask('任务1', '描述1');
    manager.addTask('任务2', '描述2');

    const task = manager.nextTask();
    expect(task?.title).toBe('任务1');
    expect(task?.status).toBe('in_progress');
  });

  it('应该检查依赖关系', () => {
    const manager = new TaskManager();
    const task1 = manager.addTask('任务1', '描述1');
    manager.addTask('任务2', '描述2', [task1.id]);

    // 任务2依赖任务1，应该先执行任务1
    const next = manager.nextTask();
    expect(next?.title).toBe('任务1');
  });
});
```

---

## 九、示例流程

### 9.1 完整流程

```
用户: /plan 重构认证模块

系统:
📋 正在生成任务计划...

✓ 任务计划已生成，共 5 个任务

  1. 分析现有认证代码
  2. 设计新的 Auth 模块接口
  3. 实现 JWT 验证逻辑
  4. 更新用户路由
  5. 运行测试验证

输入 /run 开始执行任务，或 /tasks 查看任务列表

用户: /run

系统:
[1/5] 分析现有认证代码
执行工具: read_file("src/routes/user.ts")
...
✓ 任务完成

[2/5] 设计新的 Auth 模块接口
...
✓ 任务完成

[3/5] 实现 JWT 验证逻辑
...
✓ 任务完成

[4/5] 更新用户路由
...
✓ 任务完成

[5/5] 运行测试验证
...
✓ 任务完成

🎉 所有任务执行完成！
   5/5 成功
```

---

## 十、下一步

1. ✅ 实现 `src/tasks/` 目录
2. ✅ 实现 `src/agent/plan-loop.ts`
3. ✅ 添加 CLI 命令
4. ✅ 更新测试
5. 编写 TaskManager 单元测试
6. 更新文档
