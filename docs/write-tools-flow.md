# 写入工具与 Shell 命令实现流程

## 工具总览

| 工具 | 类型 | 需要确认 | 说明 |
|------|------|---------|------|
| `list_files` | 只读 | ❌ | 查看目录结构 |
| `read_file` | 只读 | ❌ | 读取文件内容 |
| `write_file` | 写入 | ✅ | 创建/覆写文件 |
| `edit_file` | 写入 | ✅ | 局部替换编辑 |
| `create_directory` | 写入 | ✅ | 递归创建目录 |
| `run_command` | Shell | ✅ | 执行 shell 命令 |

## 写入工具实现

### write_file 流程

```
模型返回 tool_call: write_file(path, content)
  ↓
安全检查：safeResolve(path) → 路径在 workspace 内？
  ├── 否 → 返回 "路径越界" 错误
  └── 是 → 继续
  ↓
自动创建父目录：mkdir(dirname, recursive)
  ↓
写入文件：writeFile(path, content, 'utf-8')
  ↓
返回成功："文件已写入: xxx"
```

### edit_file 流程

```
模型返回 tool_call: edit_file(path, old_string, new_string)
  ↓
安全检查：safeResolve(path)
  ↓
读取文件：readFile(path, 'utf-8')
  ↓
查找 old_string
  ├── 未找到 → 返回 "未找到匹配内容" 错误
  ├── 匹配多处 → 返回 "匹配到多处" 错误（要求唯一）
  └── 唯一匹配 → 继续
  ↓
替换：content.replace(old_string, new_string)
  ↓
写回文件：writeFile(path, updated, 'utf-8')
  ↓
返回成功："文件已编辑: xxx"
```

### create_directory 流程

```
模型返回 tool_call: create_directory(path)
  ↓
安全检查：safeResolve(path)
  ↓
创建目录：mkdir(path, recursive: true)
  ↓
返回成功："目录已创建: xxx"
```

## Shell 命令实现

### run_command 流程

```
模型返回 tool_call: run_command(command)
  ↓
确认检查：requiresConfirmation = true
  ↓
弹出确认："即将执行命令: npm test? (y/n)"
  ├── n → 返回 "用户拒绝执行" 给模型
  └── y → 继续
  ↓
执行命令：child_process.exec(command, {
  cwd: workspaceRoot,    // 工作目录限制在 workspace 内
  timeout: 30000,        // 30秒超时
  windowsHide: true      // 隐藏 Windows 弹窗
})
  ↓
处理结果
  ├── 超时 → 返回 "命令执行超时 (30秒)"
  ├── exit code ≠ 0 → 返回 stderr 或 stdout
  └── 成功 → 截断输出（50KB 上限）→ 返回 stdout
```

## 确认机制

### 设计思路

所有写入/危险操作都需要用户确认。通过 Tool 接口的两个字段控制：

```typescript
interface Tool {
  // ...
  requiresConfirmation?: boolean;  // 是否需要确认
  confirmMessage?: (args) => string; // 确认时显示的消息
}
```

### 确认流程

```
Agent Loop 执行工具前
  ↓
检查 tool.requiresConfirmation
  ├── false → 直接执行
  └── true → emit confirm 事件
              ↓
          REPL 弹出确认提示
          "[确认] 即将写入文件: xxx? (y/n)"
              ├── 用户输入 y → 执行工具
              └── 用户输入 n → 返回 "用户拒绝执行" 给模型
```

### 代码位置

```
src/tools/protocol.ts    — Tool 接口定义（requiresConfirmation, confirmMessage）
src/agent/loop.ts        — 确认检查逻辑（confirmToolCall 回调）
src/cli/repl.ts          — 确认提示实现（askConfirm 函数）
```

## 安全措施汇总

| 措施 | 说明 | 适用工具 |
|------|------|---------|
| 路径安全 | safeResolve() 检查，拒绝 workspace 外路径 | 所有文件工具 |
| 唯一匹配 | edit_file 要求 old_string 唯一 | edit_file |
| 超时限制 | 30秒自动终止 | run_command |
| 输出截断 | stdout/stderr 最多 50KB | run_command |
| 工作目录 | 限制在 workspace 根目录 | run_command |
| 用户确认 | 执行前弹出 y/n 确认 | 所有写入/Shell 工具 |
