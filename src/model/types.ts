/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 单条消息 */
export interface Message {
  role: MessageRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** 工具定义（传给模型的格式） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 模型响应 */
export interface ModelResponse {
  content: string | null;
  tool_calls: ToolCall[];
  stop_reason: 'stop' | 'tool_calls' | 'length' | null;
}

/** 流式事件 */
export interface StreamEvent {
  type: 'text_delta' | 'tool_call_delta' | 'done';
  content?: string;
  tool_call?: Partial<ToolCall>;
}

/** 模型调用选项 */
export interface ChatOptions {
  tools?: ToolDefinition[];
  max_tokens?: number;
  temperature?: number;
}

/** 模型客户端接口（隐藏 SDK 细节） */
export interface ModelClient {
  chat(messages: Message[], options?: ChatOptions): Promise<ModelResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamEvent>;
}
