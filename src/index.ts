#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// 配置加载优先级：
// 1. 当前目录 .env
// 2. 用户主目录 ~/.zguigo/.env
const localEnv = resolve(process.cwd(), '.env');
const homeEnv = join(process.env.HOME || process.env.USERPROFILE || '', '.zguigo', '.env');

if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(homeEnv)) {
  config({ path: homeEnv });
} else {
  // 都没有，尝试加载（会从系统环境变量读取）
  config();
}

import { ConfigError } from './errors/index.js';
import { createModelClient } from './model/index.js';
import { createDefaultToolRegistry } from './tools/index.js';
import { startRepl } from './cli/index.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
zguigo - 终端 AI 编程助手

用法:
  zguigo                    启动交互式 REPL
  zguigo "你的问题"          执行一次任务并退出
  zguigo --debug            启动 REPL 并开启调试模式
  zguigo --help             显示帮助信息

环境变量 (.env):
  LLM_API_KEY               API 密钥（必需）
  LLM_BASE_URL              API 地址（必需）
  LLM_MODEL                 模型名称（必需）
`);
  process.exit(0);
}

const debug = args.includes('--debug');

try {
  const client = createModelClient();
  const tools = createDefaultToolRegistry();

  if (debug) {
    console.error('[debug] 模型客户端已初始化');
    console.error('[debug] 已注册工具:', tools.getDefinitions().map(t => t.function.name).join(', '));
  }

  await startRepl({ client, tools, debug });
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n配置错误: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
