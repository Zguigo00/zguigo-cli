import { mkdir } from 'fs/promises';
import { safeResolve } from '../workspace/index.js';
import type { Tool, ToolResult } from './protocol.js';

export const createDirectoryTool: Tool = {
  name: 'create_directory',
  description: '创建目录。如果父目录不存在会自动创建（递归创建）。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要创建的目录路径（相对于项目根目录）',
      },
    },
    required: ['path'],
  },
  requiresConfirmation: true,
  confirmMessage(args): string {
    return `即将创建目录: ${args.path as string}`;
  },
  async execute(args): Promise<ToolResult> {
    const inputPath = args.path as string;

    if (!inputPath) {
      return { success: false, error: '缺少必需参数: path' };
    }

    const resolved = safeResolve(inputPath);
    if (!resolved) {
      return { success: false, error: `路径越界，不允许在 workspace 之外创建目录: ${inputPath}` };
    }

    try {
      await mkdir(resolved, { recursive: true });
      return { success: true, data: `目录已创建: ${inputPath}` };
    } catch (err) {
      return {
        success: false,
        error: `创建目录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
