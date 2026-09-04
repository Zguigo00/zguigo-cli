/** 摘要压缩用的系统提示词 */
export const COMPRESS_SYSTEM_PROMPT = `你是一个对话历史压缩助手。请将以下对话历史压缩成一段简洁的摘要。

要求：
1. 保留关键信息：用户的任务目标、重要的决策、已确定的方案
2. 保留关键代码片段、文件路径、函数名等技术细节
3. 删除重复的确认、客套话、中间推理过程
4. 用中文输出
5. 格式：先总结已完成的工作，再说明当前状态和待处理事项

直接输出摘要，不要加任何前缀或解释。`;

/** 构建压缩请求的用户消息 */
export function buildCompressPrompt(messages: Array<{ role: string; content: string | null }>): string {
  const lines: string[] = [];

  for (const msg of messages) {
    if (!msg.content) continue;
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : msg.role;
    lines.push(`[${role}] ${msg.content}`);
  }

  return lines.join('\n\n');
}
