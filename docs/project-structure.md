# zguigo CLI 结构与功能

## 运行方式

```bash
# 在项目根目录运行
npx tsx src/index.ts          # 交互式 REPL
npx tsx src/index.ts --debug  # 带调试日志
```

## 核心架构

```
用户输入 → REPL → Agent Loop → Model Client → MiMo API
                         ↓
                   Tool Registry
                    ├─ list_files  (递归列出目录)
                    └─ read_file   (读取文件内容)
```

## 目录结构

| 目录 | 功能 |
|------|------|
| `src/cli/` | 命令行界面：REPL 循环、`/help` `/clear` `/exit` 命令、流式输出渲染 |
| `src/model/` | 模型客户端：OpenAI SDK 封装、`.env` 配置加载、流式/非流式调用 |
| `src/agent/` | Agent Loop：最多 8 轮迭代，流式处理模型响应，执行工具调用 |
| `src/tools/` | 工具协议与实现：工具注册、参数定义、执行 |
| `src/workspace/` | 路径安全：限制文件访问在工作区内，过滤 `.git` `node_modules` 等目录 |
| `src/debug/` | 调试日志：输出到 stderr |
| `tests/` | 测试：工具、路径安全、Agent Loop、CLI 命令（29 个用例） |

## 当前能力

- ✅ 连接小米 MiMo 模型（OpenAI 兼容接口）
- ✅ 流式输出模型回复
- ✅ 读取文件和列出目录（只读工具）
- ✅ 路径安全限制，防目录遍历
- ✅ REPL 交互，支持 `/help` `/clear` `/exit`

## 未实现

- ❌ 写文件、创建目录等写入工具
- ❌ 权限控制（写入前需用户确认）
- ❌ Shell 命令执行
- ❌ 上下文压缩（长对话自动精简）
