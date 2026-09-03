import { ToolRegistry } from './protocol.js';
import { listFilesTool } from './list-files.js';
import { readFileTool } from './read-file.js';

export { ToolRegistry } from './protocol.js';
export type { Tool, ToolResult } from './protocol.js';

/** 创建默认工具注册表 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listFilesTool);
  registry.register(readFileTool);
  return registry;
}
