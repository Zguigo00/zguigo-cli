import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { ModelError } from '../errors/index.js';
import { loadModelConfig } from './config.js';
import type {
  Message,
  ChatOptions,
  ModelClient,
  ModelResponse,
  StreamEvent,
  ToolDefinition,
} from './types.js';

/** 将内部消息格式转换为 SDK 格式 */
function toSdkMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    const base = { role: m.role as ChatCompletionMessageParam['role'] };
    if (m.role === 'tool') {
      return {
        ...base,
        content: m.content ?? '',
        tool_call_id: m.tool_call_id!,
      } as ChatCompletionMessageParam;
    }
    if (m.tool_calls && m.tool_calls.length > 0) {
      return {
        ...base,
        content: m.content,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      } as ChatCompletionMessageParam;
    }
    return {
      ...base,
      content: m.content ?? '',
    } as ChatCompletionMessageParam;
  });
}

/** 将内部工具定义转换为 SDK 格式 */
function toSdkTools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

/** 创建 OpenAI 兼容的模型客户端 */
export function createModelClient(): ModelClient {
  const config = loadModelConfig();

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  async function chat(messages: Message[], options?: ChatOptions): Promise<ModelResponse> {
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages: toSdkMessages(messages),
        tools: options?.tools ? toSdkTools(options.tools) : undefined,
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new ModelError('模型未返回任何响应');
      }

      return {
        content: choice.message.content,
        tool_calls: (choice.message.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        stop_reason: choice.finish_reason as ModelResponse['stop_reason'],
      };
    } catch (err) {
      if (err instanceof ModelError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      // 不泄漏 API Key
      throw new ModelError(`模型调用失败: ${message}`);
    }
  }

  async function* chatStream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<StreamEvent> {
    try {
      const stream = await client.chat.completions.create({
        model: config.model,
        messages: toSdkMessages(messages),
        tools: options?.tools ? toSdkTools(options.tools) : undefined,
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
        stream: true,
      });

      // 用于收集工具调用
      const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> =
        new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // 文本增量
        if (delta.content) {
          yield { type: 'text_delta', content: delta.content };
        }

        // 工具调用增量
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            if (!toolCallAccumulators.has(index)) {
              toolCallAccumulators.set(index, {
                id: tc.id ?? '',
                name: '',
                arguments: '',
              });
            }
            const acc = toolCallAccumulators.get(index)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      }

      // 流结束后输出完整的工具调用
      for (const [, acc] of toolCallAccumulators) {
        yield {
          type: 'tool_call_delta',
          tool_call: {
            id: acc.id,
            type: 'function',
            function: {
              name: acc.name,
              arguments: acc.arguments,
            },
          },
        };
      }

      yield { type: 'done' };
    } catch (err) {
      if (err instanceof ModelError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new ModelError(`模型流式调用失败: ${message}`);
    }
  }

  return { chat, chatStream };
}
