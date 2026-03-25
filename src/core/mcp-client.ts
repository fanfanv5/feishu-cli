/**
 * MCP JSON-RPC client for calling Feishu MCP tools (create-doc, update-doc).
 */
import type { LarkBrand } from './types';
import { mcpDomain } from './domains';
import { feishuFetch } from './feishu-fetch';
import fs from 'node:fs';
import path from 'node:path';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 从配置对象中提取 MCP endpoint URL
 */
function extractMcpUrlFromConfig(cfg: unknown): string | undefined {
  if (!isRecord(cfg)) return undefined;
  const channels = cfg.channels;
  if (!isRecord(channels)) return undefined;
  const feishu = channels.feishu;
  if (!isRecord(feishu)) return undefined;
  const url = feishu.mcpEndpoint;
  const legacyUrl = feishu.mcp_url;
  const chosen = typeof url === 'string' ? url : typeof legacyUrl === 'string' ? legacyUrl : undefined;
  if (typeof chosen !== 'string') return undefined;
  const trimmed = chosen.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 读取 ~/.feishu-cli/config.json 中的 MCP endpoint 配置
 */
function readMcpUrlFromConfigFile(): string | undefined {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) return undefined;
    const configPath = path.join(homeDir, '.feishu-cli', 'config.json');
    if (!fs.existsSync(configPath)) return undefined;

    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as unknown;
    return extractMcpUrlFromConfig(cfg);
  } catch {
    return undefined;
  }
}

function getMcpEndpoint(brand?: LarkBrand): string {
  // 优先级：环境变量 > 配置文件 > 基于 brand 的默认值
  return (
    process.env.FEISHU_MCP_ENDPOINT?.trim() ||
    readMcpUrlFromConfigFile() ||
    `${mcpDomain(brand)}/mcp`
  );
}

function buildAuthHeader(): string | undefined {
  // 允许通过环境变量注入鉴权（若服务端要求）
  const token = process.env.FEISHU_MCP_BEARER_TOKEN?.trim() || process.env.FEISHU_MCP_TOKEN?.trim();

  if (!token) return undefined;
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

function unwrapJsonRpcResult(v: unknown): unknown {
  if (!isRecord(v)) return v;
  const hasJsonRpc = typeof v.jsonrpc === 'string';
  const hasId = 'id' in v;
  const hasResult = 'result' in v;
  const hasError = 'error' in v;

  if (hasJsonRpc && (hasResult || hasError)) {
    if (hasError) {
      const err = v.error;
      if (isRecord(err) && typeof err.message === 'string') {
        throw new Error(err.message);
      }
      throw new Error('MCP 返回 error，但无法解析 message');
    }
    return unwrapJsonRpcResult(v.result);
  }

  // 某些实现可能只包了 { result: ... } 而没有 jsonrpc 字段
  if (!hasJsonRpc && !hasId && hasResult && !hasError) {
    return unwrapJsonRpcResult(v.result);
  }

  return v;
}

/**
 * 调用 MCP 工具
 * @param name MCP 工具名称
 * @param args 工具参数
 * @param toolCallId 工具调用 ID
 * @param uat 用户访问令牌
 * @param brand 当前账号品牌，用于选择 MCP 端点域名
 */
export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
  toolCallId: string,
  uat: string,
  brand?: LarkBrand,
): Promise<unknown> {
  const endpoint = getMcpEndpoint(brand);
  const auth = buildAuthHeader();

  const body = {
    jsonrpc: '2.0',
    id: toolCallId,
    method: 'tools/call',
    params: { name, arguments: args },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lark-MCP-UAT': uat,
    'X-Lark-MCP-Allowed-Tools': name,
  };
  if (auth) headers.authorization = auth;

  const res = await feishuFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status} ${res.statusText}: ${text.slice(0, 4000)}`);
  }

  let data: { jsonrpc: string; id: unknown; result?: unknown; error?: { code: number; message: string } };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`MCP 返回非 JSON：${text.slice(0, 4000)}`);
  }

  if (data.error) {
    throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
  }

  return unwrapJsonRpcResult(data.result);
}
