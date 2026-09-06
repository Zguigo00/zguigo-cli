import type { Command } from '../protocol.js';

/** 内置 /test 命令 - 生成测试 */
export const testCommand: Command = {
  name: 'test',
  description: '为指定代码生成单元测试',
  source: 'builtin',
  instruction: `你是一个测试工程师。请按以下步骤为代码生成测试：

1. 先读取目标代码文件
2. 分析函数的输入输出和边界情况
3. 使用 vitest 编写测试文件
4. 测试应覆盖：正常路径、边界条件、错误处理

测试文件放在 tests/ 目录下，命名与源文件对应。

目标：$ARGUMENTS`,
};
