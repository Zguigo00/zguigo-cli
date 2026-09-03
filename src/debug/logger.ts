/**
 * 调试日志器
 * 所有调试信息写入 stderr，不干扰正常输出
 */
export class DebugLogger {
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(message: string): void {
    if (!this.enabled) return;
    process.stderr.write(`[debug] ${message}\n`);
  }

  toolCall(name: string, args: string): void {
    if (!this.enabled) return;
    process.stderr.write(`[debug] 🔧 工具调用: ${name}\n`);
    process.stderr.write(`[debug]    参数: ${args}\n`);
  }

  toolResult(name: string, success: boolean, size: number, elapsed: number): void {
    if (!this.enabled) return;
    const icon = success ? '✅' : '❌';
    process.stderr.write(`[debug] ${icon} 工具结果: ${name} (${size} 字节, ${elapsed}ms)\n`);
  }

  iteration(number: number): void {
    if (!this.enabled) return;
    process.stderr.write(`\n[debug] ═══ 第 ${number} 轮 ═══\n`);
  }

  error(message: string): void {
    if (!this.enabled) return;
    process.stderr.write(`[debug] ❌ 错误: ${message}\n`);
  }

  stop(reason: string): void {
    if (!this.enabled) return;
    process.stderr.write(`[debug] 🛑 停止: ${reason}\n`);
  }
}
