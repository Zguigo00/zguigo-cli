import { ToolError } from '../errors/index.js';

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

/** 工具定义 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** 是否需要用户确认后才执行（写入/危险操作） */
  requiresConfirmation?: boolean;
  /** 确认时显示给用户的描述（如命令内容、文件路径等） */
  confirmMessage?: (args: Record<string, unknown>) => string;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/** 工具注册表 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** 获取所有工具的模型定义格式 */
  getDefinitions() {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /** 调用工具 */
  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `未知工具: ${name}` };
    }

    try {
      return await tool.execute(args);
    } catch (err) {
      if (err instanceof ToolError) {
        return { success: false, error: err.message };
      }
      return { success: false, error: `工具执行异常: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
