import type { StreamEvent } from '../model/types.js';

/** 流式渲染器：将流式事件输出到 stdout */
export async function renderStream(
  stream: AsyncIterable<StreamEvent>,
): Promise<string> {
  let fullText = '';

  for await (const event of stream) {
    switch (event.type) {
      case 'text_delta':
        if (event.content) {
          process.stdout.write(event.content);
          fullText += event.content;
        }
        break;
      case 'tool_call_delta':
        // 工具调用不显示给用户，由 Agent 处理
        break;
      case 'done':
        break;
    }
  }

  // 最后换行
  if (fullText) {
    process.stdout.write('\n');
  }

  return fullText;
}
