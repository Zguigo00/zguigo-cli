import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import type { CompressionConfig } from '../context/index.js';
import type { TaskManager } from '../tasks/manager.js';
import type { DebugLogger } from '../debug/logger.js';
import { runAgent } from '../agent/loop.js';
import { runPlan } from '../agent/plan-loop.js';

/** 进度条生成 */
function generateProgressBar(current: number, total: number, width: number = 20): string {
  const progress = Math.round((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${progress}%`;
}

/** Plan/Run 共享的执行上下文 */
export interface PlanRunContext {
  client: ModelClient;
  tools: ToolRegistry;
  messages: Message[];
  taskManager: TaskManager;
  logger: DebugLogger;
  debugMode?: boolean;
  compressionConfig: CompressionConfig;
  askConfirm: (message: string) => Promise<boolean>;
}

/**
 * 创建共享的 Agent 事件处理器
 * /plan 和 /run 的 onEvent 逻辑几乎相同，提取复用
 */
function createAgentEventHandler(
  logger: DebugLogger,
  debugMode?: boolean,
) {
  return (event: { type: string; [key: string]: unknown }) => {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.content as string);
        break;
      case 'tool_call':
        logger.toolCall(event.name as string, event.args as string);
        break;
      case 'tool_result':
        logger.toolResult(
          event.name as string,
          event.success as boolean,
          ((event.data as string) ?? '').length,
          (event.elapsed as number) ?? 0,
        );
        if (
          ['write_file', 'edit_file', 'create_directory'].includes(event.name as string) &&
          event.success
        ) {
          console.log(`\n[文件变更] ${(event.data as string) ?? ''}`);
        }
        if (event.name === 'run_command' && event.success) {
          console.log(`\n[命令输出] ${(event.data as string) ?? ''}`);
        }
        break;
      case 'iteration':
        logger.iteration(event.number as number);
        break;
      case 'error':
        logger.error(event.message as string);
        break;
      case 'compress':
        if (debugMode) {
          logger.iteration(0);
        }
        console.log(`\n[压缩] ${event.beforeTokens} → ${event.afterTokens} tokens`);
        break;
      case 'command':
      case 'confirm':
      case 'done':
        break;
    }
  };
}

/**
 * 处理 /plan 命令
 * 调用模型生成任务计划，更新全局 taskManager
 */
export async function handlePlanCommand(
  task: string,
  ctx: PlanRunContext,
): Promise<void> {
  const { client, tools, messages, taskManager, logger, debugMode, compressionConfig, askConfirm } = ctx;

  logger.log(`启动 Plan 模式: ${task}`);
  messages.push({ role: 'user', content: task });

  try {
    const manager = await runPlan({
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
      onEvent: createAgentEventHandler(logger, debugMode),
      onTaskEvent: (event) => {
        switch (event.type) {
          case 'plan_start':
            console.log('\n📋 正在生成任务计划...');
            break;
          case 'plan_complete':
            console.log(`\n✓ 任务计划已生成，共 ${event.plan.tasks.length} 个任务\n`);
            event.plan.tasks.forEach((t, i) => {
              console.log(`  ${i + 1}. ${t.title}`);
            });
            console.log('\n输入 /run 开始执行任务，或 /tasks 查看任务列表\n');
            break;
          case 'task_start': {
            const progressBar = generateProgressBar(event.task.index, event.task.total);
            console.log(`\n[${event.task.index + 1}/${event.task.total}] ${event.task.title}`);
            console.log(`   ${progressBar}`);
            break;
          }
          case 'task_complete':
            console.log(`   ✓ 完成`);
            break;
          case 'task_failed':
            console.log(`   ✗ 失败: ${event.task.error}`);
            break;
          case 'task_skipped':
            console.log(`   - 跳过: ${event.task.reason}`);
            break;
          case 'all_done': {
            const finalProgress = generateProgressBar(event.stats.total, event.stats.total);
            console.log(`\n🎉 所有任务执行完成！`);
            console.log(`   ${finalProgress}`);
            console.log(`   ${event.stats.completed}/${event.stats.total} 成功`);
            if (event.stats.failed > 0) {
              console.log(`   ${event.stats.failed} 个失败`);
            }
            if (event.stats.skipped > 0) {
              console.log(`   ${event.stats.skipped} 个跳过`);
            }
            break;
          }
        }
      },
    });

    // 将计划任务复制到全局 taskManager
    if (manager.count > 0) {
      for (const t of manager.getTasks()) {
        taskManager.addTask(t.title, t.description, t.dependencies);
      }
    }
  } catch (err) {
    console.error('Plan 执行失败:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * 处理 /run 命令
 * 逐个执行任务列表中的任务
 */
export async function handleRunCommand(ctx: PlanRunContext): Promise<void> {
  const { client, tools, messages, taskManager, logger, debugMode, compressionConfig, askConfirm } = ctx;

  logger.log('开始执行任务列表');
  console.log('\n🚀 开始执行任务列表...\n');

  const onEvent = createAgentEventHandler(logger, debugMode);

  while (true) {
    const task = taskManager.nextTask();
    if (!task) break;

    const currentIndex = taskManager.getCurrentIndex();
    const totalTasks = taskManager.count;
    const progressBar = generateProgressBar(currentIndex, totalTasks);

    console.log(`[${currentIndex + 1}/${totalTasks}] ${task.title}`);
    console.log(`   ${progressBar}`);

    messages.push({ role: 'user', content: `执行任务: ${task.title}\n${task.description}` });

    try {
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
          onEvent(event);
          // /run 额外处理：任务完成时标记到 taskManager
          if (event.type === 'done' && event.answer) {
            taskManager.completeCurrentTask(event.answer);
            console.log(`\n   ✓ 完成`);
          }
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      taskManager.failCurrentTask(error);
      console.log(`\n✗ 任务失败: ${error}`);
      break;
    }
  }

  // 显示统计
  const stats = taskManager.getStats();
  const finalProgressBar = generateProgressBar(stats.total, stats.total);
  console.log(`\n🎉 执行完成！`);
  console.log(`   ${finalProgressBar}`);
  console.log(`   ${stats.completed}/${stats.total} 成功`);
  if (stats.failed > 0) {
    console.log(`   ${stats.failed} 个失败`);
  }
  if (stats.skipped > 0) {
    console.log(`   ${stats.skipped} 个跳过`);
  }
}
