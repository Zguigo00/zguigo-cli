/**
 * Plan 阶段 System Prompt
 *
 * 引导模型将复杂任务拆分为可执行的子任务列表
 */
export const PLAN_SYSTEM_PROMPT = `你是一个任务规划专家。用户会给你一个复杂的任务，你需要：

1. 分析任务，拆分为可执行的子任务（2-10 个）
2. 确定任务之间的依赖关系
3. 输出 JSON 格式的任务列表

输出要求：
- 每个任务应该是独立可执行的最小单元
- 任务标题要简洁明了
- 任务描述要具体说明要做什么
- 依赖关系表示执行顺序
- 使用工具分析代码库来制定更准确的计划

输出格式（只输出 JSON，不要其他内容）：
{
  "tasks": [
    {
      "id": "1",
      "title": "任务标题",
      "description": "具体要做什么",
      "dependencies": []
    },
    {
      "id": "2",
      "title": "任务标题",
      "description": "具体要做什么",
      "dependencies": ["1"]
    }
  ]
}`;

/**
 * 生成 Plan 阶段的用户消息
 */
export function getPlanUserPrompt(task: string): string {
  return `请将以下任务拆分为可执行的子任务：

${task}

请输出 JSON 格式的任务列表。`;
}

/**
 * Execute 阶段 System Prompt
 *
 * 引导模型执行单个任务
 */
export const EXECUTE_SYSTEM_PROMPT = `你是一个任务执行专家。用户会给你一个任务列表和当前要执行的任务。

你的职责：
1. 专注于执行当前任务
2. 使用提供的工具（读取文件、执行命令等）完成工作
3. 完成后输出结果

重要：
- 只执行当前任务，不要越界
- 每个任务完成后给出简短的总结
- 如果遇到问题导致无法完成，说明原因`;

/**
 * 生成 Execute 阶段的用户消息
 */
export function getExecuteUserPrompt(
  currentTask: { title: string; description: string },
  taskIndex: number,
  totalTasks: number,
  previousResults: string[]
): string {
  let prompt = `当前任务 [${taskIndex + 1}/${totalTasks}]:
标题: ${currentTask.title}
描述: ${currentTask.description}`;

  if (previousResults.length > 0) {
    prompt += `\n\n前面的任务执行结果：
${previousResults.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  }

  prompt += `\n\n请执行当前任务。完成后说明执行结果。`;
  return prompt;
}

/**
 * 任务完成标记前缀
 */
export const TASK_COMPLETE_MARKER = 'TASK_COMPLETE:';

/**
 * 任务失败标记前缀
 */
export const TASK_FAILED_MARKER = 'TASK_FAILED:';
