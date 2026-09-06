import { describe, it, expect } from 'vitest';
import { reviewCommand } from '../../src/skills/built-in/review.js';
import { testCommand } from '../../src/skills/built-in/test.js';
import { explainCommand } from '../../src/skills/built-in/explain.js';
import { refactorCommand } from '../../src/skills/built-in/refactor.js';

describe('内置 Commands', () => {
  describe('reviewCommand', () => {
    it('应该有正确的名称', () => {
      expect(reviewCommand.name).toBe('review');
    });

    it('应该有描述', () => {
      expect(reviewCommand.description).toBeTruthy();
    });

    it('应该有指令模板', () => {
      expect(reviewCommand.instruction).toBeTruthy();
      expect(reviewCommand.instruction).toContain('$ARGUMENTS');
    });

    it('应该标记为只读', () => {
      expect(reviewCommand.readOnly).toBe(true);
    });

    it('来源应该是 builtin', () => {
      expect(reviewCommand.source).toBe('builtin');
    });
  });

  describe('testCommand', () => {
    it('应该有正确的名称', () => {
      expect(testCommand.name).toBe('test');
    });

    it('应该有描述', () => {
      expect(testCommand.description).toBeTruthy();
    });

    it('应该有指令模板', () => {
      expect(testCommand.instruction).toBeTruthy();
      expect(testCommand.instruction).toContain('$ARGUMENTS');
    });

    it('不应该是只读', () => {
      expect(testCommand.readOnly).toBeFalsy();
    });
  });

  describe('explainCommand', () => {
    it('应该有正确的名称', () => {
      expect(explainCommand.name).toBe('explain');
    });

    it('应该标记为只读', () => {
      expect(explainCommand.readOnly).toBe(true);
    });
  });

  describe('refactorCommand', () => {
    it('应该有正确的名称', () => {
      expect(refactorCommand.name).toBe('refactor');
    });

    it('不应该是只读', () => {
      expect(refactorCommand.readOnly).toBeFalsy();
    });
  });
});
