import type { Command } from '../protocol.js';

/** 内置 /explain 命令 - 解释代码 */
export const explainCommand: Command = {
  name: 'explain',
  description: '详细解释指定代码的功能和逻辑',
  readOnly: true,
  source: 'builtin',
  instruction: `你是一个编程教师。请用通俗易懂的方式解释代码：

1. 先读取代码文件
2. 说明整体功能和用途
3. 逐段解释关键逻辑
4. 指出值得注意的设计模式或技巧

用中文解释，适合初中级开发者理解。只读取代码，不要修改任何文件。

目标：$ARGUMENTS`,
};
