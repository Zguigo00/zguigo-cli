/** 任务状态 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/** 任务定义 */
export interface Task {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 依赖的任务 ID 列表 */
  dependencies: string[];
  /** 执行结果 */
  result?: string;
  /** 失败原因 */
  error?: string;
  /** 跳过原因 */
  skipReason?: string;
}

/** 任务计划 */
export interface TaskPlan {
  /** 任务列表 */
  tasks: Task[];
  /** 原始任务描述 */
  originalTask: string;
}
