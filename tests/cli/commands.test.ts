import { describe, it, expect } from 'vitest';
import { handleCommand, commands } from '../../src/cli/commands.js';

describe('内置命令', () => {
  it('/help 返回 true', async () => {
    const result = await handleCommand('/help', {
      messages: [],
      clearMessages: () => {},
    });
    expect(result).toBe(true);
  });

  it('/clear 清空消息', async () => {
    const messages = [{ role: 'user' as const, content: 'test' }];
    let cleared = false;

    await handleCommand('/clear', {
      messages,
      clearMessages: () => {
        messages.length = 0;
        cleared = true;
      },
    });

    expect(cleared).toBe(true);
  });

  it('未知命令返回 false', async () => {
    const result = await handleCommand('hello', {
      messages: [],
      clearMessages: () => {},
    });
    expect(result).toBe(false);
  });

  it('命令数量正确', () => {
    expect(commands.length).toBe(5);
  });
});
