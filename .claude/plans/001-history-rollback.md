# 回滚代码 + 聊天记录功能实现计划

## 目标

实现三个功能模块：
1. **Phase 1**: 聊天记录（JSON 文件存储）
2. **Phase 2**: Git 快照回滚
3. **Phase 3**: SQLite 存储（可选增强）

---

## Phase 1: 聊天记录（JSON 文件存储）

### 新增文件

```
src/history/
├── protocol.ts        # 接口定义
├── chat-history.ts    # JSON 文件聊天记录实现
└── index.ts           # 导出
```

### 1.1 `src/history/protocol.ts`

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  metadata: {
    model: string;
    messageCount: number;
    toolCallCount: number;
  };
}
```

### 1.2 `src/history/chat-history.ts`

- `saveSession(session)` — 保存为 `~/.zguigo/history/{id}.json`
- `loadSession(id)` — 加载指定会话
- `listSessions()` — 列出所有会话（按更新时间排序）
- `deleteSession(id)` — 删除会话
- `createSession(title?)` — 创建新会话
- `searchSessions(query)` — 搜索会话标题

### 1.3 修改文件

**src/cli/commands.ts** — 新增命令：
- `/history` — 显示历史会话列表
- `/load <id>` — 加载历史会话
- `/save` — 保存当前会话
- `/new` — 创建新会话
- `/delete <id>` — 删除会话

**src/cli/repl.ts** — 集成聊天记录：
- 初始化 ChatHistory
- 管理 currentSession
- 每次对话后自动保存

**src/cli/commands.ts** — CommandContext 添加：
- `chatHistory?: ChatHistory`
- `currentSession?: ChatSession`

---

## Phase 2: Git 快照回滚

### 新增文件

```
src/history/
├── git-snapshot.ts    # Git 快照实现
└── index.ts           # 更新导出
```

### 2.1 `src/history/git-snapshot.ts`

```typescript
class GitSnapshot {
  constructor(projectRoot: string)

  /** 检查是否是 Git 仓库 */
  isGitRepo(): boolean

  /** 写入工具执行前创建快照 */
  createSnapshot(description: string): Promise<string>  // 返回 commit hash

  /** 回滚到指定 commit */
  rollbackTo(commitHash: string): Promise<void>

  /** 撤销最近一次快照 */
  undo(): Promise<void>

  /** 获取快照历史 */
  getHistory(limit?: number): Promise<SnapshotEntry[]>

  /** 获取当前工作区状态 */
  getStatus(): Promise<{ clean: boolean; files: string[] }>
}
```

### 2.2 集成到 Agent Loop

**src/agent/loop.ts** — 添加 `snapshotManager?` 选项：
- 在 `RunAgentOptions` 中添加 `snapshotManager?: GitSnapshot`
- 工具执行前调用 `snapshotManager.createSnapshot()`
- 只对 write_file、edit_file、create_directory 创建快照

**src/agent/plan-loop.ts** — 同样集成快照

### 2.3 CLI 命令

**src/cli/commands.ts** — 新增命令：
- `/rollback` — 显示快照历史
- `/rollback <hash>` — 回滚到指定 commit
- `/undo` — 撤销最近一次快照

---

## Phase 3: SQLite 存储（可选增强）

### 新增依赖

```json
"better-sqlite3": "^11.0.0"
```

### 新增文件

```
src/history/
├── sqlite-history.ts  # SQLite 聊天记录实现
└── index.ts           # 更新导出
```

### 3.1 `src/history/sqlite-history.ts`

```typescript
class SqliteHistory {
  constructor(dbPath: string)

  /** 初始化数据库表 */
  init(): void

  /** 保存会话 */
  saveSession(session: ChatSession): void

  /** 加载会话 */
  loadSession(id: string): ChatSession | null

  /** 列出会话 */
  listSessions(limit?: number): ChatSession[]

  /** 搜索消息 */
  searchMessages(query: string): ChatMessage[]

  /** 删除会话 */
  deleteSession(id: string): void

  /** 统计信息 */
  getStats(): { sessionCount: number; messageCount: number }
}
```

### 3.2 存储策略

- **主存储**: JSON 文件（便于调试和手动查看）
- **索引存储**: SQLite（便于查询和搜索）
- 保存时同时写入两者
- 加载时优先 JSON，降级 SQLite

---

## 实现顺序

### Step 1: 创建 history 模块基础
1. `src/history/protocol.ts`
2. `src/history/chat-history.ts`
3. `src/history/index.ts`

### Step 2: 集成聊天记录到 CLI
4. `src/cli/commands.ts` — 添加历史命令
5. `src/cli/repl.ts` — 集成聊天记录

### Step 3: 实现 Git 快照
6. `src/history/git-snapshot.ts`
7. `src/agent/loop.ts` — 集成快照
8. `src/agent/plan-loop.ts` — 集成快照

### Step 4: 添加回滚命令
9. `src/cli/commands.ts` — 添加回滚命令

### Step 5: 实现 SQLite 存储
10. 安装 better-sqlite3
11. `src/history/sqlite-history.ts`
12. 集成到 chat-history

### Step 6: 测试
13. `tests/history/chat-history.test.ts`
14. `tests/history/git-snapshot.test.ts`

### Step 7: 文档
15. 更新 `docs/project-structure.md`
16. 更新 `docs/src-flow.md`
