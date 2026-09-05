import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommandTool } from '../../src/tools/run-command.js';
import { setWorkspaceRoot } from '../../src/workspace/safety.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'zguigo-test-'));
  setWorkspaceRoot(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('run_command', () => {
  it('执行简单命令', async () => {
    const result = await runCommandTool.execute({ command: 'echo hello' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('hello');
  });

  it('缺少参数', async () => {
    const result = await runCommandTool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('command');
  });

  it('命令失败返回错误', async () => {
    const result = await runCommandTool.execute({ command: 'node -e "process.exit(1)"' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('exit code');
  });

  it('工作目录在 workspace 内', async () => {
    const result = await runCommandTool.execute({ command: 'echo %cd%' });
    expect(result.success).toBe(true);
    // Windows 下路径分隔符不同，统一替换后比较
    const normalized = (result.data ?? '').toLowerCase().replace(/\\/g, '/');
    const expected = tempDir.toLowerCase().replace(/\\/g, '/');
    expect(normalized).toContain(expected);
  });

  it('需要确认', () => {
    expect(runCommandTool.requiresConfirmation).toBe(true);
  });

  it('确认消息包含命令', () => {
    const msg = runCommandTool.confirmMessage?.({ command: 'npm test' });
    expect(msg).toContain('npm test');
  });
});
