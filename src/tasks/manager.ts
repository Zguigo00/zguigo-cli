import { randomUUID } from 'node:crypto';
import type { Task, TaskStatus, TaskPlan } from './protocol.js';

/**
 * 任务管理器
 *
 * 管理任务列表的生命周期：添加、更新状态、遍历
 */
export class TaskManager {
  private tasks: Task[] = [];
  private currentIndex: number = -1;
  private originalTask: string = '';

  /** 获取任务数量 */
  get count(): number {
    return this.tasks.length;
  }

  /** 获取所有任务 */
  getTasks(): Task[] {
    return [...this.tasks];
  }

  /** 获取当前任务 */
  getCurrentTask(): Task | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.tasks.length) {
      return this.tasks[this.currentIndex];
    }
    return null;
  }

  /** 获取当前任务索引 */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /** 获取原始任务描述 */
  getOriginalTask(): string {
    return this.originalTask;
  }

  /** 设置原始任务描述 */
  setOriginalTask(task: string): void {
    this.originalTask = task;
  }

  /**
   * 添加任务
   * @returns 新创建的任务
   */
  addTask(title: string, description: string, dependencies: string[] = []): Task {
    const task: Task = {
      id: randomUUID().slice(0, 8),
      title,
      description,
      status: 'pending',
      dependencies,
    };
    this.tasks.push(task);
    return task;
  }

  /**
   * 从 TaskPlan 加载任务
   */
  loadFromPlan(plan: TaskPlan): void {
    this.tasks = plan.tasks.map(t => ({
      ...t,
      id: t.id || randomUUID().slice(0, 8),
      status: 'pending' as TaskStatus,
    }));
    this.originalTask = plan.originalTask;
    this.currentIndex = -1;
  }

  /**
   * 推进到下一个待执行的任务
   * @returns 下一个任务，如果没有则返回 null
   */
  nextTask(): Task | null {
    // 查找下一个 pending 状态的任务
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      if (task.status === 'pending') {
        // 检查依赖是否都已完成
        if (this.areDependenciesMet(task)) {
          this.currentIndex = i;
          task.status = 'in_progress';
          return task;
        }
      }
    }
    return null;
  }

  /**
   * 检查任务依赖是否满足
   */
  private areDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }
    return task.dependencies.every(depId => {
      const dep = this.tasks.find(t => t.id === depId);
      return dep && dep.status === 'completed';
    });
  }

  /**
   * 标记当前任务为完成
   */
  completeCurrentTask(result?: string): Task | null {
    const task = this.getCurrentTask();
    if (task) {
      task.status = 'completed';
      task.result = result;
    }
    return task;
  }

  /**
   * 标记当前任务为失败
   */
  failCurrentTask(error: string): Task | null {
    const task = this.getCurrentTask();
    if (task) {
      task.status = 'failed';
      task.error = error;
    }
    return task;
  }

  /**
   * 跳过当前任务
   */
  skipCurrentTask(reason?: string): Task | null {
    const task = this.getCurrentTask();
    if (task) {
      task.status = 'skipped';
      task.skipReason = reason;
    }
    return task;
  }

  /**
   * 更新指定任务的状态
   */
  updateStatus(taskId: string, status: TaskStatus, detail?: string): boolean {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return false;

    task.status = status;
    if (status === 'completed') task.result = detail;
    if (status === 'failed') task.error = detail;
    if (status === 'skipped') task.skipReason = detail;
    return true;
  }

  /**
   * 在指定位置插入任务
   */
  insertTask(index: number, title: string, description: string): Task {
    const task: Task = {
      id: randomUUID().slice(0, 8),
      title,
      description,
      status: 'pending',
      dependencies: [],
    };
    this.tasks.splice(index, 0, task);
    // 调整 currentIndex
    if (this.currentIndex >= index) {
      this.currentIndex++;
    }
    return task;
  }

  /**
   * 删除指定任务
   */
  removeTask(taskId: string): boolean {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    this.tasks.splice(index, 1);
    // 调整 currentIndex
    if (this.currentIndex >= index) {
      this.currentIndex--;
    }
    return true;
  }

  /**
   * 检查是否所有任务都已完成
   */
  isAllDone(): boolean {
    return this.tasks.every(t =>
      t.status === 'completed' || t.status === 'skipped'
    );
  }

  /**
   * 检查是否有失败的任务
   */
  hasFailedTasks(): boolean {
    return this.tasks.some(t => t.status === 'failed');
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; completed: number; failed: number; skipped: number; pending: number } {
    return {
      total: this.tasks.length,
      completed: this.tasks.filter(t => t.status === 'completed').length,
      failed: this.tasks.filter(t => t.status === 'failed').length,
      skipped: this.tasks.filter(t => t.status === 'skipped').length,
      pending: this.tasks.filter(t => t.status === 'pending').length,
    };
  }

  /**
   * 重置任务管理器
   */
  clear(): void {
    this.tasks = [];
    this.currentIndex = -1;
    this.originalTask = '';
  }
}
