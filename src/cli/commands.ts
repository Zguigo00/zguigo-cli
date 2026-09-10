import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { CompressionConfig } from '../context/index.js';
import { compressMessages } from '../context/index.js';
import type { CommandRegistry } from '../skills/index.js';
import type { TaskManager } from '../tasks/manager.js';
import type { ChatHistoryManager, ChatSession, SnapshotManager } from '../history/protocol.js';

/**
 * 生成进度条
 * @param current 当前步骤（从 0 开始）
 * @param total 总步骤数
 * @param width 进度条宽度（字符数）
 * @returns 进度条字符串
 */
function generateProgressBar(current: number, total: number, width: number = 20): string {
  const progress = Math.round((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${progress}%`;
}

/** 内置命令定义 */
export interface Command {
  name: string;
  description: string;
  handler: (ctx: CommandContext) => void | Promise<void>;
}

/** 输出辅助函数 —— 优先走 logLine（blessed），否则 console.log */
function log(ctx: CommandContext, ...args: unknown[]): void {
  const text = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
  if (ctx.logLine) {
    ctx.logLine(text);
  } else {
    console.log(text);
  }
}

export interface CommandContext {
  messages: Message[];
  clearMessages: () => void;
  client?: ModelClient;
  compressionConfig?: CompressionConfig;
  commandRegistry?: CommandRegistry;
  taskManager?: TaskManager;
  /** 聊天历史管理器 */
  chatHistory?: ChatHistoryManager;
  /** 当前会话 */
  currentSession?: ChatSession;
  /** 切换当前会话 */
  switchSession?: (session: ChatSession) => void;
  /** Git 快照管理器 */
  snapshotManager?: SnapshotManager;
  /** 用户原始输入（含命令名和参数） */
  input?: string;
  /** 输出函数（blessed 模式下走屏幕，否则走 console.log） */
  logLine?: (text: string) => void;
}

/** 内置命令列表 */
export const commands: Command[] = [
  {
    name: '/help',
    description: '显示帮助信息',
    handler: (ctx) => {
      log(ctx, `
zguigo - 终端 AI 编程助手

内置命令:
  /help         显示此帮助信息
  /clear        清空对话历史
  /compact      压缩对话历史（释放上下文空间）
  /commands     列出可用的 Skill 命令
  /exit         退出程序

子代理命令:
  /agent <任务>  启动子代理执行独立任务（独立对话历史）

Plan and Execute 命令:
  /plan         启动 Plan 模式，生成任务列表
  /tasks        显示当前任务列表
  /run          开始执行任务列表
  /task-done    标记当前任务完成
  /task-fail    标记当前任务失败
  /task-skip    跳过当前任务
  /task-add     添加新任务
  /task-remove  删除任务
  /clear-tasks  清空任务列表

Skill 命令:
  /command-name 任务描述  执行对应的 Skill 命令
  例如: /review src/app.ts  执行代码审查

会话管理:
  /history      显示历史会话列表
  /load         加载历史会话
  /save         保存当前会话
  /new          创建新会话
  /delete       删除历史会话

快照回滚:
  /undo         撤销最近一次文件变更
  /rollback     查看快照历史或回滚到指定版本

直接输入文本即可与 AI 对话。
按 Ctrl+C 退出。
`);
    },
  },
  {
    name: '/clear',
    description: '清空对话历史',
    handler: (ctx) => {
      ctx.clearMessages();
      log(ctx,'已清空对话历史。');
    },
  },
  {
    name: '/exit',
    description: '退出程序',
    handler: () => {
      process.exit(0);
    },
  },
  {
    name: '/compact',
    description: '压缩对话历史（释放上下文空间）',
    handler: async (ctx) => {
      if (!ctx.client || !ctx.compressionConfig) {
        log(ctx,'压缩功能未配置。');
        return;
      }

      if (ctx.messages.length === 0) {
        log(ctx,'没有对话历史需要压缩。');
        return;
      }

      log(ctx,'正在压缩对话历史...');
      try {
        const result = await compressMessages(ctx.messages, ctx.client, ctx.compressionConfig);
        if (result.compressed) {
          ctx.messages.length = 0;
          ctx.messages.push(...result.messages);
          log(ctx,`压缩完成: ${result.beforeTokens} → ${result.afterTokens} tokens`);
        } else {
          log(ctx,'当前对话历史较短，无需压缩。');
        }
      } catch (err) {
        console.error('压缩失败:', err instanceof Error ? err.message : String(err));
      }
    },
  },
  {
    name: '/commands',
    description: '列出可用的 Skill 命令',
    handler: async (ctx) => {
      if (!ctx.commandRegistry) {
        log(ctx,'命令注册表未初始化。');
        return;
      }

      const cmds = await ctx.commandRegistry.list();
      if (cmds.length === 0) {
        log(ctx,'没有可用的 Skill 命令。');
        return;
      }

      log(ctx,'\n可用的 Skill 命令:\n');
      for (const cmd of cmds) {
        const readOnlyTag = cmd.readOnly ? ' [只读]' : '';
        const sourceTag = cmd.source === 'file' ? ' (文件)' : '';
        log(ctx,`  /${cmd.name}${sourceTag}${readOnlyTag}`);
        log(ctx,`    ${cmd.description}`);
      }
      log(ctx,'');
    },
  },
  {
    name: '/run',
    description: '开始执行任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      if (ctx.taskManager.count === 0) {
        log(ctx,'任务列表为空。使用 /plan 创建任务计划。');
        return;
      }

      // 实际执行逻辑在 repl.ts 中处理
      // 这里只是提示用户
      log(ctx,'开始执行任务列表...');
    },
  },
  {
    name: '/tasks',
    description: '显示当前任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      const tasks = ctx.taskManager.getTasks();
      if (tasks.length === 0) {
        log(ctx,'任务列表为空。使用 /plan 创建任务计划。');
        return;
      }

      const currentIndex = ctx.taskManager.getCurrentIndex();
      const stats = ctx.taskManager.getStats();
      const progressBar = generateProgressBar(stats.completed, stats.total);

      log(ctx,`\n任务列表 (共 ${stats.total} 个):\n`);

      tasks.forEach((task, index) => {
        let status = '';
        switch (task.status) {
          case 'pending':
            status = '[ ]';
            break;
          case 'in_progress':
            status = '[→]';
            break;
          case 'completed':
            status = '[✓]';
            break;
          case 'failed':
            status = '[✗]';
            break;
          case 'skipped':
            status = '[-]';
            break;
        }

        const isCurrent = index === currentIndex;
        const marker = isCurrent ? ' ← 当前' : '';
        log(ctx,`  ${status} ${task.title}${marker}`);
      });

      log(ctx,`\n进度: ${progressBar}`);
      log(ctx,`统计: ${stats.completed} 完成, ${stats.failed} 失败, ${stats.skipped} 跳过, ${stats.pending} 待执行\n`);
    },
  },
  {
    name: '/task-done',
    description: '标记当前任务完成',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.completeCurrentTask('手动标记完成');
      if (task) {
        log(ctx,`✓ 任务 "${task.title}" 已标记为完成`);
      } else {
        log(ctx,'没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-fail',
    description: '标记当前任务失败',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.failCurrentTask('手动标记失败');
      if (task) {
        log(ctx,`✗ 任务 "${task.title}" 已标记为失败`);
      } else {
        log(ctx,'没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-skip',
    description: '跳过当前任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.skipCurrentTask('手动跳过');
      if (task) {
        log(ctx,`- 任务 "${task.title}" 已跳过`);
      } else {
        log(ctx,'没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-add',
    description: '添加新任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      // 从输入中解析参数：/task-add <标题> [描述]
      const args = ctx.input?.replace(/^\/task-add\s*/, '').trim();
      if (!args) {
        log(ctx,'用法: /task-add <任务标题> [任务描述]');
        log(ctx,'示例: /task-add 重构认证模块 将 OAuth 逻辑拆分为独立服务');
        return;
      }

      // 空格分隔：第一个词作为标题，剩余作为描述
      const spaceIndex = args.indexOf(' ');
      const title = spaceIndex > 0 ? args.slice(0, spaceIndex) : args;
      const description = spaceIndex > 0 ? args.slice(spaceIndex + 1).trim() : title;

      const task = ctx.taskManager.addTask(title, description);
      log(ctx,`✓ 已添加任务: [${task.id}] ${task.title}`);
    },
  },
  {
    name: '/task-remove',
    description: '删除任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      // 从输入中解析任务 ID
      const taskId = ctx.input?.replace(/^\/task-remove\s*/, '').trim();
      if (!taskId) {
        // 没有指定 ID，显示任务列表供选择
        const tasks = ctx.taskManager.getTasks();
        if (tasks.length === 0) {
          log(ctx,'任务列表为空。');
          return;
        }
        log(ctx,'\n用法: /task-remove <任务ID>\n');
        log(ctx,'当前任务:');
        tasks.forEach(t => {
          log(ctx,`  [${t.id}] ${t.title}`);
        });
        log(ctx,'');
        return;
      }

      const removed = ctx.taskManager.removeTask(taskId);
      if (removed) {
        log(ctx,`✓ 已删除任务: ${taskId}`);
      } else {
        log(ctx,`未找到任务: ${taskId}`);
        const tasks = ctx.taskManager.getTasks();
        if (tasks.length > 0) {
          log(ctx,'\n当前任务:');
          tasks.forEach(t => {
            log(ctx,`  [${t.id}] ${t.title}`);
          });
          log(ctx,'');
        }
      }
    },
  },
  {
    name: '/clear-tasks',
    description: '清空任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        log(ctx,'任务管理器未初始化。');
        return;
      }

      ctx.taskManager.clear();
      log(ctx,'已清空任务列表。');
    },
  },
  // ==================== 聊天记录命令 ====================
  {
    name: '/history',
    description: '显示历史会话列表',
    handler: async (ctx) => {
      if (!ctx.chatHistory) {
        log(ctx,'聊天历史未配置。');
        return;
      }

      const sessions = await ctx.chatHistory.listSessions();
      if (sessions.length === 0) {
        log(ctx,'没有历史会话。');
        return;
      }

      log(ctx,'\n历史会话:\n');
      sessions.forEach((s, i) => {
        const date = new Date(s.updatedAt).toLocaleString('zh-CN');
        const current = ctx.currentSession?.id === s.id ? ' ← 当前' : '';
        const msgCount = s.metadata.messageCount;
        log(ctx,`  ${i + 1}. [${s.id}] ${s.title} (${msgCount} 条消息, ${date})${current}`);
      });
      log(ctx,'');
    },
  },
  {
    name: '/save',
    description: '保存当前会话',
    handler: async (ctx) => {
      if (!ctx.chatHistory || !ctx.currentSession) {
        log(ctx,'聊天历史未配置。');
        return;
      }

      await ctx.chatHistory.saveSession(ctx.currentSession);
      log(ctx,`会话已保存: ${ctx.currentSession.title}`);
    },
  },
  {
    name: '/new',
    description: '创建新会话',
    handler: (ctx) => {
      if (!ctx.chatHistory) {
        log(ctx,'聊天历史未配置。');
        return;
      }

      const session = ctx.chatHistory.createSession();
      ctx.switchSession?.(session);
      log(ctx,`已创建新会话: ${session.title}`);
    },
  },
  {
    name: '/load',
    description: '加载历史会话',
    handler: async (ctx) => {
      if (!ctx.chatHistory || !ctx.switchSession) {
        log(ctx,'聊天历史未配置。');
        return;
      }

      // 从输入中解析会话 ID
      const sessionId = ctx.input?.replace(/^\/load\s*/, '').trim();
      if (!sessionId) {
        // 没有指定 ID，显示会话列表供选择
        const sessions = await ctx.chatHistory.listSessions();
        if (sessions.length === 0) {
          log(ctx,'没有历史会话。');
          return;
        }
        log(ctx,'\n用法: /load <会话ID>\n');
        log(ctx,'可用会话:');
        sessions.forEach((s, i) => {
          const date = new Date(s.updatedAt).toLocaleString('zh-CN');
          log(ctx,`  [${s.id}] ${s.title} (${s.metadata.messageCount} 条消息, ${date})`);
        });
        log(ctx,'');
        return;
      }

      const session = await ctx.chatHistory.loadSession(sessionId);
      if (!session) {
        log(ctx,`未找到会话: ${sessionId}`);
        return;
      }

      // 先保存当前会话
      if (ctx.currentSession && ctx.currentSession.messages.length > 0) {
        await ctx.chatHistory.saveSession(ctx.currentSession);
      }

      ctx.switchSession(session);
      log(ctx,`已加载会话: ${session.title} (${session.messages.length} 条消息)`);
    },
  },
  {
    name: '/delete',
    description: '删除历史会话',
    handler: async (ctx) => {
      if (!ctx.chatHistory) {
        log(ctx,'聊天历史未配置。');
        return;
      }

      // 从输入中解析会话 ID
      const sessionId = ctx.input?.replace(/^\/delete\s*/, '').trim();
      if (!sessionId) {
        // 没有指定 ID，显示会话列表供选择
        const sessions = await ctx.chatHistory.listSessions();
        if (sessions.length === 0) {
          log(ctx,'没有历史会话。');
          return;
        }
        log(ctx,'\n用法: /delete <会话ID>\n');
        log(ctx,'可用会话:');
        sessions.forEach(s => {
          const current = ctx.currentSession?.id === s.id ? ' (当前)' : '';
          log(ctx,`  [${s.id}] ${s.title}${current}`);
        });
        log(ctx,'');
        return;
      }

      // 禁止删除当前会话
      if (ctx.currentSession?.id === sessionId) {
        log(ctx,'不能删除当前会话。请先切换到其他会话或创建新会话。');
        return;
      }

      await ctx.chatHistory.deleteSession(sessionId);
      log(ctx,`已删除会话: ${sessionId}`);
    },
  },
  // ==================== 快照回滚命令 ====================
  {
    name: '/undo',
    description: '撤销最近一次文件变更',
    handler: async (ctx) => {
      if (!ctx.snapshotManager) {
        log(ctx,'快照管理器未配置。');
        return;
      }

      if (!ctx.snapshotManager.isGitRepo()) {
        log(ctx,'当前目录不是 Git 仓库，无法使用回滚功能。');
        return;
      }

      try {
        await ctx.snapshotManager.undo();
        log(ctx,'已撤销最近一次文件变更。');
      } catch (err) {
        console.error('撤销失败:', err instanceof Error ? err.message : String(err));
      }
    },
  },
  {
    name: '/rollback',
    description: '查看快照历史或回滚到指定版本',
    handler: async (ctx) => {
      if (!ctx.snapshotManager) {
        log(ctx,'快照管理器未配置。');
        return;
      }

      if (!ctx.snapshotManager.isGitRepo()) {
        log(ctx,'当前目录不是 Git 仓库，无法使用回滚功能。');
        return;
      }

      const history = await ctx.snapshotManager.getHistory(10);
      if (history.length === 0) {
        log(ctx,'没有快照历史。');
        return;
      }

      log(ctx,'\n快照历史:\n');
      history.forEach((entry, i) => {
        const date = new Date(entry.timestamp).toLocaleString('zh-CN');
        log(ctx,`  ${i + 1}. ${entry.hash.slice(0, 8)} — ${entry.message} (${date})`);
      });
      log(ctx,'\n使用 /rollback <hash> 回滚到指定版本');
      log(ctx,'使用 /undo 撤销最近一次变更\n');
    },
  },
];

/** 查找并执行命令，返回是否找到 */
export async function handleCommand(
  input: string,
  ctx: CommandContext,
): Promise<boolean> {
  const trimmed = input.trim();
  const cmd = commands.find((c) => c.name === trimmed);
  if (!cmd) return false;
  await cmd.handler(ctx);
  return true;
}

/** 获取所有命令名称（用于 Tab 补全） */
export function getCommandNames(): string[] {
  return commands.map((c) => c.name);
}
