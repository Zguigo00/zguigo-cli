import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { CompressionConfig } from '../context/index.js';
import { compressMessages } from '../context/index.js';
import type { CommandRegistry } from '../skills/index.js';

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
  /help       显示此帮助信息
  /clear      清空对话历史
  /compact    压缩对话历史（释放上下文空间）
  /commands   列出可用的 Skill 命令
  /exit       退出程序

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
