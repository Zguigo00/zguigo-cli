import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

/** 知识加载器 - 加载 Skills 目录中的 .md 文件 */
export class KnowledgeLoader {
  private projectSkillsDir: string;
  private userSkillsDir: string;

  constructor(projectRoot: string) {
    this.projectSkillsDir = join(projectRoot, '.zguigo', 'skills');
    this.userSkillsDir = join(getUserHome(), '.zguigo', 'skills');
  }

  /**
   * 加载所有 .md 文件内容，拼接为一段知识文本
   * 扫描顺序：用户级 → 项目级
   */
  async loadAll(): Promise<string> {
    const sections: string[] = [];

    // 1. 用户级 skills
    const userKnowledge = await this.loadFromDir(this.userSkillsDir);
    if (userKnowledge) {
      sections.push(userKnowledge);
    }

    // 2. 项目级 skills（追加）
    const projectKnowledge = await this.loadFromDir(this.projectSkillsDir);
    if (projectKnowledge) {
      sections.push(projectKnowledge);
    }

    return sections.join('\n\n---\n\n');
  }

  /** 从目录加载所有 .md 文件 */
  private async loadFromDir(dir: string): Promise<string> {
    try {
      const files = await readdir(dir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length === 0) return '';

      const contents: string[] = [];

      for (const file of mdFiles) {
        try {
          const content = await readFile(join(dir, file), 'utf-8');
          contents.push(content.trim());
        } catch {
          // 忽略无法读取的文件
        }
      }

      return contents.join('\n\n');
    } catch {
      // 目录不存在
      return '';
    }
  }
}

/** 获取用户主目录 */
function getUserHome(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}
