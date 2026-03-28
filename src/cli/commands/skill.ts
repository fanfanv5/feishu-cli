/**
 * Skill commands: install/list/update/uninstall feishu skill for AI tools.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import { outputResult, outputError } from './shared.js';

type AiTool = 'default' | 'claude' | 'cursor' | 'windsurf' | 'copilot' | 'custom';

/** Prompt user for confirmation (yes/no) on stderr. Returns true if confirmed. */
function confirmPrompt(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise<boolean>((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/** Resolve the skill source directory (where SKILL.md and references/ live in the npm package). */
function getSkillSourceDir(): string {
  // Try multiple possible locations
  const candidates = [
    // npm global install: package root / skills / feishu
    path.resolve(fileURLToPath(import.meta.url), '..', '..', 'skills', 'feishu'),
    // tsup bundle: dist is one level up from src
    path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'skills', 'feishu'),
    // development: project root / skills / feishu
    path.resolve(process.cwd(), 'skills', 'feishu'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) return dir;
  }
  throw new Error(`Cannot find skill source directory. Tried:\n${candidates.join('\n')}`);
}

function resolveTargetDir(tool: AiTool, cwd: string, customPath?: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  switch (tool) {
    case 'default':
      return path.join(cwd, 'skills', 'feishu');
    case 'claude':
      return path.join(home, '.claude', 'skills', 'feishu');
    case 'cursor':
      return path.join(cwd, '.cursor', 'skills', 'feishu');
    case 'windsurf':
      return path.join(cwd, '.windsurf', 'skills', 'feishu');
    case 'copilot':
      return path.join(cwd, '.github', 'instructions');
    case 'custom':
      if (!customPath) throw new Error('custom tool requires --target <path>');
      return customPath;
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Build a single merged file for Copilot (all SKILL.md + references concatenated). */
function buildCopilotFile(sourceDir: string): string {
  const skillMd = fs.readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8');
  // Strip existing frontmatter
  const body = skillMd.replace(/^---\n[\s\S]*?\n---\n/, '');
  let content = `---\napplyTo:\n  - "**"\ndescription: "Feishu/Lark CLI - messaging, documents, bitable, calendar, tasks, drive, wiki, sheets, search"\n---\n\n`;
  content += body;

  // Append references
  const refsDir = path.join(sourceDir, 'references');
  if (fs.existsSync(refsDir)) {
    for (const file of fs.readdirSync(refsDir).sort()) {
      if (!file.endsWith('.md')) continue;
      const name = file.replace(/\.md$/, '');
      const refContent = fs.readFileSync(path.join(refsDir, file), 'utf8');
      content += `\n\n## Reference: ${name}\n\n${refContent}`;
    }
  }
  return content;
}

export function registerSkillCommands(parent: Command): void {
  const skill = parent.command('skill').description('Manage feishu skill installation for AI tools');

  // skill install
  skill
    .command('install')
    .description('Install feishu skill for an AI tool')
    .option('--tool <tool>', 'AI tool: claude|cursor|windsurf|copilot (default: install to <cwd>/skills/feishu/)')
    .option('--cwd <path>', 'Project root directory', process.cwd())
    .option('--target <path>', 'Custom target directory')
    .option('--force', 'Force overwrite existing installation')
    .action(async (opts) => {
      try {
        const tool = (opts.tool || 'default') as AiTool;
        if (opts.target && opts.tool !== 'custom') {
          // If --target is provided, auto-switch to custom
        }
        const finalTool = opts.target ? 'custom' as AiTool : tool;
        const cwd = opts.cwd || process.cwd();
        const sourceDir = getSkillSourceDir();
        const targetDir = resolveTargetDir(finalTool, cwd, opts.target);

        // Copilot special handling
        if (finalTool === 'copilot') {
          const filePath = path.join(targetDir, 'feishu.instructions.md');
          if (fs.existsSync(filePath) && !opts.force) {
            outputResult({ installed: false, message: `Already installed at ${filePath} (use --force to overwrite)` });
            return;
          }
          fs.mkdirSync(targetDir, { recursive: true });
          const content = buildCopilotFile(sourceDir);
          fs.writeFileSync(filePath, content, 'utf8');
          outputResult({ installed: true, tool: 'copilot', path: filePath });
          return;
        }

        // Prevent deleting source when source == target
        if (path.resolve(sourceDir) === path.resolve(targetDir)) {
          outputResult({ installed: true, tool: finalTool, path: targetDir, message: 'Source and target are the same directory, skipped copy' });
          return;
        }

        // Standard install
        if (fs.existsSync(targetDir) && !opts.force) {
          outputResult({ installed: false, message: `Already installed at ${targetDir} (use --force to overwrite)` });
          return;
        }

        // Clean old version residual files before installing
        if (fs.existsSync(targetDir)) {
          removeDirRecursive(targetDir);
        }

        fs.mkdirSync(targetDir, { recursive: true });
        // Copy SKILL.md
        const skillMd = path.join(sourceDir, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          fs.copyFileSync(skillMd, path.join(targetDir, 'SKILL.md'));
        }
        // Copy references/
        const refsDir = path.join(sourceDir, 'references');
        if (fs.existsSync(refsDir)) {
          copyDirRecursive(refsDir, path.join(targetDir, 'references'));
        }

        outputResult({ installed: true, tool: finalTool, path: targetDir });
      } catch (err) {
        outputError(err);
      }
    });

  // skill list
  skill
    .command('list')
    .description('Check skill installation status')
    .option('--cwd <path>', 'Project root directory', process.cwd())
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const cwd = opts.cwd || process.cwd();
        const tools: AiTool[] = ['default', 'claude', 'cursor', 'windsurf', 'copilot'];
        const results: Record<string, { installed: boolean; path: string }> = {};

        for (const tool of tools) {
          const targetDir = resolveTargetDir(tool, cwd);
          if (tool === 'copilot') {
            const filePath = path.join(targetDir, 'feishu.instructions.md');
            results[tool] = { installed: fs.existsSync(filePath), path: filePath };
          } else {
            results[tool] = {
              installed: fs.existsSync(path.join(targetDir, 'SKILL.md')),
              path: targetDir,
            };
          }
        }

        if (opts.json) {
          outputResult(results);
        } else {
          for (const [tool, info] of Object.entries(results)) {
            console.log(`  ${tool}: ${info.installed ? 'installed' : 'not installed'} (${info.path})`);
          }
        }
      } catch (err) {
        outputError(err);
      }
    });

  // skill update
  skill
    .command('update')
    .description('Update installed skill (force reinstall)')
    .option('--tool <tool>', 'AI tool: claude|cursor|windsurf|copilot (default: <cwd>/skills/feishu/)')
    .option('--cwd <path>', 'Project root directory', process.cwd())
    .option('--target <path>', 'Custom target directory')
    .action(async (opts) => {
      try {
        const tool = (opts.tool || 'default') as AiTool;
        const finalTool = opts.target ? 'custom' as AiTool : tool;
        const cwd = opts.cwd || process.cwd();
        const sourceDir = getSkillSourceDir();
        const targetDir = resolveTargetDir(finalTool, cwd, opts.target);

        if (finalTool === 'copilot') {
          const filePath = path.join(targetDir, 'feishu.instructions.md');
          fs.mkdirSync(targetDir, { recursive: true });
          const content = buildCopilotFile(sourceDir);
          fs.writeFileSync(filePath, content, 'utf8');
          outputResult({ updated: true, tool: 'copilot', path: filePath });
          return;
        }

        if (path.resolve(sourceDir) === path.resolve(targetDir)) {
          outputResult({ updated: true, tool: finalTool, path: targetDir, message: 'Source and target are the same directory, skipped copy' });
          return;
        }

        removeDirRecursive(targetDir);
        fs.mkdirSync(targetDir, { recursive: true });
        const skillMd = path.join(sourceDir, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          fs.copyFileSync(skillMd, path.join(targetDir, 'SKILL.md'));
        }
        const refsDir = path.join(sourceDir, 'references');
        if (fs.existsSync(refsDir)) {
          copyDirRecursive(refsDir, path.join(targetDir, 'references'));
        }

        outputResult({ updated: true, tool: finalTool, path: targetDir });
      } catch (err) {
        outputError(err);
      }
    });

  // skill uninstall
  skill
    .command('uninstall')
    .description('Remove installed skill')
    .option('--tool <tool>', 'AI tool: claude|cursor|windsurf|copilot (default: <cwd>/skills/feishu/)')
    .option('--cwd <path>', 'Project root directory', process.cwd())
    .option('--target <path>', 'Custom target directory')
    .action(async (opts) => {
      try {
        const tool = (opts.tool || 'default') as AiTool;
        const finalTool = opts.target ? 'custom' as AiTool : tool;
        const cwd = opts.cwd || process.cwd();
        const targetDir = resolveTargetDir(finalTool, cwd, opts.target);

        if (finalTool === 'copilot') {
          const filePath = path.join(targetDir, 'feishu.instructions.md');
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            outputResult({ uninstalled: true, path: filePath });
          } else {
            outputResult({ uninstalled: false, message: 'Not installed' });
          }
          return;
        }

        if (fs.existsSync(targetDir)) {
          removeDirRecursive(targetDir);
          outputResult({ uninstalled: true, path: targetDir });
        } else {
          outputResult({ uninstalled: false, message: 'Not installed' });
        }
      } catch (err) {
        outputError(err);
      }
    });
}
