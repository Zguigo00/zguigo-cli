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
  | { type: 'confirm'; toolName: string; message: string };

/** Agent 事件回调 */
export type AgentEventCallback = (event: AgentEvent) => void;
