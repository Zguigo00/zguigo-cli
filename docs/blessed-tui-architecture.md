# blessed TUI 架构

## 概述

zguigo 的 REPL 交互层从 readline 迁移到 blessed 终端 UI 库，实现全屏 TUI 界面。

### 迁移动机

| 问题 | readline 方案 | blessed 方案 |
|------|--------------|-------------|
| 命令选择 | 编号列表 + 输入数字 | ↑↓ 方向键浮动菜单 |
| 输出控制 | 直接 console.log | 统一 writeLine 回调 |
| 布局 | 无（单行输入） | 可滚动日志区 + 固定输入框 + 浮动菜单 |
| 终端 resize | 手动监听 | blessed 内建处理 |

## 界面布局

```
┌─────────────────────────────────┐
│  logBox（可滚动输出区）            │  blessed.log
│  占满输入框以上的全部空间            │
│  assistant 回复、工具输出、命令结果  │
│  支持鼠标滚轮滚动                  │
├─────────────────────────────────┤
│  CommandMenu（浮动菜单）           │  blessed.list
│  ┌───────────────────────┐      │  输入 / 时弹出
│  │ /help    显示帮助信息   │      │
│  │ /review  代码审查      │      │  支持过滤、↑↓导航
│  │ /test    生成测试      │      │  Enter 选中、ESC 关闭
│  └───────────────────────┘      │
├─────────────────────────────────┤
│  inputBox（输入框）               │  blessed.box
│  你> █                          │  逐字符捕获键盘输入
└─────────────────────────────────┘
```

## 文件结构

```
src/cli/
├── repl.ts           # 主循环：blessed screen + 按键路由 + Agent 调用
├── command-menu.ts   # 浮动命令菜单组件（CommandProvider 接口）
├── plan-runner.ts    # /plan 和 /run 的执行逻辑
├── box.ts            # 对话框渲染器（Unicode 边框包裹 assistant 回复）
├── commands.ts       # 20 个内置命令定义
└── index.ts          # 公共导出
```

## 核心组件

### 1. CommandMenu（浮动命令菜单）

**文件**: `src/cli/command-menu.ts`

```
CommandProvider 接口 ──→ 外部注入命令列表
                        菜单本身不硬编码任何命令

CommandMenu 类
  ├── open(provider)     # 显示菜单，填充命令列表
  ├── close()            # 隐藏菜单
  ├── updateFilter(text) # 根据输入过滤命令
  ├── moveUp() / moveDown() # 方向键导航
  ├── confirm()          # Enter 确认选中
  └── onSelect callback  # 选中后通知外部
```

**CommandProvider 接口**（动态命令来源）:

```typescript
interface CommandProvider {
  getCommands(): CommandItem[];
}

interface CommandItem {
  name: string;        // 命令名（不含 /）
  description: string; // 命令描述
  readOnly?: boolean;  // 是否只读
}
```

REPL 启动时注入实现，从 CommandRegistry + 内置命令动态获取：

```typescript
const commandProvider: CommandProvider = {
  getCommands(): CommandItem[] {
    const builtinItems = commandNames.map(name => ({
      name: name.replace(/^\//, ''),
      description: '',
    }));
    const skillItems = allSkillCommands.map(c => ({
      name: c.name,
      description: c.description,
      readOnly: c.readOnly,
    }));
    return [...builtinItems, ...skillItems];
  },
};
```

**过滤逻辑**：命令名或描述包含过滤文本（不区分大小写）

**blessed List 配置要点**：
- `keys: false` — 不使用内置按键，由 screen.on('keypress') 统一处理
- `interactive: false` — 手动控制选中状态
- `hidden: true` — 初始隐藏
- `tags: true` — 启用 ANSI 颜色标签
- `height` 动态调整（最多显示 8 项 + 2 行边框）

### 2. blessed Screen（主屏幕）

**文件**: `src/cli/repl.ts`

```typescript
const screen = blessed.screen({
  smartCSR: true,      // 优化滚动渲染
  title: 'zguigo',     // 终端标题
  fullUnicode: true,   // 完整 Unicode 支持（CJK 字符）
});
```

**三个子组件**：

| 组件 | 类型 | 位置 | 用途 |
|------|------|------|------|
| logBox | `blessed.log` | `top:0, height:100%-3` | 可滚动输出 |
| inputBox | `blessed.box` | `bottom:0, height:3` | 输入框 + label |
| commandMenu | `blessed.list` | `bottom:3` | 浮动命令菜单 |

### 3. 输入系统

**不使用 blessed.textbox**，原因：textbox 的 `grabKeys` 会劫持所有按键（包括方向键），导致无法在菜单可见时将方向键路由到菜单。

**替代方案**：`screen.on('keypress')` 全局按键监听 + 手动管理输入缓冲区

```typescript
let inputBuffer = '';  // 手动维护的输入缓冲区

screen.on('keypress', (ch, key) => {
  // 根据菜单状态路由按键
});
```

**按键路由逻辑**：

```
keypress 事件
  ├── 确认模式？ → 只接受 y/n
  ├── 菜单可见？
  │   ├── up/down → 菜单导航
  │   ├── Enter  → 菜单选中
  │   ├── ESC    → 关闭菜单
  │   └── 普通字符 → 更新缓冲区 + 菜单过滤
  └── 菜单隐藏？
      ├── Ctrl+C  → 退出程序
      ├── Enter   → 提交输入
      ├── / (空缓冲区) → 打开菜单
      ├── Backspace → 删除字符
      ├── Ctrl+U   → 清空输入
      ├── Ctrl+L   → 清屏
      └── 普通字符 → 追加到缓冲区
```

**输入流程**：

1. 用户输入 `/` → `inputBuffer = '/'`，菜单弹出，显示所有命令
2. 继续输入 `re` → `inputBuffer = '/re'`，菜单过滤到 `/review`、/refactor`
3. ↑↓ 选中 `/review`，Enter → `inputBuffer = '/review '`，菜单关闭
4. 输入参数 `src/app.ts` → `inputBuffer = '/review src/app.ts'`
5. Enter → 提交到主循环处理

### 4. 输出系统（writeLine）

所有输出通过统一的 `writeLine` 回调：

```typescript
const writeLine = (text: string) => {
  logBox.add(text);        // 添加到日志区
  logBox.setScrollPerc(100); // 自动滚动到底部
  screen.render();          // 触发重绘
};
```

**传递路径**：

```
writeLine
  ├── BoxRenderer 构造函数    → 对话框边框渲染
  ├── handleCommand(ctx)      → 命令输出（ctx.logLine）
  ├── handlePlanCommand(ctx)  → Plan 模式输出（ctx.logLine）
  ├── handleRunCommand(ctx)   → Run 模式输出（ctx.logLine）
  └── 直接调用                → 版本信息、错误提示等
```

**向下兼容**：`logLine` 在 CommandContext 和 PlanRunContext 中是可选字段，
不传时 fallback 到 `console.log`，不影响非 blessed 环境（如测试）。

### 5. 思考动画

**readline 方案**：`process.stdout.write` 直接写 ANSI 码 + setInterval

**blessed 方案**：更新 inputBox 的 label

```typescript
const boxRenderer = new BoxRenderer(writeLine, (frame: string) => {
  inputBox.setLabel(` ${frame} 思考中 `);
  screen.render();
});
```

动画帧通过 BoxRenderer 的 `thinkingCallback` 回调传出：
- `startThinking()` → 启动 100ms 定时器，每帧调用回调
- 文本到达 → 自动停止动画
- `render()` → 恢复 label 为 ` 输入 `

### 6. 确认对话框

写入工具执行前的 y/n 确认，通过 `confirmMode` 状态机实现：

```
askConfirm(message)
  ├── writeLine 提示信息
  ├── confirmMode = true
  └── 等待用户按 y/n
      ├── y → resolve(true)
      └── n/ESC → resolve(false)
```

confirmMode 激活时，按键处理器只接受 y/n，其他键被忽略。

### 7. Tab 补全

```typescript
screen.key('tab', () => {
  const partial = inputBuffer.slice(1); // 去掉 /
  const matches = allCommandNames.filter(c => c.startsWith(`/${partial}`));
  if (matches.length === 1) {
    inputBuffer = matches[0] + ' ';  // 唯一匹配，直接填充
  } else if (matches.length > 1) {
    writeLine(`可用命令: ${matches.join(', ')}`); // 多个匹配，列出候选
  }
});
```

### 8. 终端 Resize

blessed screen 内建 resize 处理，百分比定位的组件自动适配：

```typescript
screen.on('resize', () => {
  screen.render(); // 触发重绘
});
```

logBox 使用 `height: '100%-3'`，inputBox 使用 `bottom: 0`，
窗口大小变化时自动重新计算布局。

## 依赖

```json
{
  "blessed": "^0.1.81",
  "@types/blessed": "^0.1.25"
}
```

blessed 是 curses-like 终端 UI 库（chjj/blessed），API 稳定但已停止维护。
如需更活跃的维护，可替换为 `neo-blessed`（API 兼容）。

## 关键设计决策

### 为什么不用 blessed.textbox？

blessed 的 textbox 继承自 textarea，内部使用 `screen.grabKeys()` 捕获所有按键。
这意味着当 textbox 获得焦点时，方向键、Tab 等特殊键会被吞掉，
无法在 textbox 获焦的同时将方向键路由到命令菜单。

解决方案：用 `blessed.box` 显示输入内容 + `screen.on('keypress')` 全局监听，
手动管理输入缓冲区。这样可以自由决定每个按键的去向。

### 为什么用 logBox 而不是直接 console.log？

blessed screen 接管了整个终端的渲染。如果混用 console.log 和 blessed：
- console.log 的内容会被下次 screen.render() 覆盖
- ANSI 转义码可能和 blessed 的内部缓冲区冲突

所有输出必须通过 blessed 的组件（logBox.add）才能正确显示。

### 为什么 writeLine 是可选参数？

为了向下兼容：
- 测试环境中不创建 blessed screen，命令/plan-runner 通过 console.log 输出
- 生产环境中通过 writeLine 走 blessed logBox

```typescript
// 测试中：不传 logLine，自动 fallback 到 console.log
await handleCommand('/help', { messages, ... });

// REPL 中：传入 writeLine
await handleCommand('/help', { messages, ..., logLine: writeLine });
```
