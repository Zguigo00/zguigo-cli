import { readFile, stat } from 'fs/promises';
import { safeResolve } from '../workspace/index.js';
import type { Tool, ToolResult } from './protocol.js';

/** 单文件读取上限 200KB */
const MAX_FILE_SIZE = 200 * 1024;

/**
 * 简单判断文件是否为二进制
 * 检查前 8KB 是否包含 null 字节
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  const buffer = Buffer.alloc(8192);
  const fs = await import('fs/promises');
  const fh = await fs.open(filePath, 'r');
  try {
    const { bytesRead } = await fh.read(buffer, 0, buffer.length, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } finally {
    await fh.close();
  }
}

export const readFileTool: Tool = {
  name: 'read_file',
  description: '读取指定文本文件的内容。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径（相对于项目根目录）',
      },
    },
    required: ['path'],
  },
  async execute(args): Promise<ToolResult> {
    const inputPath = args.path as string;
    if (!inputPath) {
      return { success: false, error: '缺少必需参数: path' };
    }

    const resolved = safeResolve(inputPath);
    if (!resolved) {
      return { success: false, error: `路径越界，不允许访问 workspace 之外的文件: ${inputPath}` };
    }

    try {
      const info = await stat(resolved);
      if (!info.isFile()) {
        return { success: false, error: `不是文件: ${inputPath}` };
      }

      if (info.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `文件过大 (${(info.size / 1024).toFixed(1)} KB)，上限为 200 KB: ${inputPath}`,
        };
      }

      if (await isBinaryFile(resolved)) {
        return { success: false, error: `二进制文件，无法按文本读取: ${inputPath}` };
      }

      const content = await readFile(resolved, 'utf-8');
      return { success: true, data: content };
    } catch (err) {
      return {
        success: false,
        error: `读取文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
