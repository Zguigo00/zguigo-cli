import type { Command } from '../protocol.js';

/** 内置 /review 命令 - 代码审查 */
export const reviewCommand: Command = {
  name: 'review',
  description: '审查代码质量、找出潜在问题',
  readOnly: true,
  source: 'builtin',
  instruction: `你是一个代码审查专家。请按以下步骤审查目标代码：

1. 先读取相关代码文件
2. 检查代码风格、潜在 bug、安全问题
3. 给出改进建议
4. 每个问题标注严重程度（高/中/低）

只读取代码，不要修改任何文件。

目标：$ARGUMENTS`,
};
