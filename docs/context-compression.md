# 上下文压缩

## 现状

当前对话历史无限增长，长对话会导致：
- API 调用 token 超限报错
- 费用线性增长

## 设计方案

### 方案一：模型总结式压缩（推荐）

**流程：**
1. 对话接近 token 上限时自动触发，或用户手动 `/compact`
2. 将历史消息发送给模型，要求生成简洁摘要
3. 用摘要替换原始历史，保留 system message + 最近几轮对话

**优点：** 语义保留好，实现简单
**缺点：** 压缩本身消耗 token

### 方案二：滑动窗口

**流程：**
保留 system message + 最近 N 轮对话，丢弃更早的消息。

**优点：** 零成本
**缺点：** 丢失早期上下文

### 方案三：组合式（最佳）

结合方案一和方案二：
1. 保留 system message 不变
2. 超出窗口的历史用模型压缩成摘要
3. 最近 N 轮对话保持原样

```
[system] ...（保留）
[assistant] 以下是之前对话的摘要：...（压缩）
[user] 最近一轮的问题
[assistant] 最近一轮的回答
```

## 配置

通过 `.env` 环境变量配置：

```
CONTEXT_WINDOW_SIZE=65536          # 上下文窗口大小（token 数）
COMPRESSION_THRESHOLD=0.8          # 压缩触发阈值（0-1），达到此比例时自动压缩
RECENT_MESSAGE_COUNT=5             # 压缩后保留的最近消息条数
```

## 实现

### 已完成

#### `src/context/` 目录结构

```
src/context/
├── compress.ts   # 核心压缩逻辑
├── prompt.ts     # 摘要用的 system prompt 模板
└── index.ts      # 公共导出
```

#### 核心函数

**`estimateTokens(text)`** — token 估算（中文 ~1.5字/token，英文 ~4字符/token）
**`estimateMessagesTokens(messages)`** — 计算消息列表总 token 数
**`shouldCompress(messages, config)`** — 判断是否需要压缩
**`compressMessages(messages, client, config)`** — 执行压缩，返回压缩后的消息列表

#### 压缩流程

1. 每轮 agent loop 调用模型前检查 `shouldCompress()`
2. 达到阈值时调用 `compressMessages()`：
   - 分离 system message
   - 将超出保留数量的历史消息用模型生成摘要
   - 组装：`[system] + [摘要] + [最近N条]`
3. 替换 messages 数组内容，继续对话

#### `/compact` 命令

在 REPL 中输入 `/compact` 可手动触发压缩。

#### 测试

`tests/context/compress.test.ts` — 15 个单元测试覆盖所有核心函数。
