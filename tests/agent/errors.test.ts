import { describe, it, expect } from 'vitest';
import { ConfigError, ToolError, ModelError } from '../../src/errors/index.js';

describe('自定义错误类型', () => {
  it('ConfigError', () => {
    const err = new ConfigError('缺少 API Key');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.name).toBe('ConfigError');
    expect(err.message).toBe('缺少 API Key');
  });

  it('ToolError', () => {
    const err = new ToolError('文件不存在');
    expect(err.name).toBe('ToolError');
    expect(err.message).toBe('文件不存在');
  });

  it('ModelError', () => {
    const err = new ModelError('模型超时');
    expect(err.name).toBe('ModelError');
    expect(err.message).toBe('模型超时');
  });
});
