import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileTool } from '../../src/tools/read-file.js';
import { listFilesTool } from '../../src/tools/list-files.js';
import { setWorkspaceRoot } from '../../src/workspace/safety.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
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

describe('read_file', () => {
  it('正常读取文件', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello world');
    const result = await readFileTool.execute({ path: 'test.txt' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('hello world');
  });

  it('路径越界拒绝', async () => {
    const result = await readFileTool.execute({ path: '../secret.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('缺少参数', async () => {
    const result = await readFileTool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });

  it('文件不存在', async () => {
    const result = await readFileTool.execute({ path: 'no-such-file.txt' });
    expect(result.success).toBe(false);
  });
});

describe('list_files', () => {
  it('列出目录内容', async () => {
    await writeFile(join(tempDir, 'a.txt'), 'a');
    await mkdir(join(tempDir, 'sub'));
    await writeFile(join(tempDir, 'sub', 'b.txt'), 'b');

    const result = await listFilesTool.execute({ path: '.' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('a.txt');
    expect(result.data).toContain('sub/');
  });

  it('跳过 .git 目录', async () => {
    await mkdir(join(tempDir, '.git'));
    await writeFile(join(tempDir, '.git', 'config'), 'git config');
    await writeFile(join(tempDir, 'readme.md'), 'readme');

    const result = await listFilesTool.execute({ path: '.' });
    expect(result.success).toBe(true);
    expect(result.data).not.toContain('.git');
    expect(result.data).toContain('readme.md');
  });

  it('路径越界拒绝', async () => {
    const result = await listFilesTool.execute({ path: '../..' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });
});
