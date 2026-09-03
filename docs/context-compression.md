# 上下文压缩

## 问题

对话越来越长，消息列表会超出模型的上下文限制：

```
第 1 轮: [system, user, assistant]                    ~500 tokens
第 5 轮: [system, user, assistant, tool, assistant...]  ~5000 tokens
第 20 轮: [system, ... 40条消息 ...]                    ~50000 tokens → 超限
```

## 解决思路

当消息太多时，把旧消息压缩成一段摘要，只保留最近几轮的完整消息：

```
压缩前:
  [system, msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8, msg9, msg10]

压缩后:
  [system, "摘要: 用户问了X，我做了Y...", msg8, msg9, msg10]
```

## 实现方式

### 方式一：调模型压缩

把旧消息发给模型 → "请用中文总结这段对话的要点" → 得到摘要

- 优点：摘要质量好
- 缺点：多一次 API 调用，有成本

### 方式二：滑动窗口

保留最近 N 条消息，直接丢掉更早的

- 优点：简单，零成本
- 缺点：丢失旧上下文

### 方式三：两者结合（推荐）

旧消息 → 调模型生成摘要，最近 N 条 → 保留完整

```
合并: [system, 摘要, 最近N条]
```

## 触发条件

消息总 token 数超过阈值（70%-80%）时触发压缩：

```typescript
if (estimateTokens(messages) > MAX_CONTEXT * 0.7) {
  messages = await compress(messages);
}
```

## 代码结构

```typescript
async function compressMessages(messages: Message[]): Promise<Message[]> {
  // 1. 分离：旧消息 vs 最近 N 条
  const old = messages.slice(0, -KEEP_RECENT);
  const recent = messages.slice(-KEEP_RECENT);

  // 2. 调模型生成摘要
  const summary = await client.chat([
    { role: 'user', content: `总结这段对话：\n${JSON.stringify(old)}` }
  ]);

  // 3. 合并
  return [
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: `[对话摘要]\n${summary}` },
    ...recent
  ];
}
```

## 总结

对话太长 → 摘要旧消息 + 保留最近几轮 → 继续对话

模型既能记住最近在做什么，又不会超出上下文限制。
