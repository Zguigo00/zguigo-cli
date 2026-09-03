import { describe, it, expect } from 'vitest';
import { safeResolve, setWorkspaceRoot, getWorkspaceRoot } from '../../src/workspace/safety.js';
import { shouldSkipDir } from '../../src/workspace/filter.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'zguigo-safety-'));
  setWorkspaceRoot(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('safeResolve', () => {
  it('正常路径在 workspace 内', () => {
    const result = safeResolve('src/index.ts');
    expect(result).toBe(join(tempDir, 'src', 'index.ts'));
  });

  it('当前目录', () => {
    const result = safeResolve('.');
    expect(result).toBe(tempDir);
  });

  it('.. 穿越被拒绝', () => {
    const result = safeResolve('../secret');
    expect(result).toBeNull();
  });

  it('多层 .. 穿越被拒绝', () => {
    const result = safeResolve('../../etc/passwd');
    expect(result).toBeNull();
  });

  it('嵌套路径在 workspace 内', () => {
    const result = safeResolve('src/deep/nested/file.ts');
    expect(result).not.toBeNull();
  });
});

describe('shouldSkipDir', () => {
  it('跳过 .git', () => expect(shouldSkipDir('.git')).toBe(true));
  it('跳过 node_modules', () => expect(shouldSkipDir('node_modules')).toBe(true));
  it('跳过 dist', () => expect(shouldSkipDir('dist')).toBe(true));
  it('跳过 build', () => expect(shouldSkipDir('build')).toBe(true));
  it('不跳过 src', () => expect(shouldSkipDir('src')).toBe(false));
  it('不跳过 docs', () => expect(shouldSkipDir('docs')).toBe(false));
});
