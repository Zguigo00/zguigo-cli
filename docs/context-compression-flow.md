# 上下文压缩流程

## 整体流程

```
用户输入 → Agent Loop → 压缩检查 → 调用模型 → 工具执行 → 回到循环
                ↓
        token 超过阈值？
          ├── 否 → 正常调用模型
          └── 是 → 执行压缩 → 用压缩后的消息继续
```

## 详细步骤

### 1. 触发时机

在 `src/agent/loop.ts` 的 `runAgent()` 中，**每轮模型调用之前**检查是否需要压缩：

```
while (!state.stopped) {
    state.iteration++;

    // ← 这里检查压缩
    if (shouldCompress(messages, config)) {
        result = await compressMessages(messages, client, config);
        messages = result.messages;  // 替换消息列表
    }

    // 调用模型
    const stream = client.chatStream(messages, { tools });
    ...
}
```

### 2. token 估算

`estimateTokens()` 用简单规则估算 token 数，不调用 API：

| 文本类型 | 估算规则 |
|---------|---------|
| 中文字符 | 1.5 字 ≈ 1 token |
| 英文/符号 | 4 字符 ≈ 1 token |
| 每条消息 | 额外 +4 token（role、格式开销） |

`estimateMessagesTokens()` 遍历消息列表累加，包含 `content` 和 `tool_calls` 的 token。

### 3. 判断是否压缩

`shouldCompress(messages, config)`：

```
总 token ≥ contextWindowSize × compressionThreshold
       ↓
默认：总 token ≥ 65536 × 0.8 = 52429 token 时触发
```

### 4. 压缩执行流程

`compressMessages()` 的完整流程：

```
输入: messages[]
  ↓
① 分离 system message
  ├── systemMessages[]  ← 保留不动
  └── otherMessages[]   ← 需要处理
  ↓
② 检查消息数量
  └── otherMessages.length ≤ recentMessageCount + 1？
       └── 是 → 不压缩，直接返回
  ↓
③ 分割历史和近期
  ├── toCompress = otherMessages[0 .. len-recent-1]  ← 要压缩的
  └── recent    = otherMessages[len-recent .. end]    ← 保留原样
  ↓
④ 调用模型生成摘要
  └── client.chat([
        { role: 'system', content: COMPRESS_SYSTEM_PROMPT },
        { role: 'user',   content: 拼接的对话历史 }
      ])
  ↓
⑤ 组装压缩后的消息列表
  └── [
        ...systemMessages,           ← 原始 system message
        { role: 'assistant',         ← 摘要
          content: '[对话历史摘要]\n...' },
        ...recent                    ← 最近 N 条原样保留
      ]
  ↓
输出: 压缩后的 messages[]
```

### 5. 摘要生成

`src/context/prompt.ts` 中的 `COMPRESS_SYSTEM_PROMPT` 指示模型：

- 保留任务目标、关键决策、已确定方案
- 保留代码片段、文件路径、函数名
- 删除重复确认、客套话、中间推理
- 用中文输出

### 6. 手动触发 `/compact`

在 `src/cli/commands.ts` 中注册，流程与自动压缩相同：

```
用户输入 /compact
  ↓
handleCommand() → 匹配到 /compact
  ↓
调用 compressMessages()
  ↓
替换 messages 数组
  ↓
输出: "压缩完成: 12345 → 3456 tokens"
```

## 配置项

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `CONTEXT_WINDOW_SIZE` | 65536 | 上下文窗口大小（token 数） |
| `COMPRESSION_THRESHOLD` | 0.8 | 压缩触发阈值（0-1） |
| `RECENT_MESSAGE_COUNT` | 5 | 压缩后保留的最近消息条数 |

## 压缩前后对比

```
压缩前（100条消息）:
┌─────────────────────────────┐
│ system message              │
│ user: 第1条消息              │
│ assistant: 第1条回复         │
│ user: 第2条消息              │
│ assistant: 第2条回复         │
│ ...（中间96条）...           │
│ user: 第99条消息             │
│ assistant: 第99条回复        │
│ user: 第100条消息            │
│ assistant: 第100条回复       │
└─────────────────────────────┘

压缩后（7条消息）:
┌─────────────────────────────┐
│ system message              │ ← 保留
│ assistant: [对话历史摘要]    │ ← 模型生成的摘要
│ user: 第96条消息             │ ← 最近5条保留
│ assistant: 第96条回复        │
│ user: 第97条消息             │
│ assistant: 第97条回复        │
│ user: 第98条消息             │
│ assistant: 第98条回复        │
│ user: 第99条消息             │
│ assistant: 第99条回复        │
│ user: 第100条消息            │
│ assistant: 第100条回复       │
└─────────────────────────────┘

效果: ~10000 tokens → ~800 tokens
```

## 事件通知

压缩发生时，Agent 会发出 `compress` 事件：

```typescript
emit({ type: 'compress', beforeTokens: 12345, afterTokens: 3456 });
```

在 REPL 中会显示：`[压缩] 12345 → 3456 tokens`
