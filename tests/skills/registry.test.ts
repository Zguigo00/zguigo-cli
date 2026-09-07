import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry } from '../../src/skills/registry.js';
import { reviewCommand } from '../../src/skills/built-in/review.js';
import type { Command } from '../../src/skills/protocol.js';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry(process.cwd());
  });

  describe('register()', () => {
    it('应该注册内置命令', () => {
      registry.register(reviewCommand);
      // get 是异步的，但内置命令立即返回
    });
  });

  describe('get()', () => {
    it('应该返回内置命令', async () => {
      registry.register(reviewCommand);
      const cmd = await registry.get('review');

      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('review');
      expect(cmd?.description).toBe('审查代码质量、找出潜在问题');
      expect(cmd?.source).toBe('builtin');
    });

    it('应该返回 undefined（命令不存在）', async () => {
      const cmd = await registry.get('nonexistent');
      expect(cmd).toBeUndefined();
    });

    it('应该返回 undefined（空注册表）', async () => {
      const cmd = await registry.get('review');
      expect(cmd).toBeUndefined();
    });
  });

  describe('list()', () => {
    it('应该列出所有内置命令', async () => {
      registry.register(reviewCommand);

      const testCmd: Command = {
        name: 'test',
        description: '生成测试',
        instruction: '测试指令',
        source: 'builtin',
      };
      registry.register(testCmd);

      const list = await registry.list();
      // 至少应该有我们注册的2个命令
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.some(c => c.name === 'review')).toBe(true);
      expect(list.some(c => c.name === 'test')).toBe(true);
    });

    it('空注册表应返回空数组或只包含文件系统命令', async () => {
      const list = await registry.list();
      // 可能包含文件系统中的命令，所以不检查精确数量
      expect(Array.isArray(list)).toBe(true);
    });
  });
});
