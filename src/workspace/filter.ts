/** 默认跳过的目录 */
export const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
]);

/** 判断目录名是否应跳过 */
export function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}
