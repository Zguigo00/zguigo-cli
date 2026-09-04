import type { ModelClient, Message } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import type { AgentState, AgentEvent, AgentEventCallback } from './types.js';
import { shouldCompress, compressMessages, type CompressionConfig } from '../context/index.js';

/** 最大模型调用轮数 */
const MAX_ITERATIONS = 8;

export interface RunAgentOptions {
  client: ModelClient;
  tools: ToolRegistry;
  messages: Message[];
  onEvent?: AgentEventCallback;
  debug?: boolean;
  /** 上下文压缩配置，传入则启用自动压缩 */
  compressionConfig?: CompressionConfig;
}

/**
 * 运行 Agent Loop
 *
 * 流程：
 * 1. 用户消息 → 调用模型
 * 2. 如果模型返回工具调用 → 执行工具 → 结果写回 messages → 回到 1
 * 3. 如果模型返回纯文本 → 输出并结束
 * 4. 达到 8 轮上限 → 强制停止
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentState> {
  const { client, tools, onEvent, debug } = options;
  const messages = options.messages;

  const state: AgentState = {
    messages,
    iteration: 0,
    finalAnswer: null,
    lastError: null,
    stopped: false,
    stopReason: null,
  };

  const emit = (event: AgentEvent) => {
    onEvent?.(event);
  };

  while (!state.stopped) {
    state.iteration++;

    // 超过上限
    if (state.iteration > MAX_ITERATIONS) {
      state.stopped = true;
      state.stopReason = `已达到最大调用轮数 (${MAX_ITERATIONS})，任务停止。`;
      emit({ type: 'done', answer: state.finalAnswer });
      break;
    }

    emit({ type: 'iteration', number: state.iteration });

    if (debug) {
      console.error(`\n[debug] === 第 ${state.iteration} 轮 ===`);
      console.error(`[debug] 消息数量: ${messages.length}`);
    }

    // 自动压缩检查
    if (options.compressionConfig && shouldCompress(messages, options.compressionConfig)) {
      if (debug) {
        console.error(`[debug] 触发上下文压缩`);
      }
      try {
        const result = await compressMessages(messages, client, options.compressionConfig);
        if (result.compressed) {
          // 替换消息列表内容
          messages.length = 0;
          messages.push(...result.messages);
          emit({ type: 'compress', beforeTokens: result.beforeTokens, afterTokens: result.afterTokens });
          if (debug) {
            console.error(`[debug] 压缩完成: ${result.beforeTokens} → ${result.afterTokens} tokens`);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (debug) {
          console.error(`[debug] 压缩失败: ${errMsg}`);
        }
        // 压缩失败不影响正常流程
      }
    }

    try {
      // 调用模型（流式）
      const toolDefinitions = tools.getDefinitions();
      const stream = client.chatStream(messages, { tools: toolDefinitions });

      let assistantText = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            if (event.content) {
              assistantText += event.content;
              emit({ type: 'text', content: event.content });
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
          case 'done':
            break;
        }
      }

      // 模型返回纯文本（无工具调用）→ 结束
      if (toolCalls.length === 0) {
        state.finalAnswer = assistantText || null;
        state.stopped = true;
        messages.push({ role: 'assistant', content: assistantText });

        if (debug) {
          console.error(`[debug] 模型返回纯文本回答，循环结束`);
        }

        emit({ type: 'done', answer: state.finalAnswer });
        break;
      }

      // 有工具调用 → 执行工具
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantText || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
      messages.push(assistantMessage);

      for (const tc of toolCalls) {
        emit({ type: 'tool_call', name: tc.name, args: tc.arguments });

        if (debug) {
          const start = Date.now();
          console.error(`[debug] 调用工具: ${tc.name}(${tc.arguments})`);
        }

        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments);
        } catch {
          // 参数 JSON 解析失败，回传给模型修正
          const errorMsg = `工具参数 JSON 解析失败: ${tc.arguments}`;
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: errorMsg }),
            tool_call_id: tc.id,
          });
          emit({ type: 'error', message: errorMsg });
          continue;
        }

        const result = await tools.call(tc.name, parsedArgs);

        if (debug) {
          const elapsed = Date.now();
          console.error(`[debug] 工具结果: success=${result.success}, size=${(result.data ?? result.error ?? '').length}`);
        }

        emit({
          type: 'tool_result',
          name: tc.name,
          success: result.success,
          data: result.data,
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      state.lastError = errMsg;
      emit({ type: 'error', message: errMsg });

      if (debug) {
        console.error(`[debug] 错误: ${errMsg}`);
      }

      // 模型错误不终止循环，给用户提示后继续
      messages.push({
        role: 'assistant',
        content: `调用出错: ${errMsg}`,
      });
      state.stopped = true;
      state.stopReason = '模型调用失败';
      emit({ type: 'done', answer: null });
    }
  }

  return state;
}
