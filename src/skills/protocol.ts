/** 命令来源 */
export type CommandSource = 'builtin' | 'file';

/** 命令定义 */
export interface Command {
  /** 命令名（如 "review"） */
  name: string;
  /** 一行描述 */
  description: string;
  /** 指令模板，可包含 $ARGUMENTS 占位符 */
  instruction: string;
  /** 是否只读（禁止写入类工具） */
  readOnly?: boolean;
  /** 来源：内置 或 文件 */
  source: CommandSource;
  /** 文件路径（file 来源时） */
  location?: string;
}
