import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { ChatSession, ChatHistoryManager } from './protocol.js';

/**
 * 基于 JSON 文件的聊天历史管理器
 *
 * 存储位置：~/.zguigo/history/{session-id}.json
 */
export class JsonChatHistory implements ChatHistoryManager {
  private historyDir: string;

  constructor(projectRoot: string) {
    this.historyDir = join(projectRoot, '.zguigo', 'history');
  }

  /** 初始化存储目录 */
  async init(): Promise<void> {
    if (!existsSync(this.historyDir)) {
      await mkdir(this.historyDir, { recursive: true });
    }
  }

  async saveSession(session: ChatSession): Promise<void> {
    await this.init();
    session.updatedAt = Date.now();
    session.metadata.messageCount = session.messages.length;
    const filePath = join(this.historyDir, `${session.id}.json`);
    await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async loadSession(id: string): Promise<ChatSession | null> {
    const filePath = join(this.historyDir, `${id}.json`);
    if (!existsSync(filePath)) return null;
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as ChatSession;
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<ChatSession[]> {
    if (!existsSync(this.historyDir)) return [];

    try {
      const entries = await readdir(this.historyDir);
      const sessions: ChatSession[] = [];

      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const data = await readFile(join(this.historyDir, entry), 'utf-8');
          sessions.push(JSON.parse(data) as ChatSession);
        } catch {
          // 跳过损坏的文件
        }
      }

      // 按更新时间倒序
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async deleteSession(id: string): Promise<void> {
    const filePath = join(this.historyDir, `${id}.json`);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  createSession(title?: string): ChatSession {
    const now = Date.now();
    return {
      id: randomUUID().slice(0, 8),
      title: title || `会话 ${new Date(now).toLocaleString('zh-CN')}`,
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        model: '',
        messageCount: 0,
        toolCallCount: 0,
      },
    };
  }
}
