import { ConfigError } from '../errors/index.js';

export interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 上下文窗口大小（token 数） */
  contextWindowSize: number;
  /** 压缩触发阈值（0-1），达到此比例时自动压缩 */
  compressionThreshold: number;
  /** 摘要压缩后保留的最近消息条数 */
  recentMessageCount: number;
}

/**
 * 从环境变量读取模型配置
 * 不会将 API Key 输出到任何日志
 */
export function loadModelConfig(): ModelConfig {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;

  const missing: string[] = [];
  if (!apiKey) missing.push('LLM_API_KEY');
  if (!baseUrl) missing.push('LLM_BASE_URL');
  if (!model) missing.push('LLM_MODEL');

  if (missing.length > 0) {
    throw new ConfigError(
      `缺少必要的环境变量: ${missing.join(', ')}\n` +
      `请在项目根目录创建 .env 文件，参考 .env.example`
    );
  }

  return {
    apiKey: apiKey!,
    baseUrl: baseUrl!,
    model: model!,
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE ?? '65536', 10),
    compressionThreshold: parseFloat(process.env.COMPRESSION_THRESHOLD ?? '0.8'),
    recentMessageCount: parseInt(process.env.RECENT_MESSAGE_COUNT ?? '5', 10),
  };
}
