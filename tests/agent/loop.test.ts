import { describe, it, expect } from 'vitest';
import { runAgent } from '../../src/agent/loop.js';
import { ToolRegistry } from '../../src/tools/protocol.js';
import type { ModelClient, Message, StreamEvent, ChatOptions } from '../../src/model/types.js';

/** 创建 mock 模型客户端 */
function createMockClient(
  responses: Array<{ content?: string; toolCalls?: Array<{ name: string; args: string }> }>,
): ModelClient {
  let callIndex = 0;

  async function* mockStream(): AsyncIterable<StreamEvent> {
    const response = responses[callIndex] ?? { content: '默认回答' };
    callIndex++;

    if (response.content) {
      yield { type: 'text_delta', content: response.content };
    }

    if (response.toolCalls) {
      for (let i = 0; i < response.toolCalls.length; i++) {
        yield {
          type: 'tool_call_delta',
          tool_call: {
            id: `call_${i}`,
            type: 'function',
            function: {
              name: response.toolCalls[i].name,
              arguments: JSON.stringify(response.toolCalls[i].args),
            },
          },
        };
      }
    }

    yield { type: 'done' };
  }

  return {
    async chat(messages: Message[], options?: ChatOptions) {
      return { content: 'mock', tool_calls: [], stop_reason: 'stop' };
    },
    async *chatStream(messages: Message[], options?: ChatOptions) {
      yield* mockStream();
    },
  };
}

describe('Agent Loop', () => {
  it('纯文本回答立即结束', async () => {
    const client = createMockClient([{ content: '你好！' }]);
    const tools = new ToolRegistry();
    const messages: Message[] = [{ role: 'user', content: '你好' }];

    const state = await runAgent({ client, tools, messages });

    expect(state.stopped).toBe(true);
    expect(state.finalAnswer).toBe('你好！');
    expect(state.iteration).toBe(1);
  });

  it('工具调用后继续回答', async () => {
    const client = createMockClient([
      {
        toolCalls: [{ name: 'test_tool', args: { path: '.' } }],
      },
      { content: '工具调用完成' },
    ]);

    const tools = new ToolRegistry();
    tools.register({
      name: 'test_tool',
      description: '测试工具',
      parameters: {},
      async execute() {
        return { success: true, data: 'tool result' };
      },
    });

    const messages: Message[] = [{ role: 'user', content: '查看文件' }];
    const state = await runAgent({ client, tools, messages });

    expect(state.stopped).toBe(true);
    expect(state.finalAnswer).toBe('工具调用完成');
    expect(state.iteration).toBe(2);
  });

  it('达到 8 轮上限停止', async () => {
    // 每轮都返回工具调用，永远不返回文本
    const responses = Array.from({ length: 15 }, () => ({
      toolCalls: [{ name: 'loop_tool', args: {} }],
    }));

    const client = createMockClient(responses);
    const tools = new ToolRegistry();
    tools.register({
      name: 'loop_tool',
      description: '无限循环工具',
      parameters: {},
      async execute() {
        return { success: true, data: 'looping...' };
      },
    });

    const messages: Message[] = [{ role: 'user', content: '无限循环' }];
    const events: Array<{ type: string }> = [];

    const state = await runAgent({
      client,
      tools,
      messages,
      onEvent: (e) => events.push(e),
    });

    expect(state.stopped).toBe(true);
    expect(state.iteration).toBe(9); // 第 9 轮时超过上限
    expect(state.stopReason).toContain('最大调用轮数');
  });

  it('未知工具回传错误给模型', async () => {
    const client = createMockClient([
      {
        toolCalls: [{ name: 'unknown_tool', args: {} }],
      },
      { content: '抱歉，工具调用失败了' },
    ]);

    const tools = new ToolRegistry();
    const messages: Message[] = [{ role: 'user', content: '调用未知工具' }];

    const state = await runAgent({ client, tools, messages });

    expect(state.stopped).toBe(true);
    expect(state.finalAnswer).toBe('抱歉，工具调用失败了');
  });
});
