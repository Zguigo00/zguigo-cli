# .zguigo 配置目录

## 目录结构

```
.zguigo/
├── commands/     # Skill 命令（/command-name 触发）
└── skills/       # 背景知识（启动时自动加载）
```

## Commands（命令）

在 `commands/` 目录下创建 `.md` 文件即可添加自定义命令。

### 文件格式

```markdown
# 命令标题

命令的描述说明。

执行步骤：
1. 第一步
2. 第二步
3. 第三步

目标：$ARGUMENTS
```

### 使用方式

```bash
# 触发命令
/command-name 任务描述
```

### 示例

创建 `.zguigo/commands/security-review.md`：

```markdown
# 安全审查

你是一个安全专家。请按以下步骤审查代码：

1. 检查输入验证
2. 检查权限控制
3. 检查敏感信息泄露
4. 检查 SQL 注入风险

只读取代码，不要修改任何文件。

目标：$ARGUMENTS
```

然后使用：
```bash
/security-review src/api/
```

## Skills（知识）

在 `skills/` 目录下创建 `.md` 文件即可添加背景知识。这些知识会在启动时自动加载到上下文中。

### 文件格式

```markdown
# 主题标题

相关的知识、规则、流程等...
```

### 示例

创建 `.zguigo/skills/deploy.md`：

```markdown
# 部署流程

本项目使用 Cloudflare Workers 部署：

1. 运行 npm run build
2. 运行 npx wrangler deploy
3. 检查部署状态

注意：
- 生产环境变量在 .env.production
- 不要提交 .env 文件
```

## 优先级

同名文件时：
- 项目级 `.zguigo/` > 用户级 `~/.zguigo/` > 内置

## 分享

- 项目级配置可提交到 git，团队共享
- 用户级配置放在 `~/.zguigo/`，个人跨项目共享
