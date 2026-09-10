/**
 * REPL 主循环 —— blessed TUI 版本
 *
 * 使用 blessed 管理全屏终端界面：
 * - 顶部：可滚动的输出日志区（assistant 回复、工具输出、命令结果）
 * - 底部：单行输入框，逐字符捕获键盘输入
 * - 浮动：命令菜单（输入 / 时弹出，支持过滤、↑↓导航）
 */

import blessed from 'blessed';
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
import { TaskManager } from '../tasks/manager.js';
import { JsonChatHistory, GitSnapshot } from '../history/index.js';
import type { ChatSession } from '../history/protocol.js';
import { BoxRenderer } from './box.js';
import { handlePlanCommand, handleRunCommand } from './plan-runner.js';
import { CommandMenu } from './command-menu.js';
import type { CommandItem, CommandProvider } from './command-menu.js';
import { createSpawnAgentTool } from '../agent/subagent-tool.js';
import { runSubAgent } from '../agent/subagent.js';

/** 只读模式下禁止的工具列表 */
const READ_ONLY_TOOLS = ['write_file', 'edit_file', 'create_directory', 'run_command'];

/** 输入框高度（含边框） */
const INPUT_HEIGHT = 3;

/** 基础系统消息：定义 AI 助手的角色、语言和代码风格 */
const BASE_SYSTEM_MESSAGE = `你是 zguigo，一个运行在终端中的 AI 编程助手。

## 身份与角色
- 你是一个专业的编程助手，帮助用户编写、调试和优化代码
- 你拥有文件读写和命令执行能力，可以直接操作用户的项目

## 语言
- 默认使用中文与用户交流
- 代码注释使用中文
- 代码本身（变量名、函数名等）使用英文

## 代码风格
- 生成代码时遵循项目已有的代码风格和约定
- 优先使用简洁、可读的写法
- 遵循项目使用的语言和框架的最佳实践

## 工作方式
- 遇到不确定的问题时，先阅读相关代码再回答
- 修改代码前先理解上下文，避免引入错误
- 如果用户的要求不明确，先确认再行动`;

export interface ReplOptions {
  client: ModelClient;
  tools: ToolRegistry;
  debug?: boolean;
}

/**
 * 启动 blessed TUI 交互式 REPL
 */
export async function startRepl(options: ReplOptions): Promise<void> {
  const { client, tools, debug: debugMode } = options;
  const messages: Message[] = [];
  const commandNames = getCommandNames();
  const logger = new DebugLogger(debugMode ?? false);

  // ==================== 创建 blessed 界面 ====================

  const screen = blessed.screen({
    smartCSR: true,
    title: 'zguigo',
    fullUnicode: true,
  });

  // 输出日志区（占满输入框以上的空间）
  const logBox = blessed.log({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: `100%-${INPUT_HEIGHT}`,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'cyan' } },
    mouse: true,
    keys: false,       // 不抢键盘焦点，方向键由 screen 统一处理
    focusable: false,   // 不可被聚焦
    style: { fg: 'white', bg: 'black' },
    tags: false,
  });

  // 输入框（固定在底部）
  const inputBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: INPUT_HEIGHT,
    border: { type: 'line' },
    label: ' 输入 ',
    style: {
      fg: 'white',
      bg: 'default',
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
    },
    tags: true,   // 启用标签，支持颜色
  });

  // 输出函数 —— 写入日志区并自动滚动到底部
  const writeLine = (text: string) => {
    logBox.add(text);
    logBox.setScrollPerc(100);
    screen.render();
  };

  // ==================== 初始化服务 ====================

  const projectRoot = process.cwd();
  const commandRegistry = new CommandRegistry(projectRoot);
  const knowledgeLoader = new KnowledgeLoader(projectRoot);
  const taskManager = new TaskManager();

  // 注册 spawn_agent 工具（主对话层 depth=0）
  tools.register(createSpawnAgentTool({
    client,
    tools,
    writeLine,
    depth: 0,
    debug: debugMode,
  }));

  // BoxRenderer 通过 writeLine 输出，思考动画更新输入框 label
  const boxRenderer = new BoxRenderer(writeLine, (frame: string) => {
    inputBox.setLabel(` ${frame} 思考中 `);
    screen.render();
  });

  // 初始化聊天历史和快照管理器
  const chatHistory = new JsonChatHistory(projectRoot);
  const snapshotManager = new GitSnapshot(projectRoot);
  let currentSession: ChatSession = chatHistory.createSession();

  // 会话切换函数
  const switchSession = (session: ChatSession) => {
    currentSession = session;
    messages.length = 0;
    if (!session.messages.some(m => m.role === 'system')) {
      messages.push({ role: 'system', content: BASE_SYSTEM_MESSAGE });
    }
    messages.push(...session.messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id,
    })));
  };

  // 保存消息到会话
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

  // 自动保存（每 3 条消息保存一次）
  let autoSaveCounter = 0;
  const autoSave = async () => {
    autoSaveCounter++;
    if (autoSaveCounter % 3 === 0) {
      await chatHistory.saveSession(currentSession);
    }
  };

  // 快照管理器：写入工具执行前自动创建快照
  if (snapshotManager.isGitRepo()) {
    logger.log('Git 快照已启用');
    const originalCall = tools.call.bind(tools);
    const WRITE_TOOLS = ['write_file', 'edit_file', 'create_directory'];
    tools.call = async (name: string, args: Record<string, unknown>) => {
      if (WRITE_TOOLS.includes(name)) {
        try {
          const desc = `${name}: ${(args.path as string) || ''}`;
          await snapshotManager.createSnapshot(desc);
          logger.log(`快照已创建: ${desc}`);
        } catch (err) {
          logger.log(`快照创建失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return originalCall(name, args);
    };
  }

  // 注册内置命令
  commandRegistry.register(reviewCommand);
  commandRegistry.register(testCommand);
  commandRegistry.register(explainCommand);
  commandRegistry.register(refactorCommand);

  // 加载 Knowledge
  const knowledge = await knowledgeLoader.loadAll();
  if (knowledge) {
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      systemMsg.content += '\n\n' + knowledge;
    }
    logger.log('已加载 Skills 知识');
  }

  // 注入基础系统消息
  messages.push({ role: 'system', content: BASE_SYSTEM_MESSAGE });
  logger.log('已注入基础系统消息');

  // 加载压缩配置
  const modelConfig = loadModelConfig();
  const compressionConfig: CompressionConfig = {
    contextWindowSize: modelConfig.contextWindowSize,
    compressionThreshold: modelConfig.compressionThreshold,
    recentMessageCount: modelConfig.recentMessageCount,
  };

  // 获取所有命令（用于 Tab 补全和菜单）
  const allSkillCommands = await commandRegistry.list();
  const allCommandNames = [...commandNames, ...allSkillCommands.map(c => `/${c.name}`)];

  // ==================== 命令菜单 ====================

  // 命令提供者：动态从 CommandRegistry + 内置命令获取
  const commandProvider: CommandProvider = {
    getCommands(): CommandItem[] {
      const builtinItems: CommandItem[] = commandNames.map(name => ({
        name: name.replace(/^\//, ''),
        description: '',
        readOnly: false,
      }));
      const skillItems: CommandItem[] = allSkillCommands.map(c => ({
        name: c.name,
        description: c.description,
        readOnly: c.readOnly,
      }));
      // 子 agent 命令（不在 commands.ts 注册，直接添加到菜单）
      const agentItem: CommandItem = {
        name: 'agent',
        description: '启动子代理执行任务',
        readOnly: false,
      };
      return [agentItem, ...builtinItems, ...skillItems];
    },
  };

  const commandMenu = new CommandMenu(screen, INPUT_HEIGHT);

  // 选中命令后填充输入缓冲区
  commandMenu.onSelect = (cmd) => {
    inputBuffer = `/${cmd.name} `;
    renderInput();
  };

  // ==================== 输入系统 ====================

  let inputBuffer = '';
  let resolvingLine: ((line: string) => void) | null = null;
  let confirmMode = false;
  let confirmResolver: ((answer: boolean) => void) | null = null;

  /** 渲染输入框内容 */
  const renderInput = () => {
    if (confirmMode) {
      inputBox.setContent(`{yellow-fg}{bold}确认 (y/n)>{/bold}{/yellow-fg} ${inputBuffer}{white-bg}{black-fg} {/black-fg}{/white-bg}`);
    } else {
      const cursor = `{white-bg}{black-fg} {/black-fg}{/white-bg}`;
      inputBox.setContent(`{cyan-fg}{bold}你>{/bold}{/cyan-fg} ${inputBuffer}${cursor}`);
    }
    screen.render();
  };

  /** 等待用户输入一行（Promise 化的输入循环） */
  const nextLine = (): Promise<string> =>
    new Promise((resolve) => {
      resolvingLine = resolve;
      renderInput();
    });

  /** 确认提示 */
  const askConfirm = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      writeLine(`\x1b[33m[确认] ${message}? (y/n)\x1b[0m`);
      confirmMode = true;
      confirmResolver = resolve;
      renderInput();
    });

  // ==================== 按键处理 ====================

  screen.on('keypress', (_ch: string, key: blessed.Widgets.Events.IKeyEventArg) => {
    // 确认模式：只接受 y/n
    if (confirmMode) {
      if (key.name === 'y') {
        confirmMode = false;
        confirmResolver?.(true);
        confirmResolver = null;
        inputBuffer = '';
        renderInput();
      } else if (key.name === 'n' || key.name === 'escape') {
        confirmMode = false;
        confirmResolver?.(false);
        confirmResolver = null;
        inputBuffer = '';
        renderInput();
      }
      return;
    }

    // ---- 菜单可见时的按键处理 ----
    if (commandMenu.isVisible()) {
      if (key.name === 'up') {
        commandMenu.moveUp();
        return;
      }
      if (key.name === 'down') {
        commandMenu.moveDown();
        return;
      }
      if (key.name === 'escape') {
        commandMenu.close();
        return;
      }
      if (key.name === 'return') {
        commandMenu.confirm();
        return;
      }
      // 普通字符 → 更新缓冲区 + 菜单过滤
      if (_ch && !key.ctrl && !key.meta && key.name !== 'backspace') {
        inputBuffer += _ch;
        // 菜单过滤文本：去掉开头的 /
        const filterText = inputBuffer.startsWith('/') ? inputBuffer.slice(1) : inputBuffer;
        commandMenu.updateFilter(filterText);
        renderInput();
        return;
      }
    }

    // ---- 菜单隐藏时的按键处理 ----

    // 方向键 → 滚动日志输出区
    if (key.name === 'up') {
      logBox.scroll(-1);
      screen.render();
      return;
    }
    if (key.name === 'down') {
      logBox.scroll(1);
      screen.render();
      return;
    }
    if (key.name === 'pageup') {
      logBox.scroll(-logBox.height as number);
      screen.render();
      return;
    }
    if (key.name === 'pagedown') {
      logBox.scroll(logBox.height as number);
      screen.render();
      return;
    }

    // Ctrl+C → 退出
    if (key.name === 'c' && key.ctrl) {
      boxRenderer.destroy();
      screen.destroy();
      process.exit(0);
    }

    // 回车 → 提交输入
    if (key.name === 'return') {
      if (inputBuffer.trim() && resolvingLine) {
        const line = inputBuffer.trim();
        inputBuffer = '';
        commandMenu.close();
        renderInput();
        // 恢复输入框 label
        inputBox.setLabel(' 输入 ');
        const resolve = resolvingLine;
        resolvingLine = null;
        resolve(line);
      }
      return;
    }

    // / → 打开命令菜单（多种检测方式兼容不同终端）
    if (inputBuffer === '' && (_ch === '/' || key.full === '/')) {
      inputBuffer = '/';
      commandMenu.open(commandProvider);
      renderInput();
      return;
    }

    // 退格
    if (key.name === 'backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
      if (inputBuffer === '' && commandMenu.isVisible()) {
        commandMenu.close();
      }
      renderInput();
      return;
    }

    // Ctrl+U → 清空输入
    if (key.name === 'u' && key.ctrl) {
      inputBuffer = '';
      commandMenu.close();
      renderInput();
      return;
    }

    // Ctrl+L → 清屏重绘
    if (key.name === 'l' && key.ctrl) {
      logBox.setContent('');
      screen.render();
      return;
    }

    // 可打印字符
    if (_ch && !key.ctrl && !key.meta) {
      inputBuffer += _ch;
      renderInput();
    }
  });

  // ==================== Tab 补全 ====================

  screen.key('tab', () => {
    if (commandMenu.isVisible()) return;
    if (!inputBuffer.startsWith('/')) return;

    const partial = inputBuffer.slice(1); // 去掉 /
    const matches = allCommandNames.filter(c => c.startsWith(`/${partial}`));
    if (matches.length === 1) {
      inputBuffer = matches[0] + ' ';
      renderInput();
    } else if (matches.length > 1) {
      writeLine(`\n可用命令: ${matches.join(', ')}`);
    }
  });

  // ==================== 终端 resize ====================

  screen.on('resize', () => {
    screen.render();
  });

  // ==================== 主循环 ====================

  writeLine('zguigo v0.2.0 (blessed TUI) — 输入 / 选择命令，Ctrl+C 退出\n');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const trimmed = await nextLine();
      if (!trimmed) continue;

      // 处理内置命令
      const handled = await handleCommand(trimmed, {
        messages,
        clearMessages: () => {
          messages.length = 0;
          messages.push({ role: 'system', content: BASE_SYSTEM_MESSAGE });
        },
        client,
        compressionConfig,
        commandRegistry,
        taskManager,
        chatHistory,
        currentSession,
        switchSession,
        snapshotManager,
        input: trimmed,
        logLine: writeLine,
      });
      if (handled) continue;

      // 处理 /plan 命令
      if (trimmed.startsWith('/plan ')) {
        const task = trimmed.slice(6).trim();
        if (!task) {
          writeLine('请提供任务描述，例如: /plan 重构认证模块');
          continue;
        }
        await handlePlanCommand(task, {
          client, tools, messages, taskManager, logger,
          debugMode, compressionConfig, askConfirm, logLine: writeLine,
        });
        continue;
      }

      // 处理 /run 命令
      if (trimmed === '/run') {
        if (taskManager.count === 0) {
          writeLine('任务列表为空。使用 /plan 创建任务计划。');
          continue;
        }
        await handleRunCommand({
          client, tools, messages, taskManager, logger,
          debugMode, compressionConfig, askConfirm, logLine: writeLine,
        });
        continue;
      }

      // 处理 /agent 命令 —— 启动子代理
      if (trimmed.startsWith('/agent ')) {
        const task = trimmed.slice(7).trim();
        if (!task) {
          writeLine('{red-fg}用法: /agent <任务描述>{/red-fg}');
          writeLine('{red-fg}示例: /agent 分析 src/tools 目录的代码结构{/red-fg}');
          continue;
        }

        logger.log(`执行子 agent: ${task}`);

        const result = await runSubAgent({
          task,
          client,
          tools,
          writeLine,
          depth: 0,
          debug: debugMode,
        });

        // 将子 agent 结果加入主对话消息
        messages.push(
          { role: 'assistant', content: `[调用了子 agent 执行任务: ${task}]` },
          { role: 'user', content: `子 agent 执行完毕，结果如下:\n${result}` },
        );
        saveToSession({ role: 'assistant', content: `[子 agent] ${task}` });
        saveToSession({ role: 'user', content: `[子 agent 结果] ${result}` });
        autoSave();
        continue;
      }

      // 检测 Skill 命令 (/command-name 任务描述)
      const skillMatch = trimmed.match(/^\/(\w+)\s*(.*)/);
      if (skillMatch) {
        const commandName = skillMatch[1];
        const args = skillMatch[2].trim();

        const command = await commandRegistry.get(commandName);
        if (command) {
          const instruction = command.instruction.replace(/\$ARGUMENTS/g, args || '（未指定目标）');
          messages.push({ role: 'system', content: instruction });
          if (args) {
            messages.push({ role: 'user', content: args });
          }

          logger.log(`执行 Skill 命令: /${commandName}${command.readOnly ? ' (只读)' : ''}`);

          // 更新输入框 label 显示思考状态
          inputBox.setLabel(` ⠹ 思考中 `);
          screen.render();

          await runAgent({
            client,
            tools,
            messages,
            debug: debugMode,
            compressionConfig,
            readOnlyTools: command.readOnly ? READ_ONLY_TOOLS : undefined,
            confirmToolCall: async (toolName, toolArgs) => {
              const tool = tools.get(toolName);
              const msg = tool?.confirmMessage
                ? tool.confirmMessage(toolArgs)
                : `即将执行: ${toolName}`;
              return askConfirm(msg);
            },
            onEvent: (event) => {
              switch (event.type) {
                case 'text':
                  boxRenderer.addText(event.content);
                  break;
                case 'tool_call':
                  logger.toolCall(event.name, event.args);
                  boxRenderer.toolCall(event.name, event.args);
                  break;
                case 'tool_result':
                  logger.toolResult(event.name, event.success, (event.data ?? '').length, event.elapsed ?? 0);
                  if (['write_file', 'edit_file', 'create_directory'].includes(event.name) && event.success) {
                    writeLine(`  \x1b[32m✓ 文件变更:\x1b[0m ${event.data ?? ''}`);
                  }
                  if (event.name === 'run_command' && event.success) {
                    writeLine(`  \x1b[32m✓ 命令输出:\x1b[0m ${event.data ?? ''}`);
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
                    boxRenderer.render();
                  }
                  break;
                case 'compress':
                  if (debugMode) logger.iteration(0);
                  writeLine(`\x1b[33m[压缩]\x1b[0m ${event.beforeTokens} → ${event.afterTokens} tokens`);
                  break;
                case 'command':
                  break;
              }
            },
          });

          // 恢复输入框 label
          inputBox.setLabel(' 输入 ');
          screen.render();
          continue;
        }
      }

      // 普通消息 → Agent Loop
      messages.push({ role: 'user', content: trimmed });
      saveToSession({ role: 'user', content: trimmed });
      autoSave();

      // 更新输入框 label 显示思考状态
      inputBox.setLabel(` ⠹ 思考中 `);
      screen.render();

      await runAgent({
        client,
        tools,
        messages,
        debug: debugMode,
        compressionConfig,
        confirmToolCall: async (toolName, toolArgs) => {
          const tool = tools.get(toolName);
          const msg = tool?.confirmMessage
            ? tool.confirmMessage(toolArgs)
            : `即将执行: ${toolName}`;
          return askConfirm(msg);
        },
        onEvent: (event) => {
          switch (event.type) {
            case 'text':
              boxRenderer.addText(event.content);
              break;
            case 'tool_call':
              logger.toolCall(event.name, event.args);
              boxRenderer.toolCall(event.name, event.args);
              break;
            case 'tool_result':
              logger.toolResult(event.name, event.success, (event.data ?? '').length, event.elapsed ?? 0);
              if (['write_file', 'edit_file', 'create_directory'].includes(event.name) && event.success) {
                writeLine(`  \x1b[32m✓ 文件变更:\x1b[0m ${event.data ?? ''}`);
              }
              if (event.name === 'run_command' && event.success) {
                writeLine(`  \x1b[32m✓ 命令输出:\x1b[0m ${event.data ?? ''}`);
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
                boxRenderer.render();
                saveToSession({ role: 'assistant', content: event.answer });
                autoSave();
              }
              break;
            case 'compress':
              if (debugMode) logger.iteration(0);
              writeLine(`\x1b[33m[压缩]\x1b[0m ${event.beforeTokens} → ${event.afterTokens} tokens`);
              break;
          }
        },
      });

      // 恢复输入框 label
      inputBox.setLabel(' 输入 ');
      screen.render();
    } catch (err) {
      if (err instanceof Error && err.message.includes('closed')) {
        break;
      }
      writeLine(`错误: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 退出时清理资源
  boxRenderer.destroy();
  screen.destroy();

  if (currentSession.messages.length > 0) {
    await chatHistory.saveSession(currentSession);
    if (debugMode) {
      console.error(`[debug] 会话已保存: ${currentSession.id}`);
    }
  }
}
