import type { Message } from '../model/types.js';

/** Agent 循环状态 */
export interface AgentState {
  messages: Message[];
  iteration: number;
  finalAnswer: string | null;
  lastError: string | null;
  stopped: boolean;
  stopReason: string | null;
}

/** Agent 事件 */
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'tool_result'; name: string; success: boolean; data?: string }
  | { type: 'iteration'; number: number }
  | { type: 'error'; message: string }
  | { type: 'done'; answer: string | null }
  | { type: 'compress'; beforeTokens: number; afterTokens: number }
  | { type: 'confirm'; toolName: string; message: string }
  | { type: 'command'; name: string; readOnly: boolean }
  | { type: 'plan_start' }
  | { type: 'plan_complete'; tasks: Array<{ id: string; title: string; description: string }> }
  | { type: 'task_start'; taskId: string; taskTitle: string; index: number; total: number }
  | { type: 'task_complete'; taskId: string; taskTitle: string; result: string }
  | { type: 'task_failed'; taskId: string; taskTitle: string; error: string }
  | { type: 'task_skipped'; taskId: string; taskTitle: string; reason: string }
  | { type: 'all_done'; stats: { total: number; completed: number; failed: number; skipped: number } };

/** Agent 事件回调 */
export type AgentEventCallback = (event: AgentEvent) => void;
