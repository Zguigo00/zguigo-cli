# 测试机制

## 运行方式

```bash
# 运行所有测试
npm test

# 运行单个测试文件
npx vitest run tests/context/compress.test.ts

# 监听模式（改代码自动重跑）
npm run test:watch
```

## 测试框架：Vitest

项目用 **Vitest**（和 Vite 配套的测试工具），配置在 `vitest.config.ts`：

```ts
test: {
  globals: true,                    // describe/it/expect 自动可用，不用 import
  include: ['tests/**/*.test.ts'],  // 所有 tests/ 下的 .test.ts 文件
}
```

## 测试文件结构

```
tests/
├── agent/
│   ├── errors.test.ts      # 错误处理测试
│   └── loop.test.ts        # Agent 循环测试
├── cli/
│   └── commands.test.ts    # REPL 命令测试
├── context/
│   └── compress.test.ts    # 上下文压缩测试
└── tools/
    ├── read-files.test.ts  # 文件读取工具测试
    └── safety.test.ts      # 路径安全测试
```

## 测试怎么写

以 `tests/context/compress.test.ts` 为例：

```ts
import { describe, it, expect, vi } from 'vitest';
import { estimateTokens } from '../../src/context/index.js';

describe('estimateTokens', () => {       // 分组
  it('空字符串返回 0', () => {           // 一个测试用例
    expect(estimateTokens('')).toBe(0);  // 断言
  });

  it('纯英文文本', () => {
    expect(estimateTokens('hello')).toBe(2);
  });
});
```

## Mock（模拟）

测试中不需要真的调用模型 API，用 `vi.fn()` 模拟：

```ts
// 创建假的 ModelClient
const client: ModelClient = {
  chat: vi.fn().mockResolvedValue({
    content: '模拟的摘要内容',
    tool_calls: [],
    stop_reason: 'stop',
  }),
  chatStream: vi.fn(),
};

// 用这个假 client 测试压缩逻辑
const result = await compressMessages(messages, client, config);
expect(result.compressed).toBe(true);
```

## 测试覆盖的内容

| 测试文件 | 测什么 |
|---------|-------|
| `loop.test.ts` | Agent 循环能否正常调用模型、处理工具调用、处理错误 |
| `commands.test.ts` | `/help`、`/clear`、`/compact` 命令是否正确执行 |
| `compress.test.ts` | token 估算、压缩触发、压缩结果、边界情况 |
| `read-files.test.ts` | 读文件、路径越界拦截、文件不存在处理 |
| `safety.test.ts` | 路径安全检查，防止 `../` 越界访问 |

## 测试的好处

- 改代码后跑一下 `npm test`，**44个测试全绿就说明没破坏功能**
- 不用每次手动启动 CLI 测试，自动化验证
