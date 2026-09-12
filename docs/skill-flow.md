# Skill 系统实现流程

## 概述

Skill 系统让 zguigo 支持两种扩展方式：
- **Commands**：手动触发的任务命令（`/review`、`/test` 等）
- **Skills**：启动时自动加载的背景知识

---

## 架构设计

```
用户输入
    │
    ├─ /help, /clear, /exit → 内置命令处理
    │
    ├─ /command-name args → Skill 命令处理
    │       │
    │       ├─ 1. CommandRegistry.get('command-name')
    │       │      ├─ 查找 .zguigo/commands/command-name.md（项目级）
    │       │      ├─ 查找 ~/.zguigo/commands/command-name.md（用户级）
    │       │      └─ 查找内置命令
    │       │
    │       ├─ 2. 替换 $ARGUMENTS → args
    │       │
    │       ├─ 3. 注入 instruction 到 system message
    │       │
    │       └─ 4. 调用 runAgent()
    │              └─ readOnly=true 时禁止写入类工具
    │
    └─ 普通文本 → 普通 Agent Loop
```

---

## 目录结构

```
src/skills/
├── protocol.ts          # Command 接口定义
├── registry.ts          # CommandRegistry 类
├── knowledge.ts         # KnowledgeLoader 类
├── index.ts             # 导出入口
└── built-in/
    ├── review.ts        # /review 代码审查
    ├── test.ts          # /test 生成测试
    ├── explain.ts       # /explain 解释代码
    └── refactor.ts      # /refactor 重构代码
```

---

## 核心实现

### 1. Command 接口 (protocol.ts)

```typescript
interface Command {
  name: string;               // 命令名（如 "review"）
  description: string;        // 一行描述
  instruction: string;        // 指令模板（含 $ARGUMENTS）
  readOnly?: boolean;         // 是否只读
  source: 'builtin' | 'file'; // 来源
  location?: string;          // 文件路径（file 来源时）
}
```

**关键字段**：
- `instruction`：指令模板，`$ARGUMENTS` 会被用户输入替换
- `readOnly`：为 true 时禁止执行 write_file、edit_file、create_directory、run_command

### 2. CommandRegistry (registry.ts)

**查找优先级**：
```
项目级 .zguigo/commands/{name}.md
    ↓ 找不到
用户级 ~/.zguigo/commands/{name}.md
    ↓ 找不到
内置命令
```

**核心方法**：
```typescript
class CommandRegistry {
  constructor(projectRoot: string) {
    this.projectCommandsDir = join(projectRoot, '.zguigo', 'commands');
    this.userCommandsDir = join(getUserHome(), '.zguigo', 'commands');
  }

  // 注册内置命令
  register(command: Command): void;

  // 查找命令（优先级：项目级 > 用户级 > 内置）
  async get(name: string): Promise<Command | undefined>;

  // 列出所有命令
  async list(): Promise<Command[]>;
}
```

**文件解析**：
```typescript
function parseMdCommand(content: string, filePath: string): Command {
  // 1. 提取第一行非空行作为 description
  // 2. 整个文件内容作为 instruction
  // 3. 检查是否包含 "只读" 关键词
  // 4. 文件名作为 name
}
```

### 3. KnowledgeLoader (knowledge.ts)

**加载流程**：
```
REPL 启动
    │
    ├─ 扫描 ~/.zguigo/skills/*.md（用户级）
    │
    ├─ 扫描 .zguigo/skills/*.md（项目级，追加）
    │
    ├─ 拼接所有 .md 内容为一段文本
    │
    └─ 注入到 system message 末尾
```

**核心实现**：
```typescript
class KnowledgeLoader {
  constructor(projectRoot: string) {
    this.projectSkillsDir = join(projectRoot, '.zguigo', 'skills');
    this.userSkillsDir = join(getUserHome(), '.zguigo', 'skills');
  }

  async loadAll(): Promise<string> {
    const sections: string[] = [];

    // 用户级
    const userKnowledge = await this.loadFromDir(this.userSkillsDir);
    if (userKnowledge) sections.push(userKnowledge);

    // 项目级
    const projectKnowledge = await this.loadFromDir(this.projectSkillsDir);
    if (projectKnowledge) sections.push(projectKnowledge);

    return sections.join('\n\n---\n\n');
  }
}
```

### 4. 只读限制 (loop.ts)

**禁止的工具列表**：
```typescript
const READ_ONLY_TOOLS = ['write_file', 'edit_file', 'create_directory', 'run_command'];
```

**检查逻辑**：
```typescript
// 在执行工具前检查
if (readOnlyTools?.includes(tc.name)) {
  const rejectMsg = `只读模式下禁止执行: ${tc.name}`;
  // 写入拒绝消息到 messages
  // 发送 tool_result 事件
  continue;
}
```

### 5. REPL 集成 (repl.ts)

**初始化**：
```typescript
// 初始化 Skill 系统
const commandRegistry = new CommandRegistry(projectRoot);
const knowledgeLoader = new KnowledgeLoader(projectRoot);

// 注册内置命令
commandRegistry.register(reviewCommand);
commandRegistry.register(testCommand);
commandRegistry.register(explainCommand);
commandRegistry.register(refactorCommand);

// 加载 Knowledge
const knowledge = await knowledgeLoader.loadAll();
if (knowledge) {
  // 注入到 system message
}
```

**命令检测**：
```typescript
// 检测 /command-name 任务描述
const skillMatch = trimmed.match(/^\/(\w+)\s*(.*)/);
if (skillMatch) {
  const commandName = skillMatch[1];
  const args = skillMatch[2].trim();

  const command = await commandRegistry.get(commandName);
  if (command) {
    // 替换 $ARGUMENTS
    const instruction = command.instruction.replace(/\$ARGUMENTS/g, args || '（未指定目标）');

    // 注入为系统消息
    messages.push({ role: 'system', content: instruction });

    // 添加用户任务
    if (args) {
      messages.push({ role: 'user', content: args });
    }

    // 调用 runAgent，只读时禁止写入工具
    await runAgent({
      // ...
      readOnlyTools: command.readOnly ? READ_ONLY_TOOLS : undefined,
    });
  }
}
```

---

## 添加别人的 Skills

### 手动复制

```
别人分享的 .md 文件
    ↓
复制到 .zguigo/commands/ 或 .zguigo/skills/
    ↓
重启 REPL → 生效
```

### Git 仓库方式

```
# 别人的 skills 仓库
github.com/user/zguigo-skills/
├── commands/
│   └── security-review.md
└── skills/
    └── nextjs-patterns.md

# 使用方式：clone 后复制
git clone https://github.com/user/zguigo-skills.git
cp zguigo-skills/commands/*.md .zguigo/commands/
```

### 用户级共享（跨项目）

```
# 放到用户目录，所有项目都能用
~/.zguigo/commands/security-review.md
~/.zguigo/skills/nextjs-patterns.md
```

---

## 测试验证

### 测试文件

- `tests/skills/registry.test.ts` — CommandRegistry 测试
- `tests/skills/knowledge.test.ts` — KnowledgeLoader 测试
- `tests/skills/built-in.test.ts` — 内置命令测试

### 测试结果

```
✓ tests/skills/registry.test.ts (6 tests)
✓ tests/skills/knowledge.test.ts (4 tests)
✓ tests/skills/built-in.test.ts (13 tests)

所有 90 个测试通过
```

---

## 总结

### 核心设计

| 组件 | 职责 |
|------|------|
| **CommandRegistry** | 管理命令查找（项目级 > 用户级 > 内置） |
| **KnowledgeLoader** | 加载并拼接 .md 知识文件 |
| **Command 接口** | 定义命令结构（name, description, instruction, readOnly） |
| **loop.ts** | 注入 skill 指令，执行只读限制 |

### 技术要点

1. **文件即 Skill**：.md 文件就是 Skill 定义，无需复杂配置
2. **优先级机制**：项目级 > 用户级 > 内置
3. **只读限制**：通过 readOnly 标记控制工具访问
4. **自动加载**：Skills 在启动时自动注入到上下文
5. **易于扩展**：添加 .md 文件即可扩展功能
