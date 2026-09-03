import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { getWorkspaceRoot, safeResolve } from '../workspace/index.js';
import { shouldSkipDir } from '../workspace/filter.js';
import type { Tool, ToolResult } from './protocol.js';

/** 递归列出目录树 */
async function listDir(dirPath: string, prefix: string, lines: string[]): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  // 排序：目录在前，文件在后
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (shouldSkipDir(entry.name)) continue;

    const fullPath = join(dirPath, entry.name);
    const relPath = relative(getWorkspaceRoot(), fullPath);

    if (entry.isDirectory()) {
      lines.push(`${prefix}${entry.name}/`);
      await listDir(fullPath, `${prefix}  `, lines);
    } else {
      lines.push(`${prefix}${entry.name}`);
    }
  }
}

export const listFilesTool: Tool = {
  name: 'list_files',
  description: '查看指定目录的文件结构。不传参数则查看项目根目录。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要查看的目录路径（相对于项目根目录），留空则查看根目录',
      },
    },
    required: [],
  },
  async execute(args): Promise<ToolResult> {
    const inputPath = (args.path as string) || '.';
    const resolved = safeResolve(inputPath);

    if (!resolved) {
      return { success: false, error: `路径越界，不允许访问 workspace 之外的目录: ${inputPath}` };
    }

    try {
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        return { success: false, error: `不是目录: ${inputPath}` };
      }

      const lines: string[] = [];
      await listDir(resolved, '', lines);

      return {
        success: true,
        data: lines.length > 0 ? lines.join('\n') : '(空目录)',
      };
    } catch (err) {
      return {
        success: false,
        error: `读取目录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
