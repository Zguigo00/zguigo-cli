import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import type { Command, CommandSource } from './protocol.js';

/** 解析 .md 文件为 Command */
function parseMdCommand(content: string, filePath: string): Command {
  const lines = content.split('\n');

  // 提取第一行非空行作为 description
  let description = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      description = trimmed;
      break;
    }
    // 如果是标题行，去掉 # 前缀
    if (trimmed.startsWith('#')) {
      description = trimmed.replace(/^#+\s*/, '');
      break;
    }
  }

  // 整个文件内容作为 instruction
  const instruction = content.trim();

  // 检查是否包含只读标记
  const readOnly = content.includes('只读') || content.includes('readOnly');

  const name = basename(filePath, '.md');

  return {
    name,
    description: description || `命令: ${name}`,
    instruction,
    readOnly: readOnly || undefined,
    source: 'file' as CommandSource,
    location: filePath,
  };
}

/** 命令注册表 */
export class CommandRegistry {
  private commands = new Map<string, Command>();
  private projectCommandsDir: string;
  private userCommandsDir: string;

  constructor(projectRoot: string) {
    this.projectCommandsDir = join(projectRoot, '.zguigo', 'commands');
    this.userCommandsDir = join(getUserHome(), '.zguigo', 'commands');
  }

  /** 注册内置命令 */
  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  /**
   * 查找命令
   * 优先级：项目级 > 用户级 > 内置
   */
  async get(name: string): Promise<Command | undefined> {
    // 1. 项目级
    const projectCmd = await this.loadFromFile(this.projectCommandsDir, name);
    if (projectCmd) return projectCmd;

    // 2. 用户级
    const userCmd = await this.loadFromFile(this.userCommandsDir, name);
    if (userCmd) return userCmd;

    // 3. 内置
    return this.commands.get(name);
  }

  /** 列出所有命令（合并三层，不重复） */
  async list(): Promise<Command[]> {
    const allCommands = new Map<string, Command>();

    // 1. 先添加内置
    for (const [name, cmd] of this.commands) {
      allCommands.set(name, cmd);
    }

    // 2. 用户级覆盖
    const userCmds = await this.loadAllFromDir(this.userCommandsDir);
    for (const cmd of userCmds) {
      allCommands.set(cmd.name, cmd);
    }

    // 3. 项目级覆盖（最高优先）
    const projectCmds = await this.loadAllFromDir(this.projectCommandsDir);
    for (const cmd of projectCmds) {
      allCommands.set(cmd.name, cmd);
    }

    return Array.from(allCommands.values());
  }

  /** 从目录加载指定命令 */
  private async loadFromFile(dir: string, name: string): Promise<Command | undefined> {
    try {
      const filePath = join(dir, `${name}.md`);
      const content = await readFile(filePath, 'utf-8');
      return parseMdCommand(content, filePath);
    } catch {
      return undefined;
    }
  }

  /** 从目录加载所有 .md 命令 */
  private async loadAllFromDir(dir: string): Promise<Command[]> {
    try {
      const files = await readdir(dir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      const commands: Command[] = [];

      for (const file of mdFiles) {
        try {
          const content = await readFile(join(dir, file), 'utf-8');
          commands.push(parseMdCommand(content, join(dir, file)));
        } catch {
          // 忽略无法读取的文件
        }
      }

      return commands;
    } catch {
      return [];
    }
  }
}

/** 获取用户主目录 */
function getUserHome(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}
