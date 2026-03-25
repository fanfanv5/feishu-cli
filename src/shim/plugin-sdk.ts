/**
 * openclaw/plugin-sdk — 本地替代 shim
 *
 * 提供 openclaw-lark 源码中所有从 'openclaw/plugin-sdk' 导入的
 * 类型和运行时值的替代实现，使源码无需修改即可在独立 CLI 中运行。
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const DEFAULT_ACCOUNT_ID = 'default';

export const PAIRING_APPROVED_MESSAGE = '';

export const DEFAULT_GROUP_HISTORY_LIMIT = 10;

export const SILENT_REPLY_TOKEN = '__SILENT__';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

export function normalizeAccountId(id: string): string | undefined {
  return id?.trim().toLowerCase() || undefined;
}

export function emptyPluginConfigSchema() {
  return {};
}

export function addWildcardAllowFrom(_config: unknown): void {
  // no-op
}

export function formatDocsLink(_path: string): string {
  return '';
}

export function buildRandomTempFilePath(_prefix?: string): string {
  const path = require('node:path');
  const crypto = require('node:crypto');
  const os = require('node:os');
  const name = `feishu-${crypto.randomUUID().slice(0, 8)}`;
  return path.join(os.tmpdir(), name);
}

// ---------------------------------------------------------------------------
// Action helpers (used by messaging/outbound/actions.ts)
// ---------------------------------------------------------------------------

export function extractToolSend(_params: Record<string, unknown>) {
  return undefined;
}

export function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], details: data };
}

export function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const val = params[key];
  return typeof val === 'string' ? val : undefined;
}

export function readReactionParams(_params: Record<string, unknown>) {
  return undefined;
}

// ---------------------------------------------------------------------------
// History management (no-op for CLI)
// ---------------------------------------------------------------------------

export function recordPendingHistoryEntryIfEnabled(
  _logger: unknown,
  _chatId: string,
  _entry: unknown,
): void {
  // no-op
}

export function resolveSenderCommandAuthorization(
  _config: unknown,
  _senderId: string,
  _chatId: string,
): boolean {
  return true;
}

export function isNormalizedSenderAllowed(
  _config: unknown,
  _normalizedSenderId: string,
  _chatId: string,
): boolean {
  return true;
}

export function clearHistoryEntriesIfEnabled(
  _logger: unknown,
  _chatId: string,
  _messageId: string,
): void {
  // no-op
}

export function buildPendingHistoryContextFromMap(
  _historyMap: unknown,
  _chatId: string,
  _maxEntries?: number,
): unknown[] {
  return [];
}

export function resolveThreadSessionKeys(
  _config: unknown,
  _chatId: string,
  _threadId?: string,
): string[] {
  return [];
}

// ---------------------------------------------------------------------------
// Reply / card helpers (no-op for CLI)
// ---------------------------------------------------------------------------

export function createReplyPrefixContext(_config: unknown, _chatId: string) {
  return { prefix: '' };
}

export function createTypingCallbacks(_config: unknown, _chatId: string, _messageId: string) {
  return {
    startTyping: async () => {},
    stopTyping: async () => {},
  };
}

export function logTypingFailure(_logger: unknown, _err: unknown): void {
  // no-op
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Top-level config type used everywhere */
export interface ClawdbotConfig {
  channels?: {
    feishu?: Record<string, unknown>;
    [key: string]: unknown;
  };
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Alias */
export type OpenClawConfig = ClawdbotConfig;

/** Plugin runtime (simplified for CLI) */
export interface PluginRuntime {
  config: {
    loadConfig(): ClawdbotConfig;
  };
  logging: {
    getChildLogger(opts: { subsystem: string }): RuntimeLogger;
  };
  channel: {
    commands: {
      shouldComputeCommandAuthorized: boolean;
      resolveCommandAuthorizedFromAuthorizers: unknown;
    };
    text: {
      chunkMarkdownText(text: string, limit: number): string[];
    };
  };
}

/** Runtime environment passed through monitor/handler chain */
export interface RuntimeEnv {
  log(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  config: ClawdbotConfig;
}

/** Logger interface */
export interface RuntimeLogger {
  debug?(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** History entry */
export interface HistoryEntry {
  messageId: string;
  senderId: string;
  content: string;
  timestamp: number;
}

/** Channel metadata */
export interface ChannelMeta {
  id: string;
  label: string;
  description: string;
}

/** Channel plugin interface (simplified) */
export interface ChannelPlugin<TAccount = unknown> {
  id: string;
  name: string;
  [key: string]: unknown;
}

/** Threading tool context */
export interface ChannelThreadingToolContext {
  chatId: string;
  threadMessageId?: string;
  [key: string]: unknown;
}

/** Outbound adapter */
export interface ChannelOutboundAdapter {
  sendText(params: unknown): Promise<unknown>;
  sendMedia(params: unknown): Promise<unknown>;
  sendPayload(params: unknown): Promise<unknown>;
}

/** Message action adapter */
export interface ChannelMessageActionAdapter {
  send(params: unknown): Promise<unknown>;
  react(params: unknown): Promise<unknown>;
  reactions(params: unknown): Promise<unknown>;
  delete(params: unknown): Promise<unknown>;
  unsend(params: unknown): Promise<unknown>;
}

/** Message action names */
export type ChannelMessageActionName = 'send' | 'react' | 'reactions' | 'delete' | 'unsend';

/** Group context */
export interface ChannelGroupContext {
  chatId: string;
  groupName?: string;
  [key: string]: unknown;
}

/** Group tool policy config */
export interface GroupToolPolicyConfig {
  allow?: string[];
  deny?: string[];
}

/** Onboarding adapter */
export interface ChannelOnboardingAdapter {
  [key: string]: unknown;
}

/** DM policy */
export type DmPolicy = 'open' | 'pairing' | 'allowlist' | 'disabled';

/** Wizard prompter */
export interface WizardPrompter {
  [key: string]: unknown;
}

/** Reply payload */
export interface ReplyPayload {
  text?: string;
  media?: unknown;
  channelData?: unknown;
}

/** Plugin API interface (simplified for CLI — not actually used) */
export interface OpenClawPluginApi {
  config?: ClawdbotConfig;
  logger: RuntimeLogger;
  runtime: PluginRuntime;
  registerChannel(opts: { plugin: unknown }): void;
  registerTool(tool: unknown, opts?: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  registerCli(callback: (ctx: unknown) => void, opts?: unknown): void;
}
