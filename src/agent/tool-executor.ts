import type { Message, ToolCall } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import type { AgentEventCallback } from './types.js';

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 工具注册表 */
  tools: ToolRegistry;
  /** 消息列表（结果会追加到其中） */
  messages: Message[];
  /** 事件回调 */
  emit?: AgentEventCallback;
  /** 只读模式下禁止的工具列表 */
  readOnlyTools?: string[];
  /** 工具确认回调 */
  confirmToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

/**
 * 执行单个工具调用
 *
 * 统一处理：JSON 解析、只读检查、用户确认、工具执行、结果回写
 *
 * @returns 是否成功执行（JSON 解析失败、只读拒绝、用户拒绝均返回 false）
 */
export async function executeToolCall(
  tc: ToolCall,
  context: ToolExecutionContext,
): Promise<boolean> {
  const { tools, messages, emit, readOnlyTools, confirmToolCall } = context;

  // 1. 解析工具参数 JSON
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(tc.function.arguments);
  } catch {
    const errorMsg = `工具参数 JSON 解析失败: ${tc.function.arguments}`;
    messages.push({
      role: 'tool',
      content: JSON.stringify({ success: false, error: errorMsg }),
      tool_call_id: tc.id,
    });
    emit?.({ type: 'error', message: errorMsg });
    return false;
  }

  // 2. 只读模式检查
  if (readOnlyTools?.includes(tc.function.name)) {
    const rejectMsg = `只读模式下禁止执行: ${tc.function.name}`;
    messages.push({
      role: 'tool',
      content: JSON.stringify({ success: false, error: rejectMsg }),
      tool_call_id: tc.id,
    });
    emit?.({ type: 'tool_result', name: tc.function.name, success: false, data: rejectMsg });
    return false;
  }

  const tool = tools.get(tc.function.name);

  // 3. 需要确认的工具
  if (tool?.requiresConfirmation && confirmToolCall) {
    const confirmMsg = tool.confirmMessage
      ? tool.confirmMessage(parsedArgs)
      : `即将执行: ${tc.function.name}`;
    emit?.({ type: 'confirm', toolName: tc.function.name, message: confirmMsg });

    const approved = await confirmToolCall(tc.function.name, parsedArgs);
    if (!approved) {
      const rejectMsg = `用户拒绝执行: ${tc.function.name}`;
      messages.push({
        role: 'tool',
        content: JSON.stringify({ success: false, error: rejectMsg }),
        tool_call_id: tc.id,
      });
      emit?.({ type: 'tool_result', name: tc.function.name, success: false, data: rejectMsg });
      return false;
    }
  }

  // 4. 执行工具
  const toolStart = Date.now();
  const result = await tools.call(tc.function.name, parsedArgs);
  const elapsed = Date.now() - toolStart;

  emit?.({
    type: 'tool_result',
    name: tc.function.name,
    success: result.success,
    data: result.data,
    elapsed,
  });

  messages.push({
    role: 'tool',
    content: JSON.stringify(result),
    tool_call_id: tc.id,
  });

  return true;
}
