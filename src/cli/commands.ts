import type { Message } from '../model/types.js';

/** 内置命令定义 */
export interface Command {
  name: string;
  description: string;
  handler: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandContext {
  messages: Message[];
  clearMessages: () => void;
}

/** 内置命令列表 */
export const commands: Command[] = [
  {
    name: '/help',
    description: '显示帮助信息',
    handler: () => {
      console.log(`
zguigo - 终端 AI 编程助手

内置命令:
  /help     显示此帮助信息
  /clear    清空对话历史
  /exit     退出程序

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
