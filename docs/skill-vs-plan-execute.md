# Skill vs Plan and Execute：方案对比与选择

## 概述

讨论是否可以用 Skill 系统代替 Plan and Execute 系统，以及两者的优缺点和适用场景。

---

## 一、Skill 实现 /plan 的方案

### 1.1 Skill 文件定义

```markdown
<!-- .zguigo/commands/plan.md -->
# Plan 模式

你是一个任务规划专家。当用户给你一个复杂任务时：

1. 分析任务，拆分为 2-10 个子任务
2. 确定任务之间的依赖关系
3. 输出任务列表，格式如下：

📋 任务计划：

1. [ ] 任务标题
   - 描述：具体要做什么
   - 依赖：无

2. [ ] 任务标题
   - 描述：具体要做什么
   - 依赖：任务 1

3. [ ] 任务标题
   - 描述：具体要做什么
   - 依赖：任务 2

然后询问用户：输入 /run 开始执行，或修改任务列表。

目标：$ARGUMENTS
```

### 1.2 使用效果

```
用户: /plan 重构认证模块
    ↓
模型: 
📋 任务计划：

1. [ ] 分析现有认证代码
   - 描述：读取 src/auth.ts，了解现有结构
   - 依赖：无

2. [ ] 设计新的 Auth 模块接口
   - 描述：设计新的接口和类型定义
   - 依赖：任务 1

3. [ ] 实现 JWT 验证逻辑
   - 描述：实现 token 验证和刷新
   - 依赖：任务 2

4. [ ] 更新用户路由
   - 描述：更新路由使用新的 Auth 模块
   - 依赖：任务 3

5. [ ] 运行测试验证
   - 描述：运行测试确保功能正常
   - 依赖：任务 4

输入 /run 开始执行，或修改任务列表。
```

### 1.3 工作原理

Skill 本质上是 **prompt 注入**：
- 将指令模板注入到 system message
- 模型根据指令生成输出
- 无法控制执行流程

---

## 二、功能对比

### 2.1 完整功能对比表

| 功能 | Skill 实现 | Plan and Execute 实现 |
|------|-----------|----------------------|
| **任务规划** | ✅ 可以 | ✅ 可以 |
| **任务列表存储** | ❌ 无 | ✅ 有 TaskManager |
| **任务状态跟踪** | ❌ 无 | ✅ 有 pending/in_progress/completed |
| **依赖关系检查** | ❌ 无 | ✅ 有 |
| **任务执行控制** | ❌ 无 | ✅ 有 /run、/task-done、/task-skip |
| **失败处理** | ❌ 无 | ✅ 有，失败时停止后续任务 |
| **统计信息** | ❌ 无 | ✅ 有，显示完成/失败/跳过数量 |
| **任务持久化** | ❌ 无 | ✅ 可以存储到文件 |
| **并行执行** | ❌ 无 | ✅ 支持（未来） |

### 2.2 代码复杂度对比

| 方案 | 新增代码量 | 维护成本 |
|------|-----------|----------|
| **只用 Skill** | 1 个 .md 文件 | 低 |
| **Plan and Execute** | 5 个 .ts 文件 + 测试 | 中等 |

---

## 三、具体问题分析

### 3.1 无法跟踪任务状态

**Skill 方案**：
```
用户: /plan 重构认证模块
模型: [输出任务列表]
用户: /run
模型: [开始执行任务 1]
用户: /tasks  ← 无法显示当前状态，因为没有存储
模型: "抱歉，我无法记住之前的任务列表"
```

**Plan and Execute 方案**：
```
用户: /plan 重构认证模块
系统: [生成任务列表，存储到 TaskManager]
用户: /tasks
系统: [显示任务列表和当前状态]
用户: /run
系统: [执行任务，更新状态]
用户: /tasks
系统: [显示更新后的状态]
```

### 3.2 无法管理依赖关系

**Skill 方案**：
```
用户: /plan 重构认证模块
模型: [输出任务列表，任务 2 依赖任务 1]
用户: /run
模型: [执行任务 1]
用户: /task-skip  ← 跳过任务 1
模型: [应该执行任务 2 吗？依赖检查失败，但无法阻止]
模型: [继续执行任务 2，这可能不正确]
```

**Plan and Execute 方案**：
```
用户: /plan 重构认证模块
系统: [生成任务列表，记录依赖关系]
用户: /run
系统: [执行任务 1]
用户: /task-skip  ← 跳过任务 1
系统: [检查依赖：任务 2 依赖任务 1，任务 1 未完成]
系统: [停止执行，提示依赖失败]
```

### 3.3 无法处理失败

**Skill 方案**：
```
用户: /run
模型: [执行任务 1]
模型: [任务 1 失败]
用户: /run  ← 应该停止，但 Skill 无法控制
模型: [继续执行任务 2，这可能不正确]
```

**Plan and Execute 方案**：
```
用户: /run
系统: [执行任务 1]
系统: [任务 1 失败]
系统: [检查依赖：后续任务依赖任务 1]
系统: [停止执行，提示任务 1 失败]
用户: /task-done  ← 手动标记完成
系统: [继续执行任务 2]
```

---

## 四、方案选择建议

### 4.1 三种方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **只用 Skill** | 简单任务 | 简单、无需额外代码 | 功能有限 |
| **只用 Plan and Execute** | 复杂任务 | 功能完整 | 需要额外代码 |
| **两者结合** | 通用场景 | 灵活、功能完整 | 需要理解两种模式 |

### 4.2 场景推荐

#### 场景 1：简单任务规划

**需求**：只是想看任务拆分，不需要精确控制

**推荐**：只用 Skill

```
用户: /plan 重构认证模块
模型: [输出任务列表]
用户: 好的，我自己执行
```

**优点**：
- ✅ 简单，1 个 .md 文件搞定
- ✅ 不需要额外代码
- ✅ 模型自己管理任务执行

**缺点**：
- ❌ 无法精确控制任务状态
- ❌ 无法暂停/跳过任务
- ❌ 依赖关系检查不严格

#### 场景 2：复杂任务管理

**需求**：需要精确控制任务执行，支持暂停、跳过、重试

**推荐**：使用 Plan and Execute

```
用户: /plan 重构认证模块
系统: [生成任务列表]
用户: /run
系统: [执行任务 1]
用户: /task-skip  ← 跳过某个任务
系统: [跳过任务 1，执行任务 2]
```

**优点**：
- ✅ 精确的任务状态管理
- ✅ 严格的依赖关系检查
- ✅ 完整的任务控制命令

**缺点**：
- ❌ 需要额外代码实现
- ❌ 学习成本稍高

#### 场景 3：通用场景

**需求**：既想要简单的任务规划，又想要精确的任务控制

**推荐**：两者结合

```
用户: /plan 重构认证模块
模型: [生成任务列表，使用 Skill]

用户: /run
系统: [执行任务，使用 Plan and Execute]

用户: "等等，先看看现有代码"
模型: [切换到 ReAct 模式，读取文件]

用户: /run
系统: [继续执行任务 2]
```

**优点**：
- ✅ 灵活，两种模式自由切换
- ✅ 功能完整

**缺点**：
- ❌ 需要理解两种模式的区别

---

## 五、实现建议

### 5.1 推荐方案：两者结合

**理由**：
1. Skill 提供简单的任务规划（prompt 注入）
2. Plan and Execute 提供精确的任务管理（代码实现）
3. 两者互补，覆盖更多场景

**实现方式**：

```typescript
// src/cli/repl.ts

// 处理 /plan 命令
if (trimmed.startsWith('/plan ')) {
  const task = trimmed.slice(6).trim();
  
  // 方案 1：使用 Skill（简单）
  // 将 task 注入到 system message，让模型生成任务列表
  
  // 方案 2：使用 Plan and Execute（完整）
  // 调用 runPlan() 生成任务列表，存储到 TaskManager
  
  // 推荐：根据任务复杂度自动选择
  if (isSimpleTask(task)) {
    // 使用 Skill
  } else {
    // 使用 Plan and Execute
  }
}
```

### 5.2 智能选择策略

```typescript
function isSimpleTask(task: string): boolean {
  // 简单任务特征
  const simplePatterns = [
    /看看/,
    /读取/,
    /查看/,
    /解释/,
  ];
  
  // 复杂任务特征
  const complexPatterns = [
    /重构/,
    /迁移/,
    /添加.*功能/,
    /实现.*模块/,
  ];
  
  if (simplePatterns.some(p => p.test(task))) {
    return true;
  }
  
  if (complexPatterns.some(p => p.test(task))) {
    return false;
  }
  
  // 默认使用 Plan and Execute
  return false;
}
```

---

## 六、总结

### 6.1 核心区别

| 维度 | Skill | Plan and Execute |
|------|-------|------------------|
| **本质** | Prompt 注入 | 代码实现 |
| **控制力** | 弱（模型自己决定） | 强（系统精确控制） |
| **功能** | 有限 | 完整 |
| **复杂度** | 低 | 中等 |

### 6.2 选择建议

```
简单任务（读取、查看、解释）
    ↓
只用 Skill ✅

复杂任务（重构、迁移、添加功能）
    ↓
使用 Plan and Execute ✅

两者都想要
    ↓
两者结合使用 ✅
```

### 6.3 最终建议

**对于 zguigo 项目**：

1. **保留现有的 Plan and Execute 系统**
   - 提供完整的任务管理功能
   - 支持复杂任务场景

2. **同时支持 Skill 方式**
   - 用户可以自定义 /plan skill
   - 适用于简单任务场景

3. **智能选择**
   - 根据任务复杂度自动选择模式
   - 用户也可以手动指定

---

## 七、参考示例

### 7.1 Skill 方式的 /plan

```markdown
<!-- .zguigo/commands/plan.md -->
# Plan 模式

你是一个任务规划专家。当用户给你一个复杂任务时：

1. 分析任务，拆分为 2-10 个子任务
2. 确定任务之间的依赖关系
3. 输出任务列表

然后按顺序执行每个任务，每完成一个任务就更新列表状态。

执行完成后，输出统计信息：
- 总任务数
- 完成任务数
- 失败任务数

目标：$ARGUMENTS
```

### 7.2 Plan and Execute 方式的 /plan

```typescript
// src/cli/repl.ts
if (trimmed.startsWith('/plan ')) {
  const task = trimmed.slice(6).trim();
  
  // 使用 Plan and Execute 系统
  const manager = await runPlan({
    client,
    tools,
    messages: [{ role: 'user', content: task }],
    // ...
  });
  
  // 存储任务列表
  taskManager = manager;
}
```

### 7.3 混合方式

```typescript
// 根据任务复杂度选择
if (isSimpleTask(task)) {
  // 使用 Skill
  const instruction = planSkill.instruction.replace('$ARGUMENTS', task);
  messages.push({ role: 'system', content: instruction });
} else {
  // 使用 Plan and Execute
  const manager = await runPlan({ ... });
  taskManager = manager;
}
```
