import { resolve, relative, isAbsolute } from 'path';

/** workspace 根目录 */
let workspaceRoot: string = process.cwd();

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = resolve(root);
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

/**
 * 将路径解析为绝对路径，并检查是否在 workspace 内
 * 如果路径越界，返回 null
 */
export function safeResolve(inputPath: string): string | null {
  const resolved = resolve(workspaceRoot, inputPath);
  const rel = relative(workspaceRoot, resolved);
  // 拒绝 .. 穿越
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return resolved;
}
