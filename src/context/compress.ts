import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import { COMPRESS_SYSTEM_PROMPT, buildCompressPrompt } from './prompt.js';

/** 压缩配置 */
export interface CompressionConfig {
  /** 上下文窗口大小（token 数） */
  contextWindowSize: number;
  /** 压缩触发阈值（0-1），达到此比例时自动压缩 */
  compressionThreshold: number;
  /** 压缩后保留的最近消息条数 */
  recentMessageCount: number;
}

/** 压缩结果 */
export interface CompressionResult {
  /** 压缩后的完整消息列表 */
  messages: Message[];
  /** 压缩前的 token 数 */
  beforeTokens: number;
  /** 压缩后的 token 数 */
  afterTokens: number;
  /** 是否发生了压缩 */
  compressed: boolean;
}

/**
 * 估算 token 数
 * 中文约 1.5 字/token，英文约 4 字符/token
 * 使用混合估算，对中英文混合文本取近似值
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // 统计中文字符数
  const chineseChars = (text.match(/[一-鿿]/g) ?? []).length;
  // 非中文字符数
  const otherChars = text.length - chineseChars;

  // 中文 1.5 字符/token，英文 4 字符/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 计算消息列表的总 token 数
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    // 每条消息有固定开销（role、格式等）
    total += 4;
    if (msg.content) {
      total += estimateTokens(msg.content);
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function.name + tc.function.arguments);
      }
    }
  }
  return total;
}

/**
 * 判断是否需要压缩
 */
export function shouldCompress(messages: Message[], config: CompressionConfig): boolean {
  const tokens = estimateMessagesTokens(messages);
  return tokens >= config.contextWindowSize * config.compressionThreshold;
}

/**
 * 压缩消息列表
 *
 * 策略：保留 system message + 最近 N 条，中间的用模型摘要替换
 */
export async function compressMessages(
  messages: Message[],
  client: ModelClient,
  config: CompressionConfig,
): Promise<CompressionResult> {
  const beforeTokens = estimateMessagesTokens(messages);

  // 找到 system message
  const systemMessages: Message[] = [];
  const otherMessages: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      otherMessages.push(msg);
    }
  }

  // 没有足够消息需要压缩
  if (otherMessages.length <= config.recentMessageCount + 1) {
    return { messages, beforeTokens, afterTokens: beforeTokens, compressed: false };
  }

  // 分割：需要压缩的历史 + 保留的最近消息
  const toCompress = otherMessages.slice(0, otherMessages.length - config.recentMessageCount);
  const recent = otherMessages.slice(otherMessages.length - config.recentMessageCount);

  // 用模型生成摘要
  const compressPrompt = buildCompressPrompt(toCompress);

  const summaryResponse = await client.chat([
    { role: 'system', content: COMPRESS_SYSTEM_PROMPT },
    { role: 'user', content: compressPrompt },
  ], {
    temperature: 0.3,
    max_tokens: 2000,
  });

  const summary = summaryResponse.content ?? '（摘要生成失败）';

  // 组装压缩后的消息列表
  const summaryMessage: Message = {
    role: 'assistant',
    content: `[对话历史摘要]\n${summary}`,
  };

  const compressed: Message[] = [
    ...systemMessages,
    summaryMessage,
    ...recent,
  ];

  const afterTokens = estimateMessagesTokens(compressed);

  return { messages: compressed, beforeTokens, afterTokens, compressed: true };
}
