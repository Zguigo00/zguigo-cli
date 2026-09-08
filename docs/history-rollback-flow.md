# 聊天记录与 Git 快照回滚 — 实现流程

## 一、功能概述

实现两个核心功能：
1. **聊天记录**：保存和恢复对话历史，支持多会话
2. **Git 快照回滚**：写入工具执行前自动创建快照，支持撤销和回滚

---

## 二、目录结构

```
src/history/
├── protocol.ts        # 接口定义（ChatSession、SnapshotEntry 等）
├── chat-history.ts    # JsonChatHistory 基于 JSON 文件的聊天记录
├── git-snapshot.ts    # GitSnapshot 基于 Git 的快照回滚
└── index.ts           # 模块导出
```

---

## 三、核心接口 (`protocol.ts`)

### 3.1 ChatMessage

```typescript
interface ChatMessage extends Message {
  timestamp: number;  // 消息时间戳
}
```

### 3.2 ChatSession

```typescript
interface ChatSession {
  id: string;               // 会话 ID（8位随机字符）
  title: string;            // 会话标题
  createdAt: number;        // 创建时间
  updatedAt: number;        // 更新时间
  messages: ChatMessage[];  // 消息列表
  metadata: {
    model: string;          // 模型名称
    messageCount: number;   // 消息数量
    toolCallCount: number;  // 工具调用次数
  };
}
```

### 3.3 SnapshotEntry

```typescript
interface SnapshotEntry {
  hash: string;      // Git commit hash
  message: string;   // 提交信息
  timestamp: number; // 时间戳
}
```

### 3.4 ChatHistoryManager 接口

```typescript
interface ChatHistoryManager {
  saveSession(session: ChatSession): Promise<void>;
  loadSession(id: string): Promise<ChatSession | null>;
  listSessions(): Promise<ChatSession[]>;
  deleteSession(id: string): Promise<void>;
  createSession(title?: string): ChatSession;
}
```

### 3.5 SnapshotManager 接口

```typescript
interface SnapshotManager {
  isGitRepo(): boolean;
  createSnapshot(description: string): Promise<string>;
  rollbackTo(commitHash: string): Promise<void>;
  undo(): Promise<void>;
  getHistory(limit?: number): Promise<SnapshotEntry[]>;
}
```

---

## 四、聊天记录实现 (`chat-history.ts`)

### 4.1 存储位置

```
~/.zguigo/history/
├── a1b2c3d4.json    # 会话 1
├── e5f6g7h8.json    # 会话 2
└── ...
```

### 4.2 JsonChatHistory 类

```typescript
class JsonChatHistory implements ChatHistoryManager {
  private historyDir: string;

  constructor(projectRoot: string) {
    this.historyDir = join(projectRoot, '.zguigo', 'history');
  }
}
```

### 4.3 核心方法

**saveSession()**：
1. 初始化存储目录（不存在则创建）
2. 更新 `updatedAt` 时间戳
3. 更新 `metadata.messageCount`
4. 序列化为 JSON 写入文件

**loadSession()**：
1. 读取 `{id}.json` 文件
2. 解析 JSON 返回 ChatSession
3. 文件不存在返回 null

**listSessions()**：
1. 读取 history 目录下所有 .json 文件
2. 解析每个文件为 ChatSession
3. 按 `updatedAt` 倒序排列

**createSession()**：
1. 生成 8 位随机 ID
2. 设置标题（默认为"会话 + 时间"）
3. 初始化空消息列表和元数据

---

## 五、Git 快照实现 (`git-snapshot.ts`)

### 5.1 GitSnapshot 类

```typescript
class GitSnapshot implements SnapshotManager {
  private projectRoot: string;
  private snapshots: SnapshotEntry[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }
}
```

### 5.2 核心方法

**isGitRepo()**：
```
执行 git rev-parse --is-inside-work-tree
成功 → true
失败 → false
```

**createSnapshot(description)**：
```
1. 检查是否是 Git 仓库
2. git add -A（暂存所有变更）
3. git diff --cached --quiet（检查是否有变更）
   - 无变更 → 返回当前 HEAD hash
   - 有变更 → 继续
4. git commit -m "zguigo: {description}"
5. git rev-parse HEAD（获取 commit hash）
6. 记录到 snapshots 数组
7. 返回 hash
```

**rollbackTo(commitHash)**：
```
1. 检查是否是 Git 仓库
2. git reset --hard {commitHash}
```

**undo()**：
```
1. 检查是否是 Git 仓库
2. git reset --hard HEAD~1
3. 从 snapshots 数组移除最后一个
```

**getHistory(limit)**：
```
1. 检查是否是 Git 仓库
2. git log --oneline -{limit} --format="%H|%s|%at" --grep="^zguigo:"
3. 解析输出为 SnapshotEntry 数组
```

---

## 六、REPL 集成 (`repl.ts`)

### 6.1 初始化

```typescript
// 初始化聊天历史和快照管理器
const chatHistory = new JsonChatHistory(projectRoot);
const snapshotManager = new GitSnapshot(projectRoot);
let currentSession: ChatSession = chatHistory.createSession();
```

### 6.2 会话切换函数

```typescript
const switchSession = (session: ChatSession) => {
  currentSession = session;
  messages.length = 0;
  messages.push(...session.messages.map(m => ({
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls,
    tool_call_id: m.tool_call_id,
  })));
};
```

### 6.3 消息保存函数

```typescript
const saveToSession = (message: Message) => {
  currentSession.messages.push({
    ...message,
    timestamp: Date.now(),
  });
  currentSession.updatedAt = Date.now();
  if (message.role === 'assistant' && message.tool_calls) {
    currentSession.metadata.toolCallCount += message.tool_calls.length;
  }
};
```

### 6.4 自动保存

```typescript
let autoSaveCounter = 0;
const autoSave = async () => {
  autoSaveCounter++;
  if (autoSaveCounter % 3 === 0) {
    await chatHistory.saveSession(currentSession);
  }
};
```

### 6.5 Git 快照集成

```typescript
if (snapshotManager.isGitRepo()) {
  // 包装工具调用，写入类工具执行前自动创建快照
  const originalCall = tools.call.bind(tools);
  const WRITE_TOOLS = ['write_file', 'edit_file', 'create_directory'];

  tools.call = async (name: string, args: Record<string, unknown>) => {
    if (WRITE_TOOLS.includes(name)) {
      const desc = `${name}: ${args.path || ''}`;
      await snapshotManager.createSnapshot(desc);
    }
    return originalCall(name, args);
  };
}
```

### 6.6 退出时保存

```typescript
// REPL 循环结束后
if (currentSession.messages.length > 0) {
  await chatHistory.saveSession(currentSession);
}
```

---

## 七、CLI 命令 (`commands.ts`)

### 7.1 CommandContext 扩展

```typescript
interface CommandContext {
  // ... 现有字段
  chatHistory?: ChatHistoryManager;
  currentSession?: ChatSession;
  switchSession?: (session: ChatSession) => void;
  snapshotManager?: SnapshotManager;
}
```

### 7.2 新增命令

| 命令 | 说明 | 实现 |
|------|------|------|
| `/history` | 显示历史会话列表 | 调用 `chatHistory.listSessions()` |
| `/save` | 保存当前会话 | 调用 `chatHistory.saveSession()` |
| `/new` | 创建新会话 | 调用 `chatHistory.createSession()` + `switchSession()` |
| `/undo` | 撤销最近一次变更 | 调用 `snapshotManager.undo()` |
| `/rollback` | 查看快照历史 | 调用 `snapshotManager.getHistory()` |

---

## 八、工作流程

### 8.1 聊天记录流程

```
用户启动 REPL
    ↓
创建新会话 (chatHistory.createSession())
    ↓
用户输入消息
    ↓
saveToSession({ role: 'user', content: '...' })
    ↓
runAgent() 执行
    ↓
onEvent('done') → saveToSession({ role: 'assistant', content: '...' })
    ↓
autoSave()（每 3 条消息自动保存）
    ↓
用户退出 → chatHistory.saveSession(currentSession)
```

### 8.2 快照回滚流程

```
用户输入: "重构认证模块"
    ↓
Agent Loop 开始
    ↓
模型返回 tool_call: write_file
    ↓
tools.call() 被包装函数拦截
    ↓
snapshotManager.createSnapshot("write_file: src/auth.ts")
    ↓
git add -A
git commit -m "zguigo: write_file: src/auth.ts"
    ↓
执行原始 write_file
    ↓
继续执行下一个工具
    ↓
用户输入: /undo
    ↓
snapshotManager.undo()
    ↓
git reset --hard HEAD~1
    ↓
文件恢复到变更前状态
```

### 8.3 会话管理流程

```
用户输入: /history
    ↓
chatHistory.listSessions()
    ↓
显示历史会话列表
    ↓
用户输入: /new
    ↓
chatHistory.createSession()
switchSession(newSession)
    ↓
messages 清空，开始新对话
```

---

## 九、文件变更记录

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/history/protocol.ts` | 接口定义 |
| `src/history/chat-history.ts` | JsonChatHistory 实现 |
| `src/history/git-snapshot.ts` | GitSnapshot 实现 |
| `src/history/index.ts` | 模块导出 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/cli/commands.ts` | 添加 CommandContext 字段 + 5 个新命令 |
| `src/cli/repl.ts` | 集成聊天记录和快照管理器 |
| `tests/cli/commands.test.ts` | 更新命令数量 (13→18) |

---

## 十、存储位置

### 聊天记录

```
~/.zguigo/history/
├── a1b2c3d4.json    # 会话 1
├── e5f6g7h8.json    # 会话 2
└── ...
```

### Git 快照

```
项目根目录/.git/
└── （自动创建的 commit）
```

---

## 十一、依赖关系

```
src/history/
├── protocol.ts        ← 无依赖
├── chat-history.ts    ← protocol.ts + fs/promises + crypto
├── git-snapshot.ts    ← protocol.ts + child_process
└── index.ts           ← chat-history.ts + git-snapshot.ts

src/cli/
├── commands.ts        ← history/protocol.ts
└── repl.ts            ← history/index.ts
```

---

## 十二、测试验证

### 聊天记录测试

```bash
# 启动 REPL
npx tsx src/index.ts

# 输入消息
你> 你好

# 保存会话
你> /save

# 查看历史
你> /history

# 创建新会话
你> /new

# 退出
Ctrl+C

# 重新启动，检查历史
npx tsx src/index.ts
你> /history
```

### Git 快照测试

```bash
# 启动 REPL（在 Git 仓库中）
npx tsx src/index.ts

# 让 agent 写入文件
你> 创建一个测试文件 test.txt

# 查看快照历史
你> /rollback

# 撤销变更
你> /undo

# 检查文件是否恢复
```

---

## 十三、后续扩展 (Phase 3: SQLite)

### 安装依赖

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

### 新增文件

```
src/history/
└── sqlite-history.ts  # SqliteHistory 实现
```

### 存储策略

- **主存储**：JSON 文件（便于调试）
- **索引存储**：SQLite（便于查询和搜索）
- 保存时同时写入两者
- 加载时优先 JSON，降级 SQLite
