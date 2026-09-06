import * as readline from 'readline';
import { handleCommand, getCommandNames } from './commands.js';
import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import { runAgent } from '../agent/loop.js';
import { DebugLogger } from '../debug/logger.js';
import { loadModelConfig } from '../model/config.js';
import type { CompressionConfig } from '../context/index.js';
import { CommandRegistry, KnowledgeLoader } from '../skills/index.js';
import { reviewCommand } from '../skills/built-in/review.js';
import { testCommand } from '../skills/built-in/test.js';
import { explainCommand } from '../skills/built-in/explain.js';
import { refactorCommand } from '../skills/built-in/refactor.js';

/** 只读模式下禁止的工具列表 */
const READ_ONLY_TOOLS = ['write_file', 'edit_file', 'create_directory', 'run_command'];

/** 命令信息 */
interface CommandInfo {
  name: string;
  description: string;
  readOnly?: boolean;
}

/**
 * 交互式命令选择菜单
 * 使用上下箭头选择，回车确认
 */
function showCommandSelector(commands: CommandInfo[]): Promise<CommandInfo | null> {
  return new Promise((resolve) => {
    if (commands.length === 0) {
      resolve(null);
      return;
    }

    let selectedIndex = 0;
    let isFirstRender = true;

    // 渲染菜单
    const render = () => {
      // 清除之前的输出
      if (!isFirstRender) {
        process.stdout.write(`\x1b[${commands.length + 1}A`);
      }
      isFirstRender = false;

      console.log('\x1b[36m选择命令 (↑↓ 移动, Enter 确认, Esc 取消):\x1b[0m');

      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        const prefix = i === selectedIndex ? '\x1b[32m❯\x1b[0m' : ' ';
        const readOnlyTag = cmd.readOnly ? ' \x1b[90m[只读]\x1b[0m' : '';
        const line = `  ${prefix} /${cmd.name}${readOnlyTag} - ${cmd.description}`;

        // 高亮选中项
        if (i === selectedIndex) {
          console.log(`\x1b[36m${line}\x1b[0m`);
        } else {
          console.log(line);
        }
      }
    };

    // 初始渲染
    render();

    // 监听键盘
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str: string, key: readline.Key) => {
      if (key.name === 'up') {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      } else if (key.name === 'down') {
        selectedIndex = Math.min(commands.length - 1, selectedIndex + 1);
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(commands[selectedIndex]);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      // 移动光标到菜单下方
      process.stdout.write(`\x1b[${commands.length - selectedIndex}B`);
      console.log('');
    };

    process.stdin.on('keypress', onKeypress);
  });
}

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

  // 初始化 Skill 系统
  const projectRoot = process.cwd();
  const commandRegistry = new CommandRegistry(projectRoot);
  const knowledgeLoader = new KnowledgeLoader(projectRoot);

  // 注册内置命令
  commandRegistry.register(reviewCommand);
  commandRegistry.register(testCommand);
  commandRegistry.register(explainCommand);
  commandRegistry.register(refactorCommand);

  // 加载 Knowledge 并注入到 system message
  const knowledge = await knowledgeLoader.loadAll();
  if (knowledge) {
    // 获取当前 system message 或创建新的
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      systemMsg.content += '\n\n' + knowledge;
    }
    logger.log('已加载 Skills 知识');
  }

  // 获取所有可用命令名（用于 Tab 补全）
  const allCommands = await commandRegistry.list();
  const skillCommandNames = allCommands.map(c => `/${c.name}`);
  const allCommandNames = [...commandNames, ...skillCommandNames];

  // 调试输出
  if (debugMode) {
    console.error('[debug] 内置命令:', commandNames);
    console.error('[debug] Skill 命令:', skillCommandNames);
    console.error('[debug] 所有命令:', allCommandNames);
  }

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
      const hits = allCommandNames.filter((c) => c.startsWith(line));
      return [hits.length ? hits : allCommandNames, line];
    },
  });

  /**
   * 带命令选择的输入提示
   * 输入 / 时立即显示选择菜单
   */
  const promptWithSelector = (): Promise<string> =>
    new Promise((resolve) => {
      let inputBuffer = '';
      let isMenuActive = false;

      const renderPrompt = () => {
        process.stdout.write('\r\x1b[K\x1b[36m你>\x1b[0m ' + inputBuffer);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      const onKeypress = async (str: string, key: readline.Key) => {
        // Ctrl+C 退出
        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.exit(0);
        }

        // 菜单激活时的处理
        if (isMenuActive) {
          return;
        }

        // 检测到 / 且缓冲区为空时触发菜单
        if (str === '/' && inputBuffer === '') {
          isMenuActive = true;
          cleanup();

          const commandList = allCommands.map(c => ({
            name: c.name,
            description: c.description,
            readOnly: c.readOnly,
          }));

          const selected = await showCommandSelector(commandList);
          if (selected) {
            // 选中后提示输入参数
            process.stdout.write(`\x1b[36m/${selected.name}\x1b[0m `);
            const args = await new Promise<string>((res) => {
              rl.question('', (answer) => {
                res(answer.trim());
              });
            });
            resolve(`/${selected.name} ${args}`);
          } else {
            // 取消，重新显示提示符
            inputBuffer = '';
            renderPrompt();
            isMenuActive = false;
            return;
          }
          return;
        }

        // 回车确认
        if (key.name === 'return') {
          cleanup();
          console.log('');
          resolve(inputBuffer);
          return;
        }

        // 退格
        if (key.name === 'backspace') {
          inputBuffer = inputBuffer.slice(0, -1);
          renderPrompt();
          return;
        }

        // 普通字符
        if (str && !key.ctrl && !key.meta) {
          inputBuffer += str;
          renderPrompt();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
      };

      process.stdin.on('keypress', onKeypress);
      renderPrompt();
    });

  /** 确认提示，返回 true/false */
  const askConfirm = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      rl.question(`\x1b[33m[确认] ${message}? (y/n)\x1b[0m `, (answer) => {
        resolve(answer.trim().toLowerCase() === 'y');
      });
    });

  const clearMessages = () => {
    messages.length = 0;
  };

  console.log('zguigo v0.1.0 — 输入 / 选择命令，Ctrl+C 退出\n');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const trimmed = (await promptWithSelector()).trim();
      if (!trimmed) continue;

      // 处理内置命令
      const handled = await handleCommand(trimmed, {
        messages,
        clearMessages,
        client,
        compressionConfig,
        commandRegistry,
      });
      if (handled) continue;

      // 检测 Skill 命令 (/command-name 任务描述)
      const skillMatch = trimmed.match(/^\/(\w+)\s*(.*)/);
      if (skillMatch) {
        const commandName = skillMatch[1];
        const args = skillMatch[2].trim();

        const command = await commandRegistry.get(commandName);
        if (command) {
          // 替换 $ARGUMENTS 占位符
          const instruction = command.instruction.replace(/\$ARGUMENTS/g, args || '（未指定目标）');

          // 注入为系统消息
          messages.push({ role: 'system', content: instruction });

          // 添加用户任务
          if (args) {
            messages.push({ role: 'user', content: args });
          }

          logger.log(`执行 Skill 命令: /${commandName}${command.readOnly ? ' (只读)' : ''}`);

          await runAgent({
            client,
            tools,
            messages,
            debug: debugMode,
            compressionConfig,
            readOnlyTools: command.readOnly ? READ_ONLY_TOOLS : undefined,
            confirmToolCall: async (toolName, args) => {
              const tool = tools.get(toolName);
              const msg = tool?.confirmMessage
                ? tool.confirmMessage(args)
                : `即将执行: ${toolName}`;
              return askConfirm(msg);
            },
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
                  if (['write_file', 'edit_file', 'create_directory'].includes(event.name) && event.success) {
                    console.log(`\n[文件变更] ${event.data ?? ''}`);
                  }
                  if (event.name === 'run_command' && event.success) {
                    console.log(`\n[命令输出] ${event.data ?? ''}`);
                  }
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
                case 'command':
                  // 通知模型已进入命令模式
                  break;
              }
            },
          });
          continue;
        }
      }

      // 普通消息 → Agent Loop
      messages.push({ role: 'user', content: trimmed });

      await runAgent({
        client,
        tools,
        messages,
        debug: debugMode,
        compressionConfig,
        confirmToolCall: async (toolName, args) => {
          const tool = tools.get(toolName);
          const msg = tool?.confirmMessage
            ? tool.confirmMessage(args)
            : `即将执行: ${toolName}`;
          return askConfirm(msg);
        },
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
              // 写入/命令工具提示
              if (['write_file', 'edit_file', 'create_directory'].includes(event.name) && event.success) {
                console.log(`\n[文件变更] ${event.data ?? ''}`);
              }
              if (event.name === 'run_command' && event.success) {
                console.log(`\n[命令输出] ${event.data ?? ''}`);
              }
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
