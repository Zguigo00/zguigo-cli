import { execFileSync } from 'child_process';
import type { SnapshotEntry, SnapshotManager } from './protocol.js';

/**
 * 基于 Git 的快照管理器
 *
 * 每次写入工具执行前自动创建 commit，支持回滚和撤销
 */
export class GitSnapshot implements SnapshotManager {
  private projectRoot: string;
  private snapshots: SnapshotEntry[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  isGitRepo(): boolean {
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  async createSnapshot(description: string): Promise<string> {
    if (!this.isGitRepo()) {
      throw new Error('当前目录不是 Git 仓库');
    }

    try {
      // 暂存所有变更
      execFileSync('git', ['add', '-A'], { cwd: this.projectRoot, stdio: 'pipe' });

      // 检查是否有变更
      try {
        execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: this.projectRoot, stdio: 'pipe' });
        // 没有变更，跳过
        const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: this.projectRoot,
          stdio: 'pipe',
        }).toString().trim();
        return hash;
      } catch {
        // 有变更，继续提交
      }

      // 创建 commit（使用数组参数避免 shell 注入）
      const msg = `zguigo: ${description}`;
      execFileSync('git', ['commit', '-m', msg], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });

      const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      }).toString().trim();

      this.snapshots.push({
        hash,
        message: description,
        timestamp: Date.now(),
      });

      return hash;
    } catch (err) {
      throw new Error(`创建快照失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async rollbackTo(commitHash: string): Promise<void> {
    if (!this.isGitRepo()) {
      throw new Error('当前目录不是 Git 仓库');
    }

    try {
      execFileSync('git', ['reset', '--hard', commitHash], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
    } catch (err) {
      throw new Error(`回滚失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async undo(): Promise<void> {
    if (!this.isGitRepo()) {
      throw new Error('当前目录不是 Git 仓库');
    }

    try {
      execFileSync('git', ['reset', '--hard', 'HEAD~1'], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
      this.snapshots.pop();
    } catch (err) {
      throw new Error(`撤销失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getHistory(limit: number = 20): Promise<SnapshotEntry[]> {
    if (!this.isGitRepo()) return [];

    try {
      const output = execFileSync(
        'git',
        ['log', '--oneline', `-${limit}`, '--format=%H|%s|%at', '--grep=^zguigo:'],
        { cwd: this.projectRoot, stdio: 'pipe' }
      ).toString().trim();

      if (!output) return [];

      return output.split('\n').filter(Boolean).map(line => {
        const [hash, message, timestamp] = line.split('|');
        return {
          hash,
          message: message.replace(/^zguigo:\s*/, ''),
          timestamp: parseInt(timestamp) * 1000,
        };
      });
    } catch {
      return [];
    }
  }
}
