# 全局安装与配置

## 概述

zguigo 支持全局安装后在任意目录使用。本文档详细说明实现原理和配置方法。

---

## 核心实现原理

### 整体流程

```
用户在任意目录执行 zguigo
        │
        ▼
操作系统查找 PATH 中的 zguigo 命令
        │
        ▼
找到 C:\Node\node_global\zguigo.cmd
        │
        ▼
执行 node C:\Node\node_global\node_modules\zguigo-cli\dist\index.js
        │
        ▼
process.cwd() 返回用户当前目录（如 ~/Desktop/my-project）
        │
        ▼
加载配置文件（当前目录 .env > ~/.zguigo/.env）
        │
        ▼
所有工具以当前目录为工作区
```

---

## 详细实现

### 1. package.json 的 bin 字段

```json
{
  "name": "zguigo-cli",
  "version": "0.1.0",
  "bin": {
    "zguigo": "./dist/index.js"
  }
}
```

**作用**：
- 告诉 npm：这个包有一个可执行命令叫 `zguigo`
- 命令入口是 `./dist/index.js`

**npm link 后生成的文件**：

```
C:\Node\node_global\
├── zguigo          # Linux/Mac 启动脚本
├── zguigo.cmd      # Windows 启动脚本
├── zguigo.ps1      # PowerShell 启动脚本
└── node_modules/
    └── zguigo-cli -> C:\Users\Zguigo\Desktop\zguigo_Cli  # 符号链接
```

### 2. 生成的启动脚本

#### Windows (zguigo.cmd)

```batch
@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\node_modules\zguigo-cli\dist\index.js" %*
```

**工作原理**：
1. 找到脚本所在目录 (`%dp0%`)
2. 检查是否有本地 node.exe，没有就用系统 node
3. 执行 `node C:\Node\node_global\node_modules\zguigo-cli\dist\index.js %*`
4. `%*` 传递所有命令行参数

#### Linux/Mac (zguigo)

```bash
#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")
case `uname` in
    *CYGWIN*|*MINGW*|*MSYS*)
        if command -v node > /dev/null 2>&1; then
            node  "$basedir/node_modules/zguigo-cli/dist/index.js" "$@"
        else
            echo "node not found"
            exit 1
        fi
    ;;
    *)
        exec node  "$basedir/node_modules/zguigo-cli/dist/index.js" "$@"
    ;;
esac
```

**工作原理**：
1. 检测操作系统类型
2. 执行 `node $basedir/node_modules/zguigo-cli/dist/index.js "$@"`
3. `"$@"` 传递所有命令行参数

### 3. 入口文件的 Shebang

```typescript
#!/usr/bin/env node

import { config } from 'dotenv';
// ... 其他代码
```

**作用**：
- `#!/usr/bin/env node` 告诉操作系统用 node 执行这个脚本
- 在 Linux/Mac 上直接运行 `./dist/index.js` 时会用到
- Windows 的 .cmd 脚本会忽略这一行

**注意**：shebang 必须在文件**第一行**，前面不能有空行或其他内容。

### 4. 符号链接

```
npm link 做了什么？

步骤 1：读取 package.json
    │
    ├─ name: "zguigo-cli"
    ├─ bin: { "zguigo": "./dist/index.js" }
    │
步骤 2：在全局 node_modules 创建符号链接
    │
    └─ C:\Node\node_global\node_modules\zguigo-cli
       └─ 链接到 → C:\Users\Zguigo\Desktop\zguigo_Cli
    │
步骤 3：在全局 bin 目录创建启动脚本
    │
    ├─ C:\Node\node_global\zguigo.cmd     (Windows)
    ├─ C:\Node\node_global\zguigo         (Linux/Mac)
    └─ C:\Node\node_global\zguigo.ps1     (PowerShell)
```

**验证符号链接**：

```bash
ls -la C:\Node\node_global\node_modules\
# 输出：
# zguigo-cli -> /c/Users/Zguigo/Desktop/zguigo_Cli
```

### 5. process.cwd() 获取工作目录

```typescript
// src/workspace/safety.ts

/** workspace 根目录 */
let workspaceRoot: string = process.cwd();

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = resolve(root);
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}
```

**关键点**：

```typescript
// process.cwd() 返回什么？
// 答：用户执行命令时所在的目录

// 场景 1：用户在 Desktop
cd ~/Desktop/project1
zguigo
// process.cwd() === 'C:\Users\Zguigo\Desktop\project1'

// 场景 2：用户在 Documents
cd ~/Documents/project2
zguigo
// process.cwd() === 'C:\Users\Zguigo\Documents\project2'
```

**所有工具都基于这个目录**：

```typescript
// src/tools/list-files.ts
const inputPath = (args.path as string) || '.';
const resolved = safeResolve(inputPath);  // 解析为绝对路径

// safeResolve 实现
export function safeResolve(inputPath: string): string | null {
  const resolved = resolve(workspaceRoot, inputPath);  // workspaceRoot = process.cwd()
  const rel = relative(workspaceRoot, resolved);
  
  // 防止越界访问
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  
  return resolved;
}
```

### 6. 配置文件加载

```typescript
// src/index.ts

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// 配置加载优先级
const localEnv = resolve(process.cwd(), '.env');           // 1. 当前目录
const homeEnv = join(
  process.env.HOME || process.env.USERPROFILE || '',       // 用户主目录
  '.zguigo', 
  '.env'
);

if (existsSync(localEnv)) {
  // 优先使用当前目录的 .env
  config({ path: localEnv });
} else if (existsSync(homeEnv)) {
  // 其次使用 ~/.zguigo/.env
  config({ path: homeEnv });
} else {
  // 都没有，从系统环境变量读取
  config();
}
```

**加载流程图**：

```
用户执行 zguigo
      │
      ▼
检查当前目录是否有 .env
      │
      ├─ 有 → 加载当前目录 .env
      │
      └─ 无 → 检查 ~/.zguigo/.env
              │
              ├─ 有 → 加载 ~/.zguigo/.env
              │
              └─ 无 → 从系统环境变量读取
```

**路径解析**：

```typescript
// Windows
process.env.USERPROFILE === 'C:\Users\Zguigo'
homeEnv === 'C:\Users\Zguigo\.zguigo\.env'

// Linux/Mac
process.env.HOME === '/home/zguigo'
homeEnv === '/home/zguigo/.zguigo/.env'
```

---

## 安装步骤

### Windows（需要管理员权限）

```bash
# 1. 以管理员身份运行终端
#    右键点击"终端"或"PowerShell" → 以管理员身份运行

# 2. 进入项目目录
cd C:\Users\Zguigo\Desktop\zguigo_Cli

# 3. 构建项目（TypeScript → JavaScript）
npm run build
# 执行 tsc，将 src/ 编译到 dist/

# 4. 创建全局链接
npm link
# 创建符号链接和启动脚本

# 5. 验证安装
zguigo --help
```

### Linux/Mac

```bash
cd /path/to/zguigo_Cli
npm run build
npm link          # 可能需要 sudo
zguigo --help
```

---

## 配置文件设置

### 推荐：使用全局配置

```bash
# 1. 创建配置目录
mkdir -p ~/.zguigo

# 2. 复制配置文件
cp .env ~/.zguigo/.env

# 3. 编辑配置
# Windows
notepad C:\Users\Zguigo\.zguigo\.env

# Linux/Mac
nano ~/.zguigo/.env
```

### 配置文件内容

```env
# 必需配置
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.xiaomimimo.com/v1
LLM_MODEL=mimo-v2.5-pro

# 可选配置（上下文压缩）
CONTEXT_WINDOW_SIZE=65536        # 上下文窗口大小
COMPRESSION_THRESHOLD=0.8        # 压缩阈值（80%）
RECENT_MESSAGE_COUNT=5           # 保留最近消息数
```

### 配置优先级

| 优先级 | 位置 | 用途 |
|--------|------|------|
| 1 | `./.env` | 项目级配置，覆盖全局 |
| 2 | `~/.zguigo/.env` | 用户级全局配置 |
| 3 | 系统环境变量 | 兜底方案 |

**使用场景**：

```
场景 1：所有项目用同一个 API Key
  → 只设置 ~/.zguigo/.env

场景 2：不同项目用不同 API Key
  → ~/.zguigo/.env 放默认配置
  → 特定项目目录放 .env 覆盖

场景 3：CI/CD 环境
  → 用系统环境变量
```

---

## 开发流程

### 日常开发（推荐）

```bash
# 方式 1：直接运行 TypeScript（改代码立即生效）
npx tsx src/index.ts

# 方式 2：使用 dev 脚本
npm run dev
```

### 测试全局命令

```bash
# 修改代码后重新构建
npm run build

# 全局命令自动生效（不需要重新 npm link）
cd ~/Desktop/test-project
zguigo
```

### 发布新版本

```bash
# 1. 更新版本号
npm version patch    # 0.1.0 → 0.1.1
npm version minor    # 0.1.0 → 0.2.0
npm version major    # 0.1.0 → 1.0.0

# 2. 构建
npm run build

# 3. 发布到 npm（可选，需要 npm 账号）
npm publish

# 4. 用户安装/更新
npm install -g zguigo-cli
npm update -g zguigo-cli
```

---

## 使用示例

### 基本使用

```bash
# 切换到你的项目目录
cd ~/Desktop/my-web-app

# 启动 zguigo
zguigo

# Agent 以当前目录为工作区
你> 列出当前目录的文件
你> 读取 src/index.ts
你> 帮我写一个 hello world
```

### Skill 命令

```bash
cd ~/Desktop/my-web-app
zguigo

# 代码审查（只读）
/review src/app.ts

# 生成测试
/test src/utils.ts

# 解释代码（只读）
/explain src/config.ts

# 重构代码
/refactor src/api.ts

# 查看所有可用命令
/commands
```

### 命令行参数

```bash
# 直接执行任务并退出
zguigo "列出当前目录的文件"

# 调试模式
zguigo --debug

# 查看帮助
zguigo --help
```

---

## 目录结构说明

### 全局目录

```
C:\Users\Zguigo\                      # 用户主目录
└── .zguigo\                          # zguigo 全局配置
    ├── .env                          # 全局配置文件（API Key 等）
    ├── commands\                     # 全局自定义命令
    │   └── my-command.md             # 可在任意项目使用
    └── skills\                       # 全局背景知识
        └── my-skill.md               # 自动加载到上下文
```

### 项目目录

```
~/Desktop/my-project\                 # 任意项目
├── .env                              # 项目级配置（可选，覆盖全局）
├── .zguigo\                          # 项目级 Skill 配置
│   ├── commands\                     # 项目级命令
│   │   └── project-command.md
│   └── skills\                       # 项目级知识
│       └── project-skill.md
└── src\                              # 项目代码
    └── ...
```

### npm 全局目录

```
C:\Node\node_global\                  # npm 全局目录
├── zguigo                            # Linux/Mac 启动脚本
├── zguigo.cmd                        # Windows 启动脚本
├── zguigo.ps1                        # PowerShell 启动脚本
└── node_modules\
    └── zguigo-cli\                   # 符号链接 → 项目目录
        └── dist\                     # 编译后的 JavaScript
            └── index.js              # 实际执行的入口
```

---

## 常见问题

### Q: 执行 zguigo 提示"命令找不到"

**原因**：npm 全局目录不在 PATH 中

**解决**：

```bash
# 查看 npm 全局目录
npm config get prefix
# 输出：C:\Node\node_global

# 确认目录在 PATH 中
# Windows
echo %PATH%
# 应该包含 C:\Node\node_global

# Linux/Mac
echo $PATH
# 应该包含 /usr/local/bin 或 ~/.npm-global/bin

# 如果不在，添加到 PATH
# Windows：系统属性 → 环境变量 → Path → 添加
# Linux/Mac：编辑 ~/.bashrc 或 ~/.zshrc
export PATH="$PATH:$(npm config get prefix)/bin"
```

### Q: Windows 上 npm link 报错 EPERM

**原因**：创建符号链接需要管理员权限

**解决**：
1. 右键点击"终端/PowerShell" → 以管理员身份运行
2. 再执行 `npm link`

**替代方案**（不需要管理员权限）：

```bash
# 直接用完整路径运行
node C:\Users\Zguigo\Desktop\zguigo_Cli\dist\index.js

# 或者创建 .bat 脚本放到 PATH 目录
```

### Q: 配置文件不生效

**检查步骤**：

```bash
# 1. 开启调试模式
zguigo --debug

# 2. 检查配置文件是否存在
ls -la .env
ls -la ~/.zguigo/.env

# 3. 确认加载顺序
# 优先级：当前目录 .env > ~/.zguigo/.env > 系统环境变量

# 4. 检查环境变量
# Windows
echo %LLM_API_KEY%

# Linux/Mac
echo $LLM_API_KEY
```

### Q: 修改代码后全局命令没更新

**原因**：需要重新构建

**解决**：

```bash
# 进入项目目录
cd C:\Users\Zguigo\Desktop\zguigo_Cli

# 重新构建
npm run build

# 全局命令会自动使用新的 dist/ 文件
# 不需要重新 npm link
```

### Q: 权限问题（Linux/Mac）

```bash
# npm link 可能需要 sudo
sudo npm link

# 或者修改 npm 全局目录权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm link
```

---

## 技术细节

### Node.js 模块解析

```
执行 zguigo 时，Node.js 做了什么？

1. 找到入口文件
   C:\Node\node_global\node_modules\zguigo-cli\dist\index.js

2. 解析 import 语句
   import { createClient } from './model/client.js'
   ↓
   加载 C:\Node\node_global\node_modules\zguigo-cli\dist\model\client.js

3. 因为是符号链接，实际加载的是
   C:\Users\Zguigo\Desktop\zguigo_Cli\dist\model\client.js
```

### 环境变量跨平台

```typescript
// 获取用户主目录
const home = process.env.HOME      // Linux/Mac: /home/username
          || process.env.USERPROFILE; // Windows: C:\Users\username

// 常用环境变量
process.env.PATH          // 命令搜索路径
process.env.NODE_PATH     // Node.js 模块搜索路径
process.env.APPDATA       // Windows 应用数据目录
```

### 文件路径处理

```typescript
import { resolve, join, relative, isAbsolute } from 'path';

// resolve: 解析为绝对路径
resolve('src', 'index.ts')
// Windows: C:\Users\Zguigo\Desktop\zguigo_Cli\src\index.ts
// Linux: /home/zguigo/Desktop/zguigo_Cli/src/index.ts

// join: 拼接路径
join('~', '.zguigo', '.env')
// ~/.zguigo/.env

// relative: 计算相对路径
relative('/a/b/c', '/a/b/d/e')
// ../d/e

// isAbsolute: 判断是否绝对路径
isAbsolute('/home/user')   // true
isAbsolute('src/index.ts') // false
```

---

## 总结

### 关键组件

| 组件 | 文件/字段 | 作用 |
|------|-----------|------|
| 命令定义 | `package.json` bin | 定义命令名和入口 |
| 入口标记 | `#!/usr/bin/env node` | 告诉系统用 node 执行 |
| 全局链接 | `npm link` | 创建符号链接和启动脚本 |
| 工作目录 | `process.cwd()` | 获取用户当前目录 |
| 配置加载 | `dotenv` | 加载 .env 配置文件 |
| 路径安全 | `safeResolve()` | 防止越界访问 |

### 实现原理一句话总结

```
npm link 创建符号链接
    ↓
启动脚本调用 node 执行入口文件
    ↓
process.cwd() 获取用户当前目录
    ↓
所有工具基于该目录工作
    ↓
配置从当前目录或 ~/.zguigo/ 加载
```

### 为什么改代码后不需要重新 npm link？

```
npm link 创建的是符号链接（不是复制）
    │
    ├─ C:\Node\node_global\node_modules\zguigo-cli
    │   └─ 链接到 → C:\Users\Zguigo\Desktop\zguigo_Cli
    │
    └─ 执行 zguigo 时
        └─ 实际读取的是项目目录的 dist/ 文件
           ↓
        只需要 npm run build 重新编译
           ↓
        全局命令自动使用新的代码
```
