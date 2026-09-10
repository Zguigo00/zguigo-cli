/**
 * 浮动命令菜单
 *
 * 使用 blessed List 组件实现悬浮在输入框上方的命令选择菜单
 * - 输入 `/` 自动弹出
 * - ↑↓ 方向键切换选中项
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

/** ANSI 颜色常量 */
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * 命令菜单组件
 *
 * 生命周期：
 * 1. 构造时创建 blessed List（初始隐藏）
 * 2. open() 显示菜单，填充命令列表
 * 3. updateFilter() 随用户输入过滤命令
 * 4. 用户通过 ↑↓/Enter/ESC 交互
 * 5. select 事件传出选中的命令
 */
export class CommandMenu {
  private list: blessed.Widgets.ListElement;
  private screen: blessed.Widgets.Screen;
  private allCommands: CommandItem[] = [];
  private filteredCommands: CommandItem[] = [];
  private selectedIndex = 0;
  private filterText = '';
  private visible = false;

  /** 选中命令时触发 */
  onSelect: ((command: CommandItem) => void) | null = null;

  constructor(screen: blessed.Widgets.Screen, bottomOffset: number) {
    this.screen = screen;

    // 创建浮动列表，定位在输入框上方
    this.list = blessed.list({
      parent: screen,
      label: ' 命令 ',
      bottom: bottomOffset,      // 紧贴输入框上方
      left: 0,
      width: 'shrink',
      height: 0,                 // 动态调整
      keys: false,               // 按键由 screen.on('keypress') 统一处理
      mouse: true,
      interactive: false,        // 不使用内置按键，手动控制
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
      hidden: true,
      tags: true,                // 启用颜色标签
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
    this.applyFilter();
    this.list.show();
    this.screen.render();
  }

  /** 关闭菜单 */
  close(): void {
    this.visible = false;
    this.list.hide();
    this.screen.render();
  }

  /** 菜单是否可见 */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * 更新过滤文本
   * 用户在输入框中键入的字符会同步到这里过滤命令列表
   */
  updateFilter(text: string): void {
    this.filterText = text.toLowerCase();
    this.selectedIndex = 0;
    this.applyFilter();
    this.screen.render();
  }

  /** 方向键上 */
  moveUp(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
    this.list.select(this.selectedIndex);
    this.screen.render();
  }

  /** 方向键下 */
  moveDown(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.list.select(this.selectedIndex);
    this.screen.render();
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

  /** 获取当前选中的命令（不关闭菜单） */
  getSelected(): CommandItem | null {
    if (this.filteredCommands.length === 0) return null;
    return this.filteredCommands[this.selectedIndex] ?? null;
  }

  /**
   * 应用过滤并更新列表渲染
   * 过滤逻辑：命令名或描述包含过滤文本
   */
  private applyFilter(): void {
    // 过滤命令
    if (this.filterText) {
      this.filteredCommands = this.allCommands.filter(cmd =>
        cmd.name.toLowerCase().includes(this.filterText) ||
        cmd.description.toLowerCase().includes(this.filterText)
      );
    } else {
      this.filteredCommands = [...this.allCommands];
    }

    // 确保选中索引在范围内
    if (this.selectedIndex >= this.filteredCommands.length) {
      this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
    }

    // 渲染列表项（带颜色标签）
    const items = this.filteredCommands.map(cmd => {
      const readOnlyTag = cmd.readOnly ? ` ${DIM}[只读]${RESET}` : '';
      const nameCol = `/${cmd.name}`.padEnd(16);
      return `${GREEN}${nameCol}${RESET}${DIM}${cmd.description}${RESET}${readOnlyTag}`;
    });

    // 空列表时显示提示
    if (items.length === 0) {
      this.list.setItems(['  (无匹配命令)']);
    } else {
      this.list.setItems(items);
    }

    // 动态调整菜单高度（最多显示8项，最少1项）
    const displayCount = Math.min(Math.max(this.filteredCommands.length, 1), 8);
    this.list.height = displayCount + 2; // +2 是边框

    // 保持选中状态
    if (this.filteredCommands.length > 0) {
      this.list.select(this.selectedIndex);
    }
  }
}
