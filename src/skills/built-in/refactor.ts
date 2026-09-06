import type { Command } from '../protocol.js';

/** 内置 /refactor 命令 - 重构代码 */
export const refactorCommand: Command = {
  name: 'refactor',
  description: '重构代码，提升可读性和可维护性',
  source: 'builtin',
  instruction: `你是一个代码重构专家。请按以下步骤重构代码：

1. 先读取并分析现有代码
2. 识别代码异味（重复、过长函数、深层嵌套等）
3. 提出重构方案并解释原因
4. 执行重构，确保功能不变
5. 重构后说明改动点

目标：$ARGUMENTS`,
};
