import { exec } from 'child_process';
import { getWorkspaceRoot } from '../workspace/index.js';
import type { Tool, ToolResult } from './protocol.js';

/** 命令执行超时（毫秒） */
const EXEC_TIMEOUT = 30_000;

/** 输出截断上限（字节） */
const MAX_OUTPUT = 50 * 1024;

/** 截断输出文本 */
function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + '\n... (输出已截断)';
}

export const runCommandTool: Tool = {
  name: 'run_command',
  description: '在项目目录下执行 shell 命令。支持 npm、git、node 等命令。超时 30 秒。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令，如 "npm test"、"git status"',
      },
    },
    required: ['command'],
  },
  requiresConfirmation: true,
  confirmMessage(args): string {
    return `即将执行命令: ${args.command as string}`;
  },
  async execute(args): Promise<ToolResult> {
    const command = args.command as string;

    if (!command) {
      return { success: false, error: '缺少必需参数: command' };
    }

    return new Promise((resolve) => {
      exec(command, {
        cwd: getWorkspaceRoot(),
        timeout: EXEC_TIMEOUT,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error && error.killed) {
          resolve({
            success: false,
            error: `命令执行超时 (${EXEC_TIMEOUT / 1000}秒): ${command}`,
          });
          return;
        }

        const out = truncate(stdout ?? '');
        const err = truncate(stderr ?? '');

        if (error) {
          resolve({
            success: false,
            error: `命令执行失败 (exit code ${error.code}):\n${err || out || error.message}`,
          });
          return;
        }

        resolve({
          success: true,
          data: out || '(无输出)',
        });
      });
    });
  },
};
