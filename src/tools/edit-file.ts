import { readFile, writeFile } from 'fs/promises';
import { safeResolve } from '../workspace/index.js';
import type { Tool, ToolResult } from './protocol.js';

export const editFileTool: Tool = {
  name: 'edit_file',
  description: '编辑已有文件：查找指定内容并替换为新内容。old_string 必须在文件中唯一匹配。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要编辑的文件路径（相对于项目根目录）',
      },
      old_string: {
        type: 'string',
        description: '要查找的原始内容（必须在文件中唯一）',
      },
      new_string: {
        type: 'string',
        description: '替换后的新内容',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(args): Promise<ToolResult> {
    const inputPath = args.path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;

    if (!inputPath) {
      return { success: false, error: '缺少必需参数: path' };
    }
    if (!oldString) {
      return { success: false, error: '缺少必需参数: old_string' };
    }
    if (newString === undefined || newString === null) {
      return { success: false, error: '缺少必需参数: new_string' };
    }

    const resolved = safeResolve(inputPath);
    if (!resolved) {
      return { success: false, error: `路径越界，不允许编辑 workspace 之外的文件: ${inputPath}` };
    }

    try {
      const content = await readFile(resolved, 'utf-8');

      // 检查 old_string 是否存在
      const firstIndex = content.indexOf(oldString);
      if (firstIndex === -1) {
        return {
          success: false,
          error: `未找到匹配内容，请检查 old_string 是否正确: ${inputPath}`,
        };
      }

      // 检查是否唯一匹配
      const secondIndex = content.indexOf(oldString, firstIndex + oldString.length);
      if (secondIndex !== -1) {
        return {
          success: false,
          error: `匹配到多处内容，请提供更精确的 old_string 使其唯一匹配: ${inputPath}`,
        };
      }

      // 执行替换
      const updated = content.replace(oldString, newString);
      await writeFile(resolved, updated, 'utf-8');

      return { success: true, data: `文件已编辑: ${inputPath}` };
    } catch (err) {
      return {
        success: false,
        error: `编辑文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
