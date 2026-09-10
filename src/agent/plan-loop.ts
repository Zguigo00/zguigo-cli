import type { ModelClient, Message } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import type { AgentEvent, AgentEventCallback } from './types.js';
import type { TaskPlan } from '../tasks/protocol.js';
import { TaskManager } from '../tasks/manager.js';
import { shouldCompress, compressMessages, type CompressionConfig } from '../context/index.js';
import {
  PLAN_SYSTEM_PROMPT,
  EXECUTE_SYSTEM_PROMPT,
  getPlanUserPrompt,
  getExecuteUserPrompt,
} from '../tasks/prompts.js';
import { executeToolCall, type ToolExecutionContext } from './tool-executor.js';

/** 最大模型调用轮数（每个任务） */
const MAX_ITERATIONS_PER_TASK = 8;

export interface PlanOptions {
  client: ModelClient;
  tools: ToolRegistry;
  messages: Message[];
  onEvent?: AgentEventCallback;
  debug?: boolean;
  compressionConfig?: CompressionConfig;
  confirmToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  readOnlyTools?: string[];
  /** 自动执行模式：Plan 后自动开始 Execute，无需用户确认 */
  autoExecute?: boolean;
  /** 任务状态回调 */
  onTaskEvent?: (event: TaskEvent) => void;
}

export type TaskEvent =
  | { type: 'plan_start'; task: string }
  | { type: 'plan_complete'; plan: TaskPlan }
  | { type: 'task_start'; task: { id: string; title: string; index: number; total: number } }
  | { type: 'task_complete'; task: { id: string; title: string; result: string } }
  | { type: 'task_failed'; task: { id: string; title: string; error: string } }
  | { type: 'task_skipped'; task: { id: string; title: string; reason: string } }
  | { type: 'all_done'; stats: { total: number; completed: number; failed: number; skipped: number } };

/**
 * 运行 Plan and Execute 模式
 *
 * 流程：
 * 1. Plan 阶段：调用模型分析任务，生成任务列表
 * 2. Execute 阶段：逐个执行任务
 *
 * @returns TaskManager 包含所有任务的执行结果
 */
export async function runPlan(options: PlanOptions): Promise<TaskManager> {
  const {
    client,
    tools,
    onEvent,
    debug,
    compressionConfig,
    confirmToolCall,
    readOnlyTools,
    onTaskEvent,
  } = options;

  const messages = options.messages;
  const taskManager = new TaskManager();

  const emit = (event: AgentEvent) => {
    onEvent?.(event);
  };

  const emitTask = (event: TaskEvent) => {
    onTaskEvent?.(event);
  };

  // ========== Phase 1: Plan ==========

  if (debug) {
    console.error('\n[debug] ========== Plan 阶段 ==========');
  }

  emitTask({ type: 'plan_start', task: messages[messages.length - 1]?.content || '' });

  // 构建 Plan 阶段的消息
  const planMessages: Message[] = [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    { role: 'user', content: getPlanUserPrompt(messages[messages.length - 1]?.content || '') },
  ];

  // 调用模型生成任务计划
  const planResult = await generatePlan(client, tools, planMessages, emit, debug);

  if (!planResult) {
    if (debug) {
      console.error('[debug] 任务计划生成失败');
    }
    return taskManager;
  }

  // 加载任务计划
  taskManager.loadFromPlan(planResult);

  if (debug) {
    console.error(`[debug] 生成 ${taskManager.count} 个任务`);
  }

  emitTask({ type: 'plan_complete', plan: planResult });

  // ========== Phase 2: Execute ==========

  if (debug) {
    console.error('\n[debug] ========== Execute 阶段 ==========');
  }

  const previousResults: string[] = [];

  // 逐个执行任务
  while (true) {
    const task = taskManager.nextTask();
    if (!task) break;

    const currentIndex = taskManager.getCurrentIndex();
    const totalTasks = taskManager.count;

    if (debug) {
      console.error(`\n[debug] 任务 ${currentIndex + 1}/${totalTasks}: ${task.title}`);
    }

    emitTask({
      type: 'task_start',
      task: { id: task.id, title: task.title, index: currentIndex, total: totalTasks },
    });

    // 构建 Execute 阶段的消息
    const executeMessages: Message[] = [
      { role: 'system', content: EXECUTE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: getExecuteUserPrompt(
          { title: task.title, description: task.description },
          currentIndex,
          totalTasks,
          previousResults
        ),
      },
    ];

    // 执行单个任务
    const taskResult = await executeTask(
      client,
      tools,
      executeMessages,
      emit,
      debug,
      compressionConfig,
      confirmToolCall,
      readOnlyTools
    );

    if (taskResult.success) {
      taskManager.completeCurrentTask(taskResult.result);
      previousResults.push(taskResult.result);

      emitTask({
        type: 'task_complete',
        task: { id: task.id, title: task.title, result: taskResult.result },
      });

      if (debug) {
        console.error(`[debug] 任务完成: ${taskResult.result}`);
      }
    } else {
      taskManager.failCurrentTask(taskResult.error || '未知错误');

      emitTask({
        type: 'task_failed',
        task: { id: task.id, title: task.title, error: taskResult.error || '未知错误' },
      });

      if (debug) {
        console.error(`[debug] 任务失败: ${taskResult.error}`);
      }

      // 任务失败时停止执行后续任务
      break;
    }
  }

  // 发送完成事件
  const stats = taskManager.getStats();
  emitTask({ type: 'all_done', stats });

  if (debug) {
    console.error(`\n[debug] 执行完成: ${stats.completed}/${stats.total} 成功`);
  }

  return taskManager;
}

/**
 * 生成任务计划
 */
async function generatePlan(
  client: ModelClient,
  tools: ToolRegistry,
  messages: Message[],
  emit: AgentEventCallback | undefined,
  debug?: boolean
): Promise<TaskPlan | null> {
  try {
    const toolDefinitions = tools.getDefinitions();
    const stream = client.chatStream(messages, { tools: toolDefinitions });

    let assistantText = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const event of stream) {
      switch (event.type) {
        case 'text_delta':
          if (event.content) {
            assistantText += event.content;
            emit?.({ type: 'text', content: event.content });
          }
          break;
        case 'tool_call_delta':
          if (event.tool_call) {
            toolCalls.push({
              id: event.tool_call.id ?? '',
              name: event.tool_call.function?.name ?? '',
              arguments: event.tool_call.function?.arguments ?? '',
            });
          }
          break;
      }
    }

    // 如果模型返回纯文本，尝试解析为 JSON
    if (toolCalls.length === 0 && assistantText) {
      const plan = parsePlanFromText(assistantText);
      if (plan) return plan;
    }

    // 如果有工具调用，执行工具后再重新请求计划
    if (toolCalls.length > 0) {
      // 执行工具
      const toolCallObjects = toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      messages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: toolCallObjects,
      });

      for (const tc of toolCallObjects) {
        await executeToolCall(tc, { tools, messages });
      }

      // 重新请求计划
      const secondStream = client.chatStream(messages);
      let secondText = '';

      for await (const event of secondStream) {
        if (event.type === 'text_delta' && event.content) {
          secondText += event.content;
          emit?.({ type: 'text', content: event.content });
        }
      }

      if (secondText) {
        return parsePlanFromText(secondText);
      }
    }

    return null;
  } catch (err) {
    if (debug) {
      console.error(`[debug] 生成计划失败: ${err}`);
    }
    return null;
  }
}

/**
 * 从文本中解析任务计划 JSON
 */
function parsePlanFromText(text: string): TaskPlan | null {
  try {
    // 尝试直接解析
    const json = JSON.parse(text);
    if (json.tasks && Array.isArray(json.tasks)) {
      return {
        tasks: json.tasks.map((t: Record<string, unknown>) => ({
          id: String(t.id || ''),
          title: String(t.title || ''),
          description: String(t.description || ''),
          dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
          status: 'pending' as const,
        })),
        originalTask: text,
      };
    }
  } catch {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[1]);
        if (json.tasks && Array.isArray(json.tasks)) {
          return {
            tasks: json.tasks.map((t: Record<string, unknown>) => ({
              id: String(t.id || ''),
              title: String(t.title || ''),
              description: String(t.description || ''),
              dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
              status: 'pending' as const,
            })),
            originalTask: text,
          };
        }
      } catch {}
    }
  }
  return null;
}

/**
 * 执行单个任务
 */
async function executeTask(
  client: ModelClient,
  tools: ToolRegistry,
  messages: Message[],
  emit: AgentEventCallback | undefined,
  debug?: boolean,
  compressionConfig?: CompressionConfig,
  confirmToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>,
  readOnlyTools?: string[]
): Promise<{ success: boolean; result: string; error?: string }> {
  let iterations = 0;

  while (iterations < MAX_ITERATIONS_PER_TASK) {
    iterations++;

    // 自动压缩检查
    if (compressionConfig && shouldCompress(messages, compressionConfig)) {
      try {
        const result = await compressMessages(messages, client, compressionConfig);
        if (result.compressed) {
          messages.length = 0;
          messages.push(...result.messages);
          emit?.({ type: 'compress', beforeTokens: result.beforeTokens, afterTokens: result.afterTokens });
        }
      } catch {}
    }

    try {
      const toolDefinitions = tools.getDefinitions();
      const stream = client.chatStream(messages, { tools: toolDefinitions });

      let assistantText = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            if (event.content) {
              assistantText += event.content;
              emit?.({ type: 'text', content: event.content });
            }
            break;
          case 'tool_call_delta':
            if (event.tool_call) {
              toolCalls.push({
                id: event.tool_call.id ?? '',
                name: event.tool_call.function?.name ?? '',
                arguments: event.tool_call.function?.arguments ?? '',
              });
            }
            break;
        }
      }

      // 模型返回纯文本 → 任务完成
      if (toolCalls.length === 0) {
        messages.push({ role: 'assistant', content: assistantText });
        return { success: true, result: assistantText };
      }

      // 有工具调用 → 执行工具
      const toolCallObjects = toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      messages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: toolCallObjects,
      });

      const execContext: ToolExecutionContext = {
        tools,
        messages,
        emit,
        readOnlyTools,
        confirmToolCall,
      };

      for (const tc of toolCallObjects) {
        emit?.({ type: 'tool_call', name: tc.function.name, args: tc.function.arguments });
        await executeToolCall(tc, execContext);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emit?.({ type: 'error', message: errMsg });
      return { success: false, result: '', error: errMsg };
    }
  }

  return { success: false, result: '', error: '达到最大调用轮数' };
}
