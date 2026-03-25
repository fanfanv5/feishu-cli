/**
 * Configuration loader for feishu-cli.
 *
 * Config sources (highest priority first):
 * 1. FEISHU_APP_ID / FEISHU_APP_SECRET env vars
 * 2. FEISHU_CONFIG env var (path to JSON file)
 * 3. ~/.feishu-cli/config.json
 * 4. .feishu-cli.json in current directory
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ClawdbotConfig } from '../shim/plugin-sdk';

const CONFIG_FILE_NAMES = ['.feishu-cli.json'];

function loadJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findConfigFile(): string | null {
  // Check FEISHU_CONFIG env var
  const envPath = process.env.FEISHU_CONFIG;
  if (envPath) return envPath;

  // Check home directory
  const homeConfig = join(homedir(), '.feishu-cli', 'config.json');
  if (existsSync(homeConfig)) return homeConfig;

  // Check current directory and up
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Load the full ClawdbotConfig-compatible configuration.
 */
export function loadConfig(): ClawdbotConfig {
  const config: ClawdbotConfig = {};

  // Load from file
  const configPath = findConfigFile();
  if (configPath) {
    const fileConfig = loadJsonFile(configPath);
    if (fileConfig) {
      Object.assign(config, fileConfig);
    }
  }

  // Ensure channels.feishu exists
  if (!config.channels) {
    config.channels = {};
  }
  if (!config.channels.feishu) {
    config.channels.feishu = {};
  }

  const feishu = config.channels.feishu as Record<string, unknown>;

  // Override with env vars
  if (process.env.FEISHU_APP_ID) {
    feishu.appId = process.env.FEISHU_APP_ID;
  }
  if (process.env.FEISHU_APP_SECRET) {
    feishu.appSecret = process.env.FEISHU_APP_SECRET;
  }
  if (process.env.FEISHU_DOMAIN) {
    feishu.domain = process.env.FEISHU_DOMAIN;
  }

  return config;
}

/**
 * Get the Feishu section of the config.
 */
export function getFeishuConfig(): Record<string, unknown> {
  const config = loadConfig();
  return (config.channels?.feishu as Record<string, unknown>) ?? {};
}

/**
 * Get app credentials from config.
 */
export function getCredentials(): { appId: string; appSecret: string; domain?: string } | null {
  const feishu = getFeishuConfig();
  const appId = feishu.appId as string | undefined;
  const appSecret = feishu.appSecret as string | undefined;
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    domain: (feishu.domain as string) || 'feishu',
  };
}
