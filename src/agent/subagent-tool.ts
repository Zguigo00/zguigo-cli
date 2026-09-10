import type { Tool } from '../tools/protocol.js';
import type { ModelClient } from '../model/types.js';
import type { ToolRegistry } from '../tools/protocol.js';
import { runSubAgent } from './subagent.js';

/** 创建 spawn_agent 工具的选项 */
export interface SpawnAgentToolOptions {
  /** 模型客户端 */
  client: ModelClient;
  /** 工具注册表 */
  tools: ToolRegistry;
  /** 输出到 TUI */
  writeLine: (text: string) => void;
  /** 当前嵌套深度 */
  depth?: number;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 创建 spawn_agent 工具
 *
 * 主 agent 可通过此工具启动子 agent 执行独立任务。
 * 子 agent 有自己的对话历史，完成后将结果作为 tool_result 返回。
 */
export function createSpawnAgentTool(options: SpawnAgentToolOptions): Tool {
  return {
    name: 'spawn_agent',
    description: `启动一个子代理来执行特定任务。子代理有自己的对话历史，完成后将结果返回。

适用场景：
- 需要独立分析一个文件或目录结构
- 需要专门的代码审查或测试
- 任务较复杂，拆分为子任务更清晰
- 需要独立的上下文避免干扰主对话

注意：子代理会消耗额外的模型调用轮数，请确保任务明确具体。`,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '子代理要执行的任务描述，应足够具体明确',
        },
        context: {
          type: 'string',
          description: '从当前对话传递给子代理的上下文信息（可选）',
        },
      },
      required: ['task'],
    },
    async execute(args: Record<string, unknown>): Promise<{ success: boolean; data?: string; error?: string }> {
      const task = args.task as string;
      if (!task || typeof task !== 'string') {
        return { success: false, error: '缺少必填参数: task' };
      }

      try {
        const result = await runSubAgent({
          task,
          client: options.client,
          tools: options.tools,
          writeLine: options.writeLine,
          context: args.context as string | undefined,
          depth: (options.depth ?? 0) + 1,
          debug: options.debug,
        });
        return { success: true, data: result };
      } catch (err) {
        return {
          success: false,
          error: `子代理执行失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
