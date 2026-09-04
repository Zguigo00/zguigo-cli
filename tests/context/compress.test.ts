import { describe, it, expect, vi } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  shouldCompress,
  compressMessages,
  type CompressionConfig,
} from '../../src/context/index.js';
import type { Message, ModelClient, ModelResponse } from '../../src/model/types.js';

/** 创建 mock ModelClient */
function createMockClient(response: string): ModelClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      tool_calls: [],
      stop_reason: 'stop',
    } satisfies ModelResponse),
    chatStream: vi.fn(),
  };
}

const defaultConfig: CompressionConfig = {
  contextWindowSize: 1000,
  compressionThreshold: 0.8,
  recentMessageCount: 3,
};

describe('estimateTokens', () => {
  it('空字符串返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('纯英文文本', () => {
    // 16 chars / 4 = 4 tokens
    expect(estimateTokens('hello world test')).toBe(4);
  });

  it('纯中文文本', () => {
    // 6 chars / 1.5 = 4 tokens
    expect(estimateTokens('你好世界测试')).toBe(4);
  });

  it('中英混合文本', () => {
    const result = estimateTokens('hello你好');
    // 'hello' = 5 chars → 5/4 = 1.25, '你好' = 2 chars → 2/1.5 = 1.33
    // ceil(1.25 + 1.33) = 3
    expect(result).toBe(3);
  });
});

describe('estimateMessagesTokens', () => {
  it('空消息列表', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('单条用户消息', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
    ];
    // 4 (overhead) + ceil(5/4) = 4 + 2 = 6
    expect(estimateMessagesTokens(messages)).toBe(6);
  });

  it('多条消息累加', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    // msg1: 4 + ceil(2/4) = 4 + 1 = 5
    // msg2: 4 + ceil(5/4) = 4 + 2 = 6
    // total = 11
    expect(estimateMessagesTokens(messages)).toBe(11);
  });

  it('包含 tool_calls 的消息', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"test.txt"}' },
        }],
      },
    ];
    // 4 (overhead) + 0 (content null) + ceil(8+19)/4 = 4 + 7 = 11
    expect(estimateMessagesTokens(messages)).toBe(11);
  });
});

describe('shouldCompress', () => {
  it('消息少时不触发', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
    ];
    expect(shouldCompress(messages, defaultConfig)).toBe(false);
  });

  it('消息多时触发', () => {
    // 构造大量消息使 token 超过阈值
    const messages: Message[] = [];
    for (let i = 0; i < 200; i++) {
      messages.push({ role: 'user', content: '这是一条测试消息，用于填充上下文空间' });
      messages.push({ role: 'assistant', content: '这是助手的回复内容，包含一些解释和代码示例' });
    }
    expect(shouldCompress(messages, defaultConfig)).toBe(true);
  });

  it('阈值边界不触发', () => {
    const config: CompressionConfig = {
      contextWindowSize: 100000,
      compressionThreshold: 0.8,
      recentMessageCount: 3,
    };
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
    ];
    expect(shouldCompress(messages, config)).toBe(false);
  });
});

describe('compressMessages', () => {
  it('消息过少时不压缩', async () => {
    const client = createMockClient('摘要');
    const messages: Message[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮你？' },
    ];

    const result = await compressMessages(messages, client, defaultConfig);

    expect(result.compressed).toBe(false);
    expect(result.messages).toHaveLength(2);
  });

  it('消息足够多时压缩', async () => {
    const client = createMockClient('用户问了项目结构，助手解释了目录布局。');
    const messages: Message[] = [
      { role: 'system', content: '你是一个编程助手' },
      { role: 'user', content: '请介绍一下项目结构' },
      { role: 'assistant', content: '项目结构如下...' },
      { role: 'user', content: 'src 目录是做什么的？' },
      { role: 'assistant', content: 'src 目录包含...' },
      { role: 'user', content: 'agent 模块怎么工作的？' },
      { role: 'assistant', content: 'agent 模块...' },
      { role: 'user', content: '还有其他模块吗？' },
      { role: 'assistant', content: '还有 model 模块...' },
      { role: 'user', content: '详细说说 model 模块' },
      { role: 'assistant', content: 'model 模块负责...' },
    ];

    const result = await compressMessages(messages, client, defaultConfig);

    expect(result.compressed).toBe(true);
    expect(result.beforeTokens).toBeGreaterThan(result.afterTokens);

    // 检查结构：system + summary + 最近3条
    const roles = result.messages.map((m) => m.role);
    expect(roles[0]).toBe('system');
    expect(roles[1]).toBe('assistant'); // 摘要
    expect(result.messages[1].content).toContain('[对话历史摘要]');
    // 最近3条是 user/assistant/user
    expect(result.messages).toHaveLength(2 + 3); // system + summary + 3 recent
  });

  it('保留 system message', async () => {
    const client = createMockClient('摘要内容');
    const messages: Message[] = [
      { role: 'system', content: '系统提示' },
      { role: 'user', content: '消息1' },
      { role: 'assistant', content: '回复1' },
      { role: 'user', content: '消息2' },
      { role: 'assistant', content: '回复2' },
      { role: 'user', content: '消息3' },
      { role: 'assistant', content: '回复3' },
      { role: 'user', content: '消息4' },
      { role: 'assistant', content: '回复4' },
      { role: 'user', content: '消息5' },
      { role: 'assistant', content: '回复5' },
    ];

    const result = await compressMessages(messages, client, defaultConfig);

    expect(result.compressed).toBe(true);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('系统提示');
  });

  it('模型返回 null 时使用默认文本', async () => {
    const mockChat = vi.fn().mockResolvedValue({
      content: null,
      tool_calls: [],
      stop_reason: 'stop',
    } satisfies ModelResponse);
    const client: ModelClient = {
      chat: mockChat,
      chatStream: vi.fn(),
    };

    const messages: Message[] = [];
    for (let i = 0; i < 200; i++) {
      messages.push({ role: 'user', content: `这是第${i}条测试消息，用于填充上下文空间，确保触发压缩逻辑` });
      messages.push({ role: 'assistant', content: `这是第${i}条助手回复，包含详细的解释和代码示例，确保触发压缩逻辑` });
    }

    const result = await compressMessages(messages, client, defaultConfig);

    expect(result.compressed).toBe(true);
    expect(mockChat).toHaveBeenCalledOnce();
    // 摘要是 messages 的第二条（第一条是 summary message）
    const summaryMsg = result.messages.find(m => m.content?.includes('[对话历史摘要]'));
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('摘要生成失败');
  });
});
