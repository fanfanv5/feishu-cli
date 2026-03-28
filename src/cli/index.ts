#!/usr/bin/env node
/**
 * feishu-cli — Standalone Feishu/Lark CLI tool.
 *
 * Usage:
 *   feishu calendar event list --start_time "2026-03-25" --end_time "2026-03-26"
 *   feishu task task create --summary "Buy groceries"
 *   feishu auth device-flow
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.js';

function loadVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../package.json', '../../package.json']) {
    try { return JSON.parse(readFileSync(join(dir, rel), 'utf8')).version; } catch {}
  }
  return '0.0.0';
}
const version = loadVersion();

const program = new Command();

program
  .name('feishu')
  .description('Standalone Feishu/Lark CLI tool')
  .version(version)
  .option('-a, --account <id>', 'Account ID to use', 'default')
  .hook('preAction', () => {
    // Skip config validation for skill and help commands
    const args = process.argv.slice(2);
    if (args[0] === 'skill' || args[0] === 'help' || args[0] === '--help' || args[0] === '-V' || args[0] === '--version') {
      return;
    }
    // Validate config on every other command
    const config = loadConfig();
    const feishu = config.channels?.feishu as Record<string, unknown> | undefined;
    if (!feishu?.appId || !feishu?.appSecret) {
      console.error('Error: No Feishu credentials configured.');
      console.error('Set FEISHU_APP_ID and FEISHU_APP_SECRET env vars, or create a config file.');
      console.error('See config.example.json for the format.');
      process.exit(1);
    }
  });

// Register command groups
import { registerCalendarCommands } from './commands/calendar.js';
import { registerTaskCommands } from './commands/task.js';
import { registerBitableCommands } from './commands/bitable.js';
import { registerImCommands } from './commands/im.js';
import { registerDriveCommands } from './commands/drive.js';
import { registerWikiCommands } from './commands/wiki.js';
import { registerDocCommands } from './commands/doc.js';
import { registerSheetsCommands } from './commands/sheets.js';
import { registerSearchCommands } from './commands/search.js';
import { registerChatCommands } from './commands/chat.js';
import { registerUserCommands } from './commands/user.js';
import { registerSendCommands } from './commands/send.js';
import { registerAuthCommands } from './commands/auth.js';

registerCalendarCommands(program);
registerTaskCommands(program);
registerBitableCommands(program);
registerImCommands(program);
registerDriveCommands(program);
registerWikiCommands(program);
registerDocCommands(program);
registerSheetsCommands(program);
registerSearchCommands(program);
registerChatCommands(program);
registerUserCommands(program);
registerSendCommands(program);
registerAuthCommands(program);
import { registerSkillCommands } from './commands/skill.js';
registerSkillCommands(program);

program.parse();
