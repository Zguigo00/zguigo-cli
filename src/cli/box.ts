/**
 * 对话框渲染器
 * 缓冲 assistant 的流式文本，回复结束后用 Unicode 边框一次性渲染
 * 等待期间显示动态思考动画
 */

/** CJK 字符范围，这些字符在终端中占 2 个宽度 */
const CJK_RANGES = [
  [0x4E00, 0x9FFF],   // CJK 统一汉字
  [0x3000, 0x303F],   // CJK 标点
  [0xFF00, 0xFFEF],   // 全角字符
  [0x3400, 0x4DBF],   // CJK 扩展 A
  [0x2E80, 0x2EFF],   // CJK 部首
  [0xF900, 0xFAFF],   // CJK 兼容
  [0x2F00, 0x2FDF],   // 康熙部首
  [0xFE30, 0xFE4F],   // CJK 兼容形式
  [0x20000, 0x2A6DF], // CJK 扩展 B
];

/**
 * 判断字符是否为 CJK 字符
 */
function isCJK(char: string): boolean {
  const code = char.codePointAt(0)!;
  return CJK_RANGES.some(([start, end]) => code >= start && code <= end);
}

/**
 * 计算字符串在终端中的显示宽度
 * CJK 字符占 2 个宽度，ASCII 字符占 1 个宽度
 */
function getStringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    width += isCJK(char) ? 2 : 1;
  }
  return width;
}

/**
 * 按显示宽度对字符串进行换行
 * 考虑 CJK 字符的双宽度特性
 */
function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [''];
  if (maxWidth <= 0) return [text];

  const lines: string[] = [];

  for (const rawLine of text.split('\n')) {
    if (getStringWidth(rawLine) <= maxWidth) {
      lines.push(rawLine);
      continue;
    }

    // 逐字符换行
    let currentLine = '';
    let currentWidth = 0;

    for (const char of rawLine) {
      const charWidth = isCJK(char) ? 2 : 1;

      // 如果加入这个字符会超出宽度，先换行
      if (currentWidth + charWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = '';
        currentWidth = 0;
      }

      currentLine += char;
      currentWidth += charWidth;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * 思考动画帧
 */
const THINKING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** ANSI 颜色 */
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

/** 内容区域宽度（两边边框 + padding = 6） */
const CONTENT_WIDTH_RATIO = 0.85;

/**
 * 对话框渲染器
 *
 * 用法：
 * 1. startThinking() - 开始显示思考动画
 * 2. addText(chunk) - 缓冲流式文本（首次文本到达自动停止动画）
 * 3. toolCall() - 渲染已缓冲文本 + 显示工具调用
 * 4. render() - 渲染最终边框
 *
 * 无文本内容时不渲染边框。
 */
export class BoxRenderer {
  private content = '';
  private thinkingInterval: ReturnType<typeof setInterval> | null = null;
  private thinkingFrameIndex = 0;
  private state: 'idle' | 'thinking' | 'done' = 'idle';
  private terminalWidth: number;

  constructor() {
    this.terminalWidth = process.stdout.columns || 80;
  }

  /**
   * 开始显示思考动画
   */
  startThinking(): void {
    if (this.state === 'thinking') return;
    this.state = 'thinking';
    this.thinkingFrameIndex = 0;

    const frame = THINKING_FRAMES[0];
    process.stdout.write(`\n${CYAN}${BOLD}${frame} 思考中...${RESET}\r`);

    this.thinkingInterval = setInterval(() => {
      this.thinkingFrameIndex = (this.thinkingFrameIndex + 1) % THINKING_FRAMES.length;
      const frame = THINKING_FRAMES[this.thinkingFrameIndex];
      process.stdout.write(`${CYAN}${BOLD}${frame} 思考中...${RESET}\r`);
    }, 100);
  }

  /**
   * 停止思考动画
   */
  private stopThinking(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    // 清除思考行
    process.stdout.write('\r\x1b[K');
    this.state = 'done';
  }

  /**
   * 缓冲流式文本
   * 首次文本到达时自动停止思考动画
   */
  addText(chunk: string): void {
    if (this.state === 'thinking') {
      this.stopThinking();
    }
    this.content += chunk;
  }

  /**
   * 处理工具调用
   * 先渲染已缓冲的文本，再显示工具信息
   */
  toolCall(name: string, args: string): void {
    if (this.content) {
      this.render();
    }
    // 显示工具调用信息
    const argsDisplay = args.length > 100 ? args.slice(0, 100) + '...' : args;
    console.log(`\n  ${MAGENTA}⚙ ${name}(${argsDisplay})${RESET}`);
  }

  /**
   * 渲染最终边框
   * 如果没有内容则不渲染
   */
  render(): void {
    if (!this.content.trim()) return;

    this.stopThinking();

    const boxWidth = Math.min(
      Math.floor(this.terminalWidth * CONTENT_WIDTH_RATIO),
      100,
    );
    const contentWidth = boxWidth - 4; // 减去 "│ " + " │"

    // 渲染边框
    const top = `${CYAN}╭${'─'.repeat(boxWidth - 2)}╮${RESET}`;
    const bottom = `${CYAN}╰${'─'.repeat(boxWidth - 2)}╯${RESET}`;

    console.log(`\n${top}`);

    // 处理文本内容：按段落分割
    const textLines = this.content.split('\n');
    for (const line of textLines) {
      const wrapped = wrapText(line, contentWidth);
      for (const subLine of wrapped) {
        const lineWidth = getStringWidth(subLine);
        const padding = Math.max(0, contentWidth - lineWidth);
        const paddedLine = subLine + ' '.repeat(padding);
        console.log(`${CYAN}│${RESET} ${DIM}${paddedLine}${RESET} ${CYAN}│${RESET}`);
      }
    }

    console.log(`${bottom}`);

    // 重置状态
    this.content = '';
    this.state = 'idle';
  }

  /**
   * 获取当前状态
   */
  get isThinking(): boolean {
    return this.state === 'thinking';
  }

  get hasContent(): boolean {
    return this.content.length > 0;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
  }
}
