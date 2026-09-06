# Skill 系统实现计划

## 两个子系统

| 系统 | 存放位置 | 触发方式 | 本质 |
|------|----------|----------|------|
| **Commands** | `.zguigo/commands/*.md` | `/command-name` 手动触发 | 任务执行模板 |
| **Skills** | `.zguigo/skills/*.md` | 启动时自动加载 | 背景知识注入 |

支持两个层级：**项目级**（团队共享）和**用户级**（个人跨项目）

---

## 一、Commands（任务命令）

### 文件格式

```markdown
<!-- .zguigo/commands/review.md -->
# 代码审查

你是一个代码审查专家。请按以下步骤审查目标代码：

1. 先读取相关代码文件
2. 检查代码风格、潜在 bug、安全问题
3. 给出改进建议
4. 每个问题标注严重程度（高/中/低）

只读取代码，不要修改任何文件。

目标：$ARGUMENTS
```

### 触发方式

```
/review src/app.ts
  ↓
读取 .zguigo/commands/review.md
  ↓
替换 $ARGUMENTS → "src/app.ts"
  ↓
注入为用户消息发给模型
```

### 内置 Commands

项目自带几个常用命令（打包在代码里），用户也可以自己添加 .md 文件扩展。

| 命令 | 描述 | 只读 |
|------|------|------|
| `/review` | 代码审查 | ✅ |
| `/test` | 生成测试 | ❌ |
| `/explain` | 解释代码 | ✅ |
| `/refactor` | 重构代码 | ❌ |

**内置 Commands 的 fallback 机制**：
1. 优先查找 `.zguigo/commands/{name}.md`（用户自定义）
2. 找不到则使用内置定义（代码中的默认实现）

---

## 二、Skills（背景知识）

### 文件格式

```markdown
<!-- .zguigo/skills/deploy.md -->
# 部署流程

本项目使用 Cloudflare Workers 部署：

1. 运行 npm run build
2. 运行 npx wrangler deploy
3. 检查部署状态

注意：
- 生产环境变量在 .env.production
- 不要提交 .env 文件
```

```markdown
<!-- .zguigo/skills/code-style.md -->
# 代码风格

- 使用 TypeScript 严格模式
- 所有注释使用中文
- ESM 模块，import 必须带 .js 后缀
- 变量命名使用 camelCase
- 接口命名使用 PascalCase
```

### 加载方式

```
启动 REPL
  ↓
扫描 .zguigo/skills/*.md
  ↓
拼接所有 .md 内容
  ↓
注入到 system message 末尾
  ↓
模型始终知道这些知识
```

### 与 CLAUDE.md 的关系

| 文件 | 加载时机 | 用途 |
|------|----------|------|
| `CLAUDE.md` | 启动时 | 项目基本指令（已有） |
| `.zguigo/skills/*.md` | 启动时 | 具体领域的知识/流程 |

两者**互补**：CLAUDE.md 是通用框架，skills 是具体领域知识。

---

## 三、目录结构

```
zguigo_Cli/
├── .zguigo/                         # 项目级配置（提交到 git，团队共享）
│   ├── commands/
│   │   └── my-command.md
│   └── skills/
│       └── my-skill.md
│
~/.zguigo/                           # 用户级配置（个人，跨项目共享）
├── commands/
│   └── my-command.md
└── skills/
    └── my-skill.md

优先级：项目级 > 用户级 > 内置
```

---

## 四、核心接口

```typescript
// ==================== Commands ====================

interface Command {
  name: string;               // 命令名（如 "review"）
  description: string;        // 描述
  instruction: string;        // 指令模板（含 $ARGUMENTS）
  readOnly?: boolean;         // 是否只读
  source: 'builtin' | 'file'; // 来源
  location?: string;          // 文件路径（file 来源时）
}

class CommandRegistry {
  private commands = new Map<string, Command>();
  private projectCommandsDir: string;  // .zguigo/commands/
  private userCommandsDir: string;     // ~/.zguigo/commands/

  /** 注册内置命令 */
  register(command: Command): void;

  /**
   * 查找命令（优先级：项目级 > 用户级 > 内置）
   * 1. .zguigo/commands/{name}.md
   * 2. ~/.zguigo/commands/{name}.md
   * 3. 内置命令
   */
  async get(name: string): Promise<Command | undefined>;

  /** 列出所有命令（合并三层，不重复） */
  async list(): Promise<Command[]>;
}

// ==================== Skills（知识） ====================

class KnowledgeLoader {
  private projectSkillsDir: string;  // .zguigo/skills/
  private userSkillsDir: string;     // ~/.zguigo/skills/

  /**
   * 加载所有 .md 文件内容，拼接为一段知识文本
   * 扫描顺序：用户级 → 项目级（项目级内容追加在后面，优先级更高）
   */
  async loadAll(): Promise<string>;
}

// ==================== REPL 中的使用 ====================

// 启动时：
const knowledge = await knowledgeLoader.loadAll();
// knowledge 注入到 system message 末尾

// 用户输入 /review 时：
const command = await commandRegistry.get('review');
const prompt = command.instruction.replace('$ARGUMENTS', userInput);
// 作为用户消息发给模型
```

---

## 五、实现步骤

### Phase 1: 基础框架（5 个文件）
1. `src/skills/protocol.ts` — Command、Knowledge 接口
2. `src/skills/registry.ts` — CommandRegistry 类
3. `src/skills/knowledge.ts` — KnowledgeLoader 类
4. `src/skills/index.ts` — 导出

### Phase 2: 内置 Commands（4 个文件）
5. `src/skills/built-in/review.ts`
6. `src/skills/built-in/test.ts`
7. `src/skills/built-in/explain.ts`
8. `src/skills/built-in/refactor.ts`

### Phase 3: 集成（4 个文件修改）
9. `src/agent/types.ts` — 添加 command 相关事件类型
10. `src/agent/loop.ts` — 支持只读限制（command 触发时过滤写入工具）
11. `src/cli/commands.ts` — 添加 /commands 列表命令
12. `src/cli/repl.ts` — /command-name 触发逻辑 + knowledge 注入

### Phase 4: 配置目录
13. 创建 `.zguigo/` 示例目录（可选，不强制）

### Phase 5: 测试（3 个文件）
14. `tests/skills/registry.test.ts` — CommandRegistry 测试
15. `tests/skills/knowledge.test.ts` — KnowledgeLoader 测试
16. `tests/skills/built-in.test.ts` — 内置命令内容测试

### Phase 6: 文档
17. `docs/skill-flow.md` — Skill 系统实现流程笔记

---

## 六、工作流程图

### Command 触发流程

```
用户输入: /review src/app.ts
    │
    ├─ 匹配 /review → 查找命令
    │   ├─ 1. .zguigo/commands/review.md → 项目级（最高优先）
    │   ├─ 2. ~/.zguigo/commands/review.md → 用户级
    │   └─ 3. 内置 review 命令
    │
    ├─ 替换 $ARGUMENTS → "src/app.ts"
    │
    ├─ 注入 instruction 到 system message 前部
    │
    ├─ readOnly=true → 过滤掉 write_file/edit_file/create_directory/run_command
    │
    └─ 调用 runAgent()
```

### Skill（知识）加载流程

```
REPL 启动
    │
    ├─ 扫描 ~/.zguigo/skills/*.md（用户级）
    │
    ├─ 扫描 .zguigo/skills/*.md（项目级，追加）
    │
    ├─ 拼接所有 .md 内容为一段文本
    │
    ├─ 注入到 system message 末尾
    │
    └─ 模型始终拥有这些背景知识
```

---

## 七、示例：完整流程

### 场景 1：使用 /review 命令

```
用户: /review src/agent/loop.ts

系统内部:
1. CommandRegistry.get('review') → 找到内置 review 命令
2. 替换: "审查以下代码：src/agent/loop.ts" + instruction
3. 注入到 system message
4. runAgent() →
   模型: "我来审查 src/agent/loop.ts..."
   [只读取文件，给出审查意见]
```

### 场景 2：Skills 自动生效

```
.zguigo/skills/deploy.md 内容:
"本项目使用 npm run build && npm run deploy 部署"

用户: 帮我部署一下

模型（因为已经知道 deploy.md 的内容）:
"好的，我会执行以下步骤：
1. npm run build
2. npm run deploy
确认执行吗？"
```

---

## 八、添加别人的 Skills

### 手动复制（最简单）

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
│   ├── security-review.md
│   └── api-design.md
└── skills/
    └── nextjs-patterns.md

# 使用方式：clone 后复制
git clone https://github.com/user/zguigo-skills.git
cp zguigo-skills/commands/*.md .zguigo/commands/
cp zguigo-skills/skills/*.md .zguigo/skills/
```

### 用户级共享（跨项目）

```
# 放到用户目录，所有项目都能用
~/.zguigo/commands/security-review.md
~/.zguigo/skills/nextjs-patterns.md
```

### 优先级

```
项目级 .zguigo/xxx.md  >  用户级 ~/.zguigo/xxx.md  >  内置
```

同名文件，项目级覆盖用户级，用户级覆盖内置。
