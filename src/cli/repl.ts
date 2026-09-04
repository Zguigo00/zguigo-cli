import * as readline from 'readline';
import { handleCommand, getCommandNames } from './commands.js';
import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import { runAgent } from '../agent/loop.js';
import { DebugLogger } from '../debug/logger.js';
import { loadModelConfig } from '../model/config.js';
import type { CompressionConfig } from '../context/index.js';

export interface ReplOptions {
  client: ModelClient;
  tools: ToolRegistry;
  debug?: boolean;
}

/**
 * 启动交互式 REPL
 * 使用 Agent Loop 处理对话
 */
export async function startRepl(options: ReplOptions): Promise<void> {
  const { client, tools, debug: debugMode } = options;
  const messages: Message[] = [];
  const commandNames = getCommandNames();
  const logger = new DebugLogger(debugMode ?? false);

  // 加载压缩配置
  const modelConfig = loadModelConfig();
  const compressionConfig: CompressionConfig = {
    contextWindowSize: modelConfig.contextWindowSize,
    compressionThreshold: modelConfig.compressionThreshold,
    recentMessageCount: modelConfig.recentMessageCount,
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      const hits = commandNames.filter((c) => c.startsWith(line));
      return [hits.length ? hits : commandNames, line];
    },
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve) => {
      rl.question('\x1b[36m你>\x1b[0m ', (answer) => {
        resolve(answer);
      });
    });

  const clearMessages = () => {
    messages.length = 0;
  };

  console.log('zguigo v0.1.0 — 输入 /help 查看命令，Ctrl+C 退出\n');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const input = await prompt();
      const trimmed = input.trim();
      if (!trimmed) continue;

      // 处理内置命令
      const handled = await handleCommand(trimmed, { messages, clearMessages, client, compressionConfig });
      if (handled) continue;

      // 普通消息 → Agent Loop
      messages.push({ role: 'user', content: trimmed });

      await runAgent({
        client,
        tools,
        messages,
        debug: debugMode,
        compressionConfig,
        onEvent: (event) => {
          switch (event.type) {
            case 'text':
              process.stdout.write(event.content);
              break;
            case 'tool_call':
              logger.toolCall(event.name, event.args);
              break;
            case 'tool_result':
              logger.toolResult(event.name, event.success, (event.data ?? '').length, 0);
              break;
            case 'iteration':
              logger.iteration(event.number);
              break;
            case 'error':
              logger.error(event.message);
              break;
            case 'done':
              if (event.answer) {
                process.stdout.write('\n');
              }
              break;
            case 'compress':
              if (debugMode) {
                logger.iteration(0);
              }
              console.log(`\n[压缩] ${event.beforeTokens} → ${event.afterTokens} tokens`);
              break;
          }
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('closed')) {
        break;
      }
      console.error('\n错误:', err instanceof Error ? err.message : String(err));
    }
  }
}
