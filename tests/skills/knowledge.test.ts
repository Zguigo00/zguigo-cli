import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeLoader } from '../../src/skills/knowledge.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import { readdir, readFile } from 'fs/promises';
const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

describe('KnowledgeLoader', () => {
  let loader: KnowledgeLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new KnowledgeLoader('/test/project');
  });

  describe('loadAll()', () => {
    it('应该返回空字符串（目录不存在）', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));

      const result = await loader.loadAll();
      expect(result).toBe('');
    });

    it('应该返回空字符串（无 .md 文件）', async () => {
      mockReaddir.mockResolvedValue([] as any);

      const result = await loader.loadAll();
      expect(result).toBe('');
    });

    it('应该加载并拼接 .md 文件内容', async () => {
      // Mock Dirent 对象
      const createDirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });

      // 用户目录为空，项目目录有两个 .md 文件
      mockReaddir
        .mockResolvedValueOnce([] as any)  // 用户目录为空
        .mockResolvedValueOnce([
          createDirent('deploy.md', false),
          createDirent('style.md', false),
        ] as any);  // 项目目录有文件

      mockReadFile
        .mockResolvedValueOnce('# 部署流程\n\nnpm run build')
        .mockResolvedValueOnce('# 代码风格\n\n使用严格模式');

      const result = await loader.loadAll();

      expect(result).toContain('# 部署流程');
      expect(result).toContain('# 代码风格');
      expect(result).toContain('npm run build');
    });

    it('应该跳过无法读取的文件', async () => {
      const createDirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });

      mockReaddir
        .mockResolvedValueOnce([] as any)  // 用户目录为空
        .mockResolvedValueOnce([
          createDirent('good.md', false),
          createDirent('bad.md', false),
        ] as any);  // 项目目录有文件

      mockReadFile
        .mockResolvedValueOnce('# 好的文件')
        .mockRejectedValueOnce(new Error('读取失败'));

      const result = await loader.loadAll();

      expect(result).toContain('# 好的文件');
      expect(result).not.toContain('bad');
    });
  });
});
