import type { Message, ToolCall } from '../model/types.js';

/** 聊天消息（带时间戳） */
export interface ChatMessage extends Message {
  /** 消息时间戳 */
  timestamp: number;
}

/** 会话元数据 */
export interface SessionMetadata {
  /** 模型名称 */
  model: string;
  /** 消息数量 */
  messageCount: number;
  /** 工具调用次数 */
  toolCallCount: number;
}

/** 聊天会话 */
export interface ChatSession {
  /** 会话 ID */
  id: string;
  /** 会话标题 */
  title: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 消息列表 */
  messages: ChatMessage[];
  /** 元数据 */
  metadata: SessionMetadata;
}

/** 快照条目 */
export interface SnapshotEntry {
  /** Git commit hash */
  hash: string;
  /** 提交信息 */
  message: string;
  /** 时间戳 */
  timestamp: number;
}

/** 聊天历史接口 */
export interface ChatHistoryManager {
  /** 保存会话 */
  saveSession(session: ChatSession): Promise<void>;
  /** 加载会话 */
  loadSession(id: string): Promise<ChatSession | null>;
  /** 列出会话 */
  listSessions(): Promise<ChatSession[]>;
  /** 删除会话 */
  deleteSession(id: string): Promise<void>;
  /** 创建新会话 */
  createSession(title?: string): ChatSession;
}

/** Git 快照接口 */
export interface SnapshotManager {
  /** 是否在 Git 仓库中 */
  isGitRepo(): boolean;
  /** 创建快照，返回 commit hash */
  createSnapshot(description: string): Promise<string>;
  /** 回滚到指定 commit */
  rollbackTo(commitHash: string): Promise<void>;
  /** 撤销最近一次快照 */
  undo(): Promise<void>;
  /** 获取快照历史 */
  getHistory(limit?: number): Promise<SnapshotEntry[]>;
}
