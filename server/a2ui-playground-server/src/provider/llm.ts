import OpenAI from 'openai';

/**
 * 官方 OpenAI API（模型对话 `/api/chat` 默认使用）。
 * 密钥与可选代理见 `OPENAI_*`；兼容旧版 `LLM_*`（如 DashScope 兼容网关）。
 */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** 未设置 `OPENAI_BASE_URL` 且仅配置了 `LLM_*` 时的兼容网关默认（阿里云等） */
export const DEFAULT_LLM_COMPAT_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export interface LlmClientConfig {
  baseURL: string;
  apiKey: string;
}

/**
 * 读取 LLM 配置（不创建客户端）。
 * 优先 `OPENAI_API_KEY` + `OPENAI_BASE_URL`（默认官方 v1）；否则 `LLM_API_KEY` + `LLM_BASE_URL`。
 */
export function getLlmConfig(): LlmClientConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const legacyKey = process.env.LLM_API_KEY?.trim();
  const apiKey = openaiKey || legacyKey;
  if (!apiKey) return null;

  let baseURL: string;
  if (openaiKey) {
    baseURL = normalizeBaseUrl(
      process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL
    );
  } else {
    baseURL = normalizeBaseUrl(
      process.env.LLM_BASE_URL?.trim() || DEFAULT_LLM_COMPAT_BASE_URL
    );
  }
  return { baseURL, apiKey };
}

/** `POST /api/chat` 默认模型（可被请求体 `model` 或 `OPENAI_MODEL` 覆盖）；DashScope 兼容网关常用通义系列 */
export function getDefaultChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'qwen3.5-plus';
}

let cachedClient: OpenAI | null | undefined;

/**
 * OpenAI 兼容客户端（`baseURL` + `apiKey`）。未配置任何密钥时返回 `null`。
 */
export function getOpenAiCompatibleClient(): OpenAI | null {
  if (cachedClient !== undefined) return cachedClient;
  const cfg = getLlmConfig();
  if (!cfg) {
    cachedClient = null;
    return null;
  }
  cachedClient = new OpenAI({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey
  });
  return cachedClient;
}

/** 单测或热重载前可调用，避免沿用上一次的 client */
export function resetLlmClientCache(): void {
  cachedClient = undefined;
}
