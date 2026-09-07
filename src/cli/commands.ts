import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { CompressionConfig } from '../context/index.js';
import { compressMessages } from '../context/index.js';
import type { CommandRegistry } from '../skills/index.js';
import type { TaskManager } from '../tasks/manager.js';

/** 内置命令定义 */
export interface Command {
  name: string;
  description: string;
  handler: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandContext {
  messages: Message[];
  clearMessages: () => void;
  client?: ModelClient;
  compressionConfig?: CompressionConfig;
  commandRegistry?: CommandRegistry;
  taskManager?: TaskManager;
}

/** 内置命令列表 */
export const commands: Command[] = [
  {
    name: '/help',
    description: '显示帮助信息',
    handler: (ctx) => {
      console.log(`
zguigo - 终端 AI 编程助手

内置命令:
  /help         显示此帮助信息
  /clear        清空对话历史
  /compact      压缩对话历史（释放上下文空间）
  /commands     列出可用的 Skill 命令
  /exit         退出程序

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
      console.log('已清空对话历史。');
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
        console.log('压缩功能未配置。');
        return;
      }

      if (ctx.messages.length === 0) {
        console.log('没有对话历史需要压缩。');
        return;
      }

      console.log('正在压缩对话历史...');
      try {
        const result = await compressMessages(ctx.messages, ctx.client, ctx.compressionConfig);
        if (result.compressed) {
          ctx.messages.length = 0;
          ctx.messages.push(...result.messages);
          console.log(`压缩完成: ${result.beforeTokens} → ${result.afterTokens} tokens`);
        } else {
          console.log('当前对话历史较短，无需压缩。');
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
        console.log('命令注册表未初始化。');
        return;
      }

      const cmds = await ctx.commandRegistry.list();
      if (cmds.length === 0) {
        console.log('没有可用的 Skill 命令。');
        return;
      }

      console.log('\n可用的 Skill 命令:\n');
      for (const cmd of cmds) {
        const readOnlyTag = cmd.readOnly ? ' [只读]' : '';
        const sourceTag = cmd.source === 'file' ? ' (文件)' : '';
        console.log(`  /${cmd.name}${sourceTag}${readOnlyTag}`);
        console.log(`    ${cmd.description}`);
      }
      console.log('');
    },
  },
  {
    name: '/run',
    description: '开始执行任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      if (ctx.taskManager.count === 0) {
        console.log('任务列表为空。使用 /plan 创建任务计划。');
        return;
      }

      // 实际执行逻辑在 repl.ts 中处理
      // 这里只是提示用户
      console.log('开始执行任务列表...');
    },
  },
  {
    name: '/tasks',
    description: '显示当前任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      const tasks = ctx.taskManager.getTasks();
      if (tasks.length === 0) {
        console.log('任务列表为空。使用 /plan 创建任务计划。');
        return;
      }

      const currentIndex = ctx.taskManager.getCurrentIndex();
      const stats = ctx.taskManager.getStats();

      console.log(`\n任务列表 (共 ${stats.total} 个):\n`);

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
        console.log(`  ${status} ${task.title}${marker}`);
      });

      console.log(`\n统计: ${stats.completed} 完成, ${stats.failed} 失败, ${stats.skipped} 跳过, ${stats.pending} 待执行\n`);
    },
  },
  {
    name: '/task-done',
    description: '标记当前任务完成',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.completeCurrentTask('手动标记完成');
      if (task) {
        console.log(`✓ 任务 "${task.title}" 已标记为完成`);
      } else {
        console.log('没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-fail',
    description: '标记当前任务失败',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.failCurrentTask('手动标记失败');
      if (task) {
        console.log(`✗ 任务 "${task.title}" 已标记为失败`);
      } else {
        console.log('没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-skip',
    description: '跳过当前任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      const task = ctx.taskManager.skipCurrentTask('手动跳过');
      if (task) {
        console.log(`- 任务 "${task.title}" 已跳过`);
      } else {
        console.log('没有正在执行的任务。');
      }
    },
  },
  {
    name: '/task-add',
    description: '添加新任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      // 需要从输入中获取任务标题
      // 这里简化处理，实际应该解析参数
      console.log('请使用: /task-add <任务标题> <任务描述>');
    },
  },
  {
    name: '/task-remove',
    description: '删除任务',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      console.log('请使用: /task-remove <任务ID>');
    },
  },
  {
    name: '/clear-tasks',
    description: '清空任务列表',
    handler: (ctx) => {
      if (!ctx.taskManager) {
        console.log('任务管理器未初始化。');
        return;
      }

      ctx.taskManager.clear();
      console.log('已清空任务列表。');
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
