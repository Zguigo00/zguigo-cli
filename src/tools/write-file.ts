import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { safeResolve } from '../workspace/index.js';
import type { Tool, ToolResult } from './protocol.js';

export const writeFileTool: Tool = {
  name: 'write_file',
  description: '创建或覆写指定文件。如果父目录不存在会自动创建。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要写入的文件路径（相对于项目根目录）',
      },
      content: {
        type: 'string',
        description: '要写入的文件内容',
      },
    },
    required: ['path', 'content'],
  },
  requiresConfirmation: true,
  confirmMessage(args): string {
    return `即将写入文件: ${args.path as string}`;
  },
  async execute(args): Promise<ToolResult> {
    const inputPath = args.path as string;
    const content = args.content as string;

    if (!inputPath) {
      return { success: false, error: '缺少必需参数: path' };
    }
    if (content === undefined || content === null) {
      return { success: false, error: '缺少必需参数: content' };
    }

    const resolved = safeResolve(inputPath);
    if (!resolved) {
      return { success: false, error: `路径越界，不允许写入 workspace 之外的文件: ${inputPath}` };
    }

    try {
      // 自动创建父目录
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');
      return { success: true, data: `文件已写入: ${inputPath}` };
    } catch (err) {
      return {
        success: false,
        error: `写入文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
