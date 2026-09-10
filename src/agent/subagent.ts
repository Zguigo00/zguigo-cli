import type { Message } from '../model/types.js';
import type { ModelClient } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import { runAgent } from './loop.js';
import type { AgentEvent, AgentEventCallback } from './types.js';

/** 子 Agent 最大嵌套深度（0=主对话，1=子 agent，2=子子 agent，3=拒绝） */
const MAX_SUBAGENT_DEPTH = 2;

/** 子 Agent 选项 */
export interface SubAgentOptions {
  /** 子 agent 要执行的任务描述 */
  task: string;
  /** 模型客户端，继承父 agent 的 */
  client: ModelClient;
  /** 工具注册表，继承父 agent 的 */
  tools: ToolRegistry;
  /** 输出到 TUI */
  writeLine: (text: string) => void;
  /** 事件回调，用于 UI 更新 */
  onEvent?: AgentEventCallback;
  /** 从父对话传递给子 agent 的上下文 */
  context?: string;
  /** 最大迭代轮数，默认 8 */
  maxIterations?: number;
  /** 当前嵌套深度，防递归 */
  depth?: number;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 运行子 Agent
 *
 * 创建独立的消息历史，执行指定任务，返回最终结果文本。
 * 子 agent 有自己的系统提示，继承父 agent 的工具集。
 *
 * @returns 子 agent 的最终输出文本，失败时返回错误描述
 */
export async function runSubAgent(options: SubAgentOptions): Promise<string> {
  const {
    task,
    client,
    tools,
    writeLine,
    onEvent,
    context,
    maxIterations = 8,
    depth = 0,
    debug = false,
  } = options;

  // 防递归检查
  if (depth >= MAX_SUBAGENT_DEPTH) {
    const msg = `嵌套深度超限 (${depth}/${MAX_SUBAGENT_DEPTH})，无法启动子 agent`;
    writeLine(`{red-fg}[子 agent] ${msg}{/red-fg}`);
    return msg;
  }

  writeLine(`{cyan-fg}{bold}[子 agent 启动]{/bold}{/cyan-fg} ${task.substring(0, 80)}${task.length > 80 ? '...' : ''}`);

  // 构建子 agent 的系统提示
  const systemPrompt = buildSubAgentSystemPrompt(depth);

  // 构建初始消息
  const subMessages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: context
        ? `## 任务\n${task}\n\n## 来自主对话的上下文\n${context}`
        : task,
    },
  ];

  // 收集最终输出
  let finalAnswer = '';

  // 子 agent 事件处理器：转发输出，记录最终答案
  const subEventHandler: AgentEventCallback = (event: AgentEvent) => {
    switch (event.type) {
      case 'text':
        writeLine(`{gray-fg}[子 agent]{/gray-fg} ${event.content}`);
        finalAnswer += event.content;
        break;
      case 'tool_call':
        writeLine(`{gray-fg}[子 agent] 调用工具: ${event.name}{/gray-fg}`);
        break;
      case 'tool_result':
        if (!event.success) {
          writeLine(`{gray-fg}[子 agent] 工具失败: ${event.name}{/gray-fg}`);
        }
        break;
      case 'done':
        if (event.answer) {
          finalAnswer = event.answer;
        }
        break;
      case 'error':
        writeLine(`{red-fg}[子 agent] 错误: ${event.message}{/red-fg}`);
        break;
    }
    // 同时转发给外部事件处理器（如有）
    onEvent?.(event);
  };

  try {
    const state = await runAgent({
      client,
      tools,
      messages: subMessages,
      onEvent: subEventHandler,
      debug,
      maxIterations,
    });

    const result = state.finalAnswer || finalAnswer || '(子 agent 未产生输出)';
    writeLine(`{green-fg}{bold}[子 agent 完成]{/bold}{/green-fg}`);
    return result;
  } catch (err) {
    const errMsg = `子 agent 执行异常: ${err instanceof Error ? err.message : String(err)}`;
    writeLine(`{red-fg}[子 agent] ${errMsg}{/red-fg}`);
    return errMsg;
  }
}

/**
 * 构建子 Agent 的系统提示
 */
function buildSubAgentSystemPrompt(depth: number): string {
  return `你是一个专注执行特定任务的子代理（深度 ${depth}）。

## 规则
1. 你有自己独立的对话历史，与主对话隔离
2. 专注于完成分配给你的任务，不要偏离主题
3. 使用工具获取信息、读写文件、执行命令
4. 任务完成后，给出清晰、结构化的总结
5. 如果遇到无法解决的问题，明确说明原因
6. 你还可以通过 spawn_agent 工具启动更深层的子代理（深度限制: ${MAX_SUBAGENT_DEPTH}）

## 输出格式
任务完成后，用以下格式总结：
- **结论**: 一句话概括结果
- **详情**: 具体内容
- **遇到的问题**: 如有`;
}
