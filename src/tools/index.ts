import { ToolRegistry } from './protocol.js';
import { listFilesTool } from './list-files.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { createDirectoryTool } from './create-directory.js';
import { runCommandTool } from './run-command.js';

export { ToolRegistry } from './protocol.js';
export type { Tool, ToolResult } from './protocol.js';

/** 创建默认工具注册表 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listFilesTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(createDirectoryTool);
  registry.register(runCommandTool);
  return registry;
}
