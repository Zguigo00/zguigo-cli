import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileTool } from '../../src/tools/write-file.js';
import { editFileTool } from '../../src/tools/edit-file.js';
import { createDirectoryTool } from '../../src/tools/create-directory.js';
import { readFileTool } from '../../src/tools/read-file.js';
import { setWorkspaceRoot } from '../../src/workspace/safety.js';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
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

describe('write_file', () => {
  it('创建新文件', async () => {
    const result = await writeFileTool.execute({ path: 'hello.txt', content: 'hello world' });
    expect(result.success).toBe(true);

    const content = await readFile(join(tempDir, 'hello.txt'), 'utf-8');
    expect(content).toBe('hello world');
  });

  it('覆写已有文件', async () => {
    await writeFileTool.execute({ path: 'test.txt', content: 'original' });
    const result = await writeFileTool.execute({ path: 'test.txt', content: 'updated' });
    expect(result.success).toBe(true);

    const content = await readFile(join(tempDir, 'test.txt'), 'utf-8');
    expect(content).toBe('updated');
  });

  it('自动创建父目录', async () => {
    const result = await writeFileTool.execute({ path: 'src/utils/helper.ts', content: 'export const x = 1;' });
    expect(result.success).toBe(true);

    const content = await readFile(join(tempDir, 'src', 'utils', 'helper.ts'), 'utf-8');
    expect(content).toBe('export const x = 1;');
  });

  it('路径越界拒绝', async () => {
    const result = await writeFileTool.execute({ path: '../outside.txt', content: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('缺少参数 path', async () => {
    const result = await writeFileTool.execute({ content: 'hello' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });

  it('缺少参数 content', async () => {
    const result = await writeFileTool.execute({ path: 'test.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });
});

describe('edit_file', () => {
  beforeEach(async () => {
    const { writeFile } = await import('fs/promises');
    await writeFile(join(tempDir, 'app.ts'), 'function hello() {\n  console.log("hi");\n}\n');
  });

  it('替换指定内容', async () => {
    const result = await editFileTool.execute({
      path: 'app.ts',
      old_string: 'console.log("hi")',
      new_string: 'console.log("hello")',
    });
    expect(result.success).toBe(true);

    const content = await readFile(join(tempDir, 'app.ts'), 'utf-8');
    expect(content).toContain('console.log("hello")');
    expect(content).not.toContain('console.log("hi")');
  });

  it('old_string 不存在返回错误', async () => {
    const result = await editFileTool.execute({
      path: 'app.ts',
      old_string: '不存在的内容',
      new_string: '替换',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('未找到匹配内容');
  });

  it('old_string 匹配多处返回错误', async () => {
    const { writeFile } = await import('fs/promises');
    await writeFile(join(tempDir, 'dup.ts'), 'aaa\naaa\n');

    const result = await editFileTool.execute({
      path: 'dup.ts',
      old_string: 'aaa',
      new_string: 'bbb',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('匹配到多处');
  });

  it('路径越界拒绝', async () => {
    const result = await editFileTool.execute({
      path: '../outside.ts',
      old_string: 'a',
      new_string: 'b',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('文件不存在返回错误', async () => {
    const result = await editFileTool.execute({
      path: 'no-such-file.ts',
      old_string: 'a',
      new_string: 'b',
    });
    expect(result.success).toBe(false);
  });

  it('缺少参数', async () => {
    const result = await editFileTool.execute({ path: 'app.ts' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('old_string');
  });
});

describe('create_directory', () => {
  it('创建单层目录', async () => {
    const result = await createDirectoryTool.execute({ path: 'src' });
    expect(result.success).toBe(true);

    const info = await stat(join(tempDir, 'src'));
    expect(info.isDirectory()).toBe(true);
  });

  it('递归创建多层目录', async () => {
    const result = await createDirectoryTool.execute({ path: 'src/utils/helpers' });
    expect(result.success).toBe(true);

    const info = await stat(join(tempDir, 'src', 'utils', 'helpers'));
    expect(info.isDirectory()).toBe(true);
  });

  it('目录已存在不报错', async () => {
    await createDirectoryTool.execute({ path: 'existing' });
    const result = await createDirectoryTool.execute({ path: 'existing' });
    expect(result.success).toBe(true);
  });

  it('路径越界拒绝', async () => {
    const result = await createDirectoryTool.execute({ path: '../outside' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('缺少参数', async () => {
    const result = await createDirectoryTool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });
});
