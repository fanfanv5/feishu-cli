#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/cli/config.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var CONFIG_FILE_NAMES = [".feishu-cli.json"];
function loadJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function findConfigFile() {
  const envPath = process.env.FEISHU_CONFIG;
  if (envPath) return envPath;
  const homeConfig = join(homedir(), ".feishu-cli", "config.json");
  if (existsSync(homeConfig)) return homeConfig;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function loadConfig() {
  const config = {};
  const configPath = findConfigFile();
  if (configPath) {
    const fileConfig = loadJsonFile(configPath);
    if (fileConfig) {
      Object.assign(config, fileConfig);
    }
  }
  if (!config.channels) {
    config.channels = {};
  }
  if (!config.channels.feishu) {
    config.channels.feishu = {};
  }
  const feishu = config.channels.feishu;
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

// src/shim/plugin-sdk.ts
var DEFAULT_ACCOUNT_ID = "default";
function normalizeAccountId(id) {
  return id?.trim().toLowerCase() || void 0;
}

// src/core/accounts.ts
var normalizeAccountId2 = typeof normalizeAccountId === "function" ? normalizeAccountId : (id) => id?.trim().toLowerCase() || void 0;
function getLarkConfig(cfg) {
  return cfg?.channels?.feishu;
}
function getAccountMap(section) {
  return section.accounts;
}
function baseConfig(section) {
  const { accounts: _ignored, ...rest } = section;
  return rest;
}
function mergeAccountConfig(base, override) {
  return { ...base, ...override };
}
function toBrand(domain) {
  return domain ?? "feishu";
}
function getLarkAccountIds(cfg) {
  const section = getLarkConfig(cfg);
  if (!section) return [DEFAULT_ACCOUNT_ID];
  const accountMap = getAccountMap(section);
  if (!accountMap || Object.keys(accountMap).length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  const accountIds = Object.keys(accountMap);
  const hasDefault = accountIds.some((id) => id.trim().toLowerCase() === DEFAULT_ACCOUNT_ID);
  if (!hasDefault) {
    const base = baseConfig(section);
    if (base.appId && base.appSecret) {
      return [DEFAULT_ACCOUNT_ID, ...accountIds];
    }
  }
  return accountIds;
}
function getLarkAccount(cfg, accountId) {
  const requestedId = accountId ? normalizeAccountId2(accountId) ?? DEFAULT_ACCOUNT_ID : DEFAULT_ACCOUNT_ID;
  const section = getLarkConfig(cfg);
  if (!section) {
    return {
      accountId: requestedId,
      enabled: false,
      configured: false,
      brand: "feishu",
      config: {}
    };
  }
  const base = baseConfig(section);
  const accountMap = getAccountMap(section);
  const accountOverride = accountMap && requestedId !== DEFAULT_ACCOUNT_ID ? accountMap[requestedId] : void 0;
  const merged = accountOverride ? mergeAccountConfig(base, accountOverride) : { ...base };
  const appId = merged.appId;
  const appSecret = merged.appSecret;
  const configured = !!(appId && appSecret);
  const enabled = !!(merged.enabled ?? configured);
  const brand = toBrand(merged.domain);
  if (configured) {
    return {
      accountId: requestedId,
      enabled,
      configured: true,
      name: merged.name ?? void 0,
      appId,
      appSecret,
      encryptKey: merged.encryptKey ?? void 0,
      verificationToken: merged.verificationToken ?? void 0,
      brand,
      config: merged
    };
  }
  return {
    accountId: requestedId,
    enabled,
    configured: false,
    name: merged.name ?? void 0,
    appId: appId ?? void 0,
    appSecret: appSecret ?? void 0,
    encryptKey: merged.encryptKey ?? void 0,
    verificationToken: merged.verificationToken ?? void 0,
    brand,
    config: merged
  };
}
function getEnabledLarkAccounts(cfg) {
  const ids = getLarkAccountIds(cfg);
  const results = [];
  for (const id of ids) {
    const account = getLarkAccount(cfg, id);
    if (account.enabled && account.configured) {
      results.push(account);
    }
  }
  return results;
}

// src/core/lark-client.ts
import * as Lark from "@larksuiteoapi/node-sdk";

// src/core/lark-ticket.ts
import { AsyncLocalStorage } from "async_hooks";
var store = new AsyncLocalStorage();
function getTicket() {
  return store.getStore();
}

// src/core/lark-logger.ts
var CYAN = "\x1B[36m";
var YELLOW = "\x1B[33m";
var RED = "\x1B[31m";
var GRAY = "\x1B[90m";
var RESET = "\x1B[0m";
function consoleFallback(subsystem) {
  const tag = `feishu/${subsystem}`;
  return {
    debug: (msg, meta) => console.debug(`${GRAY}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
    info: (msg, meta) => console.log(`${CYAN}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
    warn: (msg, meta) => console.warn(`${YELLOW}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
    error: (msg, meta) => console.error(`${RED}[${tag}]${RESET}`, msg, ...meta ? [meta] : [])
  };
}
function resolveRuntimeLogger(_subsystem) {
  return null;
}
function getTraceMeta() {
  const ctx = getTicket();
  if (!ctx) return null;
  const trace = {
    accountId: ctx.accountId,
    messageId: ctx.messageId,
    chatId: ctx.chatId
  };
  if (ctx.senderOpenId) trace.senderOpenId = ctx.senderOpenId;
  return trace;
}
function enrichMeta(meta) {
  const trace = getTraceMeta();
  if (!trace) return meta ?? {};
  return meta ? { ...trace, ...meta } : trace;
}
function buildTracePrefix() {
  const ctx = getTicket();
  if (!ctx) return "feishu:";
  return `feishu[${ctx.accountId}][msg:${ctx.messageId}]:`;
}
function formatMessage(message, meta) {
  const prefix = buildTracePrefix();
  if (!meta || Object.keys(meta).length === 0) return `${prefix} ${message}`;
  const parts = Object.entries(meta).map(([k, v]) => {
    if (v === void 0 || v === null) return null;
    if (typeof v === "object") return `${k}=${JSON.stringify(v)}`;
    return `${k}=${v}`;
  }).filter(Boolean);
  return parts.length > 0 ? `${prefix} ${message} (${parts.join(", ")})` : `${prefix} ${message}`;
}
function createLarkLogger(subsystem) {
  let cachedLogger = null;
  let resolved = false;
  function getLogger() {
    if (!resolved) {
      cachedLogger = resolveRuntimeLogger(subsystem);
      if (cachedLogger) resolved = true;
    }
    return cachedLogger ?? consoleFallback(subsystem);
  }
  return {
    subsystem,
    debug(message, meta) {
      getLogger().debug?.(formatMessage(message, meta), enrichMeta(meta));
    },
    info(message, meta) {
      getLogger().info(formatMessage(message, meta), enrichMeta(meta));
    },
    warn(message, meta) {
      getLogger().warn(formatMessage(message, meta), enrichMeta(meta));
    },
    error(message, meta) {
      getLogger().error(formatMessage(message, meta), enrichMeta(meta));
    },
    child(name) {
      return createLarkLogger(`${subsystem}/${name}`);
    }
  };
}
function larkLogger(subsystem) {
  return createLarkLogger(subsystem);
}

// src/core/chat-info-cache.ts
var log = larkLogger("core/chat-info-cache");
var DEFAULT_TTL_MS = 60 * 60 * 1e3;
var registry = /* @__PURE__ */ new Map();
function clearChatInfoCache(accountId) {
  if (accountId !== void 0) {
    registry.get(accountId)?.clear();
    registry.delete(accountId);
  } else {
    for (const c of registry.values()) c.clear();
    registry.clear();
  }
}

// src/core/version.ts
import { fileURLToPath } from "url";
import { dirname, join as join2 } from "path";
import { readFileSync as readFileSync2 } from "fs";
var cachedVersion;
function getPluginVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join2(__dirname, "..", "..", "package.json");
    const raw = readFileSync2(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    cachedVersion = pkg.version ?? "unknown";
    return cachedVersion;
  } catch {
    cachedVersion = "unknown";
    return cachedVersion;
  }
}
function getUserAgent() {
  return `openclaw-lark/${getPluginVersion()}`;
}

// src/core/lark-client.ts
var log2 = larkLogger("core/lark-client");
var GLOBAL_LARK_USER_AGENT_KEY = "LARK_USER_AGENT";
function installGlobalUserAgent() {
  globalThis[GLOBAL_LARK_USER_AGENT_KEY] = getUserAgent();
}
installGlobalUserAgent();
Lark.defaultHttpInstance.interceptors.request.handlers = [];
Lark.defaultHttpInstance.interceptors.request.use(
  (req) => {
    if (req.headers) {
      req.headers["User-Agent"] = getUserAgent();
    }
    return req;
  },
  void 0,
  { synchronous: true }
);
var BRAND_TO_DOMAIN = {
  feishu: Lark.Domain.Feishu,
  lark: Lark.Domain.Lark
};
function resolveBrand(brand) {
  return BRAND_TO_DOMAIN[brand ?? "feishu"] ?? brand.replace(/\/+$/, "");
}
var cache = /* @__PURE__ */ new Map();
var LarkClient = class _LarkClient {
  account;
  _sdk = null;
  _wsClient = null;
  _botOpenId;
  _botName;
  _lastProbeResult = null;
  _lastProbeAt = 0;
  /** Attached message deduplicator — disposed together with the client. */
  messageDedup = null;
  // ---- Plugin runtime (optional, for standalone CLI) -----------------------
  static _runtime = null;
  /** Persist the runtime instance for later retrieval. */
  static setRuntime(runtime) {
    _LarkClient._runtime = runtime;
  }
  /** Retrieve the stored runtime instance, or null if not set. */
  static get runtime() {
    return _LarkClient._runtime;
  }
  // ---- Global config (singleton) -------------------------------------------
  //
  // Plugin commands receive an account-scoped config (channels.feishu replaced
  // with the merged per-account config, `accounts` map stripped).  Commands
  // that need cross-account visibility (e.g. doctor, diagnose) read the
  // original global config from here.
  static _globalConfig = null;
  /** Store the original global config (called during monitor startup). */
  static setGlobalConfig(cfg) {
    _LarkClient._globalConfig = cfg;
  }
  /** Retrieve the stored global config, or `null` if not yet set. */
  static get globalConfig() {
    return _LarkClient._globalConfig;
  }
  // --------------------------------------------------------------------------
  constructor(account) {
    this.account = account;
  }
  /** Shorthand for `this.account.accountId`. */
  get accountId() {
    return this.account.accountId;
  }
  // ---- Static factory / cache ------------------------------------------------
  /** Resolve account from config and return a cached `LarkClient`. */
  static fromCfg(cfg, accountId) {
    return _LarkClient.fromAccount(getLarkAccount(cfg, accountId));
  }
  /**
   * Get (or create) a cached `LarkClient` for the given account.
   * If the cached instance has stale credentials it is replaced.
   */
  static fromAccount(account) {
    const existing = cache.get(account.accountId);
    if (existing && existing.account.appId === account.appId && existing.account.appSecret === account.appSecret) {
      return existing;
    }
    if (existing) {
      log2.info(`credentials changed, disposing stale instance`, { accountId: account.accountId });
      existing.dispose();
    }
    const instance = new _LarkClient(account);
    cache.set(account.accountId, instance);
    return instance;
  }
  /**
   * Create an ephemeral `LarkClient` from bare credentials.
   * The instance is **not** added to the global cache — suitable for
   * one-off probe / diagnose calls that should not pollute account state.
   */
  static fromCredentials(credentials) {
    const base = {
      accountId: credentials.accountId ?? "default",
      enabled: true,
      brand: credentials.brand ?? "feishu",
      config: {}
    };
    const account = credentials.appId && credentials.appSecret ? { ...base, configured: true, appId: credentials.appId, appSecret: credentials.appSecret } : { ...base, configured: false, appId: credentials.appId, appSecret: credentials.appSecret };
    return new _LarkClient(account);
  }
  /** Look up a cached instance by accountId. */
  static get(accountId) {
    return cache.get(accountId) ?? null;
  }
  /**
   * Dispose one or all cached instances.
   * With `accountId` — dispose that single instance.
   * Without — dispose every cached instance and clear the cache.
   */
  static async clearCache(accountId) {
    if (accountId !== void 0) {
      cache.get(accountId)?.dispose();
      clearChatInfoCache(accountId);
    } else {
      for (const inst of cache.values()) inst.dispose();
      clearChatInfoCache();
    }
  }
  // ---- SDK client (lazy) -----------------------------------------------------
  /** Lazily-created Lark SDK client. */
  get sdk() {
    if (!this._sdk) {
      const { appId, appSecret } = this.requireCredentials();
      this._sdk = new Lark.Client({
        appId,
        appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveBrand(this.account.brand)
      });
    }
    return this._sdk;
  }
  // ---- Bot identity ----------------------------------------------------------
  /**
   * Probe bot identity via the `bot/v3/info` API.
   * Results are cached on the instance for subsequent access via
   * `botOpenId` / `botName`.
   */
  async probe(opts) {
    const maxAge = opts?.maxAgeMs ?? 0;
    if (maxAge > 0 && this._lastProbeResult && Date.now() - this._lastProbeAt < maxAge) {
      return this._lastProbeResult;
    }
    if (!this.account.appId || !this.account.appSecret) {
      return { ok: false, error: "missing credentials (appId, appSecret)" };
    }
    try {
      const res = await this.sdk.request({
        method: "GET",
        url: "/open-apis/bot/v3/info",
        data: {}
      });
      if (res.code !== 0) {
        const result2 = {
          ok: false,
          appId: this.account.appId,
          error: `API error: ${res.msg || `code ${res.code}`}`
        };
        this._lastProbeResult = result2;
        this._lastProbeAt = Date.now();
        return result2;
      }
      const bot = res.bot || res.data?.bot;
      this._botOpenId = bot?.open_id;
      this._botName = bot?.bot_name;
      const result = {
        ok: true,
        appId: this.account.appId,
        botName: this._botName,
        botOpenId: this._botOpenId
      };
      this._lastProbeResult = result;
      this._lastProbeAt = Date.now();
      return result;
    } catch (err) {
      const result = {
        ok: false,
        appId: this.account.appId,
        error: err instanceof Error ? err.message : String(err)
      };
      this._lastProbeResult = result;
      this._lastProbeAt = Date.now();
      return result;
    }
  }
  /** Cached bot open_id (available after `probe()` or `startWS()`). */
  get botOpenId() {
    return this._botOpenId;
  }
  /** Cached bot name (available after `probe()` or `startWS()`). */
  get botName() {
    return this._botName;
  }
  // ---- WebSocket lifecycle ---------------------------------------------------
  /**
   * Start WebSocket event monitoring.
   *
   * Flow: probe bot identity → EventDispatcher → WSClient → start.
   * The returned Promise resolves when `abortSignal` fires.
   */
  async startWS(opts) {
    const { handlers, abortSignal, autoProbe = true } = opts;
    if (autoProbe) await this.probe();
    const dispatcher = new Lark.EventDispatcher({
      encryptKey: this.account.encryptKey ?? "",
      verificationToken: this.account.verificationToken ?? ""
    });
    dispatcher.register(handlers);
    const { appId, appSecret } = this.requireCredentials();
    if (this._wsClient) {
      log2.warn(`closing previous WSClient before reconnect`, { accountId: this.accountId });
      try {
        this._wsClient.close({ force: true });
      } catch {
      }
      this._wsClient = null;
    }
    this._wsClient = new Lark.WSClient({
      appId,
      appSecret,
      domain: resolveBrand(this.account.brand),
      loggerLevel: Lark.LoggerLevel.info
    });
    const wsClientAny = this._wsClient;
    const origHandleEventData = wsClientAny.handleEventData.bind(wsClientAny);
    wsClientAny.handleEventData = (data) => {
      const msgType = data.headers?.find?.((h) => h.key === "type")?.value;
      if (msgType === "card") {
        const patchedData = {
          ...data,
          headers: data.headers.map((h) => h.key === "type" ? { ...h, value: "event" } : h)
        };
        return origHandleEventData(patchedData);
      }
      return origHandleEventData(data);
    };
    await this.waitForAbort(dispatcher, abortSignal);
  }
  /** Whether a WebSocket client is currently active. */
  get wsConnected() {
    return this._wsClient !== null;
  }
  /** Disconnect WebSocket but keep instance in cache. */
  disconnect() {
    if (this._wsClient) {
      log2.info(`disconnecting WebSocket`, { accountId: this.accountId });
      try {
        this._wsClient.close({ force: true });
      } catch {
      }
    }
    this._wsClient = null;
    if (this.messageDedup) {
      log2.info(`disposing message dedup`, { accountId: this.accountId, size: this.messageDedup.size });
      this.messageDedup.dispose();
      this.messageDedup = null;
    }
  }
  /** Disconnect + remove from cache. */
  dispose() {
    this.disconnect();
    cache.delete(this.accountId);
  }
  // ---- Private helpers -------------------------------------------------------
  /** Assert credentials exist or throw. */
  requireCredentials() {
    const appId = this.account.appId;
    const appSecret = this.account.appSecret;
    if (!appId || !appSecret) {
      throw new Error(`LarkClient[${this.accountId}]: appId and appSecret are required`);
    }
    return { appId, appSecret };
  }
  /**
   * Start the WSClient and return a promise that resolves when the
   * abort signal fires (or immediately if already aborted).
   */
  waitForAbort(dispatcher, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        this.disconnect();
        return resolve();
      }
      signal?.addEventListener(
        "abort",
        () => {
          this.disconnect();
          resolve();
        },
        { once: true }
      );
      try {
        void this._wsClient.start({ eventDispatcher: dispatcher });
      } catch (err) {
        this.disconnect();
        reject(err);
      }
    });
  }
};

// src/core/tool-client.ts
import * as Lark2 from "@larksuiteoapi/node-sdk";

// src/core/token-store.ts
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { mkdir, unlink, readFile, writeFile, chmod } from "fs/promises";
import { join as join3 } from "path";
import { homedir as homedir2 } from "os";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
var log3 = larkLogger("core/token-store");
var execFile = promisify(execFileCb);
var KEYCHAIN_SERVICE = "openclaw-feishu-uat";
var REFRESH_AHEAD_MS = 5 * 60 * 1e3;
function accountKey(appId, userOpenId) {
  return `${appId}:${userOpenId}`;
}
function maskToken(token) {
  if (token.length <= 8) return "****";
  return `****${token.slice(-4)}`;
}
var darwinBackend = {
  async get(service, account) {
    try {
      const { stdout } = await execFile("security", ["find-generic-password", "-s", service, "-a", account, "-w"]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  },
  async set(service, account, data) {
    try {
      await execFile("security", ["delete-generic-password", "-s", service, "-a", account]);
    } catch {
    }
    await execFile("security", ["add-generic-password", "-s", service, "-a", account, "-w", data]);
  },
  async remove(service, account) {
    try {
      await execFile("security", ["delete-generic-password", "-s", service, "-a", account]);
    } catch {
    }
  }
};
var LINUX_UAT_DIR = join3(process.env.XDG_DATA_HOME || join3(homedir2(), ".local", "share"), "openclaw-feishu-uat");
var MASTER_KEY_PATH = join3(LINUX_UAT_DIR, "master.key");
var MASTER_KEY_BYTES = 32;
var IV_BYTES = 12;
var TAG_BYTES = 16;
function linuxSafeFileName(account) {
  return account.replace(/[^a-zA-Z0-9._-]/g, "_") + ".enc";
}
async function ensureLinuxCredDir() {
  await mkdir(LINUX_UAT_DIR, { recursive: true, mode: 448 });
}
async function getMasterKey() {
  try {
    const key2 = await readFile(MASTER_KEY_PATH);
    if (key2.length === MASTER_KEY_BYTES) return key2;
    log3.warn("master key has unexpected length, regenerating");
  } catch (err) {
    if (!(err instanceof Error) || err.code !== "ENOENT") {
      log3.warn(`failed to read master key: ${err instanceof Error ? err.message : err}`);
    }
  }
  await ensureLinuxCredDir();
  const key = randomBytes(MASTER_KEY_BYTES);
  await writeFile(MASTER_KEY_PATH, key, { mode: 384 });
  await chmod(MASTER_KEY_PATH, 384);
  log3.info("generated new master key for encrypted file storage");
  return key;
}
function encryptData(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}
function decryptData(data, key) {
  if (data.length < IV_BYTES + TAG_BYTES) return null;
  try {
    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const enc = data.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
var linuxBackend = {
  async get(_service, account) {
    try {
      const key = await getMasterKey();
      const data = await readFile(join3(LINUX_UAT_DIR, linuxSafeFileName(account)));
      return decryptData(data, key);
    } catch {
      return null;
    }
  },
  async set(_service, account, data) {
    const key = await getMasterKey();
    await ensureLinuxCredDir();
    const filePath = join3(LINUX_UAT_DIR, linuxSafeFileName(account));
    const encrypted = encryptData(data, key);
    await writeFile(filePath, encrypted, { mode: 384 });
    await chmod(filePath, 384);
  },
  async remove(_service, account) {
    try {
      await unlink(join3(LINUX_UAT_DIR, linuxSafeFileName(account)));
    } catch {
    }
  }
};
var WIN32_UAT_DIR = join3(
  process.env.LOCALAPPDATA ?? join3(process.env.USERPROFILE ?? homedir2(), "AppData", "Local"),
  KEYCHAIN_SERVICE
);
var WIN32_MASTER_KEY_PATH = join3(WIN32_UAT_DIR, "master.key");
function win32SafeFileName(account) {
  return account.replace(/[^a-zA-Z0-9._-]/g, "_") + ".enc";
}
async function ensureWin32CredDir() {
  await mkdir(WIN32_UAT_DIR, { recursive: true });
}
async function getWin32MasterKey() {
  try {
    const key2 = await readFile(WIN32_MASTER_KEY_PATH);
    if (key2.length === MASTER_KEY_BYTES) return key2;
    log3.warn("win32 master key has unexpected length, regenerating");
  } catch (err) {
    if (!(err instanceof Error) || err.code !== "ENOENT") {
      log3.warn(`failed to read win32 master key: ${err instanceof Error ? err.message : err}`);
    }
  }
  await ensureWin32CredDir();
  const key = randomBytes(MASTER_KEY_BYTES);
  await writeFile(WIN32_MASTER_KEY_PATH, key);
  log3.info("generated new master key for win32 encrypted file storage");
  return key;
}
var win32Backend = {
  async get(_service, account) {
    try {
      const key = await getWin32MasterKey();
      const data = await readFile(join3(WIN32_UAT_DIR, win32SafeFileName(account)));
      return decryptData(data, key);
    } catch {
      return null;
    }
  },
  async set(_service, account, data) {
    const key = await getWin32MasterKey();
    await ensureWin32CredDir();
    const filePath = join3(WIN32_UAT_DIR, win32SafeFileName(account));
    const encrypted = encryptData(data, key);
    await writeFile(filePath, encrypted);
  },
  async remove(_service, account) {
    try {
      await unlink(join3(WIN32_UAT_DIR, win32SafeFileName(account)));
    } catch {
    }
  }
};
function createBackend() {
  switch (process.platform) {
    case "darwin":
      return darwinBackend;
    case "linux":
      return linuxBackend;
    case "win32":
      return win32Backend;
    default:
      log3.warn(`unsupported platform "${process.platform}", falling back to macOS backend`);
      return darwinBackend;
  }
}
var backend = createBackend();
async function getStoredToken(appId, userOpenId) {
  try {
    const json = await backend.get(KEYCHAIN_SERVICE, accountKey(appId, userOpenId));
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}
async function setStoredToken(token) {
  const key = accountKey(token.appId, token.userOpenId);
  const payload = JSON.stringify(token);
  await backend.set(KEYCHAIN_SERVICE, key, payload);
  log3.info(`saved UAT for ${token.userOpenId} (at:${maskToken(token.accessToken)})`);
}
async function removeStoredToken(appId, userOpenId) {
  await backend.remove(KEYCHAIN_SERVICE, accountKey(appId, userOpenId));
  log3.info(`removed UAT for ${userOpenId}`);
}
function tokenStatus(token) {
  const now = Date.now();
  if (now < token.expiresAt - REFRESH_AHEAD_MS) {
    return "valid";
  }
  if (now < token.refreshExpiresAt) {
    return "needs_refresh";
  }
  return "expired";
}

// src/core/feishu-fetch.ts
function feishuFetch(url, init) {
  const headers = {
    ...init?.headers,
    "User-Agent": getUserAgent()
  };
  return fetch(url, { ...init, headers });
}

// src/core/device-flow.ts
var log4 = larkLogger("core/device-flow");
function resolveOAuthEndpoints(brand) {
  if (!brand || brand === "feishu") {
    return {
      deviceAuthorization: "https://accounts.feishu.cn/oauth/v1/device_authorization",
      token: "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
    };
  }
  if (brand === "lark") {
    return {
      deviceAuthorization: "https://accounts.larksuite.com/oauth/v1/device_authorization",
      token: "https://open.larksuite.com/open-apis/authen/v2/oauth/token"
    };
  }
  const base = brand.replace(/\/+$/, "");
  let accountsBase = base;
  try {
    const parsed = new URL(base);
    if (parsed.hostname.startsWith("open.")) {
      accountsBase = `${parsed.protocol}//${parsed.hostname.replace(/^open\./, "accounts.")}`;
    }
  } catch {
  }
  return {
    deviceAuthorization: `${accountsBase}/oauth/v1/device_authorization`,
    token: `${base}/open-apis/authen/v2/oauth/token`
  };
}
async function requestDeviceAuthorization(params) {
  const { appId, appSecret, brand } = params;
  const endpoints = resolveOAuthEndpoints(brand);
  let scope = params.scope ?? "";
  if (!scope.includes("offline_access")) {
    scope = scope ? `${scope} offline_access` : "offline_access";
  }
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const body = new URLSearchParams();
  body.set("client_id", appId);
  body.set("scope", scope);
  log4.info(
    `requesting device authorization (scope="${scope}") url=${endpoints.deviceAuthorization} token_url=${endpoints.token}`
  );
  const resp = await feishuFetch(endpoints.deviceAuthorization, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`
    },
    body: body.toString()
  });
  const text = await resp.text();
  log4.info(`response status=${resp.status} body=${text.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Device authorization failed: HTTP ${resp.status} \u2013 ${text.slice(0, 200)}`);
  }
  if (!resp.ok || data.error) {
    const msg = data.error_description ?? data.error ?? "Unknown error";
    throw new Error(`Device authorization failed: ${msg}`);
  }
  const expiresIn = data.expires_in ?? 240;
  const interval = data.interval ?? 5;
  log4.info(`device_code obtained, expires_in=${expiresIn}s (${Math.round(expiresIn / 60)}min), interval=${interval}s`);
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete ?? data.verification_uri,
    expiresIn,
    interval
  };
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
async function pollDeviceToken(params) {
  const MAX_POLL_INTERVAL = 60;
  const MAX_POLL_ATTEMPTS = 200;
  const { appId, appSecret, brand, deviceCode, expiresIn, signal } = params;
  let interval = params.interval;
  const endpoints = resolveOAuthEndpoints(brand);
  const deadline = Date.now() + expiresIn * 1e3;
  let attempts = 0;
  while (Date.now() < deadline && attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    if (signal?.aborted) {
      return { ok: false, error: "expired_token", message: "Polling was cancelled" };
    }
    await sleep(interval * 1e3, signal);
    let data;
    try {
      const resp = await feishuFetch(endpoints.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: appId,
          client_secret: appSecret
        }).toString()
      });
      data = await resp.json();
    } catch (err) {
      log4.warn(`poll network error: ${err}`);
      interval = Math.min(interval + 1, MAX_POLL_INTERVAL);
      continue;
    }
    const error = data.error;
    if (!error && data.access_token) {
      log4.info("token obtained successfully");
      const refreshToken = data.refresh_token ?? "";
      const expiresIn2 = data.expires_in ?? 7200;
      let refreshExpiresIn = data.refresh_token_expires_in ?? 604800;
      if (!refreshToken) {
        log4.warn("no refresh_token in response, token will not be refreshable");
        refreshExpiresIn = expiresIn2;
      }
      return {
        ok: true,
        token: {
          accessToken: data.access_token,
          refreshToken,
          expiresIn: expiresIn2,
          refreshExpiresIn,
          scope: data.scope ?? ""
        }
      };
    }
    if (error === "authorization_pending") {
      log4.debug("authorization_pending, retrying...");
      continue;
    }
    if (error === "slow_down") {
      interval = Math.min(interval + 5, MAX_POLL_INTERVAL);
      log4.info(`slow_down, interval increased to ${interval}s`);
      continue;
    }
    if (error === "access_denied") {
      log4.info("user denied authorization");
      return { ok: false, error: "access_denied", message: "\u7528\u6237\u62D2\u7EDD\u4E86\u6388\u6743" };
    }
    if (error === "expired_token" || error === "invalid_grant") {
      log4.info(`device code expired/invalid (error=${error})`);
      return { ok: false, error: "expired_token", message: "\u6388\u6743\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77" };
    }
    const desc = data.error_description ?? error ?? "Unknown error";
    log4.warn(`unexpected error: error=${error}, desc=${desc}`);
    return { ok: false, error: "expired_token", message: desc };
  }
  if (attempts >= MAX_POLL_ATTEMPTS) {
    log4.warn(`max poll attempts (${MAX_POLL_ATTEMPTS}) reached`);
  }
  return { ok: false, error: "expired_token", message: "\u6388\u6743\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77" };
}

// src/core/auth-errors.ts
var LARK_ERROR = {
  /** 应用 scope 不足（租户维度） */
  APP_SCOPE_MISSING: 99991672,
  /** 用户 token scope 不足 */
  USER_SCOPE_INSUFFICIENT: 99991679,
  /** access_token 无效 */
  TOKEN_INVALID: 99991668,
  /** access_token 已过期 */
  TOKEN_EXPIRED: 99991677,
  /** refresh_token 本身无效（格式非法或来自 v1 API） */
  REFRESH_TOKEN_INVALID: 20026,
  /** refresh_token 已过期（超过 365 天） */
  REFRESH_TOKEN_EXPIRED: 20037,
  /** refresh_token 已被吊销 */
  REFRESH_TOKEN_REVOKED: 20064,
  /** refresh_token 已被使用（单次消费，rotation 场景） */
  REFRESH_TOKEN_ALREADY_USED: 20073,
  /** refresh token 端点服务端内部错误，可重试 */
  REFRESH_SERVER_ERROR: 20050,
  /** 消息已被撤回 */
  MESSAGE_RECALLED: 230011,
  /** 消息已被删除 */
  MESSAGE_DELETED: 231003
};
var REFRESH_TOKEN_RETRYABLE = /* @__PURE__ */ new Set([
  LARK_ERROR.REFRESH_SERVER_ERROR
]);
var MESSAGE_TERMINAL_CODES = /* @__PURE__ */ new Set([
  LARK_ERROR.MESSAGE_RECALLED,
  LARK_ERROR.MESSAGE_DELETED
]);
var TOKEN_RETRY_CODES = /* @__PURE__ */ new Set([LARK_ERROR.TOKEN_INVALID, LARK_ERROR.TOKEN_EXPIRED]);
var NeedAuthorizationError = class extends Error {
  userOpenId;
  constructor(userOpenId) {
    super("need_user_authorization");
    this.name = "NeedAuthorizationError";
    this.userOpenId = userOpenId;
  }
};
var AppScopeCheckFailedError = class extends Error {
  /** 应用 ID，用于生成开放平台权限管理链接。 */
  appId;
  constructor(appId) {
    super("\u5E94\u7528\u7F3A\u5C11 application:application:self_manage \u6743\u9650\uFF0C\u65E0\u6CD5\u67E5\u8BE2\u5E94\u7528\u6743\u9650\u914D\u7F6E\u3002\u8BF7\u7BA1\u7406\u5458\u5728\u5F00\u653E\u5E73\u53F0\u5F00\u901A\u8BE5\u6743\u9650\u3002");
    this.name = "AppScopeCheckFailedError";
    this.appId = appId;
  }
};
var AppScopeMissingError = class extends Error {
  apiName;
  /** OAPI 需要但 APP 未开通的 scope 列表。 */
  missingScopes;
  /** 工具的全部所需 scope（含已开通的），用于应用权限完成后一次性发起用户授权。 */
  allRequiredScopes;
  /** 应用 ID，用于生成开放平台权限管理链接。 */
  appId;
  scopeNeedType;
  /** 触发此错误时使用的 token 类型，用于保持 card action 二次校验一致。 */
  tokenType;
  constructor(info, scopeNeedType, tokenType, allRequiredScopes) {
    if (scopeNeedType === "one") {
      super(`\u5E94\u7528\u7F3A\u5C11\u6743\u9650 [${info.scopes.join(", ")}](\u5F00\u542F\u4EFB\u4E00\u6743\u9650\u5373\u53EF)\uFF0C\u8BF7\u7BA1\u7406\u5458\u5728\u5F00\u653E\u5E73\u53F0\u5F00\u901A\u3002`);
    } else {
      super(`\u5E94\u7528\u7F3A\u5C11\u6743\u9650 [${info.scopes.join(", ")}]\uFF0C\u8BF7\u7BA1\u7406\u5458\u5728\u5F00\u653E\u5E73\u53F0\u5F00\u901A\u3002`);
    }
    this.name = "AppScopeMissingError";
    this.apiName = info.apiName;
    this.missingScopes = info.scopes;
    this.allRequiredScopes = allRequiredScopes;
    this.appId = info.appId;
    this.scopeNeedType = scopeNeedType;
    this.tokenType = tokenType;
  }
};
var UserAuthRequiredError = class extends Error {
  userOpenId;
  apiName;
  /** APP∩OAPI 交集 scope，传给 OAuth authorize。 */
  requiredScopes;
  /** 应用 scope 是否已验证通过。false 时 requiredScopes 可能不准确。 */
  appScopeVerified;
  /** 应用 ID，用于生成开放平台权限管理链接。 */
  appId;
  constructor(userOpenId, info) {
    super("need_user_authorization");
    this.name = "UserAuthRequiredError";
    this.userOpenId = userOpenId;
    this.apiName = info.apiName;
    this.requiredScopes = info.scopes;
    this.appId = info.appId;
    this.appScopeVerified = info.appScopeVerified ?? true;
  }
};
var UserScopeInsufficientError = class extends Error {
  userOpenId;
  apiName;
  /** 缺失的 scope 列表。 */
  missingScopes;
  constructor(userOpenId, info) {
    super("user_scope_insufficient");
    this.name = "UserScopeInsufficientError";
    this.userOpenId = userOpenId;
    this.apiName = info.apiName;
    this.missingScopes = info.scopes;
  }
};

// src/core/uat-client.ts
var log5 = larkLogger("core/uat-client");
var refreshLocks = /* @__PURE__ */ new Map();
async function doRefreshToken(opts, stored) {
  if (Date.now() >= stored.refreshExpiresAt) {
    log5.info(`refresh_token expired for ${opts.userOpenId}, clearing`);
    await removeStoredToken(opts.appId, opts.userOpenId);
    return null;
  }
  const endpoints = resolveOAuthEndpoints(opts.domain);
  const requestBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    client_id: opts.appId,
    client_secret: opts.appSecret
  }).toString();
  const callEndpoint = async () => {
    const resp = await feishuFetch(endpoints.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: requestBody
    });
    return await resp.json();
  };
  let data = await callEndpoint();
  const code = data.code;
  const error = data.error;
  if (code !== void 0 && code !== 0 || error) {
    const errCode = code ?? error;
    if (REFRESH_TOKEN_RETRYABLE.has(code)) {
      log5.warn(`refresh transient error (code=${errCode}) for ${opts.userOpenId}, retrying once`);
      data = await callEndpoint();
      const retryCode = data.code;
      const retryError = data.error;
      if (retryCode !== void 0 && retryCode !== 0 || retryError) {
        const retryErrCode = retryCode ?? retryError;
        log5.warn(`refresh failed after retry (code=${retryErrCode}), clearing token for ${opts.userOpenId}`);
        await removeStoredToken(opts.appId, opts.userOpenId);
        return null;
      }
    } else {
      log5.warn(`refresh failed (code=${errCode}), clearing token for ${opts.userOpenId}`);
      await removeStoredToken(opts.appId, opts.userOpenId);
      return null;
    }
  }
  if (!data.access_token) {
    throw new Error("Token refresh returned no access_token");
  }
  const now = Date.now();
  const updated = {
    userOpenId: stored.userOpenId,
    appId: opts.appId,
    accessToken: data.access_token,
    // refresh_token is rotated – always use the new one.
    refreshToken: data.refresh_token ?? stored.refreshToken,
    expiresAt: now + (data.expires_in ?? 7200) * 1e3,
    refreshExpiresAt: data.refresh_token_expires_in ? now + data.refresh_token_expires_in * 1e3 : stored.refreshExpiresAt,
    scope: data.scope ?? stored.scope,
    grantedAt: stored.grantedAt
  };
  await setStoredToken(updated);
  log5.info(`refreshed UAT for ${opts.userOpenId} (at:${maskToken(updated.accessToken)})`);
  return updated;
}
async function refreshWithLock(opts, stored) {
  const key = `${opts.appId}:${opts.userOpenId}`;
  const existing = refreshLocks.get(key);
  if (existing) {
    await existing;
    return getStoredToken(opts.appId, opts.userOpenId);
  }
  const promise = doRefreshToken(opts, stored);
  refreshLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    refreshLocks.delete(key);
  }
}
async function getValidAccessToken(opts) {
  const stored = await getStoredToken(opts.appId, opts.userOpenId);
  if (!stored) {
    throw new NeedAuthorizationError(opts.userOpenId);
  }
  const status = tokenStatus(stored);
  if (status === "valid") {
    return stored.accessToken;
  }
  if (status === "needs_refresh") {
    const refreshed = await refreshWithLock(opts, stored);
    if (!refreshed) {
      throw new NeedAuthorizationError(opts.userOpenId);
    }
    return refreshed.accessToken;
  }
  await removeStoredToken(opts.appId, opts.userOpenId);
  throw new NeedAuthorizationError(opts.userOpenId);
}
async function callWithUAT(opts, apiCall) {
  const accessToken = await getValidAccessToken(opts);
  try {
    return await apiCall(accessToken);
  } catch (err) {
    const code = err?.code ?? err?.response?.data?.code;
    if (TOKEN_RETRY_CODES.has(code)) {
      log5.warn(`API call failed (code=${code}), refreshing and retrying`);
      const stored = await getStoredToken(opts.appId, opts.userOpenId);
      if (!stored) throw new NeedAuthorizationError(opts.userOpenId);
      const refreshed = await refreshWithLock(opts, stored);
      if (!refreshed) throw new NeedAuthorizationError(opts.userOpenId);
      return await apiCall(refreshed.accessToken);
    }
    throw err;
  }
}

// src/core/app-scope-checker.ts
var log6 = larkLogger("core/app-scope-checker");
var cache2 = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 30 * 1e3;
function invalidateAppScopeCache(appId) {
  cache2.delete(appId);
}
async function getAppGrantedScopes(sdk, appId, tokenType) {
  const cached = cache2.get(appId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rawScopes.filter((s) => {
      if (tokenType && s.token_types && Array.isArray(s.token_types)) {
        return s.token_types.includes(tokenType);
      }
      return true;
    }).map((s) => s.scope);
  }
  try {
    const res = await sdk.request({
      method: "GET",
      url: `/open-apis/application/v6/applications/${appId}`,
      params: { lang: "zh_cn" }
    });
    if (res.code !== 0) {
      throw new AppScopeCheckFailedError(appId);
    }
    const app = res.data?.app ?? res.app ?? res.data;
    const rawScopes = app?.scopes ?? app?.online_version?.scopes ?? [];
    const validScopes = rawScopes.filter((s) => typeof s.scope === "string" && s.scope.length > 0).map((s) => ({ scope: s.scope, token_types: s.token_types }));
    cache2.set(appId, { rawScopes: validScopes, rawApp: app, fetchedAt: Date.now() });
    log6.info(`fetched ${validScopes.length} scopes for app ${appId}`);
    const scopes = validScopes.filter((s) => {
      if (tokenType && s.token_types && Array.isArray(s.token_types)) {
        return s.token_types.includes(tokenType);
      }
      return true;
    }).map((s) => s.scope);
    log6.info(`returning ${scopes.length} scopes${tokenType ? ` for ${tokenType} token` : ""}`);
    return scopes;
  } catch (err) {
    if (err instanceof AppScopeCheckFailedError) {
      throw err;
    }
    const statusCode = err?.response?.status || err?.status || err?.statusCode;
    const isPermissionError = statusCode === 400 || statusCode === 403 || err instanceof Error && (err.message.includes("status code 400") || err.message.includes("status code 403"));
    if (isPermissionError) {
      throw new AppScopeCheckFailedError(appId);
    }
    log6.warn(`failed to fetch scopes for ${appId}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
async function getAppInfo(sdk, appId) {
  await getAppGrantedScopes(sdk, appId);
  const cached = cache2.get(appId);
  const rawApp = cached?.rawApp;
  const owner = rawApp?.owner;
  const creatorId = rawApp?.creator_id;
  const ownerTypeValue = owner?.owner_type ?? owner?.type;
  const effectiveOwnerOpenId = ownerTypeValue === 2 && owner?.owner_id ? owner.owner_id : creatorId ?? owner?.owner_id;
  return {
    appId,
    creatorId,
    ownerOpenId: owner?.owner_id,
    ownerType: owner?.owner_type,
    effectiveOwnerOpenId,
    scopes: cached?.rawScopes ?? []
  };
}
function missingScopes(appGranted, apiRequired) {
  const grantedSet = new Set(appGranted);
  return apiRequired.filter((s) => !grantedSet.has(s));
}

// src/core/app-owner-fallback.ts
var log7 = larkLogger("core/app-owner-fallback");
async function getAppOwnerFallback(account, sdk) {
  const { appId } = account;
  try {
    const appInfo = await getAppInfo(sdk, appId);
    return appInfo.effectiveOwnerOpenId;
  } catch (err) {
    log7.warn(`failed to get owner for ${appId}: ${err instanceof Error ? err.message : err}`);
    return void 0;
  }
}

// src/core/tool-scopes.ts
var TOOL_SCOPES = {
  "feishu_bitable_app.create": ["base:app:create"],
  "feishu_bitable_app.get": ["base:app:read"],
  "feishu_bitable_app.list": ["space:document:retrieve"],
  "feishu_bitable_app.patch": ["base:app:update"],
  "feishu_bitable_app.copy": ["base:app:copy"],
  "feishu_bitable_app_table.create": ["base:table:create"],
  "feishu_bitable_app_table.list": ["base:table:read"],
  "feishu_bitable_app_table.patch": ["base:table:update"],
  "feishu_bitable_app_table.batch_create": ["base:table:create"],
  "feishu_bitable_app_table_record.create": ["base:record:create"],
  "feishu_bitable_app_table_record.update": ["base:record:update"],
  "feishu_bitable_app_table_record.delete": ["base:record:delete"],
  "feishu_bitable_app_table_record.batch_create": ["base:record:create"],
  "feishu_bitable_app_table_record.batch_update": ["base:record:update"],
  "feishu_bitable_app_table_record.batch_delete": ["base:record:delete"],
  "feishu_bitable_app_table_record.list": ["base:record:retrieve"],
  "feishu_bitable_app_table_field.create": ["base:field:create"],
  "feishu_bitable_app_table_field.list": ["base:field:read"],
  "feishu_bitable_app_table_field.update": ["base:field:read", "base:field:update"],
  "feishu_bitable_app_table_field.delete": ["base:field:delete"],
  "feishu_bitable_app_table_view.create": ["base:view:write_only"],
  "feishu_bitable_app_table_view.get": ["base:view:read"],
  "feishu_bitable_app_table_view.list": ["base:view:read"],
  "feishu_bitable_app_table_view.patch": ["base:view:write_only"],
  "feishu_calendar_calendar.list": ["calendar:calendar:read"],
  "feishu_calendar_calendar.get": ["calendar:calendar:read"],
  "feishu_calendar_calendar.primary": ["calendar:calendar:read"],
  "feishu_calendar_event.create": ["calendar:calendar.event:create", "calendar:calendar.event:update"],
  "feishu_calendar_event.list": ["calendar:calendar.event:read"],
  "feishu_calendar_event.get": ["calendar:calendar.event:read"],
  "feishu_calendar_event.patch": ["calendar:calendar.event:update"],
  "feishu_calendar_event.delete": ["calendar:calendar.event:delete"],
  "feishu_calendar_event.search": ["calendar:calendar.event:read"],
  "feishu_calendar_event.reply": ["calendar:calendar.event:reply"],
  "feishu_calendar_event.instances": ["calendar:calendar.event:read"],
  "feishu_calendar_event.instance_view": ["calendar:calendar.event:read"],
  "feishu_calendar_event_attendee.create": ["calendar:calendar.event:update"],
  "feishu_calendar_event_attendee.list": ["calendar:calendar.event:read"],
  "feishu_calendar_freebusy.list": ["calendar:calendar.free_busy:read"],
  "feishu_task_task.create": ["task:task:write", "task:task:writeonly"],
  "feishu_task_task.get": ["task:task:read", "task:task:write"],
  "feishu_task_task.list": ["task:task:read", "task:task:write"],
  "feishu_task_task.patch": ["task:task:write", "task:task:writeonly"],
  "feishu_task_tasklist.create": ["task:tasklist:write"],
  "feishu_task_tasklist.get": ["task:tasklist:read", "task:tasklist:write"],
  "feishu_task_tasklist.list": ["task:tasklist:read", "task:tasklist:write"],
  "feishu_task_tasklist.tasks": ["task:tasklist:read", "task:tasklist:write"],
  "feishu_task_tasklist.patch": ["task:tasklist:write"],
  "feishu_task_tasklist.add_members": ["task:tasklist:write"],
  "feishu_task_comment.create": ["task:comment:write"],
  "feishu_task_comment.list": ["task:comment:read", "task:comment:write"],
  "feishu_task_comment.get": ["task:comment:read", "task:comment:write"],
  "feishu_task_subtask.create": ["task:task:write"],
  "feishu_task_subtask.list": ["task:task:read", "task:task:write"],
  "feishu_chat.search": ["im:chat:read"],
  "feishu_chat.get": ["im:chat:read"],
  "feishu_chat_members.default": ["im:chat.members:read"],
  "feishu_drive_file.list": ["space:document:retrieve"],
  "feishu_drive_file.get_meta": ["drive:drive.metadata:readonly"],
  "feishu_drive_file.copy": ["docs:document:copy"],
  "feishu_drive_file.move": ["space:document:move"],
  "feishu_drive_file.delete": ["space:document:delete"],
  "feishu_drive_file.upload": ["drive:file:upload"],
  "feishu_drive_file.download": ["drive:file:download"],
  "feishu_doc_media.download": ["board:whiteboard:node:read", "docs:document.media:download"],
  "feishu_doc_media.insert": ["docx:document:write_only", "docs:document.media:upload"],
  "feishu_doc_comments.list": ["wiki:node:read", "docs:document.comment:read"],
  "feishu_doc_comments.create": ["wiki:node:read", "docs:document.comment:create"],
  "feishu_doc_comments.patch": ["docs:document.comment:update"],
  "feishu_wiki_space.list": ["wiki:space:retrieve"],
  "feishu_wiki_space.get": ["wiki:space:read"],
  "feishu_wiki_space.create": ["wiki:space:write_only"],
  "feishu_wiki_space_node.list": ["wiki:node:retrieve"],
  "feishu_wiki_space_node.get": ["wiki:node:read"],
  "feishu_wiki_space_node.create": ["wiki:node:create"],
  "feishu_wiki_space_node.move": ["wiki:node:move"],
  "feishu_wiki_space_node.copy": ["wiki:node:copy"],
  "feishu_im_user_message.send": ["im:message", "im:message.send_as_user"],
  "feishu_im_user_message.reply": ["im:message", "im:message.send_as_user"],
  "feishu_im_user_fetch_resource.default": [
    "im:message.group_msg:get_as_user",
    "im:message.p2p_msg:get_as_user",
    "im:message:readonly"
  ],
  "feishu_im_user_get_messages.default": [
    "im:chat:read",
    "im:message:readonly",
    "im:message.group_msg:get_as_user",
    "im:message.p2p_msg:get_as_user",
    "contact:contact.base:readonly",
    "contact:user.base:readonly"
  ],
  "feishu_im_user_search_messages.default": [
    "im:chat:read",
    "im:message:readonly",
    "im:message.group_msg:get_as_user",
    "im:message.p2p_msg:get_as_user",
    "contact:contact.base:readonly",
    "contact:user.base:readonly",
    "search:message"
  ],
  "feishu_search_doc_wiki.search": ["search:docs:read"],
  "feishu_get_user.basic_batch": ["contact:user.basic_profile:readonly"],
  "feishu_get_user.default": ["contact:contact.base:readonly", "contact:user.base:readonly"],
  "feishu_search_user.default": ["contact:user:search"],
  "feishu_create_doc.default": [
    "board:whiteboard:node:create",
    "docx:document:create",
    "docx:document:readonly",
    "docx:document:write_only",
    "wiki:node:create",
    "wiki:node:read",
    "docs:document.media:upload"
  ],
  "feishu_fetch_doc.default": ["docx:document:readonly", "wiki:node:read"],
  "feishu_update_doc.default": [
    "board:whiteboard:node:create",
    "docx:document:create",
    "docx:document:readonly",
    "docx:document:write_only"
  ],
  "feishu_sheet.info": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
  "feishu_sheet.read": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
  "feishu_sheet.write": [
    "sheets:spreadsheet.meta:read",
    "sheets:spreadsheet:read",
    "sheets:spreadsheet:create",
    "sheets:spreadsheet:write_only"
  ],
  "feishu_sheet.append": [
    "sheets:spreadsheet.meta:read",
    "sheets:spreadsheet:read",
    "sheets:spreadsheet:create",
    "sheets:spreadsheet:write_only"
  ],
  "feishu_sheet.find": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
  "feishu_sheet.create": [
    "sheets:spreadsheet.meta:read",
    "sheets:spreadsheet:read",
    "sheets:spreadsheet:create",
    "sheets:spreadsheet:write_only"
  ],
  "feishu_sheet.export": ["docs:document:export"]
};

// src/core/scope-manager.ts
function getRequiredScopes(toolAction) {
  return TOOL_SCOPES[toolAction] ?? [];
}

// src/core/raw-request.ts
function resolveDomainUrl(brand) {
  const map = {
    feishu: "https://open.feishu.cn",
    lark: "https://open.larksuite.com"
  };
  return map[brand] ?? `https://${brand}`;
}
async function rawLarkRequest(options) {
  const baseUrl = resolveDomainUrl(options.brand);
  const url = new URL(options.path, baseUrl);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }
  const headers = {};
  if (options.accessToken) {
    headers["Authorization"] = `Bearer ${options.accessToken}`;
  }
  if (options.body !== void 0) {
    headers["Content-Type"] = "application/json";
  }
  if (options.headers) {
    Object.assign(headers, options.headers);
  }
  const resp = await feishuFetch(url.toString(), {
    method: options.method ?? "GET",
    headers,
    ...options.body !== void 0 ? { body: JSON.stringify(options.body) } : {}
  });
  const data = await resp.json();
  if (data.code !== void 0 && data.code !== 0) {
    const err = new Error(data.msg ?? `Lark API error: code=${data.code}`);
    err.code = data.code;
    err.msg = data.msg;
    throw err;
  }
  return data;
}

// src/core/owner-policy.ts
var OwnerAccessDeniedError = class extends Error {
  userOpenId;
  appOwnerId;
  constructor(userOpenId, appOwnerId) {
    super("Permission denied: Only the app owner is authorized to use this feature.");
    this.name = "OwnerAccessDeniedError";
    this.userOpenId = userOpenId;
    this.appOwnerId = appOwnerId;
  }
};
async function assertOwnerAccessStrict(account, sdk, userOpenId) {
  const ownerOpenId = await getAppOwnerFallback(account, sdk);
  if (!ownerOpenId) {
    throw new OwnerAccessDeniedError(userOpenId, "unknown");
  }
  if (ownerOpenId !== userOpenId) {
    throw new OwnerAccessDeniedError(userOpenId, ownerOpenId);
  }
}

// src/core/tool-client.ts
var tcLog = larkLogger("core/tool-client");
var ToolClient = class {
  config;
  /** 当前解析的账号信息（appId、appSecret 保证存在）。 */
  account;
  /** 当前请求的用户 open_id（来自 LarkTicket，可能为 undefined）。 */
  senderOpenId;
  /** Lark SDK 实例（TAT 身份），直接调用即可。 */
  sdk;
  constructor(params) {
    this.account = params.account;
    this.senderOpenId = params.senderOpenId;
    this.sdk = params.sdk;
    this.config = params.config;
  }
  // -------------------------------------------------------------------------
  // invoke() — 统一 API 调用入口
  // -------------------------------------------------------------------------
  /**
   * 统一 API 调用入口。
   *
   * 自动处理：
   * - 根据 API meta 选择 UAT / TAT
   * - 严格模式：检查应用和用户是否拥有所有 API 要求的 scope
   * - 无 token 或 scope 不足时抛出结构化错误
   * - UAT 模式下复用 callWithUAT 的 refresh + retry
   *
   * @param apiName - meta.json 中的 toolName，如 `"calendar.v4.calendarEvent.create"`
   * @param fn - API 调用逻辑。UAT 时 opts 已注入 token，TAT 时 opts 为 undefined。
   * @param options - 可选配置：
   *   - `as`: 指定 UAT/TAT
   *   - `userOpenId`: 覆盖用户 ID
   *
   * @throws {@link AppScopeMissingError} 应用未开通 API 所需 scope
   * @throws {@link UserAuthRequiredError} 用户未授权或 scope 不足
   * @throws {@link UserScopeInsufficientError} 服务端报用户 scope 不足
   *
   * @example
   * // UAT 调用 — 通过 { as: "user" } 指定
   * const res = await client.invoke(
   *   "calendar.v4.calendarEvent.create",
   *   (sdk, opts) => sdk.calendar.calendarEvent.create(payload, opts),
   *   { as: "user" },
   * );
   *
   * @example
   * // TAT 调用
   * const res = await client.invoke(
   *   "calendar.v4.calendar.list",
   *   (sdk) => sdk.calendar.calendar.list(payload),
   *   { as: "tenant" },
   * );
   *
   */
  async invoke(toolAction, fn, options) {
    return this._invokeInternal(toolAction, fn, options);
  }
  /**
   * 内部 invoke 实现，只支持 ToolActionKey（严格类型检查）
   */
  async _invokeInternal(toolAction, fn, options) {
    const requiredScopes = getRequiredScopes(toolAction);
    const tokenType = options?.as ?? "user";
    const appCheckScopes = tokenType === "user" ? [.../* @__PURE__ */ new Set([...requiredScopes, "offline_access"])] : requiredScopes;
    let appScopeVerified = true;
    if (appCheckScopes.length > 0) {
      const appGrantedScopes = await getAppGrantedScopes(this.sdk, this.account.appId, tokenType);
      if (appGrantedScopes.length > 0) {
        const missingAppScopes = missingScopes(appGrantedScopes, appCheckScopes);
        if (missingAppScopes.length > 0) {
          throw new AppScopeMissingError(
            { apiName: toolAction, scopes: missingAppScopes, appId: this.account.appId },
            "all",
            tokenType,
            requiredScopes
          );
        }
      } else {
        appScopeVerified = false;
      }
    }
    if (tokenType === "tenant") {
      return this.invokeAsTenant(toolAction, fn, requiredScopes);
    }
    let userOpenId = options?.userOpenId ?? this.senderOpenId;
    if (!userOpenId) {
      const fallbackUserId = await getAppOwnerFallback(this.account, this.sdk);
      if (fallbackUserId) {
        userOpenId = fallbackUserId;
        tcLog.info(`Using app owner as fallback user`, {
          toolAction,
          appId: this.account.appId,
          ownerId: fallbackUserId
        });
      }
    }
    return this.invokeAsUser(toolAction, fn, requiredScopes, userOpenId, appScopeVerified);
  }
  /**
   * invoke() 的非抛出包装，适用于"允许失败"的子操作。
   *
   * - 成功 → `{ ok: true, data }`
   * - 用户授权错误（可通过 OAuth 恢复）→ `{ ok: false, authHint }`
   * - 应用权限缺失 / appScopeVerified=false → **仍然 throw**（需管理员操作）
   * - 其他错误 → `{ ok: false, error }`
   */
  // -------------------------------------------------------------------------
  // invokeByPath() — SDK 未覆盖的 API 调用入口
  // -------------------------------------------------------------------------
  /**
   * 对 SDK 未覆盖的飞书 API 发起 raw HTTP 请求，同时复用 invoke() 的
   * auth/scope/refresh 全链路。
   *
   * @param apiName - 逻辑 API 名称（用于日志和错误信息），如 `"im.v1.chatP2p.batchQuery"`
   * @param path - API 路径（以 `/open-apis/` 开头），如 `"/open-apis/im/v1/chat_p2p/batch_query"`
   * @param options - HTTP 方法、body、query 及 InvokeOptions（as、userOpenId 等）
   *
   * @example
   * ```typescript
   * const res = await client.invokeByPath<{ data: { items: Array<{ chat_id: string }> } }>(
   *   "im.v1.chatP2p.batchQuery",
   *   "/open-apis/im/v1/chat_p2p/batch_query",
   *   {
   *     method: "POST",
   *     body: { chatter_ids: [openId] },
   *     as: "user",
   *   },
   * );
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invokeByPath(toolAction, path4, options) {
    const fn = async (_sdk, _opts, uat) => {
      return this.rawRequest(path4, {
        method: options?.method,
        body: options?.body,
        query: options?.query,
        headers: options?.headers,
        accessToken: uat
      });
    };
    return this._invokeInternal(toolAction, fn, options);
  }
  // -------------------------------------------------------------------------
  // Private: TAT path
  // -------------------------------------------------------------------------
  async invokeAsTenant(toolAction, fn, requiredScopes) {
    try {
      return await fn(this.sdk);
    } catch (err) {
      this.rethrowStructuredError(err, toolAction, requiredScopes, void 0, "tenant");
      throw err;
    }
  }
  // -------------------------------------------------------------------------
  // Private: UAT path
  // -------------------------------------------------------------------------
  async invokeAsUser(toolAction, fn, requiredScopes, userOpenId, appScopeVerified) {
    if (!userOpenId) {
      throw new UserAuthRequiredError("unknown", {
        apiName: toolAction,
        scopes: requiredScopes,
        appScopeVerified,
        appId: this.account.appId
      });
    }
    await assertOwnerAccessStrict(this.account, this.sdk, userOpenId);
    const stored = await getStoredToken(this.account.appId, userOpenId);
    if (!stored) {
      throw new UserAuthRequiredError(userOpenId, {
        apiName: toolAction,
        scopes: requiredScopes,
        appScopeVerified,
        appId: this.account.appId
      });
    }
    if (appScopeVerified && stored.scope && requiredScopes.length > 0) {
      const userGrantedScopes = new Set(stored.scope.split(/\s+/).filter(Boolean));
      const missingUserScopes = requiredScopes.filter((s) => !userGrantedScopes.has(s));
      if (missingUserScopes.length > 0) {
        throw new UserAuthRequiredError(userOpenId, {
          apiName: toolAction,
          scopes: missingUserScopes,
          appScopeVerified,
          appId: this.account.appId
        });
      }
    }
    try {
      return await callWithUAT(
        {
          userOpenId,
          appId: this.account.appId,
          appSecret: this.account.appSecret,
          domain: this.account.brand
        },
        (accessToken) => fn(this.sdk, Lark2.withUserAccessToken(accessToken), accessToken)
      );
    } catch (err) {
      if (err instanceof NeedAuthorizationError) {
        throw new UserAuthRequiredError(userOpenId, {
          apiName: toolAction,
          scopes: requiredScopes,
          appScopeVerified
        });
      }
      this.rethrowStructuredError(err, toolAction, requiredScopes, userOpenId, "user");
      throw err;
    }
  }
  // -------------------------------------------------------------------------
  // Private: raw HTTP request
  // -------------------------------------------------------------------------
  /**
   * 发起 raw HTTP 请求到飞书 API，委托 rawLarkRequest 处理。
   */
  async rawRequest(path4, options) {
    return rawLarkRequest({
      brand: this.account.brand,
      path: path4,
      ...options
    });
  }
  // -------------------------------------------------------------------------
  // Private: structured error detection
  // -------------------------------------------------------------------------
  /**
   * 识别飞书服务端错误码并转换为结构化错误。
   *
   * - LARK_ERROR.APP_SCOPE_MISSING (99991672) → AppScopeMissingError（清缓存后抛出）
   * - LARK_ERROR.USER_SCOPE_INSUFFICIENT (99991679) → UserScopeInsufficientError
   */
  rethrowStructuredError(err, apiName, effectiveScopes, userOpenId, tokenType) {
    const code = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      err?.code ?? err?.response?.data?.code
    );
    if (code === LARK_ERROR.APP_SCOPE_MISSING) {
      invalidateAppScopeCache(this.account.appId);
      throw new AppScopeMissingError(
        {
          apiName,
          scopes: effectiveScopes,
          appId: this.account.appId
        },
        "all",
        tokenType
      );
    }
    if (code === LARK_ERROR.USER_SCOPE_INSUFFICIENT && userOpenId) {
      throw new UserScopeInsufficientError(userOpenId, {
        apiName,
        scopes: effectiveScopes
      });
    }
  }
};
function createToolClient(config, accountIndex = 0) {
  const ticket = getTicket();
  let account;
  if (ticket?.accountId) {
    const resolved = getLarkAccount(config, ticket.accountId);
    if (!resolved.configured) {
      throw new Error(
        `Feishu account "${ticket.accountId}" is not configured (missing appId or appSecret). Please check channels.feishu.accounts.${ticket.accountId} in your config.`
      );
    }
    if (!resolved.enabled) {
      throw new Error(
        `Feishu account "${ticket.accountId}" is disabled. Set channels.feishu.accounts.${ticket.accountId}.enabled to true, or remove it to use defaults.`
      );
    }
    account = resolved;
  }
  if (!account) {
    const accounts = getEnabledLarkAccounts(config);
    if (accounts.length === 0) {
      throw new Error(
        "No enabled Feishu accounts configured. Please add appId and appSecret in config under channels.feishu"
      );
    }
    if (accountIndex >= accounts.length) {
      throw new Error(`Requested account index ${accountIndex} but only ${accounts.length} accounts available`);
    }
    const fallback = accounts[accountIndex];
    if (!fallback.configured) {
      throw new Error(`Account at index ${accountIndex} is not fully configured (missing appId or appSecret)`);
    }
    account = fallback;
  }
  const larkClient = LarkClient.fromAccount(account);
  return new ToolClient({
    account,
    senderOpenId: ticket?.senderOpenId,
    sdk: larkClient.sdk,
    config
  });
}

// src/cli/commands/shared.ts
function outputResult(data) {
  console.log(JSON.stringify(data, null, 2));
}
function outputError(error, exitCode = 1) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: msg }, null, 2));
  process.exit(exitCode);
}
async function withAutoAuth(action) {
  try {
    await action();
  } catch (err) {
    if (shouldTriggerDeviceFlow(err)) {
      console.error(`Auth error: ${err instanceof Error ? err.message : String(err)}`);
      const ok = await runDeviceFlow();
      if (ok) {
        try {
          await action();
          return;
        } catch (retryErr) {
          outputError(retryErr);
          return;
        }
      }
    }
    outputError(err);
  }
}
function getConfig() {
  return loadConfig();
}
function getToolClient(accountId, accountIndex = 0) {
  const config = loadConfig();
  return createToolClient(config, accountIndex);
}
function parseJsonArg(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
async function runDeviceFlow() {
  try {
    const config = loadConfig();
    const accounts = getEnabledLarkAccounts(config);
    if (accounts.length === 0) return false;
    const account = accounts[0];
    if (!account.appId || !account.appSecret) return false;
    console.error("Authorization required. Starting device flow...");
    const deviceAuth = await requestDeviceAuthorization({
      appId: account.appId,
      appSecret: account.appSecret,
      brand: account.brand
      // Don't pass specific scope — Feishu will grant all app-approved scopes
    });
    console.error(`User code: ${deviceAuth.userCode}`);
    console.error(`URL: ${deviceAuth.verificationUriComplete}`);
    console.error("Waiting for authorization...");
    const { exec } = await import("child_process");
    const cmd = process.platform === "win32" ? 'start ""' : process.platform === "darwin" ? "open" : "xdg-open";
    exec(`${cmd} "${deviceAuth.verificationUriComplete}"`);
    const tokenResult = await pollDeviceToken({
      appId: account.appId,
      appSecret: account.appSecret,
      brand: account.brand,
      deviceCode: deviceAuth.deviceCode,
      interval: deviceAuth.interval,
      expiresIn: deviceAuth.expiresIn
    });
    if (tokenResult.ok) {
      try {
        const endpoints = resolveOAuthEndpoints(account.brand);
        const meResp = await feishuFetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
          headers: { Authorization: `Bearer ${tokenResult.token.accessToken}` }
        });
        const meData = await meResp.json();
        if (meData.code === 0 && meData.data) {
          const userInfo = meData.data;
          const userOpenId = userInfo.open_id;
          if (userOpenId) {
            await setStoredToken({
              userOpenId,
              appId: account.appId,
              accessToken: tokenResult.token.accessToken,
              refreshToken: tokenResult.token.refreshToken,
              expiresAt: Date.now() + tokenResult.token.expiresIn * 1e3,
              refreshExpiresAt: Date.now() + tokenResult.token.refreshExpiresIn * 1e3,
              scope: tokenResult.token.scope,
              grantedAt: Date.now()
            });
            console.error(`Token stored for user ${userOpenId}`);
          }
        }
      } catch (storeErr) {
        console.error(`Warning: failed to store token: ${storeErr instanceof Error ? storeErr.message : storeErr}`);
      }
      console.error("Authorization successful! Retrying...");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function shouldTriggerDeviceFlow(err) {
  if (err instanceof NeedAuthorizationError) return true;
  if (err instanceof UserAuthRequiredError) return true;
  if (err instanceof Error && err.message === "need_user_authorization") return true;
  return false;
}

// src/cli/commands/calendar.ts
function parseTimeToTimestamp(input) {
  try {
    const trimmed = input.trim();
    const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);
    if (hasTimezone) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / 1e3).toString();
    }
    const normalized = trimmed.replace("T", " ");
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return Math.floor(date.getTime() / 1e3).toString();
    }
    const [, year, month, day, hour, minute, second] = match;
    const utcDate = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour) - 8,
        parseInt(minute),
        parseInt(second ?? "0")
      )
    );
    return Math.floor(utcDate.getTime() / 1e3).toString();
  } catch {
    return null;
  }
}
function unixTimestampToISO8601(raw) {
  if (raw === void 0 || raw === null) return null;
  const text = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (!/^-?\d+$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  const utcMs = Math.abs(num) >= 1e12 ? num : num * 1e3;
  const offset = 8 * 60 * 60 * 1e3;
  const date = new Date(utcMs + offset);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+08:00`;
}
function normalizeEventTimeFields(event) {
  if (!event) return event;
  const normalized = { ...event };
  const normalizeTime = (value) => {
    if (value === null || value === void 0) return void 0;
    if (typeof value === "string") {
      const iso = unixTimestampToISO8601(value);
      return iso ?? value;
    }
    if (typeof value === "object") {
      const timeObj = value;
      const fromTimestamp = unixTimestampToISO8601(timeObj.timestamp);
      if (fromTimestamp) return fromTimestamp;
      if (typeof timeObj.date === "string") return timeObj.date;
    }
    return void 0;
  };
  const startTime = normalizeTime(event.start_time);
  if (startTime) normalized.start_time = startTime;
  const endTime = normalizeTime(event.end_time);
  if (endTime) normalized.end_time = endTime;
  const createTime = unixTimestampToISO8601(event.create_time);
  if (createTime) normalized.create_time = createTime;
  return normalized;
}
function normalizeEventList(events) {
  if (!events) return events;
  return events.map((e) => normalizeEventTimeFields(e));
}
function assertLarkOk(res) {
  if (res.code !== void 0 && res.code !== 0) {
    throw new Error(`Lark API error: code=${res.code}`);
  }
}
function registerCalendarCommands(parent) {
  const cal = parent.command("calendar").description("Calendar and event management");
  const calendar = cal.command("calendar").description("Calendar management");
  calendar.command("list").description("List calendars").option("--page_size <n>", "Page size", "50").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_calendar_calendar.list",
        (sdk, sdkOpts) => sdk.calendar.calendar.list(
          { params: { page_size: Number(opts.page_size), page_token: opts.page_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  calendar.command("get <calendar_id>").description("Get calendar info").action(async (calendarId) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_calendar_calendar.get",
        (sdk, sdkOpts) => sdk.calendar.calendar.get({ path: { calendar_id: calendarId } }, sdkOpts || {}),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  calendar.command("primary").description("Get primary calendar").action(async () => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_calendar_calendar.primary",
        (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const event = cal.command("event").description("Calendar event operations");
  event.command("list").description("List events in a time range (uses instance_view)").requiredOption("--start_time <time>", "Start time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--end_time <time>", "End time (ISO 8601 or YYYY-MM-DD HH:mm)").option("--calendar_id <id>", "Calendar ID").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const startTs = parseTimeToTimestamp(opts.start_time);
      const endTs = parseTimeToTimestamp(opts.end_time);
      if (!startTs || !endTs) {
        throw new Error("Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm");
      }
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.instance_view",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.instanceView(
          {
            path: { calendar_id: calendarId },
            params: { start_time: startTs, end_time: endTs, user_id_type: "open_id" }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const data = result.data;
      outputResult({
        events: normalizeEventList(data?.items),
        has_more: data?.has_more,
        page_token: data?.page_token
      });
    });
  });
  event.command("create").description("Create a calendar event").requiredOption("--start_time <time>", "Start time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--end_time <time>", "End time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--summary <title>", "Event title").option("--calendar_id <id>", "Calendar ID").option("--description <desc>", "Event description").option("--attendees <json>", 'Attendees JSON array: [{"type":"user","id":"ou_xxx"}]', parseJsonArg).option("--user_open_id <id>", "User open_id to add as attendee ( SenderId from message context)").option("--visibility <visibility>", "Visibility: default|public|private").option("--free_busy_status <status>", "Free/busy status: busy|free").option("--attendee_ability <ability>", "Attendee ability: none|can_see_others|can_invite_others|can_modify_event").option("--location <name>", "Location name").option("--location_address <address>", "Location address").option("--location_lat <lat>", "Location latitude").option("--location_lng <lng>", "Location longitude").option("--vc_type <type>", "Video conference type: vc|third_party|no_meeting").option("--vc_icon <icon>", "Video conference icon: vc|live|default").option("--vc_desc <desc>", "Video conference description").option("--vc_url <url>", "Video conference meeting URL").option("--reminders <json>", 'Reminders JSON array: [{"minutes":15}]', parseJsonArg).option("--recurrence <rrule>", "Recurrence rule (RFC 5545 RRULE)").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const startTs = parseTimeToTimestamp(opts.start_time);
      const endTs = parseTimeToTimestamp(opts.end_time);
      if (!startTs || !endTs) {
        throw new Error("Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm");
      }
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const eventData = {
        summary: opts.summary,
        start_time: { timestamp: startTs },
        end_time: { timestamp: endTs },
        need_notification: true,
        attendee_ability: opts.attendee_ability ?? "can_modify_event"
      };
      if (opts.description) eventData.description = opts.description;
      if (opts.visibility) eventData.visibility = opts.visibility;
      if (opts.free_busy_status) eventData.free_busy_status = opts.free_busy_status;
      if (opts.location || opts.location_address || opts.location_lat || opts.location_lng) {
        const location = {};
        if (opts.location) location.name = opts.location;
        if (opts.location_address) location.address = opts.location_address;
        if (opts.location_lat !== void 0) location.latitude = Number(opts.location_lat);
        if (opts.location_lng !== void 0) location.longitude = Number(opts.location_lng);
        eventData.location = location;
      }
      if (opts.vc_type || opts.vc_icon || opts.vc_desc || opts.vc_url) {
        const vchat = {};
        if (opts.vc_type) vchat.vc_type = opts.vc_type;
        if (opts.vc_icon) vchat.icon_type = opts.vc_icon;
        if (opts.vc_desc) vchat.description = opts.vc_desc;
        if (opts.vc_url) vchat.meeting_url = opts.vc_url;
        eventData.vchat = vchat;
      }
      if (opts.reminders && Array.isArray(opts.reminders)) {
        eventData.reminders = opts.reminders.map((r) => ({ minutes: r.minutes }));
      }
      if (opts.recurrence) eventData.recurrence = opts.recurrence;
      const result = await client.invoke(
        "feishu_calendar_event.create",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.create(
          { path: { calendar_id: calendarId }, data: eventData },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk(result);
      const eventId = result.data?.event?.event_id;
      const attendees = [];
      if (opts.attendees && Array.isArray(opts.attendees)) {
        for (const a of opts.attendees) {
          attendees.push({ type: a.type, id: a.id });
        }
      }
      if (opts.user_open_id) {
        const alreadyIncluded = attendees.some((a) => a.type === "user" && a.id === opts.user_open_id);
        if (!alreadyIncluded) {
          attendees.push({ type: "user", id: opts.user_open_id });
        }
      }
      if (attendees.length > 0 && eventId) {
        const attendeeData = attendees.map((a) => ({
          type: a.type,
          user_id: a.type === "user" ? a.id : void 0,
          chat_id: a.type === "chat" ? a.id : void 0,
          room_id: a.type === "resource" ? a.id : void 0,
          third_party_email: a.type === "third_party" ? a.id : void 0,
          operate_id: opts.user_open_id ?? attendees.find((x) => x.type === "user")?.id
        }));
        try {
          const attendeeRes = await client.invoke(
            "feishu_calendar_event.create",
            (sdk, sdkOpts) => sdk.calendar.calendarEventAttendee.create(
              {
                path: { calendar_id: calendarId, event_id: eventId },
                params: { user_id_type: "open_id" },
                data: { attendees: attendeeData, need_notification: true }
              },
              sdkOpts || {}
            ),
            { as: "user" }
          );
          assertLarkOk(attendeeRes);
        } catch (attendeeErr) {
          console.error(JSON.stringify({ warning: "Event created but attendees failed to add", error: String(attendeeErr) }, null, 2));
        }
      }
      outputResult({
        event: {
          event_id: eventId,
          summary: opts.summary,
          start_time: unixTimestampToISO8601(startTs) ?? opts.start_time,
          end_time: unixTimestampToISO8601(endTs) ?? opts.end_time
        },
        attendees_added: attendees.length
      });
    });
  });
  event.command("get <event_id>").description("Get event details").option("--calendar_id <id>", "Calendar ID").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.get",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.get(
          { path: { calendar_id: calendarId, event_id: eventId } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({
        event: normalizeEventTimeFields(result.data)
      });
    });
  });
  event.command("patch <event_id>").description("Update an event").option("--calendar_id <id>", "Calendar ID").option("--summary <title>", "New title").option("--description <desc>", "New description").option("--start_time <time>", "New start time (ISO 8601 or YYYY-MM-DD HH:mm)").option("--end_time <time>", "New end time (ISO 8601 or YYYY-MM-DD HH:mm)").option("--location <loc>", "New location").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const updateData = {};
      if (opts.summary) updateData.summary = opts.summary;
      if (opts.description) updateData.description = opts.description;
      if (opts.start_time) {
        const ts = parseTimeToTimestamp(opts.start_time);
        if (!ts) throw new Error("Invalid start_time format");
        updateData.start_time = { timestamp: ts };
      }
      if (opts.end_time) {
        const ts = parseTimeToTimestamp(opts.end_time);
        if (!ts) throw new Error("Invalid end_time format");
        updateData.end_time = { timestamp: ts };
      }
      if (opts.location) updateData.location = { name: opts.location };
      const result = await client.invoke(
        "feishu_calendar_event.patch",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.patch(
          { path: { calendar_id: calendarId, event_id: eventId }, data: updateData },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({
        event: normalizeEventTimeFields(result.data)
      });
    });
  });
  event.command("delete <event_id>").description("Delete an event").option("--calendar_id <id>", "Calendar ID").option("--no_notification", "Do not notify attendees").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.delete",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.delete(
          {
            path: { calendar_id: calendarId, event_id: eventId },
            params: { need_notification: !opts.no_notification ? "true" : "false" }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk(result);
      outputResult({ success: true, event_id: eventId });
    });
  });
  event.command("search").description("Search events").requiredOption("--query <query>", "Search keyword").option("--calendar_id <id>", "Calendar ID").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.search",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.search(
          {
            path: { calendar_id: calendarId },
            params: { page_size: opts.page_size, page_token: opts.page_token },
            data: { query: opts.query }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const data = result.data;
      outputResult({
        events: normalizeEventList(data?.items),
        has_more: data?.has_more,
        page_token: data?.page_token
      });
    });
  });
  event.command("reply <event_id>").description("Reply to an event invitation").requiredOption("--status <status>", "RSVP status: accept|decline|tentative").option("--calendar_id <id>", "Calendar ID").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.reply",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.reply(
          {
            path: { calendar_id: calendarId, event_id: eventId },
            data: { rsvp_status: opts.status }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk(result);
      outputResult({ success: true, event_id: eventId, rsvp_status: opts.status });
    });
  });
  event.command("instances <event_id>").description("List instances of a recurring event").requiredOption("--start_time <time>", "Start time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--end_time <time>", "End time (ISO 8601 or YYYY-MM-DD HH:mm)").option("--calendar_id <id>", "Calendar ID").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const startTs = parseTimeToTimestamp(opts.start_time);
      const endTs = parseTimeToTimestamp(opts.end_time);
      if (!startTs || !endTs) {
        throw new Error("Invalid time format. Use ISO 8601 (e.g., 2024-01-01T00:00:00+08:00) or YYYY-MM-DD HH:mm");
      }
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event.instances",
        (sdk, sdkOpts) => sdk.calendar.calendarEvent.instances(
          {
            path: { calendar_id: calendarId, event_id: eventId },
            params: {
              start_time: startTs,
              end_time: endTs,
              page_size: opts.page_size,
              page_token: opts.page_token
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const data = result.data;
      outputResult({
        instances: normalizeEventList(data?.items),
        has_more: data?.has_more,
        page_token: data?.page_token
      });
    });
  });
  const eventAttendee = cal.command("event-attendee").description("Event attendee management");
  eventAttendee.command("create <event_id>").description("Add attendees to an event").option("--calendar_id <id>", "Calendar ID").requiredOption("--attendees <json>", 'Attendees JSON array: [{"type":"user","attendee_id":"ou_xxx"}]', parseJsonArg).option("--no_notification", "Do not notify attendees").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const attendees = opts.attendees;
      const attendeeData = attendees.map((a) => {
        const base = { type: a.type, is_optional: false };
        if (a.type === "user") base.user_id = a.attendee_id;
        else if (a.type === "chat") base.chat_id = a.attendee_id;
        else if (a.type === "resource") base.room_id = a.attendee_id;
        else if (a.type === "third_party") base.third_party_email = a.attendee_id;
        return base;
      });
      const result = await client.invoke(
        "feishu_calendar_event.create",
        (sdk, sdkOpts) => sdk.calendar.calendarEventAttendee.create(
          {
            path: { calendar_id: calendarId, event_id: eventId },
            params: { user_id_type: "open_id" },
            data: {
              attendees: attendeeData,
              need_notification: !opts.no_notification
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk(result);
      outputResult(result.data);
    });
  });
  eventAttendee.command("list <event_id>").description("List attendees of an event").option("--calendar_id <id>", "Calendar ID").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (eventId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let calendarId = opts.calendar_id;
      if (!calendarId) {
        const primary = await client.invoke(
          "feishu_calendar_calendar.primary",
          (sdk, sdkOpts) => sdk.calendar.calendar.primary({}, sdkOpts || {}),
          { as: "user" }
        );
        calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
        if (!calendarId) throw new Error("Could not determine primary calendar");
      }
      const result = await client.invoke(
        "feishu_calendar_event_attendee.list",
        (sdk, sdkOpts) => sdk.calendar.calendarEventAttendee.list(
          {
            path: { calendar_id: calendarId, event_id: eventId },
            params: {
              page_size: opts.page_size,
              page_token: opts.page_token,
              user_id_type: "open_id"
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  cal.command("freebusy").description("Query free/busy status for users").requiredOption("--time_min <time>", "Query start time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--time_max <time>", "Query end time (ISO 8601 or YYYY-MM-DD HH:mm)").requiredOption("--user_ids <json>", 'User IDs JSON array: ["ou_xxx", "ou_yyy"]', parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const userIds = opts.user_ids;
      if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 10) {
        throw new Error("user_ids must be an array with 1-10 user IDs");
      }
      const parseToRFC3339 = (input) => {
        const trimmed = input.trim();
        const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);
        if (hasTimezone) return trimmed;
        const normalized = trimmed.replace("T", " ");
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (match) {
          const [, year, month, day, hour, minute, second] = match;
          const sec = second ?? "00";
          return `${year}-${month}-${day}T${hour}:${minute}:${sec}+08:00`;
        }
        return trimmed;
      };
      const timeMin = parseToRFC3339(opts.time_min);
      const timeMax = parseToRFC3339(opts.time_max);
      const result = await client.invoke(
        "feishu_calendar_freebusy.list",
        (sdk, sdkOpts) => sdk.calendar.freebusy.batch(
          {
            data: {
              time_min: timeMin,
              time_max: timeMax,
              user_ids: userIds,
              include_external_calendar: true,
              only_busy: true
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/cli/commands/task.ts
function parseTimeToTimestampMs(input) {
  try {
    const trimmed = input.trim();
    const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed);
    if (hasTimezone) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return date.getTime().toString();
    }
    const normalized = trimmed.replace("T", " ");
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return null;
      return date.getTime().toString();
    }
    const [, year, month, day, hour, minute, second] = match;
    const utcDate = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour) - 8,
        parseInt(minute),
        parseInt(second ?? "0")
      )
    );
    return utcDate.getTime().toString();
  } catch {
    return null;
  }
}
function parseDueTime(dueArg) {
  if (dueArg.startsWith("{")) {
    const parsed = JSON.parse(dueArg);
    if (parsed.timestamp) {
      const ts2 = parseTimeToTimestampMs(parsed.timestamp);
      if (!ts2) {
        throw new Error(`Invalid due time format: ${parsed.timestamp}`);
      }
      return { timestamp: ts2, is_all_day: parsed.is_all_day ?? false };
    }
  }
  const ts = parseTimeToTimestampMs(dueArg);
  if (!ts) {
    throw new Error(`Invalid due time format: ${dueArg}`);
  }
  return { timestamp: ts, is_all_day: false };
}
function parseStartTime(startArg) {
  if (startArg.startsWith("{")) {
    const parsed = JSON.parse(startArg);
    if (parsed.timestamp) {
      const ts2 = parseTimeToTimestampMs(parsed.timestamp);
      if (!ts2) {
        throw new Error(`Invalid start time format: ${parsed.timestamp}`);
      }
      return { timestamp: ts2, is_all_day: parsed.is_all_day ?? false };
    }
  }
  const ts = parseTimeToTimestampMs(startArg);
  if (!ts) {
    throw new Error(`Invalid start time format: ${startArg}`);
  }
  return { timestamp: ts, is_all_day: false };
}
function parseCompletedAt(value) {
  if (value === "0") return "0";
  if (/^\d+$/.test(value)) return value;
  const ts = parseTimeToTimestampMs(value);
  if (!ts) {
    throw new Error(`Invalid completed_at format: ${value}`);
  }
  return ts;
}
function registerTaskCommands(parent) {
  const task = parent.command("task").description("Task management");
  const taskCmd = task.command("task").description("Task CRUD operations");
  taskCmd.command("create").description("Create a task").requiredOption("--summary <title>", "Task title").option("--description <desc>", "Task description").option("--due <time|json>", 'Due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--start <time|json>", 'Start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--repeat <rrule>", "Repeat rule (RRULE format)").option("--members <json>", "Members JSON array", parseJsonArg).option("--tasklists <json>", "Tasklists JSON array", parseJsonArg).option("--current-user-id <id>", "Current user open_id").option("--user-id-type <type>", "User ID type (open_id|union_id|user_id)", "open_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = { summary: opts.summary };
      if (opts.description) data.description = opts.description;
      if (opts.due) {
        data.due = parseDueTime(opts.due);
      }
      if (opts.start) {
        data.start = parseStartTime(opts.start);
      }
      if (opts.repeat) data.repeat_rule = opts.repeat;
      if (opts.members) data.members = opts.members;
      if (opts.tasklists) data.tasklists = opts.tasklists;
      if (opts.current_user_id) data.current_user_id = opts.current_user_id;
      const result = await client.invoke(
        "feishu_task_task.create",
        (sdk, sdkOpts) => sdk.task.v2.task.create(
          { data, params: { user_id_type: opts.userIdType || "open_id" } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  taskCmd.command("get <task_guid>").description("Get task details").option("--user-id-type <type>", "User ID type (open_id|union_id|user_id)", "open_id").action(async (taskGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_task.get",
        (sdk, sdkOpts) => sdk.task.v2.task.get(
          { path: { task_guid: taskGuid }, params: { user_id_type: opts.userIdType || "open_id" } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  taskCmd.command("list").description("List tasks").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--completed", "Show only completed tasks").option("--user-id-type <type>", "User ID type (open_id|union_id|user_id)", "open_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_task.list",
        (sdk, sdkOpts) => sdk.task.v2.task.list(
          {
            params: {
              page_size: opts.page_size,
              page_token: opts.page_token,
              completed: opts.completed,
              user_id_type: opts.userIdType || "open_id"
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  taskCmd.command("patch <task_guid>").description("Update a task").option("--summary <title>", "New title").option("--description <desc>", "New description").option("--due <time|json>", 'New due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--start <time|json>", 'New start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--completed_at <val>", 'Complete time (ISO 8601, "0" to uncomplete, or ms timestamp)').option("--repeat <rrule>", "Repeat rule (RRULE format)").option("--members <json>", "New members JSON array", parseJsonArg).option("--user-id-type <type>", "User ID type (open_id|union_id|user_id)", "open_id").action(async (taskGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const updateData = {};
      if (opts.summary) updateData.summary = opts.summary;
      if (opts.description !== void 0) updateData.description = opts.description;
      if (opts.due) {
        updateData.due = parseDueTime(opts.due);
      }
      if (opts.start) {
        updateData.start = parseStartTime(opts.start);
      }
      if (opts.completed_at !== void 0) {
        updateData.completed_at = parseCompletedAt(opts.completed_at);
      }
      if (opts.repeat) updateData.repeat_rule = opts.repeat;
      if (opts.members) updateData.members = opts.members;
      const updateFields = Object.keys(updateData);
      if (updateFields.length === 0) {
        outputError(new Error("No fields to update"));
        return;
      }
      const result = await client.invoke(
        "feishu_task_task.patch",
        (sdk, sdkOpts) => sdk.task.v2.task.patch(
          {
            path: { task_guid: taskGuid },
            data: { task: updateData, update_fields: updateFields },
            params: { user_id_type: opts.userIdType || "open_id" }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const tasklist = task.command("tasklist").description("Tasklist operations");
  tasklist.command("create").description("Create a tasklist").requiredOption("--name <name>", "Tasklist name").option("--members <json>", "Members JSON array", parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = { name: opts.name };
      if (opts.members) {
        data.members = opts.members.map((m) => ({
          id: m.id,
          type: "user",
          role: m.role || "editor"
        }));
      }
      const result = await client.invoke(
        "feishu_task_tasklist.create",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.create(
          { params: { user_id_type: "open_id" }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  tasklist.command("get <tasklist_guid>").description("Get tasklist details").action(async (tasklistGuid) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_tasklist.get",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.get(
          { path: { tasklist_guid: tasklistGuid }, params: { user_id_type: "open_id" } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  tasklist.command("list").description("List tasklists").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_tasklist.list",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.list(
          {
            params: { page_size: opts.page_size, page_token: opts.page_token, user_id_type: "open_id" }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  tasklist.command("tasks <tasklist_guid>").description("List tasks in a tasklist").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--completed", "Show only completed tasks").action(async (tasklistGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_tasklist.tasks",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.tasks(
          {
            path: { tasklist_guid: tasklistGuid },
            params: {
              page_size: opts.page_size,
              page_token: opts.page_token,
              completed: opts.completed,
              user_id_type: "open_id"
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  tasklist.command("patch <tasklist_guid>").description("Update a tasklist").requiredOption("--name <name>", "New name").action(async (tasklistGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_tasklist.patch",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.patch(
          {
            path: { tasklist_guid: tasklistGuid },
            params: { user_id_type: "open_id" },
            data: { tasklist: { name: opts.name }, update_fields: ["name"] }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  tasklist.command("add-members <tasklist_guid>").description("Add members to a tasklist").requiredOption("--members <json>", "Members JSON array", parseJsonArg).action(async (tasklistGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const memberData = opts.members.map((m) => ({
        id: m.id,
        type: "user",
        role: m.role || "editor"
      }));
      const result = await client.invoke(
        "feishu_task_tasklist.add_members",
        (sdk, sdkOpts) => sdk.task.v2.tasklist.addMembers(
          {
            path: { tasklist_guid: tasklistGuid },
            params: { user_id_type: "open_id" },
            data: { members: memberData }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const subtask = task.command("subtask").description("Subtask operations");
  subtask.command("create <task_guid>").description("Create a subtask").requiredOption("--summary <title>", "Subtask title").option("--description <desc>", "Subtask description").option("--due <time|json>", 'Due time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--start <time|json>", 'Start time (ISO 8601) or JSON {"timestamp":"...","is_all_day":false}').option("--members <json>", "Members JSON array", parseJsonArg).action(async (taskGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = { summary: opts.summary };
      if (opts.description) data.description = opts.description;
      if (opts.due) {
        data.due = parseDueTime(opts.due);
      }
      if (opts.start) {
        data.start = parseStartTime(opts.start);
      }
      if (opts.members) {
        data.members = opts.members.map((m) => ({
          id: m.id,
          type: "user",
          role: m.role || "assignee"
        }));
      }
      const result = await client.invoke(
        "feishu_task_subtask.create",
        (sdk, sdkOpts) => sdk.task.v2.taskSubtask.create(
          {
            path: { task_guid: taskGuid },
            params: { user_id_type: "open_id" },
            data
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  subtask.command("list <task_guid>").description("List subtasks of a task").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (taskGuid, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_task_subtask.list",
        (sdk, sdkOpts) => sdk.task.v2.taskSubtask.list(
          {
            path: { task_guid: taskGuid },
            params: {
              page_size: opts.page_size,
              page_token: opts.page_token,
              user_id_type: "open_id"
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/cli/commands/bitable.ts
function registerBitableCommands(parent) {
  const bitable = parent.command("bitable").description("Bitable (multidimensional table) management");
  bitable.command("create").description("Create a bitable app").requiredOption("--name <name>", "App name").option("--folder_token <token>", "Parent folder token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app.create",
        (sdk, sdkOpts) => sdk.bitable.app.create(
          { data: { name: opts.name, folder_token: opts.folder_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  bitable.command("get <app_token>").description("Get bitable app info").action(async (appToken) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app.get",
        (sdk, sdkOpts) => sdk.bitable.app.get({ path: { app_token: appToken } }, sdkOpts || {}),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  bitable.command("list").description("List bitable apps").option("--folder_token <token>", "Parent folder token").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app.list",
        (sdk, sdkOpts) => sdk.drive.file.list(
          {
            params: {
              folder_token: opts.folder_token,
              page_size: opts.page_size,
              page_token: opts.page_token
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const files = result.data?.files || [];
      const bitables = files.filter((f) => f.type === "bitable");
      outputResult({ apps: bitables, has_more: result.data?.has_more, page_token: result.data?.page_token });
    });
  });
  bitable.command("patch <app_token>").description("Update bitable app metadata").option("--name <name>", "New app name").option("--is_advanced <bool>", "Enable advanced permissions", parseJsonArg).action(async (appToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = {};
      if (opts.name !== void 0) data.name = opts.name;
      if (opts.is_advanced !== void 0) data.is_advanced = opts.is_advanced;
      const result = await client.invoke(
        "feishu_bitable_app.patch",
        (sdk, sdkOpts) => sdk.bitable.app.update(
          { path: { app_token: appToken }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  bitable.command("copy <app_token>").description("Copy a bitable app").requiredOption("--name <name>", "New app name").option("--folder_token <token>", "Target folder token").action(async (appToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = { name: opts.name };
      if (opts.folder_token) data.folder_token = opts.folder_token;
      const result = await client.invoke(
        "feishu_bitable_app.copy",
        (sdk, sdkOpts) => sdk.bitable.app.copy(
          { path: { app_token: appToken }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const table = bitable.command("table").description("Table operations");
  table.command("list <app_token>").description("List tables in a bitable app").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (appToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table.list",
        (sdk, sdkOpts) => sdk.bitable.appTable.list(
          { path: { app_token: appToken }, params: { page_size: opts.page_size, page_token: opts.page_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  table.command("create <app_token>").description("Create a table").requiredOption("--name <name>", "Table name").option("--default_view_name <name>", "Default view name").option("--fields <json>", "Fields JSON array", parseJsonArg).action(async (appToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const tableData = { name: opts.name };
      if (opts.default_view_name) tableData.default_view_name = opts.default_view_name;
      if (opts.fields) {
        tableData.fields = opts.fields.map((field2) => {
          if ((field2.type === 7 || field2.type === 15) && field2.property !== void 0) {
            const { property, ...fieldWithoutProperty } = field2;
            return fieldWithoutProperty;
          }
          return field2;
        });
      }
      const result = await client.invoke(
        "feishu_bitable_app_table.create",
        (sdk, sdkOpts) => sdk.bitable.appTable.create(
          { path: { app_token: appToken }, data: { table: tableData } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  table.command("patch <app_token> <table_id>").description("Update a table").option("--name <name>", "New table name").action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table.patch",
        (sdk, sdkOpts) => sdk.bitable.appTable.patch(
          { path: { app_token: appToken, table_id: tableId }, data: { name: opts.name } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  table.command("batch_create <app_token>").description("Batch create tables").requiredOption("--tables <json>", "Tables JSON array with names", parseJsonArg).action(async (appToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table.batch_create",
        (sdk, sdkOpts) => sdk.bitable.appTable.batchCreate(
          { path: { app_token: appToken }, data: { tables: opts.tables } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const record = bitable.command("record").description("Record operations");
  record.command("list <app_token> <table_id>").description("Search/list records").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--view_id <id>", "View ID").option("--field_names <json>", "Field names JSON array", parseJsonArg).option("--filter <json>", "Filter condition JSON", parseJsonArg).option("--sort <json>", "Sort condition JSON", parseJsonArg).option("--automatic_fields <bool>", "Return automatic fields", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = {};
      if (opts.view_id !== void 0) data.view_id = opts.view_id;
      if (opts.field_names !== void 0) data.field_names = opts.field_names;
      if (opts.filter) {
        const filter = opts.filter;
        if (filter.conditions) {
          filter.conditions = filter.conditions.map((cond) => {
            if ((cond.operator === "isEmpty" || cond.operator === "isNotEmpty") && !cond.value) {
              cond.value = [];
            }
            return cond;
          });
        }
        data.filter = filter;
      }
      if (opts.sort) data.sort = opts.sort;
      if (opts.automatic_fields !== void 0) data.automatic_fields = opts.automatic_fields;
      const result = await client.invoke(
        "feishu_bitable_app_table_record.list",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.search(
          {
            path: { app_token: appToken, table_id: tableId },
            params: { user_id_type: "open_id", page_size: opts.page_size, page_token: opts.page_token },
            data
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ records: result.data?.items, has_more: result.data?.has_more, page_token: result.data?.page_token, total: result.data?.total });
    });
  });
  record.command("create <app_token> <table_id>").description("Create a record").requiredOption("--fields <json>", "Record fields JSON object", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const fields = opts.fields;
      if (!fields || Object.keys(fields).length === 0) {
        outputResult({ error: "fields is required and cannot be empty" });
        return;
      }
      const result = await client.invoke(
        "feishu_bitable_app_table_record.create",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.create(
          {
            path: { app_token: appToken, table_id: tableId },
            params: { user_id_type: "open_id" },
            data: { fields }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  record.command("update <app_token> <table_id> <record_id>").description("Update a record").requiredOption("--fields <json>", "Record fields JSON object", parseJsonArg).action(async (appToken, tableId, recordId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const fields = opts.fields;
      if (!fields || Object.keys(fields).length === 0) {
        outputResult({ error: "fields is required and cannot be empty" });
        return;
      }
      const result = await client.invoke(
        "feishu_bitable_app_table_record.update",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.update(
          {
            path: { app_token: appToken, table_id: tableId, record_id: recordId },
            params: { user_id_type: "open_id" },
            data: { fields }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  record.command("delete <app_token> <table_id> <record_id>").description("Delete a record").action(async (appToken, tableId, recordId) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_record.delete",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.delete(
          { path: { app_token: appToken, table_id: tableId, record_id: recordId } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ success: true });
    });
  });
  record.command("batch_create <app_token> <table_id>").description("Batch create records").requiredOption("--records <json>", "Records JSON array", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_record.batch_create",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.batchCreate(
          { path: { app_token: appToken, table_id: tableId }, params: { user_id_type: "open_id" }, data: { records: opts.records } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  record.command("batch_update <app_token> <table_id>").description("Batch update records").requiredOption("--records <json>", "Records JSON array with record_id and fields", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_record.batch_update",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.batchUpdate(
          { path: { app_token: appToken, table_id: tableId }, params: { user_id_type: "open_id" }, data: { records: opts.records } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  record.command("batch_delete <app_token> <table_id>").description("Batch delete records").requiredOption("--records <json>", "Records JSON array with record_id", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const records = opts.records.map((r) => r.record_id);
      const result = await client.invoke(
        "feishu_bitable_app_table_record.batch_delete",
        (sdk, sdkOpts) => sdk.bitable.appTableRecord.batchDelete(
          { path: { app_token: appToken, table_id: tableId }, data: { records } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const field = bitable.command("field").description("Field (column) operations");
  field.command("list <app_token> <table_id>").description("List fields").option("--view_id <id>", "View ID").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_field.list",
        (sdk, sdkOpts) => sdk.bitable.appTableField.list(
          { path: { app_token: appToken, table_id: tableId }, params: { view_id: opts.view_id, page_size: opts.page_size, page_token: opts.page_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  field.command("create <app_token> <table_id>").description("Create a field").requiredOption("--field_name <name>", "Field name").requiredOption("--type <n>", "Field type number").option("--property <json>", "Field property JSON", parseJsonArg).action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const fieldType = Number(opts.type);
      const data = {
        field_name: opts.field_name,
        type: fieldType
      };
      if (opts.property !== void 0 && fieldType !== 7 && fieldType !== 15) {
        data.property = opts.property;
      }
      const result = await client.invoke(
        "feishu_bitable_app_table_field.create",
        (sdk, sdkOpts) => sdk.bitable.appTableField.create(
          { path: { app_token: appToken, table_id: tableId }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  field.command("update <app_token> <table_id> <field_id>").description("Update a field").option("--field_name <name>", "New field name").option("--type <n>", "Field type number").option("--property <json>", "New field property JSON", parseJsonArg).action(async (appToken, tableId, fieldId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let finalFieldName = opts.field_name;
      let finalType = opts.type !== void 0 ? Number(opts.type) : void 0;
      let finalProperty = opts.property;
      if (!finalType || !finalFieldName) {
        const listResult = await client.invoke(
          "feishu_bitable_app_table_field.list",
          (sdk, sdkOpts) => sdk.bitable.appTableField.list(
            { path: { app_token: appToken, table_id: tableId }, params: { page_size: 500 } },
            sdkOpts || {}
          ),
          { as: "user" }
        );
        const currentField = listResult.data?.items?.find((f) => f.field_id === fieldId);
        if (!currentField) {
          outputResult({ error: `field ${fieldId} does not exist` });
          return;
        }
        finalFieldName = opts.field_name || currentField.field_name;
        finalType = finalType ?? currentField.type;
        finalProperty = finalProperty !== void 0 ? finalProperty : currentField.property;
      }
      const data = {
        field_name: finalFieldName,
        type: finalType
      };
      if (finalProperty !== void 0) data.property = finalProperty;
      const result = await client.invoke(
        "feishu_bitable_app_table_field.update",
        (sdk, sdkOpts) => sdk.bitable.appTableField.update(
          { path: { app_token: appToken, table_id: tableId, field_id: fieldId }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  field.command("delete <app_token> <table_id> <field_id>").description("Delete a field").action(async (appToken, tableId, fieldId) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_field.delete",
        (sdk, sdkOpts) => sdk.bitable.appTableField.delete(
          { path: { app_token: appToken, table_id: tableId, field_id: fieldId } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ success: true });
    });
  });
  const view = bitable.command("view").description("View operations");
  view.command("list <app_token> <table_id>").description("List views").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_view.list",
        (sdk, sdkOpts) => sdk.bitable.appTableView.list(
          { path: { app_token: appToken, table_id: tableId }, params: { page_size: opts.page_size, page_token: opts.page_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  view.command("get <app_token> <table_id> <view_id>").description("Get view details").action(async (appToken, tableId, viewId) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_view.get",
        (sdk, sdkOpts) => sdk.bitable.appTableView.get(
          { path: { app_token: appToken, table_id: tableId, view_id: viewId } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  view.command("create <app_token> <table_id>").description("Create a view").requiredOption("--view_name <name>", "View name").option("--view_type <type>", "View type (grid/kanban/gallery/gantt/form)").action(async (appToken, tableId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_bitable_app_table_view.create",
        (sdk, sdkOpts) => sdk.bitable.appTableView.create(
          { path: { app_token: appToken, table_id: tableId }, data: { view_name: opts.view_name, view_type: opts.view_type || "grid" } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  view.command("patch <app_token> <table_id> <view_id>").description("Update a view").option("--view_name <name>", "New view name").option("--config <json>", "View config JSON", parseJsonArg).action(async (appToken, tableId, viewId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const data = {};
      if (opts.view_name) data.view_name = opts.view_name;
      if (opts.config) data.config = opts.config;
      const result = await client.invoke(
        "feishu_bitable_app_table_view.patch",
        (sdk, sdkOpts) => sdk.bitable.appTableView.patch(
          { path: { app_token: appToken, table_id: tableId, view_id: viewId }, data },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/tools/oapi/im/time-utils.ts
var BJ_OFFSET_MS = 8 * 60 * 60 * 1e3;
function formatBeijingISO(d) {
  const bj = new Date(d.getTime() + BJ_OFFSET_MS);
  const y = bj.getUTCFullYear();
  const mo = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const da = String(bj.getUTCDate()).padStart(2, "0");
  const h = String(bj.getUTCHours()).padStart(2, "0");
  const mi = String(bj.getUTCMinutes()).padStart(2, "0");
  const s = String(bj.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${mi}:${s}+08:00`;
}
function dateTimeToSeconds(datetime) {
  const d = new Date(datetime);
  if (isNaN(d.getTime())) {
    throw new Error(`\u65E0\u6CD5\u89E3\u6790 ISO 8601 \u65F6\u95F4: "${datetime}"\u3002\u683C\u5F0F\u793A\u4F8B: 2026-02-27T14:30:00+08:00`);
  }
  return Math.floor(d.getTime() / 1e3);
}
function dateTimeToSecondsString(datetime) {
  return dateTimeToSeconds(datetime).toString();
}
function parseTimeRange(input) {
  const now = /* @__PURE__ */ new Date();
  const bjNow = toBeijingDate(now);
  let start;
  let end;
  switch (input) {
    case "today":
      start = beijingStartOfDay(bjNow);
      end = now;
      break;
    case "yesterday": {
      const d = new Date(bjNow);
      d.setUTCDate(d.getUTCDate() - 1);
      start = beijingStartOfDay(d);
      end = beijingEndOfDay(d);
      break;
    }
    case "day_before_yesterday": {
      const d = new Date(bjNow);
      d.setUTCDate(d.getUTCDate() - 2);
      start = beijingStartOfDay(d);
      end = beijingEndOfDay(d);
      break;
    }
    case "this_week": {
      const day = bjNow.getUTCDay();
      const diffToMon = day === 0 ? 6 : day - 1;
      const monday = new Date(bjNow);
      monday.setUTCDate(monday.getUTCDate() - diffToMon);
      start = beijingStartOfDay(monday);
      end = now;
      break;
    }
    case "last_week": {
      const day = bjNow.getUTCDay();
      const diffToMon = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(bjNow);
      thisMonday.setUTCDate(thisMonday.getUTCDate() - diffToMon);
      const lastMonday = new Date(thisMonday);
      lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);
      start = beijingStartOfDay(lastMonday);
      end = beijingEndOfDay(lastSunday);
      break;
    }
    case "this_month": {
      const firstDay = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1));
      start = beijingStartOfDay(firstDay);
      end = now;
      break;
    }
    case "last_month": {
      const firstDayThisMonth = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1));
      const lastDayPrevMonth = new Date(firstDayThisMonth);
      lastDayPrevMonth.setUTCDate(lastDayPrevMonth.getUTCDate() - 1);
      const firstDayPrevMonth = new Date(
        Date.UTC(lastDayPrevMonth.getUTCFullYear(), lastDayPrevMonth.getUTCMonth(), 1)
      );
      start = beijingStartOfDay(firstDayPrevMonth);
      end = beijingEndOfDay(lastDayPrevMonth);
      break;
    }
    default: {
      const match = input.match(/^last_(\d+)_(minutes?|hours?|days?)$/);
      if (!match) {
        throw new Error(
          `\u4E0D\u652F\u6301\u7684 relative_time \u683C\u5F0F: "${input}"\u3002\u652F\u6301: today, yesterday, day_before_yesterday, this_week, last_week, this_month, last_month, last_{N}_{unit}\uFF08unit: minutes/hours/days\uFF09`
        );
      }
      const n = parseInt(match[1], 10);
      const unit = match[2].replace(/s$/, "");
      start = subtractFromNow(now, n, unit);
      end = now;
      break;
    }
  }
  return {
    start: formatBeijingISO(start),
    end: formatBeijingISO(end)
  };
}
function parseTimeRangeToSeconds(input) {
  const range = parseTimeRange(input);
  return {
    start: dateTimeToSecondsString(range.start),
    end: dateTimeToSecondsString(range.end)
  };
}
function toBeijingDate(d) {
  return new Date(d.getTime() + BJ_OFFSET_MS);
}
function beijingStartOfDay(bjDate) {
  return new Date(Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET_MS);
}
function beijingEndOfDay(bjDate) {
  return new Date(
    Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate(), 23, 59, 59) - BJ_OFFSET_MS
  );
}
function subtractFromNow(now, n, unit) {
  const d = new Date(now);
  switch (unit) {
    case "minute":
      d.setMinutes(d.getMinutes() - n);
      break;
    case "hour":
      d.setHours(d.getHours() - n);
      break;
    case "day":
      d.setDate(d.getDate() - n);
      break;
    default:
      throw new Error(`\u4E0D\u652F\u6301\u7684\u65F6\u95F4\u5355\u4F4D: ${unit}`);
  }
  return d;
}

// src/core/permission-url.ts
function getPermissionPriority(scope) {
  const lowerScope = scope.toLowerCase();
  const hasRead = lowerScope.includes("read");
  const hasWrite = lowerScope.includes("write");
  if (hasRead && !hasWrite) return 1;
  if (hasWrite && !hasRead) return 2;
  return 3;
}
function extractHighestPriorityScope(scopeList) {
  return scopeList.split(",").sort((a, b) => getPermissionPriority(a) - getPermissionPriority(b))[0] ?? "";
}
function extractPermissionGrantUrl(msg) {
  const urlMatch = msg.match(/https:\/\/[^\s]+\/app\/[^\s]+/);
  if (!urlMatch?.[0]) {
    return "";
  }
  try {
    const url = new URL(urlMatch[0]);
    const scopeListParam = url.searchParams.get("q") ?? "";
    const firstScope = extractHighestPriorityScope(scopeListParam);
    if (firstScope) {
      url.searchParams.set("q", firstScope);
    }
    return url.href;
  } catch {
    return urlMatch[0];
  }
}
function extractPermissionScopes(msg) {
  const scopeMatch = msg.match(/\[([^\]]+)\]/);
  return scopeMatch?.[1] ?? "unknown";
}

// src/core/api-error.ts
function formatPermissionError(code, msg) {
  if (code !== LARK_ERROR.APP_SCOPE_MISSING) return null;
  const authUrl = extractPermissionGrantUrl(msg);
  const scopes = extractPermissionScopes(msg);
  return `\u6743\u9650\u4E0D\u8DB3\uFF1A\u5E94\u7528\u7F3A\u5C11 [${scopes}] \u6743\u9650\u3002
\u8BF7\u7BA1\u7406\u5458\u70B9\u51FB\u4EE5\u4E0B\u94FE\u63A5\u7533\u8BF7\u5E76\u5F00\u901A\u6743\u9650\uFF1A
${authUrl}`;
}
function assertLarkOk2(res) {
  if (!res.code || res.code === 0) return;
  const permMsg = formatPermissionError(res.code, res.msg ?? "");
  if (permMsg) throw new Error(permMsg);
  throw new Error(res.msg ?? `Feishu API error (code: ${res.code})`);
}

// src/cli/commands/im.ts
var userNameCache = /* @__PURE__ */ new Map();
var USER_NAME_TTL_MS = 30 * 60 * 1e3;
var MAX_CACHE_SIZE = 500;
function getUserNameCache(accountId) {
  let cache3 = userNameCache.get(accountId);
  if (!cache3) {
    cache3 = /* @__PURE__ */ new Map();
    userNameCache.set(accountId, cache3);
  }
  return cache3;
}
function getUserNameFromCache(accountId, openId) {
  const cache3 = getUserNameCache(accountId);
  const entry = cache3.get(openId);
  if (!entry) return void 0;
  if (entry.expireAt <= Date.now()) {
    cache3.delete(openId);
    return void 0;
  }
  cache3.delete(openId);
  cache3.set(openId, entry);
  return entry.name;
}
function setUserNameCache(accountId, entries) {
  const cache3 = getUserNameCache(accountId);
  const now = Date.now();
  for (const [openId, name] of entries) {
    cache3.delete(openId);
    cache3.set(openId, { name, expireAt: now + USER_NAME_TTL_MS });
  }
  while (cache3.size > MAX_CACHE_SIZE) {
    const oldest = cache3.keys().next().value;
    if (oldest !== void 0) cache3.delete(oldest);
  }
}
async function batchResolveUserNames(client, openIds, accountId) {
  if (openIds.length === 0) return;
  const BATCH_SIZE = 10;
  const cache3 = getUserNameCache(accountId);
  const missing = openIds.filter((id) => getUserNameFromCache(accountId, id) === void 0);
  if (missing.length === 0) return;
  const uniqueMissing = [...new Set(missing)];
  const result = /* @__PURE__ */ new Map();
  for (let i = 0; i < uniqueMissing.length; i += BATCH_SIZE) {
    const chunk = uniqueMissing.slice(i, i + BATCH_SIZE);
    try {
      const res = await client.invoke(
        "feishu_get_user.basic_batch",
        (sdk, opts) => sdk.request(
          {
            method: "POST",
            url: "/open-apis/contact/v3/users/basic_batch",
            data: { user_ids: chunk },
            params: { user_id_type: "open_id" }
          },
          opts
        ),
        { as: "user" }
      );
      const users = res?.data?.users ?? [];
      for (const user of users) {
        const openId = user.user_id;
        const rawName = user.name;
        const name = typeof rawName === "string" ? rawName : rawName?.value;
        if (openId && name) {
          cache3.delete(openId);
          cache3.set(openId, { name, expireAt: Date.now() + USER_NAME_TTL_MS });
          result.set(openId, name);
        }
      }
    } catch (err) {
      console.error(`Failed to resolve user names: ${err}`);
    }
  }
}
var MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "video/mp4": ".mp4",
  "video/mpeg": ".mpeg",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/zip": ".zip",
  "application/x-rar-compressed": ".rar",
  "text/plain": ".txt",
  "application/json": ".json"
};
function registerImCommands(parent) {
  const im = parent.command("im").description("IM message operations");
  im.command("send").description("Send a message").requiredOption("--receive_id_type <type>", "Receiver ID type: open_id|chat_id").requiredOption("--receive_id <id>", "Receiver ID").requiredOption("--msg_type <type>", "Message type: text|post|image|file|audio|media|interactive|share_chat|share_user").requiredOption("--content <json>", "Message content JSON string").option("--uuid <id>", "Idempotency UUID").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_im_user_message.send",
        (sdk, sdkOpts) => sdk.im.v1.message.create(
          {
            params: { receive_id_type: opts.receive_id_type },
            data: {
              receive_id: opts.receive_id,
              msg_type: opts.msg_type,
              content: opts.content,
              uuid: opts.uuid
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk2(result);
      outputResult(result.data);
    });
  });
  im.command("reply <message_id>").description("Reply to a message").requiredOption("--msg_type <type>", "Message type: text|post|image|file|audio|media|interactive|share_chat|share_user").requiredOption("--content <json>", "Message content JSON string").option("--reply_in_thread", "Reply in thread").option("--uuid <id>", "Idempotency UUID").action(async (messageId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_im_user_message.reply",
        (sdk, sdkOpts) => sdk.im.v1.message.reply(
          {
            path: { message_id: messageId },
            data: {
              content: opts.content,
              msg_type: opts.msg_type,
              reply_in_thread: opts.reply_in_thread,
              uuid: opts.uuid
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      assertLarkOk2(result);
      outputResult(result.data);
    });
  });
  im.command("get-messages").description("Get conversation messages").option("--chat_id <id>", "Chat ID (oc_xxx)").option("--open_id <id>", "User open_id for P2P chat").option("--page_size <n>", "Page size (1-50, default 50)").option("--page_token <token>", "Page token").option("--sort <rule>", "Sort: create_time_asc|create_time_desc").option("--start_time <time>", "Start time (ISO 8601)").option("--end_time <time>", "End time (ISO 8601)").option("--relative_time <range>", "Relative time: today|yesterday|day_before_yesterday|this_week|last_week|this_month|last_month|last_{N}_{minutes|hours|days}").action(async (opts) => {
    await withAutoAuth(async () => {
      if (opts.chat_id && opts.open_id) {
        outputError(new Error("Cannot provide both --chat_id and --open_id"));
        return;
      }
      if (!opts.chat_id && !opts.open_id) {
        outputError(new Error("Either --chat_id or --open_id is required"));
        return;
      }
      if (opts.relative_time && (opts.start_time || opts.end_time)) {
        outputError(new Error("Cannot use both --relative_time and --start_time/--end_time"));
        return;
      }
      const client = getToolClient();
      let containerId = opts.chat_id ?? "";
      if (opts.open_id) {
        const p2pRes = await client.invokeByPath("feishu_im_user_get_messages.default", "/open-apis/im/v1/chat_p2p/batch_query", {
          method: "POST",
          body: { chatter_ids: [opts.open_id] },
          query: { user_id_type: "open_id" },
          as: "user"
        });
        const chats = p2pRes.data?.p2p_chats;
        if (!chats?.length) throw new Error(`No 1-on-1 chat found with open_id=${opts.open_id}`);
        containerId = chats[0].chat_id;
      }
      let startTime;
      let endTime;
      if (opts.relative_time) {
        const range = parseTimeRangeToSeconds(opts.relative_time);
        startTime = range.start;
        endTime = range.end;
      } else {
        if (opts.start_time) startTime = Math.floor(new Date(opts.start_time).getTime() / 1e3).toString();
        if (opts.end_time) endTime = Math.floor(new Date(opts.end_time).getTime() / 1e3).toString();
      }
      const sortType = opts.sort === "create_time_asc" ? "ByCreateTimeAsc" : "ByCreateTimeDesc";
      const params = {
        container_id_type: "chat",
        container_id: containerId,
        sort_type: sortType,
        page_size: opts.page_size ?? 50,
        page_token: opts.page_token,
        card_msg_content_type: "raw_card_content"
      };
      if (startTime) params.start_time = startTime;
      if (endTime) params.end_time = endTime;
      const result = await client.invoke(
        "feishu_im_user_get_messages.default",
        (sdk, sdkOpts) => sdk.im.v1.message.list({ params }, sdkOpts || {}),
        { as: "user" }
      );
      assertLarkOk2(result);
      const items = result.data?.items ?? [];
      const accountId = client.account.accountId;
      const senderIds = /* @__PURE__ */ new Set();
      const mentionNames = /* @__PURE__ */ new Map();
      for (const item of items) {
        if (item.sender?.sender_type === "user" && item.sender?.id) {
          senderIds.add(item.sender.id);
        }
        for (const m of item.mentions ?? []) {
          const id = typeof m.id === "string" ? m.id : m.id?.open_id;
          if (id && m.name) {
            mentionNames.set(id, m.name);
          }
        }
      }
      if (mentionNames.size > 0) {
        setUserNameCache(accountId, mentionNames);
      }
      await batchResolveUserNames(client, Array.from(senderIds), accountId);
      const messages = items.map((item) => {
        const senderId = item.sender?.id ?? "";
        const senderName = item.sender?.sender_type === "user" ? getUserNameFromCache(accountId, senderId) : void 0;
        const createTime = item.create_time ? new Date(parseInt(item.create_time, 10)).toISOString().replace("Z", "+08:00") : "";
        let content = "";
        try {
          const contentObj = JSON.parse(item.body?.content ?? "{}");
          if (item.msg_type === "text") {
            content = contentObj.text ?? "";
          } else if (item.msg_type === "post") {
            const extractPostText = (post) => {
              if (typeof post !== "object" || !post) return "";
              for (const locale of ["zh_cn", "en_us", "ja_jp"]) {
                if (post[locale]?.content) {
                  return post[locale].content.map((line) => line.map((block) => {
                    if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                    if (block.tag === "a") return block.href ?? "";
                    if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                    if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                    if (block.tag === "emotion") return block.emoji_id ?? "";
                    return "";
                  }).join("")).join("\n");
                }
              }
              if (post.content) {
                return post.content.map((line) => line.map((block) => {
                  if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                  if (block.tag === "a") return block.href ?? "";
                  if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                  if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                  return "";
                }).join("")).join("\n");
              }
              return "";
            };
            content = extractPostText(contentObj);
          } else if (item.msg_type === "image") {
            content = `[image: ${contentObj.image_key ?? ""}]`;
          } else if (item.msg_type === "file") {
            content = `[file: ${contentObj.file_key ?? ""}, name: ${contentObj.fileName ?? ""}]`;
          } else if (item.msg_type === "audio") {
            content = `[audio: ${contentObj.file_key ?? ""}]`;
          } else if (item.msg_type === "media") {
            content = `[media: ${contentObj.file_key ?? ""}]`;
          } else if (item.msg_type === "share_chat") {
            content = `[share_chat: ${contentObj.chat_id ?? ""}]`;
          } else if (item.msg_type === "share_user") {
            content = `[share_user: ${contentObj.user_id ?? ""}]`;
          } else if (item.msg_type === "interactive") {
            content = `[interactive card]`;
          } else if (item.msg_type === "merge_forward") {
            const entries = contentObj.entries ?? [];
            content = `[forwarded messages: ${entries.length} messages]`;
          } else {
            content = item.body?.content ?? "";
          }
        } catch {
          content = item.body?.content ?? "";
        }
        const formatted = {
          message_id: item.message_id ?? "",
          msg_type: item.msg_type ?? "unknown",
          content,
          sender: {
            id: senderId,
            sender_type: item.sender?.sender_type ?? "unknown"
          },
          create_time: createTime,
          deleted: item.deleted ?? false,
          updated: item.updated ?? false
        };
        if (senderName) formatted.sender.name = senderName;
        if (item.thread_id) formatted.thread_id = item.thread_id;
        else if (item.parent_id) formatted.reply_to = item.parent_id;
        if (item.mentions && item.mentions.length > 0) {
          formatted.mentions = item.mentions.map((m) => ({
            key: m.key ?? "",
            id: typeof m.id === "string" ? m.id : m.id?.open_id ?? "",
            name: m.name ?? ""
          }));
        }
        return formatted;
      });
      outputResult({
        messages,
        has_more: result.data?.has_more ?? false,
        page_token: result.data?.page_token
      });
    });
  });
  im.command("get-thread-messages").description("Get messages within a thread").requiredOption("--thread_id <id>", "Thread ID (omt_xxx)").option("--page_size <n>", "Page size (1-50, default 50)").option("--page_token <token>", "Page token").option("--sort <rule>", "Sort: create_time_asc|create_time_desc").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const sortType = opts.sort === "create_time_asc" ? "ByCreateTimeAsc" : "ByCreateTimeDesc";
      const params = {
        container_id_type: "thread",
        container_id: opts.thread_id,
        sort_type: sortType,
        page_size: opts.page_size ?? 50,
        page_token: opts.page_token,
        card_msg_content_type: "raw_card_content"
      };
      const result = await client.invoke(
        "feishu_im_user_get_thread_messages.default",
        (sdk, sdkOpts) => sdk.im.v1.message.list({ params }, sdkOpts || {}),
        { as: "user" }
      );
      assertLarkOk2(result);
      const items = result.data?.items ?? [];
      const accountId = client.account.accountId;
      const senderIds = /* @__PURE__ */ new Set();
      const mentionNames = /* @__PURE__ */ new Map();
      for (const item of items) {
        if (item.sender?.sender_type === "user" && item.sender?.id) {
          senderIds.add(item.sender.id);
        }
        for (const m of item.mentions ?? []) {
          const id = typeof m.id === "string" ? m.id : m.id?.open_id;
          if (id && m.name) {
            mentionNames.set(id, m.name);
          }
        }
      }
      if (mentionNames.size > 0) {
        setUserNameCache(accountId, mentionNames);
      }
      await batchResolveUserNames(client, Array.from(senderIds), accountId);
      const messages = items.map((item) => {
        const senderId = item.sender?.id ?? "";
        const senderName = item.sender?.sender_type === "user" ? getUserNameFromCache(accountId, senderId) : void 0;
        const createTime = item.create_time ? new Date(parseInt(item.create_time, 10)).toISOString().replace("Z", "+08:00") : "";
        let content = "";
        try {
          const contentObj = JSON.parse(item.body?.content ?? "{}");
          if (item.msg_type === "text") {
            content = contentObj.text ?? "";
          } else if (item.msg_type === "post") {
            const extractPostText = (post) => {
              if (typeof post !== "object" || !post) return "";
              for (const locale of ["zh_cn", "en_us", "ja_jp"]) {
                if (post[locale]?.content) {
                  return post[locale].content.map((line) => line.map((block) => {
                    if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                    if (block.tag === "a") return block.href ?? "";
                    if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                    if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                    return "";
                  }).join("")).join("\n");
                }
              }
              if (post.content) {
                return post.content.map((line) => line.map((block) => {
                  if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                  if (block.tag === "a") return block.href ?? "";
                  if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                  if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                  return "";
                }).join("")).join("\n");
              }
              return "";
            };
            content = extractPostText(contentObj);
          } else if (item.msg_type === "image") {
            content = `[image: ${contentObj.image_key ?? ""}]`;
          } else if (item.msg_type === "file") {
            content = `[file: ${contentObj.file_key ?? ""}]`;
          } else if (item.msg_type === "merge_forward") {
            const entries = contentObj.entries ?? [];
            content = `[forwarded messages: ${entries.length} messages]`;
          } else {
            content = item.body?.content ?? "";
          }
        } catch {
          content = item.body?.content ?? "";
        }
        const formatted = {
          message_id: item.message_id ?? "",
          msg_type: item.msg_type ?? "unknown",
          content,
          sender: {
            id: senderId,
            sender_type: item.sender?.sender_type ?? "unknown"
          },
          create_time: createTime,
          deleted: item.deleted ?? false,
          updated: item.updated ?? false
        };
        if (senderName) formatted.sender.name = senderName;
        if (item.thread_id) formatted.thread_id = item.thread_id;
        return formatted;
      });
      outputResult({
        messages,
        has_more: result.data?.has_more ?? false,
        page_token: result.data?.page_token
      });
    });
  });
  im.command("search-messages").description("Search messages across conversations").option("--query <text>", "Search keyword").option("--chat_id <id>", "Limit to chat").option("--sender_ids <json>", "Sender open_id list JSON array").option("--mention_ids <json>", "Mentioned user open_id list JSON array").option("--message_type <type>", "Message type filter: file|image|media").option("--sender_type <type>", "Sender type: user|bot|all").option("--chat_type <type>", "Chat type: group|p2p").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--start_time <time>", "Start time (ISO 8601)").option("--end_time <time>", "End time (ISO 8601)").option("--relative_time <range>", "Relative time: today|yesterday|day_before_yesterday|this_week|last_week|this_month|last_month|last_{N}_{minutes|hours|days}").action(async (opts) => {
    await withAutoAuth(async () => {
      if (opts.relative_time && (opts.start_time || opts.end_time)) {
        outputError(new Error("Cannot use both --relative_time and --start_time/--end_time"));
        return;
      }
      const client = getToolClient();
      const accountId = client.account.accountId;
      let startTime;
      let endTime;
      if (opts.relative_time) {
        const range = parseTimeRangeToSeconds(opts.relative_time);
        startTime = range.start;
        endTime = range.end;
      } else {
        startTime = opts.start_time ? Math.floor(new Date(opts.start_time).getTime() / 1e3).toString() : "978307200";
        endTime = opts.end_time ? Math.floor(new Date(opts.end_time).getTime() / 1e3).toString() : Math.floor(Date.now() / 1e3).toString();
      }
      const searchData = {
        query: opts.query ?? "",
        start_time: startTime,
        end_time: endTime
      };
      if (opts.sender_ids) {
        try {
          searchData.from_ids = typeof opts.sender_ids === "string" ? JSON.parse(opts.sender_ids) : opts.sender_ids;
        } catch {
          outputError(new Error("Invalid JSON for --sender_ids"));
          return;
        }
      }
      if (opts.chat_id) searchData.chat_ids = [opts.chat_id];
      if (opts.mention_ids) {
        try {
          searchData.at_chatter_ids = typeof opts.mention_ids === "string" ? JSON.parse(opts.mention_ids) : opts.mention_ids;
        } catch {
          outputError(new Error("Invalid JSON for --mention_ids"));
          return;
        }
      }
      if (opts.message_type && ["file", "image", "media"].includes(opts.message_type)) {
        searchData.message_type = opts.message_type;
      }
      if (opts.sender_type && opts.sender_type !== "all") {
        searchData.from_type = opts.sender_type;
      }
      if (opts.chat_type) {
        searchData.chat_type = opts.chat_type === "group" ? "group_chat" : "p2p_chat";
      }
      const searchRes = await client.invoke(
        "feishu_im_user_search_messages.default",
        (sdk, sdkOpts) => sdk.search.message.create(
          {
            data: searchData,
            params: { user_id_type: "open_id", page_size: opts.page_size ?? 50, page_token: opts.page_token }
          },
          sdkOpts
        ),
        { as: "user" }
      );
      assertLarkOk2(searchRes);
      const messageIds = searchRes.data?.items ?? [];
      const hasMore = searchRes.data?.has_more ?? false;
      const pageToken = searchRes.data?.page_token;
      if (messageIds.length === 0) {
        outputResult({
          messages: [],
          has_more: hasMore,
          page_token: pageToken
        });
        return;
      }
      const queryStr = messageIds.map((id) => `message_ids=${encodeURIComponent(id)}`).join("&");
      const mgetRes = await client.invokeByPath("feishu_im_user_search_messages.default", `/open-apis/im/v1/messages/mget?${queryStr}`, {
        method: "GET",
        query: { user_id_type: "open_id", card_msg_content_type: "raw_card_content" },
        as: "user"
      });
      const items = mgetRes.data?.items ?? [];
      const chatIds = [...new Set(items.map((i) => i.chat_id).filter(Boolean))];
      const chatMap = /* @__PURE__ */ new Map();
      if (chatIds.length > 0) {
        try {
          const chatRes = await client.invokeByPath("feishu_im_user_search_messages.default", "/open-apis/im/v1/chats/batch_query", {
            method: "POST",
            body: { chat_ids: chatIds },
            query: { user_id_type: "open_id" },
            as: "user"
          });
          for (const c of chatRes.data?.items ?? []) {
            if (c.chat_id) {
              chatMap.set(c.chat_id, {
                name: c.name ?? "",
                chat_mode: c.chat_mode ?? "",
                p2p_target_id: c.p2p_target_id
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch chat contexts: ${err}`);
        }
      }
      const p2pTargetIds = [...new Set(
        [...chatMap.values()].filter((c) => c.chat_mode === "p2p" && c.p2p_target_id).map((c) => c.p2p_target_id)
      )];
      await batchResolveUserNames(client, p2pTargetIds, accountId);
      const senderIds = /* @__PURE__ */ new Set();
      const mentionNames = /* @__PURE__ */ new Map();
      for (const item of items) {
        if (item.sender?.sender_type === "user" && item.sender?.id) {
          senderIds.add(item.sender.id);
        }
        for (const m of item.mentions ?? []) {
          const id = typeof m.id === "string" ? m.id : m.id?.open_id;
          if (id && m.name) {
            mentionNames.set(id, m.name);
          }
        }
      }
      if (mentionNames.size > 0) {
        setUserNameCache(accountId, mentionNames);
      }
      await batchResolveUserNames(client, Array.from(senderIds), accountId);
      const messages = items.map((item) => {
        const chatId = item.chat_id;
        const chatCtx = chatId ? chatMap.get(chatId) : void 0;
        const senderId = item.sender?.id ?? "";
        const senderName = item.sender?.sender_type === "user" ? getUserNameFromCache(accountId, senderId) : void 0;
        const createTime = item.create_time ? new Date(parseInt(item.create_time, 10)).toISOString().replace("Z", "+08:00") : "";
        let content = "";
        try {
          const contentObj = JSON.parse(item.body?.content ?? "{}");
          if (item.msg_type === "text") {
            content = contentObj.text ?? "";
          } else if (item.msg_type === "post") {
            const extractPostText = (post) => {
              if (typeof post !== "object" || !post) return "";
              for (const locale of ["zh_cn", "en_us", "ja_jp"]) {
                if (post[locale]?.content) {
                  return post[locale].content.map((line) => line.map((block) => {
                    if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                    if (block.tag === "a") return block.href ?? "";
                    if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                    if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                    return "";
                  }).join("")).join("\n");
                }
              }
              if (post.content) {
                return post.content.map((line) => line.map((block) => {
                  if (block.tag === "text" || block.tag === "md") return block.text ?? "";
                  if (block.tag === "a") return block.href ?? "";
                  if (block.tag === "at") return `@${block.user_name ?? block.user_id ?? ""}`;
                  if (block.tag === "img") return `[image: ${block.image_key ?? ""}]`;
                  return "";
                }).join("")).join("\n");
              }
              return "";
            };
            content = extractPostText(contentObj);
          } else if (item.msg_type === "image") {
            content = `[image: ${contentObj.image_key ?? ""}]`;
          } else if (item.msg_type === "file") {
            content = `[file: ${contentObj.file_key ?? ""}]`;
          } else if (item.msg_type === "merge_forward") {
            const entries = contentObj.entries ?? [];
            content = `[forwarded messages: ${entries.length} messages]`;
          } else {
            content = item.body?.content ?? "";
          }
        } catch {
          content = item.body?.content ?? "";
        }
        const formatted = {
          message_id: item.message_id ?? "",
          msg_type: item.msg_type ?? "unknown",
          content,
          sender: {
            id: senderId,
            sender_type: item.sender?.sender_type ?? "unknown"
          },
          create_time: createTime,
          deleted: item.deleted ?? false,
          updated: item.updated ?? false
        };
        if (senderName) formatted.sender.name = senderName;
        if (item.thread_id) formatted.thread_id = item.thread_id;
        else if (item.parent_id) formatted.reply_to = item.parent_id;
        if (chatCtx) {
          formatted.chat_id = chatId;
          if (chatCtx.chat_mode === "p2p" && chatCtx.p2p_target_id) {
            const partnerName = getUserNameFromCache(accountId, chatCtx.p2p_target_id);
            formatted.chat_type = "p2p";
            formatted.chat_name = partnerName ?? void 0;
            formatted.chat_partner = {
              open_id: chatCtx.p2p_target_id,
              name: partnerName ?? void 0
            };
          } else {
            formatted.chat_type = chatCtx.chat_mode;
            formatted.chat_name = chatCtx.name || void 0;
          }
        }
        return formatted;
      });
      outputResult({
        messages,
        has_more: hasMore,
        page_token: pageToken
      });
    });
  });
  im.command("fetch-resource").description("Download a message resource (image/file)").requiredOption("--message_id <id>", "Message ID (om_xxx)").requiredOption("--file_key <key>", "Resource key (image_key or file_key)").requiredOption("--type <type>", "Resource type: image|file").option("--output_path <path>", "Local save path (auto-generated if not provided)").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const res = await client.invoke(
        "feishu_im_user_fetch_resource.default",
        (sdk, sdkOpts) => sdk.im.v1.messageResource.get(
          {
            params: { type: opts.type },
            path: { message_id: opts.message_id, file_key: opts.file_key }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const stream = res.getReadableStream();
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const contentType = res.headers?.["content-type"] || "";
      const mimeType = contentType ? contentType.split(";")[0].trim() : "";
      const mimeExt = mimeType ? MIME_TO_EXT[mimeType] : void 0;
      let outputPath = opts.output_path;
      if (!outputPath) {
        const { join: join4 } = await import("path");
        const os = await import("os");
        const { tmpdir } = await import("os");
        const tmpDir = os.tmpdir();
        const ext = mimeExt || `.${opts.type}`;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        outputPath = join4(tmpDir, `feishu-${opts.type}-${timestamp}-${random}${ext}`);
      }
      const { mkdir: mkdir4, writeFile: writeFile4 } = await import("fs/promises");
      const { dirname: dirname4 } = await import("path");
      await mkdir4(dirname4(outputPath), { recursive: true });
      await writeFile4(outputPath, buffer);
      outputResult({
        saved_path: outputPath,
        size: buffer.length,
        content_type: contentType,
        mime_type: mimeType
      });
    });
  });
}

// src/cli/commands/drive.ts
import * as fs from "fs/promises";
import * as path from "path";
import { createReadStream } from "fs";
var SMALL_FILE_THRESHOLD = 15 * 1024 * 1024;
function registerDriveCommands(parent) {
  const drive = parent.command("drive").description("Drive (cloud storage) operations");
  drive.command("list").description("List files in a folder").option("--folder_token <token>", "Folder token (root if omitted)").option("--page_size <n>", "Page size (max 200)").option("--page_token <token>", "Page token").option("--order_by <field>", "Sort: EditedTime|CreatedTime").option("--direction <dir>", "Direction: ASC|DESC").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_drive_file.list",
        (sdk, sdkOpts) => sdk.drive.file.list(
          {
            params: {
              folder_token: opts.folder_token,
              page_size: opts.page_size,
              page_token: opts.page_token,
              order_by: opts.order_by,
              direction: opts.direction
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({
        files: result.data?.files,
        has_more: result.data?.has_more,
        page_token: result.data?.next_page_token
      });
    });
  });
  drive.command("get-meta").description("Batch query file metadata").requiredOption("--docs <json>", "Request docs JSON array", parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const docs = opts.docs;
      if (!docs || !Array.isArray(docs) || docs.length === 0) {
        outputError(new Error('request_docs must be a non-empty array. Format: [{"doc_token":"...","doc_type":"sheet"}]'));
        return;
      }
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_drive_file.get_meta",
        (sdk, sdkOpts) => sdk.drive.meta.batchQuery(
          { data: { request_docs: docs } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ metas: result.data?.metas ?? [] });
    });
  });
  drive.command("copy <file_token>").description("Copy a file").requiredOption("--name <name>", "New file name").requiredOption("--type <type>", "Doc type: doc|sheet|file|bitable|docx|folder|mindnote|slides").option("--folder_token <token>", "Target folder token").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_drive_file.copy",
        (sdk, sdkOpts) => sdk.drive.file.copy(
          {
            path: { file_token: fileToken },
            data: { name: opts.name, type: opts.type, folder_token: opts.folder_token }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ file: result.data?.file });
    });
  });
  drive.command("move <file_token>").description("Move a file").requiredOption("--type <type>", "Doc type").requiredOption("--folder_token <token>", "Target folder token").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_drive_file.move",
        (sdk, sdkOpts) => sdk.drive.file.move(
          {
            path: { file_token: fileToken },
            data: { type: opts.type, folder_token: opts.folder_token }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const data = result.data;
      outputResult({
        success: true,
        ...data?.task_id ? { task_id: data.task_id } : {},
        file_token: fileToken,
        target_folder_token: opts.folder_token
      });
    });
  });
  drive.command("delete <file_token>").description("Delete a file").requiredOption("--type <type>", "Doc type").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_drive_file.delete",
        (sdk, sdkOpts) => sdk.drive.file.delete(
          { path: { file_token: fileToken }, params: { type: opts.type } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const data = result.data;
      outputResult({
        success: true,
        ...data?.task_id ? { task_id: data.task_id } : {},
        file_token: fileToken
      });
    });
  });
  drive.command("upload").description("Upload a file").option("--file_path <path>", "Local file path to upload").option("--file_content_base64 <base64>", "File content as base64 (alternative to file_path)").option("--file_name <name>", "File name (required when using file_content_base64)").option("--size <n>", "File size in bytes (required when using file_content_base64)").option("--parent_node <token>", "Parent folder token").action(async (opts) => {
    await withAutoAuth(async () => {
      if (!opts.file_path && !opts.file_content_base64) {
        outputError(new Error("Either --file_path or --file_content_base64 is required"));
        return;
      }
      if (opts.file_content_base64 && (!opts.file_name || !opts.size)) {
        outputError(new Error("--file_name and --size are required when using --file_content_base64"));
        return;
      }
      const client = getToolClient();
      let fileBuffer;
      let fileName;
      let fileSize;
      if (opts.file_path) {
        fileBuffer = await fs.readFile(opts.file_path);
        fileName = opts.file_name || path.basename(opts.file_path);
        fileSize = opts.size || fileBuffer.length;
      } else {
        fileBuffer = Buffer.from(opts.file_content_base64, "base64");
        fileName = opts.file_name;
        fileSize = opts.size;
      }
      if (fileSize <= SMALL_FILE_THRESHOLD) {
        const result = await client.invoke(
          "feishu_drive_file.upload",
          (sdk, sdkOpts) => sdk.drive.file.uploadAll(
            {
              data: {
                file_name: fileName,
                parent_type: "explorer",
                parent_node: opts.parent_node || "",
                size: fileSize,
                file: fileBuffer
              }
            },
            sdkOpts || {}
          ),
          { as: "user" }
        );
        outputResult({ file_token: result.data?.file_token, file_name: fileName, size: fileSize });
      } else {
        const prepareRes = await client.invoke(
          "feishu_drive_file.upload",
          (sdk, sdkOpts) => sdk.drive.file.uploadPrepare(
            {
              data: {
                file_name: fileName,
                parent_type: "explorer",
                parent_node: opts.parent_node || "",
                size: fileSize
              }
            },
            sdkOpts || {}
          ),
          { as: "user" }
        );
        const { upload_id, block_size, block_num } = prepareRes.data;
        for (let seq = 0; seq < block_num; seq++) {
          const start = seq * block_size;
          const end = Math.min(start + block_size, fileSize);
          const chunkBuffer = fileBuffer.subarray(start, end);
          await client.invoke(
            "feishu_drive_file.upload",
            (sdk, sdkOpts) => sdk.drive.file.uploadPart(
              {
                data: {
                  upload_id: String(upload_id),
                  seq: Number(seq),
                  size: Number(chunkBuffer.length),
                  file: chunkBuffer
                }
              },
              sdkOpts || {}
            ),
            { as: "user" }
          );
        }
        const finishRes = await client.invoke(
          "feishu_drive_file.upload",
          (sdk, sdkOpts) => sdk.drive.file.uploadFinish(
            {
              data: { upload_id, block_num }
            },
            sdkOpts || {}
          ),
          { as: "user" }
        );
        outputResult({
          file_token: finishRes.data?.file_token,
          file_name: fileName,
          size: fileSize,
          upload_method: "chunked",
          chunks_uploaded: block_num
        });
      }
    });
  });
  drive.command("download <file_token>").description("Download a file").option("--output_path <path>", "Local save path (with filename)").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const res = await client.invoke(
        "feishu_drive_file.download",
        (sdk, sdkOpts) => sdk.drive.file.download(
          { path: { file_token: fileToken } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const stream = res.getReadableStream();
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      if (opts.output_path) {
        await fs.mkdir(path.dirname(opts.output_path), { recursive: true });
        await fs.writeFile(opts.output_path, buffer);
        outputResult({ saved_path: opts.output_path, size: buffer.length });
      } else {
        outputResult({ file_content_base64: buffer.toString("base64"), size: buffer.length });
      }
    });
  });
  const docMedia = drive.command("doc-media").description("Document media operations (insert/download)");
  docMedia.command("insert <doc_id>").description("Insert media (image/file) into a document").requiredOption("--file_path <path>", "Local file path to insert").option("--type <type>", "Media type: image (default) or file", "image").option("--align <align>", "Alignment for image: left|center|right", "center").option("--caption <text>", "Image caption/description").action(async (docId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const filePath = opts.file_path;
      const fileName = path.basename(filePath);
      const stat2 = await fs.stat(filePath);
      const fileSize = stat2.size;
      const mediaType = opts.type || "image";
      const blockType = mediaType === "file" ? 23 : 27;
      const parentType = mediaType === "file" ? "docx_file" : "docx_image";
      const createRes = await client.invoke(
        "feishu_doc_media.insert",
        (sdk, sdkOpts) => sdk.docx.documentBlockChildren.create(
          {
            path: { document_id: docId, block_id: docId },
            data: {
              children: [
                mediaType === "file" ? { block_type: 23, file: { token: "" } } : { block_type: 27, image: {} }
              ]
            },
            params: { document_revision_id: -1 }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      let blockId;
      if (mediaType === "file") {
        blockId = createRes.data?.children?.[0]?.children?.[0];
      } else {
        blockId = createRes.data?.children?.[0]?.block_id;
      }
      if (!blockId) {
        outputError(new Error(`Failed to create ${mediaType} block: no block_id returned`));
        return;
      }
      const uploadRes = await client.invoke(
        "feishu_doc_media.insert",
        (sdk, sdkOpts) => sdk.drive.v1.media.uploadAll(
          {
            data: {
              file_name: fileName,
              parent_type: parentType,
              parent_node: blockId,
              size: fileSize,
              file: createReadStream(filePath),
              extra: JSON.stringify({ drive_route_token: docId })
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const fileToken = uploadRes?.file_token ?? uploadRes?.data?.file_token;
      if (!fileToken) {
        outputError(new Error(`Failed to upload ${mediaType}: no file_token returned`));
        return;
      }
      const patchRequest = { block_id: blockId };
      if (mediaType === "image") {
        const alignMap = { left: 1, center: 2, right: 3 };
        patchRequest.replace_image = {
          token: fileToken,
          align: alignMap[opts.align] || 2,
          ...opts.caption ? { caption: { content: opts.caption } } : {}
        };
      } else {
        patchRequest.replace_file = { token: fileToken };
      }
      await client.invoke(
        "feishu_doc_media.insert",
        (sdk, sdkOpts) => sdk.docx.documentBlock.batchUpdate(
          {
            path: { document_id: docId },
            data: { requests: [patchRequest] },
            params: { document_revision_id: -1 }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({
        success: true,
        type: mediaType,
        document_id: docId,
        block_id: blockId,
        file_token: fileToken,
        file_name: fileName
      });
    });
  });
  docMedia.command("download <resource_token>").description("Download media or whiteboard").requiredOption("--resource_type <type>", "Resource type: media or whiteboard").requiredOption("--output_path <path>", "Local save path (can omit extension)").action(async (resourceToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let res;
      if (opts.resource_type === "media") {
        res = await client.invoke(
          "feishu_doc_media.download",
          (sdk, sdkOpts) => sdk.drive.v1.media.download({ path: { file_token: resourceToken } }, sdkOpts || {}),
          { as: "user" }
        );
      } else {
        res = await client.invoke(
          "feishu_doc_media.download",
          (sdk, sdkOpts) => sdk.board.v1.whiteboard.downloadAsImage({ path: { whiteboard_id: resourceToken } }, sdkOpts || {}),
          { as: "user" }
        );
      }
      const stream = res.getReadableStream();
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const contentType = res.headers?.["content-type"] || "";
      let finalPath = opts.output_path;
      if (!path.extname(opts.output_path) && contentType) {
        const mimeType = contentType.split(";")[0].trim();
        const extMap = {
          "image/png": ".png",
          "image/jpeg": ".jpg",
          "image/gif": ".gif",
          "image/webp": ".webp",
          "application/pdf": ".pdf"
        };
        const ext = extMap[mimeType] || (opts.resource_type === "whiteboard" ? ".png" : "");
        if (ext) finalPath = opts.output_path + ext;
      }
      await fs.mkdir(path.dirname(finalPath), { recursive: true });
      await fs.writeFile(finalPath, buffer);
      outputResult({
        resource_type: opts.resource_type,
        resource_token: resourceToken,
        size_bytes: buffer.length,
        content_type: contentType,
        saved_path: finalPath
      });
    });
  });
  const docComments = drive.command("doc-comments").description("Document comment operations (list/create/patch)");
  docComments.command("list <file_token>").description("List document comments").requiredOption("--file_type <type>", "File type: doc|docx|sheet|file|slides|wiki").option("--is_whole", "Only whole comments").option("--is_solved", "Only solved comments").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--user_id_type <type>", "User ID type: open_id|union_id|user_id").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const { actualFileToken, actualFileType } = await resolveDocToken(
        client,
        fileToken,
        opts.file_type
      );
      const result = await client.invoke(
        "feishu_doc_comments.list",
        (sdk, sdkOpts) => sdk.drive.v1.fileComment.list(
          {
            path: { file_token: actualFileToken },
            params: {
              file_type: actualFileType,
              is_whole: opts.is_whole,
              is_solved: opts.is_solved,
              page_size: opts.page_size || 50,
              page_token: opts.page_token,
              user_id_type: opts.user_id_type || "open_id"
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const items = result.data?.items || [];
      const assembled = await assembleCommentReplies(
        client,
        actualFileToken,
        actualFileType,
        items,
        opts.user_id_type || "open_id"
      );
      outputResult({
        items: assembled,
        has_more: result.data?.has_more ?? false,
        page_token: result.data?.page_token
      });
    });
  });
  docComments.command("create <file_token>").description("Create a document comment").requiredOption("--file_type <type>", "File type: doc|docx|sheet|file|slides|wiki").requiredOption("--elements <json>", "Comment elements JSON array", parseJsonArg).option("--user_id_type <type>", "User ID type: open_id|union_id|user_id").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const elements = opts.elements;
      if (!elements || elements.length === 0) {
        outputError(new Error("elements parameter is required and cannot be empty"));
        return;
      }
      const client = getToolClient();
      const { actualFileToken, actualFileType } = await resolveDocToken(
        client,
        fileToken,
        opts.file_type
      );
      const sdkElements = elements.map((el) => {
        if (el.type === "text") {
          return { type: "text_run", text_run: { text: el.text || "" } };
        } else if (el.type === "mention") {
          return { type: "person", person: { user_id: el.open_id || "" } };
        } else if (el.type === "link") {
          return { type: "docs_link", docs_link: { url: el.url || "" } };
        }
        return { type: "text_run", text_run: { text: "" } };
      });
      const result = await client.invoke(
        "feishu_doc_comments.create",
        (sdk, sdkOpts) => sdk.drive.v1.fileComment.create(
          {
            path: { file_token: actualFileToken },
            params: {
              file_type: actualFileType,
              user_id_type: opts.user_id_type || "open_id"
            },
            data: {
              reply_list: {
                replies: [{ content: { elements: sdkElements } }]
              }
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  docComments.command("patch <file_token>").description("Patch a comment (solve/unsolve)").requiredOption("--file_type <type>", "File type: doc|docx|sheet|file|slides|wiki").requiredOption("--comment_id <id>", "Comment ID").requiredOption("--is_solved_value <bool>", "Solve status: true or false", (v) => v === "true").action(async (fileToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const { actualFileToken, actualFileType } = await resolveDocToken(
        client,
        fileToken,
        opts.file_type
      );
      await client.invoke(
        "feishu_doc_comments.patch",
        (sdk, sdkOpts) => sdk.drive.v1.fileComment.patch(
          {
            path: { file_token: actualFileToken, comment_id: opts.comment_id },
            params: { file_type: actualFileType },
            data: { is_solved: opts.is_solved_value }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult({ success: true });
    });
  });
}
async function resolveDocToken(client, fileToken, fileType) {
  if (fileType === "wiki") {
    const wikiNodeRes = await client.invoke(
      "feishu_doc_comments.resolve",
      (sdk, opts) => sdk.wiki.space.getNode(
        {
          params: { token: fileToken, obj_type: "wiki" }
        },
        opts
      ),
      { as: "user" }
    );
    const node = wikiNodeRes.data?.node;
    if (!node?.obj_token || !node?.obj_type) {
      throw new Error(`Failed to resolve wiki token "${fileToken}" to document object`);
    }
    return { actualFileToken: node.obj_token, actualFileType: node.obj_type };
  }
  return { actualFileToken: fileToken, actualFileType: fileType };
}
async function assembleCommentReplies(client, fileToken, fileType, comments, userIdType) {
  const result = [];
  for (const comment of comments) {
    const assembled = { ...comment };
    if (comment.reply_list?.replies?.length > 0 || comment.has_more) {
      try {
        const replies = [];
        let pageToken = void 0;
        let hasMore = true;
        while (hasMore) {
          const replyRes = await client.invoke(
            "drive.v1.fileCommentReply.list",
            (sdk, opts) => sdk.drive.v1.fileCommentReply.list(
              {
                path: { file_token, comment_id: comment.comment_id },
                params: {
                  file_type: fileType,
                  page_token: pageToken,
                  page_size: 50,
                  user_id_type: userIdType
                }
              },
              opts
            ),
            { as: "user" }
          );
          const replyData = replyRes.data;
          if (replyRes.code === 0 && replyData?.items) {
            replies.push(...replyData.items || []);
            hasMore = replyData.has_more || false;
            pageToken = replyData.page_token;
          } else {
            break;
          }
        }
        assembled.reply_list = { replies };
      } catch {
      }
    }
    result.push(assembled);
  }
  return result;
}

// src/cli/commands/wiki.ts
function registerWikiCommands(parent) {
  const wiki = parent.command("wiki").description("Wiki (knowledge base) management");
  const space = wiki.command("space").description("Wiki space operations");
  space.command("list").description("List wiki spaces").option("--page_size <n>", "Page size (max 50)").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space.list",
        (sdk, sdkOpts) => sdk.wiki.space.list(
          { params: { page_size: opts.page_size, page_token: opts.page_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  space.command("get <space_id>").description("Get wiki space info").action(async (spaceId) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space.get",
        (sdk, sdkOpts) => sdk.wiki.space.get({ path: { space_id: spaceId } }, sdkOpts || {}),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  space.command("create").description("Create a wiki space").option("--name <name>", "Space name").option("--description <desc>", "Space description").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space.create",
        (sdk, sdkOpts) => sdk.wiki.space.create(
          { data: { name: opts.name, description: opts.description } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  const node = wiki.command("node").description("Wiki space node operations");
  node.command("list <space_id>").description("List nodes in a space").option("--parent_node_token <token>", "Parent node token").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (spaceId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space_node.list",
        (sdk, sdkOpts) => sdk.wiki.spaceNode.list(
          {
            path: { space_id: spaceId },
            params: {
              page_size: opts.page_size,
              page_token: opts.page_token,
              parent_node_token: opts.parent_node_token
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  node.command("get <token>").description("Get a node (resolve node_token to obj_token)").option("--obj_type <type>", "Object type (default: wiki)").action(async (token, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space_node.get",
        (sdk, sdkOpts) => sdk.wiki.space.getNode(
          { params: { token, obj_type: opts.obj_type || "wiki" } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  node.command("create <space_id>").description("Create a node in a space").requiredOption("--obj_type <type>", "Object type: sheet|bitable|file|docx|slides").requiredOption("--node_type <type>", "Node type: origin|shortcut").option("--parent_node_token <token>", "Parent node token").option("--origin_node_token <token>", "Origin node token (for shortcut)").option("--title <title>", "Node title").action(async (spaceId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space_node.create",
        (sdk, sdkOpts) => sdk.wiki.spaceNode.create(
          {
            path: { space_id: spaceId },
            data: {
              obj_type: opts.obj_type,
              parent_node_token: opts.parent_node_token,
              node_type: opts.node_type,
              origin_node_token: opts.origin_node_token,
              title: opts.title
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  node.command("move <space_id> <node_token>").description("Move a node").option("--target_parent_token <token>", "Target parent token").action(async (spaceId, nodeToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space_node.move",
        (sdk, sdkOpts) => sdk.wiki.spaceNode.move(
          {
            path: { space_id: spaceId, node_token: nodeToken },
            data: { target_parent_token: opts.target_parent_token }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  node.command("copy <space_id> <node_token>").description("Copy a node").option("--target_space_id <id>", "Target space ID").option("--target_parent_token <token>", "Target parent token").option("--title <title>", "New title").action(async (spaceId, nodeToken, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_wiki_space_node.copy",
        (sdk, sdkOpts) => sdk.wiki.spaceNode.copy(
          {
            path: { space_id: spaceId, node_token: nodeToken },
            data: {
              target_space_id: opts.target_space_id,
              target_parent_token: opts.target_parent_token,
              title: opts.title
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/cli/commands/doc.ts
import fs3 from "fs";

// src/core/domains.ts
function mcpDomain(brand) {
  return brand === "lark" ? "https://mcp.larksuite.com" : "https://mcp.feishu.cn";
}

// src/core/mcp-client.ts
import fs2 from "fs";
import path2 from "path";
function isRecord(v) {
  return typeof v === "object" && v !== null;
}
function extractMcpUrlFromConfig(cfg) {
  if (!isRecord(cfg)) return void 0;
  const channels = cfg.channels;
  if (!isRecord(channels)) return void 0;
  const feishu = channels.feishu;
  if (!isRecord(feishu)) return void 0;
  const url = feishu.mcpEndpoint;
  const legacyUrl = feishu.mcp_url;
  const chosen = typeof url === "string" ? url : typeof legacyUrl === "string" ? legacyUrl : void 0;
  if (typeof chosen !== "string") return void 0;
  const trimmed = chosen.trim();
  return trimmed ? trimmed : void 0;
}
function readMcpUrlFromConfigFile() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    if (!homeDir) return void 0;
    const configPath = path2.join(homeDir, ".feishu-cli", "config.json");
    if (!fs2.existsSync(configPath)) return void 0;
    const raw = fs2.readFileSync(configPath, "utf8");
    const cfg = JSON.parse(raw);
    return extractMcpUrlFromConfig(cfg);
  } catch {
    return void 0;
  }
}
function getMcpEndpoint(brand) {
  return process.env.FEISHU_MCP_ENDPOINT?.trim() || readMcpUrlFromConfigFile() || `${mcpDomain(brand)}/mcp`;
}
function buildAuthHeader() {
  const token = process.env.FEISHU_MCP_BEARER_TOKEN?.trim() || process.env.FEISHU_MCP_TOKEN?.trim();
  if (!token) return void 0;
  return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}
function unwrapJsonRpcResult(v) {
  if (!isRecord(v)) return v;
  const hasJsonRpc = typeof v.jsonrpc === "string";
  const hasId = "id" in v;
  const hasResult = "result" in v;
  const hasError = "error" in v;
  if (hasJsonRpc && (hasResult || hasError)) {
    if (hasError) {
      const err = v.error;
      if (isRecord(err) && typeof err.message === "string") {
        throw new Error(err.message);
      }
      throw new Error("MCP \u8FD4\u56DE error\uFF0C\u4F46\u65E0\u6CD5\u89E3\u6790 message");
    }
    return unwrapJsonRpcResult(v.result);
  }
  if (!hasJsonRpc && !hasId && hasResult && !hasError) {
    return unwrapJsonRpcResult(v.result);
  }
  return v;
}
async function callMcpTool(name, args, toolCallId, uat, brand) {
  const endpoint = getMcpEndpoint(brand);
  const auth = buildAuthHeader();
  const body = {
    jsonrpc: "2.0",
    id: toolCallId,
    method: "tools/call",
    params: { name, arguments: args }
  };
  const headers = {
    "Content-Type": "application/json",
    "X-Lark-MCP-UAT": uat,
    "X-Lark-MCP-Allowed-Tools": name
  };
  if (auth) headers.authorization = auth;
  const res = await feishuFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status} ${res.statusText}: ${text.slice(0, 4e3)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`MCP \u8FD4\u56DE\u975E JSON\uFF1A${text.slice(0, 4e3)}`);
  }
  if (data.error) {
    throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
  }
  return unwrapJsonRpcResult(data.result);
}

// src/cli/commands/doc.ts
function extractDocumentId(input) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:feishu\.cn|larksuite\.com)\/docx\/([A-Za-z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}
function validateCreateDocParams(params) {
  if (params.task_id) return;
  if (!params.markdown || !params.title) {
    throw new Error("create-doc\uFF1A\u672A\u63D0\u4F9B task_id \u65F6\uFF0C\u5FC5\u987B\u63D0\u4F9B markdown \u548C title");
  }
  const flags = [params.folder_token, params.wiki_node, params.wiki_space].filter(Boolean);
  if (flags.length > 1) {
    throw new Error("create-doc\uFF1Afolder_token / wiki_node / wiki_space \u4E09\u8005\u4E92\u65A5\uFF0C\u8BF7\u53EA\u63D0\u4F9B\u4E00\u4E2A");
  }
}
function validateUpdateDocParams(params) {
  if (params.task_id) return;
  if (!params.doc_id) {
    throw new Error("update-doc\uFF1A\u672A\u63D0\u4F9B task_id \u65F6\u5FC5\u987B\u63D0\u4F9B doc_id");
  }
  const needSelection = params.mode === "replace_range" || params.mode === "insert_before" || params.mode === "insert_after" || params.mode === "delete_range";
  if (needSelection) {
    const hasEllipsis = Boolean(params.selection_with_ellipsis);
    const hasTitle = Boolean(params.selection_by_title);
    if (hasEllipsis && hasTitle || !hasEllipsis && !hasTitle) {
      throw new Error(
        "update-doc\uFF1Amode \u4E3A replace_range/insert_before/insert_after/delete_range \u65F6\uFF0Cselection_with_ellipsis \u4E0E selection_by_title \u5FC5\u987B\u4E8C\u9009\u4E00"
      );
    }
  }
  const needMarkdown = params.mode !== "delete_range";
  if (needMarkdown && !params.markdown) {
    throw new Error(`update-doc\uFF1Amode=${params.mode} \u65F6\u5FC5\u987B\u63D0\u4F9B markdown`);
  }
}
function registerDocCommands(parent) {
  const doc = parent.command("doc").description("Document operations");
  doc.command("fetch <doc_id>").description("Fetch document content (title + markdown)").option("--offset <n>", "Character offset for pagination").option("--limit <n>", "Max characters to return").option("--task_id <id>", "Async task ID for polling").action(async (docId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const documentId = extractDocumentId(docId);
      const params = {};
      if (opts.offset !== void 0) params.offset = Number(opts.offset);
      if (opts.limit !== void 0) params.limit = Number(opts.limit);
      if (opts.task_id) params.task_id = opts.task_id;
      const result = await client.invoke(
        "feishu_fetch_doc.default",
        (sdk, sdkOpts) => {
          const sdkWithOpts = sdkOpts || {};
          return sdk.docx.document.rawContent(
            { path: { document_id: documentId }, params },
            sdkWithOpts
          );
        },
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  doc.command("create").description("Create a new document from markdown").option("--title <title>", "Document title").option("--content <markdown>", "Markdown content").option("--file <path>", "Read markdown content from file").option("--folder_token <token>", "Parent folder token").option("--wiki_node <token>", "Wiki node token or URL").option("--wiki_space <id>", 'Wiki space ID (use "my_library" for personal)').option("--task_id <id>", "Async task ID for polling").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let markdown = opts.content;
      if (opts.file) {
        if (!fs3.existsSync(opts.file)) {
          outputError(`File not found: ${opts.file}`);
          return;
        }
        markdown = fs3.readFileSync(opts.file, "utf8");
      }
      const args = {
        markdown,
        title: opts.title,
        task_id: opts.task_id
      };
      if (opts.folder_token) args.folder_token = opts.folder_token;
      if (opts.wiki_node) args.wiki_node = opts.wiki_node;
      if (opts.wiki_space) args.wiki_space = opts.wiki_space;
      try {
        validateCreateDocParams(args);
      } catch (err) {
        outputError(err instanceof Error ? err.message : String(err));
        return;
      }
      const result = await client.invoke(
        "feishu_create_doc.default",
        async (_sdk, _sdkOpts, uat) => {
          if (!uat) throw new Error("UAT not available");
          return callMcpTool("create-doc", args, "doc-create", uat, client.account.brand);
        },
        { as: "user" }
      );
      if (result?.content?.[0]?.type === "text") {
        try {
          outputResult(JSON.parse(result.content[0].text));
        } catch {
          outputResult(result.content[0].text);
        }
      } else {
        outputResult(result);
      }
    });
  });
  doc.command("update").description("Update a document (overwrite/append/replace/insert/delete)").option("--token <doc_id>", "Document ID or URL").requiredOption("--mode <mode>", "Update mode: overwrite|append|replace_range|replace_all|insert_before|insert_after|delete_range").option("--content <markdown>", "Markdown content").option("--file <path>", "Read markdown content from file").option("--selection <text>", 'Selection locator: "start...end" or "exact text"').option("--selection_by_title <title>", 'Selection by title: "## Section Title"').option("--new_title <title>", "New document title").option("--task_id <id>", "Async task ID for polling").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      let markdown = opts.content;
      if (opts.file) {
        if (!fs3.existsSync(opts.file)) {
          outputError(`File not found: ${opts.file}`);
          return;
        }
        markdown = fs3.readFileSync(opts.file, "utf8");
      }
      const docId = opts.token ? extractDocumentId(opts.token) : void 0;
      const args = {
        doc_id: docId,
        mode: opts.mode,
        markdown,
        selection_with_ellipsis: opts.selection,
        selection_by_title: opts.selection_by_title,
        new_title: opts.new_title,
        task_id: opts.task_id
      };
      try {
        validateUpdateDocParams(args);
      } catch (err) {
        outputError(err instanceof Error ? err.message : String(err));
        return;
      }
      const result = await client.invoke(
        "feishu_update_doc.default",
        async (_sdk, _sdkOpts, uat) => {
          if (!uat) throw new Error("UAT not available");
          return callMcpTool("update-doc", args, "doc-update", uat, client.account.brand);
        },
        { as: "user" }
      );
      if (result?.content?.[0]?.type === "text") {
        try {
          outputResult(JSON.parse(result.content[0].text));
        } catch {
          outputResult(result.content[0].text);
        }
      } else {
        outputResult(result);
      }
    });
  });
}

// src/cli/commands/sheets.ts
import * as fs4 from "fs/promises";
import * as path3 from "path";
var MAX_READ_ROWS = 200;
var MAX_WRITE_ROWS = 5e3;
var MAX_WRITE_COLS = 100;
function registerSheetsCommands(parent) {
  const sheets = parent.command("sheets").description("Spreadsheet operations");
  sheets.command("info").description("Get spreadsheet info and sheet list").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const [spreadsheetRes, sheetsRes] = await Promise.all([
        client.invoke(
          "feishu_sheet.info",
          (sdk, sdkOpts) => sdk.sheets.spreadsheet.get({ path: { spreadsheet_token: token } }, sdkOpts || {}),
          { as: "user" }
        ),
        client.invoke(
          "feishu_sheet.info",
          (sdk, sdkOpts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, sdkOpts || {}),
          { as: "user" }
        )
      ]);
      const spreadsheet = spreadsheetRes.data?.spreadsheet;
      const sheetList = (sheetsRes.data?.sheets ?? []).map((s) => ({
        sheet_id: s.sheet_id,
        title: s.title,
        index: s.index,
        row_count: s.grid_properties?.row_count,
        column_count: s.grid_properties?.column_count,
        frozen_row_count: s.grid_properties?.frozen_row_count,
        frozen_column_count: s.grid_properties?.frozen_column_count
      }));
      outputResult({
        title: spreadsheet?.title,
        spreadsheet_token: token,
        sheets: sheetList
      });
    });
  });
  sheets.command("read").description("Read cell values").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").option("--range <range>", "Range (e.g. sheetId!A1:D10)").option("--sheet_id <id>", "Sheet ID (used when no range)").option("--value_render_option <opt>", "ToString|FormattedValue|Formula|UnformattedValue").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
      const query = {
        valueRenderOption: opts.value_render_option ?? "ToString",
        dateTimeRenderOption: "FormattedString"
      };
      const res = await client.invokeByPath("feishu_sheet.read", `/open-apis/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(range)}`, {
        method: "GET",
        query,
        as: "user"
      });
      if (res.code && res.code !== 0) {
        outputError(new Error(res.msg || `API error code: ${res.code}`));
        return;
      }
      let values = flattenValues(res.data?.valueRange?.values);
      const totalRows = values?.length || 0;
      let truncated = false;
      if (values && values.length > MAX_READ_ROWS) {
        values = values.slice(0, MAX_READ_ROWS);
        truncated = true;
      }
      outputResult({
        range: res.data?.valueRange?.range,
        values,
        ...truncated ? {
          truncated: true,
          total_rows: totalRows,
          hint: `Data exceeds ${MAX_READ_ROWS} rows, truncated. Please narrow the range and read again.`
        } : {}
      });
    });
  });
  sheets.command("write").description("Write cell values (overwrite)").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").option("--range <range>", "Range").option("--sheet_id <id>", "Sheet ID").requiredOption("--values <json>", "Values as 2D JSON array", parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const values = opts.values;
      if (values.length > MAX_WRITE_ROWS) {
        outputError(new Error(`write row count ${values.length} exceeds limit ${MAX_WRITE_ROWS}`));
        return;
      }
      if (values.some((row) => Array.isArray(row) && row.length > MAX_WRITE_COLS)) {
        outputError(new Error(`write column count exceeds limit ${MAX_WRITE_COLS}`));
        return;
      }
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
      const res = await client.invokeByPath(
        "feishu_sheet.write",
        `/open-apis/sheets/v2/spreadsheets/${token}/values`,
        {
          method: "PUT",
          body: { valueRange: { range, values } },
          as: "user"
        }
      );
      if (res.code && res.code !== 0) {
        outputError(new Error(res.msg || `API error code: ${res.code}`));
        return;
      }
      outputResult(res.data);
    });
  });
  sheets.command("append").description("Append rows to a sheet").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").option("--range <range>", "Range").option("--sheet_id <id>", "Sheet ID").requiredOption("--values <json>", "Values as 2D JSON array", parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const values = opts.values;
      if (values.length > MAX_WRITE_ROWS) {
        outputError(new Error(`append row count ${values.length} exceeds limit ${MAX_WRITE_ROWS}`));
        return;
      }
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const range = await resolveSheetRange(token, opts.range, opts.sheet_id, client);
      const res = await client.invokeByPath(
        "feishu_sheet.append",
        `/open-apis/sheets/v2/spreadsheets/${token}/values_append`,
        {
          method: "POST",
          body: { valueRange: { range, values } },
          as: "user"
        }
      );
      if (res.code && res.code !== 0) {
        outputError(new Error(res.msg || `API error code: ${res.code}`));
        return;
      }
      outputResult(res.data);
    });
  });
  sheets.command("find").description("Find cells in a sheet").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").requiredOption("--sheet_id <id>", "Sheet ID").requiredOption("--find <text>", "Search text or regex").option("--range <range>", "Search range (without sheetId prefix)").option("--match_case", "Case sensitive (default true)").option("--match_entire_cell", "Match entire cell only").option("--search_by_regex", "Use regex").option("--include_formulas", "Search formulas instead of values").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const findCondition = {
        range: opts.range ? `${opts.sheet_id}!${opts.range}` : opts.sheet_id
      };
      if (opts.match_case !== void 0) findCondition.match_case = !opts.match_case;
      if (opts.match_entire_cell !== void 0) findCondition.match_entire_cell = opts.match_entire_cell;
      if (opts.search_by_regex !== void 0) findCondition.search_by_regex = opts.search_by_regex;
      if (opts.include_formulas !== void 0) findCondition.include_formulas = opts.include_formulas;
      const result = await client.invoke(
        "feishu_sheet.find",
        (sdk, sdkOpts) => sdk.sheets.spreadsheetSheet.find(
          {
            path: { spreadsheet_token: token, sheet_id: opts.sheet_id },
            data: { find_condition: findCondition, find: opts.find }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data?.find_result);
    });
  });
  sheets.command("create").description("Create a new spreadsheet").requiredOption("--title <title>", "Spreadsheet title").option("--folder_token <token>", "Parent folder token").option("--headers <json>", "Header row as JSON array", parseJsonArg).option("--data <json>", "Initial data as 2D JSON array", parseJsonArg).action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_sheet.create",
        (sdk, sdkOpts) => sdk.sheets.spreadsheet.create(
          { data: { title: opts.title, folder_token: opts.folder_token } },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const spreadsheet = result.data?.spreadsheet;
      const token = spreadsheet?.spreadsheet_token;
      if (!token) {
        outputError(new Error("failed to create spreadsheet: no token returned"));
        return;
      }
      if (opts.headers || opts.data) {
        const allRows = [];
        if (opts.headers) allRows.push(opts.headers);
        if (opts.data) allRows.push(...opts.data);
        if (allRows.length > 0) {
          const sheetsRes = await client.invoke(
            "feishu_sheet.create",
            (sdk, sdkOpts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, sdkOpts || {}),
            { as: "user" }
          );
          const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
          if (firstSheet?.sheet_id) {
            const numRows = allRows.length;
            const numCols = Math.max(...allRows.map((r) => r.length));
            const range = `${firstSheet.sheet_id}!A1:${colLetter(numCols)}${numRows}`;
            await client.invokeByPath(
              "feishu_sheet.create",
              `/open-apis/sheets/v2/spreadsheets/${token}/values`,
              {
                method: "PUT",
                body: { valueRange: { range, values: allRows } },
                as: "user"
              }
            );
          }
        }
      }
      outputResult({
        spreadsheet_token: token,
        title: opts.title
      });
    });
  });
  sheets.command("export").description("Export spreadsheet to file").option("--spreadsheet_token <token>", "Spreadsheet token").option("--url <url>", "Spreadsheet URL").requiredOption("--file_extension <ext>", "Export format: xlsx or csv").option("--output_path <path>", "Local save path (with filename)").option("--sheet_id <id>", "Sheet ID (required for CSV export)").action(async (opts) => {
    await withAutoAuth(async () => {
      if (opts.file_extension === "csv" && !opts.sheet_id) {
        outputError(new Error("sheet_id is required for CSV export (CSV can only export one worksheet at a time)"));
        return;
      }
      const client = getToolClient();
      const token = await resolveSheetToken(opts, client);
      const createRes = await client.invoke(
        "feishu_sheet.export",
        (sdk, sdkOpts) => sdk.drive.exportTask.create(
          {
            data: {
              file_extension: opts.file_extension,
              token,
              type: "sheet",
              sub_id: opts.sheet_id
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      const ticket = createRes.data?.ticket;
      if (!ticket) {
        outputError(new Error("failed to create export task: no ticket returned"));
        return;
      }
      let fileToken;
      let fileName;
      let fileSize;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1e3));
        const pollRes = await client.invoke(
          "feishu_sheet.export",
          (sdk, sdkOpts) => sdk.drive.exportTask.get({ path: { ticket }, params: { token } }, sdkOpts || {}),
          { as: "user" }
        );
        const result = pollRes.data?.result;
        const jobStatus = result?.job_status;
        if (jobStatus === 0) {
          fileToken = result?.file_token;
          fileName = result?.file_name;
          fileSize = result?.file_size;
          break;
        }
        if (jobStatus !== void 0 && jobStatus >= 3) {
          outputError(new Error(result?.job_error_msg || `export failed (status=${jobStatus})`));
          return;
        }
      }
      if (!fileToken) {
        outputError(new Error("export timeout: task did not complete within 30 seconds"));
        return;
      }
      if (opts.output_path) {
        const dlRes = await client.invoke(
          "feishu_sheet.export",
          (sdk, sdkOpts) => sdk.drive.exportTask.download({ path: { file_token } }, sdkOpts || {}),
          { as: "user" }
        );
        const stream = dlRes.getReadableStream();
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        await fs4.mkdir(path3.dirname(opts.output_path), { recursive: true });
        await fs4.writeFile(opts.output_path, Buffer.concat(chunks));
        outputResult({
          file_path: opts.output_path,
          file_name: fileName,
          file_size: fileSize
        });
      } else {
        outputResult({
          file_token: fileToken,
          file_name: fileName,
          file_size: fileSize,
          hint: "File exported. Provide output_path parameter to download locally."
        });
      }
    });
  });
}
var KNOWN_TOKEN_TYPES = /* @__PURE__ */ new Set([
  "dox",
  "doc",
  "sht",
  "bas",
  "app",
  "sld",
  "bmn",
  "fld",
  "nod",
  "box",
  "jsn",
  "img",
  "isv",
  "wik",
  "wia",
  "wib",
  "wic",
  "wid",
  "wie",
  "dsb"
]);
function getTokenType(token) {
  if (token.length >= 15) {
    const prefix = token[4] + token[9] + token[14];
    if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
  }
  if (token.length >= 3) {
    const prefix = token.substring(0, 3);
    if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
  }
  return null;
}
async function resolveSheetToken(opts, client) {
  let token;
  if (opts.spreadsheet_token) {
    token = opts.spreadsheet_token;
  } else if (opts.url) {
    try {
      const u = new URL(opts.url);
      const match = u.pathname.match(/\/(?:sheets|wiki)\/([^/?#]+)/);
      if (match) token = match[1];
      else throw new Error(`Failed to parse spreadsheet_token from URL: ${opts.url}`);
    } catch {
      throw new Error(`Failed to parse spreadsheet_token from URL: ${opts.url}`);
    }
  } else {
    throw new Error("--spreadsheet_token or --url is required");
  }
  const tokenType = getTokenType(token);
  if (tokenType === "wik") {
    const wikiNodeRes = await client.invoke(
      "feishu_sheet.info",
      (sdk, opts2) => sdk.wiki.space.getNode(
        {
          params: { token, obj_type: "wiki" }
        },
        opts2
      ),
      { as: "user" }
    );
    const objToken = wikiNodeRes.data?.node?.obj_token;
    if (!objToken) {
      throw new Error(`Failed to resolve spreadsheet token from wiki token: ${token}`);
    }
    return objToken;
  }
  return token;
}
async function resolveSheetRange(token, range, sheetId, client) {
  if (range) return range;
  if (sheetId) return sheetId;
  const sheetsRes = await client.invoke(
    "feishu_sheet.info",
    (sdk, opts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, opts),
    { as: "user" }
  );
  const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
  if (!firstSheet?.sheet_id) throw new Error("Spreadsheet has no worksheets");
  return firstSheet.sheet_id;
}
function colLetter(n) {
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + n % 26) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
function flattenCellValue(cell) {
  if (!Array.isArray(cell)) return cell;
  if (cell.length > 0 && cell.every((seg) => seg != null && typeof seg === "object" && "text" in seg)) {
    return cell.map((seg) => seg.text).join("");
  }
  return cell;
}
function flattenValues(values) {
  if (!values) return values;
  return values.map((row) => row.map(flattenCellValue));
}

// src/cli/commands/search.ts
function convertTimeRange(timeRange) {
  if (!timeRange) return void 0;
  const result = {};
  if (timeRange.start) {
    const date = new Date(timeRange.start);
    if (!isNaN(date.getTime())) {
      result.start = String(Math.floor(date.getTime() / 1e3));
    }
  }
  if (timeRange.end) {
    const date = new Date(timeRange.end);
    if (!isNaN(date.getTime())) {
      result.end = String(Math.floor(date.getTime() / 1e3));
    }
  }
  if (Object.keys(result).length === 0) return void 0;
  return result;
}
function unixTimestampToISO86012(ts) {
  if (ts === void 0 || ts === null || ts === "") return void 0;
  const num = typeof ts === "string" ? parseInt(ts, 10) : ts;
  if (isNaN(num)) return void 0;
  if (typeof ts === "string" && (ts.includes("T") || ts.includes("-"))) return ts;
  return new Date(num * 1e3).toISOString();
}
function normalizeSearchResultTimeFields(value, converted) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSearchResultTimeFields(item, converted));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const source = value;
  const normalized = {};
  for (const [key, item] of Object.entries(source)) {
    if (key.endsWith("_time")) {
      const iso = unixTimestampToISO86012(item);
      if (iso) {
        normalized[key] = iso;
        converted.count += 1;
        continue;
      }
    }
    normalized[key] = normalizeSearchResultTimeFields(item, converted);
  }
  return normalized;
}
function registerSearchCommands(parent) {
  const search = parent.command("search").description("Search documents and wikis");
  search.command("doc-wiki").description("Search documents and wikis").option("--query <text>", "Search keyword").option("--doc_types <types>", "Comma-separated doc types: DOC,SHEET,BITABLE,WIKI,DOCX,etc.").option("--only_title", "Search titles only").option("--creator_ids <ids>", "Comma-separated creator open_ids").option("--sort_type <type>", "Sort type: DEFAULT_TYPE|OPEN_TIME|EDIT_TIME|EDIT_TIME_ASC|CREATE_TIME").option("--open_time_start <iso>", "Open time range start (ISO 8601)").option("--open_time_end <iso>", "Open time range end (ISO 8601)").option("--create_time_start <iso>", "Create time range start (ISO 8601)").option("--create_time_end <iso>", "Create time range end (ISO 8601)").option("--page_size <n>", "Page size (max 20)").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const query = opts.query ?? "";
      const requestData = {
        query,
        page_size: opts.page_size,
        page_token: opts.page_token
      };
      const filter = {};
      if (opts.doc_types) filter.doc_types = opts.doc_types.split(",");
      if (opts.only_title) filter.only_title = true;
      if (opts.creator_ids) filter.creator_ids = opts.creator_ids.split(",");
      if (opts.sort_type) filter.sort_type = opts.sort_type;
      if (opts.open_time_start || opts.open_time_end) {
        filter.open_time = convertTimeRange({
          start: opts.open_time_start,
          end: opts.open_time_end
        });
      }
      if (opts.create_time_start || opts.create_time_end) {
        filter.create_time = convertTimeRange({
          start: opts.create_time_start,
          end: opts.create_time_end
        });
      }
      requestData.doc_filter = { ...filter };
      requestData.wiki_filter = { ...filter };
      const res = await client.invoke(
        "feishu_search_doc_wiki.search",
        async (sdk, _opts, uat) => {
          return sdk.request(
            {
              method: "POST",
              url: "/open-apis/search/v2/doc_wiki/search",
              data: requestData,
              headers: {
                Authorization: `Bearer ${uat}`,
                "Content-Type": "application/json; charset=utf-8"
              }
            },
            _opts
          );
        },
        { as: "user" }
      );
      if (res.code !== 0) {
        throw new Error(`API Error: code=${res.code}, msg=${res.msg}`);
      }
      const data = res.data || {};
      const converted = { count: 0 };
      const normalizedResults = normalizeSearchResultTimeFields(data.res_units, converted);
      outputResult({
        total: data.total,
        has_more: data.has_more,
        results: normalizedResults,
        page_token: data.page_token
      });
    });
  });
}

// src/cli/commands/chat.ts
function registerChatCommands(parent) {
  const chat = parent.command("chat").description("Chat (group) management");
  chat.command("get <chat_id>").description("Get chat info").option("--user_id_type <type>", "User ID type: open_id|union_id|user_id").action(async (chatId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const userIdType = opts.user_id_type || "open_id";
      const result = await client.invoke(
        "feishu_chat.get",
        (sdk, sdkOpts) => sdk.im.v1.chat.get(
          {
            path: { chat_id: chatId },
            params: { user_id_type: userIdType }
          },
          {
            ...sdkOpts || {},
            headers: {
              ...sdkOpts?.headers ?? {},
              "X-Chat-Custom-Header": "enable_chat_list_security_check"
            }
          }
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  chat.command("search").description("Search chats by keyword").requiredOption("--query <text>", "Search keyword").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").option("--user_id_type <type>", "User ID type: open_id|union_id|user_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_chat.search",
        (sdk, sdkOpts) => sdk.im.v1.chat.search(
          {
            params: {
              user_id_type: opts.user_id_type || "open_id",
              query: opts.query,
              page_size: opts.page_size,
              page_token: opts.page_token
            }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  chat.command("members <chat_id>").description("List chat members").option("--member_id_type <type>", "Member ID type: open_id|union_id|user_id").option("--page_size <n>", "Page size").option("--page_token <token>", "Page token").action(async (chatId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_chat_members.default",
        (sdk, sdkOpts) => sdk.im.v1.chatMembers.get(
          {
            path: { chat_id: chatId },
            params: {
              member_id_type: opts.member_id_type || "open_id",
              page_size: opts.page_size,
              page_token: opts.page_token
            }
          },
          {
            ...sdkOpts || {},
            headers: {
              ...sdkOpts?.headers ?? {},
              "X-Chat-Custom-Header": "enable_chat_list_security_check"
            }
          }
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/cli/commands/user.ts
function registerUserCommands(parent) {
  const user = parent.command("user").description("User operations");
  user.command("get [user_id]").description("Get user info (own info if user_id omitted)").option("--user_id_type <type>", "User ID type: open_id|union_id|user_id").action(async (userId, opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      if (!userId) {
        try {
          const result = await client.invoke(
            "feishu_get_user.default",
            (sdk, sdkOpts) => sdk.authen.userInfo.get({}, sdkOpts || {}),
            { as: "user" }
          );
          outputResult(result.data);
        } catch (invokeErr) {
          if (isErrorCode41050(invokeErr)) {
            outputResult({
              error: "\u65E0\u6743\u9650\u67E5\u8BE2\u8BE5\u7528\u6237\u4FE1\u606F\u3002\n\n\u8BF4\u660E\uFF1A\u4F7F\u7528\u7528\u6237\u8EAB\u4EFD\u8C03\u7528\u901A\u8BAF\u5F55 API \u65F6\uFF0C\u53EF\u64CD\u4F5C\u7684\u6743\u9650\u8303\u56F4\u4E0D\u53D7\u5E94\u7528\u7684\u901A\u8BAF\u5F55\u6743\u9650\u8303\u56F4\u5F71\u54CD\uFF0C\u800C\u662F\u53D7\u5F53\u524D\u7528\u6237\u7684\u7EC4\u7EC7\u67B6\u6784\u53EF\u89C1\u8303\u56F4\u5F71\u54CD\u3002\u8BE5\u8303\u56F4\u9650\u5236\u4E86\u7528\u6237\u5728\u4F01\u4E1A\u5185\u53EF\u89C1\u7684\u7EC4\u7EC7\u67B6\u6784\u6570\u636E\u8303\u56F4\u3002"
            });
            return;
          }
          throw invokeErr;
        }
      } else {
        const userIdType = opts.user_id_type || "open_id";
        try {
          const result = await client.invoke(
            "feishu_get_user.default",
            (sdk, sdkOpts) => sdk.contact.v3.user.get(
              {
                path: { user_id: userId },
                params: { user_id_type: userIdType }
              },
              sdkOpts || {}
            ),
            { as: "user" }
          );
          outputResult({ user: result.data?.user });
        } catch (invokeErr) {
          if (isErrorCode41050(invokeErr)) {
            outputResult({
              error: "\u65E0\u6743\u9650\u67E5\u8BE2\u8BE5\u7528\u6237\u4FE1\u606F\u3002\n\n\u8BF4\u660E\uFF1A\u4F7F\u7528\u7528\u6237\u8EAB\u4EFD\u8C03\u7528\u901A\u8BAF\u5F55 API \u65F6\uFF0C\u53EF\u64CD\u4F5C\u7684\u6743\u9650\u8303\u56F4\u4E0D\u53D7\u5E94\u7528\u7684\u901A\u8BAF\u5F55\u6743\u9650\u8303\u56F4\u5F71\u54CD\uFF0C\u800C\u662F\u53D7\u5F53\u524D\u7528\u6237\u7684\u7EC4\u7EC7\u67B6\u6784\u53EF\u89C1\u8303\u56F4\u5F71\u54CD\u3002\u8BE5\u8303\u56F4\u9650\u5236\u4E86\u7528\u6237\u5728\u4F01\u4E1A\u5185\u53EF\u89C1\u7684\u7EC4\u7EC7\u67B6\u6784\u6570\u636E\u8303\u56F4\u3002\n\n\u5EFA\u8BAE\uFF1A\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u8C03\u6574\u5F53\u524D\u7528\u6237\u7684\u7EC4\u7EC7\u67B6\u6784\u53EF\u89C1\u8303\u56F4\uFF0C\u6216\u4F7F\u7528\u5E94\u7528\u8EAB\u4EFD\uFF08tenant_access_token\uFF09\u8C03\u7528 API\u3002"
            });
            return;
          }
          throw invokeErr;
        }
      }
    });
  });
  user.command("search").description("Search users by keyword").requiredOption("--query <text>", "Search keyword (name, phone, email)").option("--page_size <n>", "Page size (max 200)").option("--page_token <token>", "Page token").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const query = {
        query: opts.query,
        page_size: String(opts.page_size ?? 20)
      };
      if (opts.page_token) query.page_token = opts.page_token;
      const result = await client.invokeByPath(
        "feishu_search_user.default",
        "/open-apis/search/v1/user",
        { method: "GET", query, as: "user" }
      );
      outputResult(result.data);
    });
  });
}
function isErrorCode41050(err) {
  if (err && typeof err === "object") {
    const e = err;
    if (e.response && typeof e.response === "object") {
      const response = e.response;
      if (response.data && typeof response.data === "object") {
        const data = response.data;
        return data.code === 41050;
      }
    }
    if (e.code === 41050) return true;
  }
  return false;
}

// src/cli/commands/send.ts
function registerSendCommands(parent) {
  const send = parent.command("send").description("Send messages (convenience wrappers)");
  send.command("text").description("Send a text message").requiredOption("--to <id>", "Receiver ID (open_id or chat_id)").requiredOption("--text <message>", "Text content").option("--type <type>", "ID type: open_id|chat_id", "open_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const content = JSON.stringify({ text: opts.text });
      const result = await client.invoke(
        "feishu_im_user_message.send",
        (sdk, sdkOpts) => sdk.im.v1.message.create(
          {
            params: { receive_id_type: opts.type },
            data: { receive_id: opts.to, msg_type: "text", content }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  send.command("card").description("Send an interactive card message").requiredOption("--to <id>", "Receiver ID").requiredOption("--content <json>", "Card content JSON").option("--type <type>", "ID type: open_id|chat_id", "open_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const result = await client.invoke(
        "feishu_im_user_message.send",
        (sdk, sdkOpts) => sdk.im.v1.message.create(
          {
            params: { receive_id_type: opts.type },
            data: { receive_id: opts.to, msg_type: "interactive", content: opts.content }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
  send.command("media").description("Send an image or file message").requiredOption("--to <id>", "Receiver ID").requiredOption("--msg_type <type>", "Message type: image|file").requiredOption("--key <key>", "Image key (img_xxx) or file key (file_xxx)").option("--type <type>", "ID type: open_id|chat_id", "open_id").action(async (opts) => {
    await withAutoAuth(async () => {
      const client = getToolClient();
      const content = JSON.stringify({ [`${opts.msg_type}_key`]: opts.key });
      const result = await client.invoke(
        "feishu_im_user_message.send",
        (sdk, sdkOpts) => sdk.im.v1.message.create(
          {
            params: { receive_id_type: opts.type },
            data: { receive_id: opts.to, msg_type: opts.msg_type, content }
          },
          sdkOpts || {}
        ),
        { as: "user" }
      );
      outputResult(result.data);
    });
  });
}

// src/cli/commands/auth.ts
function registerAuthCommands(parent) {
  const auth = parent.command("auth").description("Authentication management");
  auth.command("device-flow").description("Start OAuth device authorization flow").option("--scope <scope>", "Scopes to request (space-separated)").action(async (opts) => {
    try {
      const config = getConfig();
      const accounts = getEnabledLarkAccounts(config);
      if (accounts.length === 0) {
        outputError(new Error("No enabled Feishu accounts found"));
        return;
      }
      const account = accounts[0];
      if (!account.appId || !account.appSecret) {
        outputError(new Error("Account missing appId or appSecret"));
        return;
      }
      console.error(`Starting device authorization for account: ${account.accountId}`);
      console.error(`Brand: ${account.brand}`);
      const deviceAuth = await requestDeviceAuthorization({
        appId: account.appId,
        appSecret: account.appSecret,
        brand: account.brand,
        scope: opts.scope
      });
      console.error("");
      console.error("=== Device Authorization ===");
      console.error(`User code: ${deviceAuth.userCode}`);
      console.error(`Verification URL: ${deviceAuth.verificationUriComplete}`);
      console.error(`Expires in: ${Math.round(deviceAuth.expiresIn / 60)} minutes`);
      console.error("");
      console.error("Please open the URL above and enter the user code to authorize.");
      console.error("Waiting for authorization...");
      const tokenResult = await pollDeviceToken({
        appId: account.appId,
        appSecret: account.appSecret,
        brand: account.brand,
        deviceCode: deviceAuth.deviceCode,
        interval: deviceAuth.interval,
        expiresIn: deviceAuth.expiresIn
      });
      if (tokenResult.ok) {
        outputResult({
          success: true,
          scope: tokenResult.token.scope,
          expires_in: tokenResult.token.expiresIn,
          refresh_expires_in: tokenResult.token.refreshExpiresIn
        });
      } else {
        const fail = tokenResult;
        outputError(new Error(`Authorization failed: ${fail.error} - ${fail.message}`));
      }
    } catch (err) {
      outputError(err);
    }
  });
  auth.command("status").description("Check authentication status").action(async () => {
    try {
      const config = getConfig();
      const accounts = getEnabledLarkAccounts(config);
      if (accounts.length === 0) {
        outputResult({ authenticated: false, error: "No enabled accounts" });
        return;
      }
      const results = [];
      for (const account of accounts) {
        if (!account.appId) {
          results.push({
            account_id: account.accountId,
            authenticated: false,
            error: "Missing appId"
          });
          continue;
        }
        const stored = await getStoredToken(account.appId, "");
        results.push({
          account_id: account.accountId,
          configured: !!(account.appId && account.appSecret),
          brand: account.brand
        });
      }
      outputResult(results);
    } catch (err) {
      outputError(err);
    }
  });
}

// src/cli/index.ts
var program = new Command();
program.name("feishu").description("Standalone Feishu/Lark CLI tool").version("1.0.0").option("-a, --account <id>", "Account ID to use", "default").hook("preAction", () => {
  const config = loadConfig();
  const feishu = config.channels?.feishu;
  if (!feishu?.appId || !feishu?.appSecret) {
    console.error("Error: No Feishu credentials configured.");
    console.error("Set FEISHU_APP_ID and FEISHU_APP_SECRET env vars, or create a config file.");
    console.error("See config.example.json for the format.");
    process.exit(1);
  }
});
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
program.parse();
