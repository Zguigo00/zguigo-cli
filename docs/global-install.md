# 全局安装与配置

## 概述

zguigo 支持全局安装后在任意目录使用，配置文件支持项目级和用户级两种位置。

---

## 实现方式

### 1. package.json 配置

```json
{
  "name": "zguigo-cli",
  "version": "0.1.0",
  "bin": {
    "zguigo": "./dist/index.js"
  }
}
```

**关键字段**：
- `bin`：定义全局命令名称和入口文件
- 执行 `npm link` 后，系统会在 PATH 中创建 `zguigo` 命令，指向 `./dist/index.js`

### 2. 入口文件 shebang

```typescript
#!/usr/bin/env node  // 必须在文件第一行
```

**作用**：
- 告诉操作系统使用 node 来执行这个脚本
- Linux/Mac 需要，Windows 的 .cmd 包装器会自动处理

### 3. 配置加载逻辑

```typescript
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// 配置加载优先级：
// 1. 当前目录 .env
// 2. 用户主目录 ~/.zguigo/.env
const localEnv = resolve(process.cwd(), '.env');
const homeEnv = join(process.env.HOME || process.env.USERPROFILE || '', '.zguigo', '.env');

if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(homeEnv)) {
  config({ path: homeEnv });
} else {
  // 都没有，尝试加载（会从系统环境变量读取）
  config();
}
```

**优先级**：
```
当前目录 .env  >  ~/.zguigo/.env  >  系统环境变量
```

### 4. 工作目录处理

```typescript
// src/workspace/safety.ts
let workspaceRoot: string = process.cwd();

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = resolve(root);
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}
```

**关键点**：
- `process.cwd()` 返回用户执行命令时所在的目录
- 所有工具（list_files、read_file 等）都基于这个目录工作
- 用户在哪个目录运行 `zguigo`，那个目录就是工作区

---

## 安装步骤

### Windows（需要管理员权限）

```bash
# 1. 以管理员身份运行终端
# 右键点击"终端/PowerShell" → 以管理员身份运行

# 2. 进入项目目录
cd C:\Users\Zguigo\Desktop\zguigo_Cli

# 3. 构建项目
npm run build

# 4. 创建全局链接
npm link

# 5. 验证
zguigo --help
```

### Linux/Mac

```bash
cd /path/to/zguigo_Cli
npm run build
npm link
zguigo --help
```

---

## 配置文件

### 位置

| 位置 | 用途 | 是否提交到 Git |
|------|------|----------------|
| 项目目录 `.env` | 项目级配置 | ❌ 不提交 |
| `~/.zguigo/.env` | 用户级全局配置 | ❌ 不提交 |

### 内容

```env
# .env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.xiaomimimo.com/v1
LLM_MODEL=mimo-v2.5-pro

# 可选配置
CONTEXT_WINDOW_SIZE=65536
COMPRESSION_THRESHOLD=0.8
RECENT_MESSAGE_COUNT=5
```

### 设置全局配置

```bash
# 创建目录
mkdir -p ~/.zguigo

# 复制配置文件
cp .env ~/.zguigo/.env

# 编辑配置
notepad ~/.zguigo/.env  # Windows
# nano ~/.zguigo/.env   # Linux/Mac
```

---

## 开发流程

### 日常开发

```bash
# 方式 1：直接运行（改代码后立即生效）
npx tsx src/index.ts

# 方式 2：使用全局命令（需要重新构建）
npm run build
zguigo
```

### 更新全局命令

```bash
# 修改代码后
npm run build
# 全局命令自动生效，不需要重新 npm link
```

### 发布新版本

```bash
# 更新版本号
npm version patch  # 0.1.0 → 0.1.1

# 构建
npm run build

# 发布到 npm（可选）
npm publish

# 用户更新
npm update -g zguigo-cli
```

---

## 使用示例

### 在任意目录启动

```bash
cd ~/Desktop/my-project
zguigo
```

Agent 会以 `~/Desktop/my-project` 作为工作目录，可以：
- 读取该目录下的文件
- 在该目录创建/编辑文件
- 在该目录执行命令

### 使用 Skill 命令

```bash
cd ~/Desktop/my-project
zguigo

# 在 REPL 中
/review src/app.ts        # 审查代码
/test src/utils.ts        # 生成测试
/explain src/index.ts     # 解释代码
/refactor src/api.ts      # 重构代码
```

### 调试模式

```bash
zguigo --debug
```

---

## 目录结构

安装后的目录布局：

```
用户主目录/
└── .zguigo/
    ├── .env          # 全局配置文件
    ├── commands/     # 全局自定义命令
    └── skills/       # 全局背景知识

任意项目目录/
├── .env              # 项目级配置（可选，覆盖全局）
├── .zguigo/
│   ├── commands/     # 项目级自定义命令
│   └── skills/       # 项目级背景知识
└── src/              # 你的项目代码
```

---

## 常见问题

### Q: 命令找不到？

```bash
# 检查 npm 全局目录
npm config get prefix

# 确认目录在 PATH 中
echo $PATH  # Linux/Mac
echo %PATH% # Windows
```

### Q: 权限不足？

Windows 上 `npm link` 需要管理员权限，解决方案：
1. 以管理员身份运行终端
2. 或者直接用 `npx tsx /path/to/zguigo_Cli/src/index.ts` 运行

### Q: 配置不生效？

```bash
# 检查配置加载顺序
zguigo --debug

# 确认配置文件位置
ls -la ~/.zguigo/.env
ls -la .env
```

### Q: 改了代码没生效？

```bash
# 需要重新构建
npm run build

# 然后再运行
zguigo
```

---

## 技术细节

### npm link 原理

```
npm link 做了什么？
    │
    ├─ 在项目目录执行：npm link
    │   └─ 创建符号链接：
    │       $NODE_GLOBAL/node_modules/zguigo-cli → 当前项目目录
    │
    ├─ 读取 package.json 的 bin 字段
    │   └─ 创建命令：
    │       $NODE_GLOBAL/zguigo → ./dist/index.js
    │
    └─ 用户执行 zguigo
        └─ 实际运行 node ./dist/index.js
```

### process.cwd()

```typescript
// 用户在哪个目录执行命令
// process.cwd() 就返回那个目录

cd ~/Desktop/project1
zguigo
// process.cwd() === ~/Desktop/project1

cd ~/Documents/project2
zguigo
// process.cwd() === ~/Documents/project2
```

---

## 总结

| 组件 | 作用 |
|------|------|
| `package.json` bin | 定义全局命令名称 |
| `#!/usr/bin/env node` | 告诉系统用 node 执行 |
| `process.cwd()` | 获取用户当前目录作为工作区 |
| `~/.zguigo/.env` | 用户级全局配置 |
| `npm link` | 创建全局符号链接 |

**核心原理**：
1. npm link 创建全局命令指向项目
2. 命令执行时，`process.cwd()` 获取用户当前目录
3. 所有工具基于这个目录工作
4. 配置文件从当前目录或用户目录加载
