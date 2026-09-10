/**
 * 浮动命令菜单
 *
 * 使用 blessed Box 手动渲染命令列表（不依赖 blessed.list 的内部状态管理）
 * - 输入 `/` 自动弹出
 * - ↑↓ 方向键切换选中项（高亮行）
 * - 回车选中命令，ESC 关闭
 * - 支持输入过滤
 */

import blessed from 'blessed';

/** 命令提供者接口 —— 由外部注入，菜单不硬编码任何命令 */
export interface CommandProvider {
  getCommands(): CommandItem[];
}

/** 命令条目 */
export interface CommandItem {
  name: string;
  description: string;
  readOnly?: boolean;
}

/** 菜单最大显示行数 */
const MAX_VISIBLE = 8;

/**
 * 命令菜单组件
 *
 * 使用 blessed.box + setContent 手动渲染每行，
 * 选中行用反转色标记，不依赖 blessed.list 的内置选择逻辑。
 */
export class CommandMenu {
  private box: blessed.Widgets.BoxElement;
  private allCommands: CommandItem[] = [];
  private filteredCommands: CommandItem[] = [];
  private selectedIndex = 0;
  private filterText = '';
  private visible = false;

  /** 选中命令时触发 */
  onSelect: ((command: CommandItem) => void) | null = null;

  constructor(screen: blessed.Widgets.Screen, bottomOffset: number) {
    this.box = blessed.box({
      parent: screen,
      label: ' 命令 ',
      bottom: bottomOffset,
      left: 0,
      width: 50,
      height: 3,        // 初始高度，open() 时动态调整
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
      },
      hidden: true,
      tags: true,         // 启用 {bold} 等标签
      wrap: false,
    });
  }

  /**
   * 打开菜单
   * @param provider 命令来源（动态获取，不硬编码）
   */
  open(provider: CommandProvider): void {
    this.allCommands = provider.getCommands();
    this.filterText = '';
    this.selectedIndex = 0;
    this.visible = true;
    this.renderContent();
    this.box.show();
    this.box.focus();
  }

  /** 关闭菜单 */
  close(): void {
    this.visible = false;
    this.box.hide();
  }

  /** 菜单是否可见 */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * 更新过滤文本
   */
  updateFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this.selectedIndex = 0;
    this.renderContent();
  }

  /** 方向键上 */
  moveUp(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
    this.renderContent();
  }

  /** 方向键下 */
  moveDown(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.renderContent();
  }

  /** 确认选中当前项 */
  confirm(): void {
    if (this.filteredCommands.length === 0) {
      this.close();
      return;
    }
    const selected = this.filteredCommands[this.selectedIndex];
    this.close();
    if (selected && this.onSelect) {
      this.onSelect(selected);
    }
  }

  /**
   * 手动渲染菜单内容
   * 用反转色标记选中行，不依赖 blessed.list 内部逻辑
   */
  private renderContent(): void {
    // 过滤命令
    if (this.filterText) {
      this.filteredCommands = this.allCommands.filter(cmd =>
        cmd.name.toLowerCase().includes(this.filterText) ||
        cmd.description.toLowerCase().includes(this.filterText)
      );
    } else {
      this.filteredCommands = [...this.allCommands];
    }

    // 边界检查
    if (this.selectedIndex >= this.filteredCommands.length) {
      this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
    }

    // 渲染每一行，选中行用反转色
    const lines: string[] = [];
    const displayCount = Math.min(this.filteredCommands.length, MAX_VISIBLE);

    if (displayCount === 0) {
      lines.push('  (无匹配命令)');
    } else {
      for (let i = 0; i < displayCount; i++) {
        const cmd = this.filteredCommands[i];
        const selected = i === this.selectedIndex;
        const readOnlyTag = cmd.readOnly ? ' [只读]' : '';
        const nameStr = ` /${cmd.name}`;
        const descStr = `  ${cmd.description}${readOnlyTag}`;

        if (selected) {
          // 选中行：反转色高亮
          lines.push(`{white-bg}{black-fg}{bold}${nameStr}{/bold}${descStr}{/white-bg}{/black-fg}`);
        } else {
          lines.push(`{green-fg}${nameStr}{/green-fg}{white-fg}${descStr}{/white-fg}`);
        }
      }
    }

    // 设置内容和高度
    const contentHeight = Math.max(displayCount, 1);
    this.box.height = contentHeight + 2; // +2 是上下边框
    this.box.setContent(lines.join('\n'));
  }
}
