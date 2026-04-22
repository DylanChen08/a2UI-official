import OpenAI from 'openai';

/**
 * 官方 OpenAI API（模型对话 `/api/chat` 默认使用）。
 * 密钥与可选代理见 `OPENAI_*`；兼容旧版 `LLM_*`（如 DashScope 兼容网关）。
 */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.cn/v1';

/** 未设置 `OPENAI_BASE_URL` 且仅配置了 `LLM_*` 时的兼容网关默认（阿里云等） */
export const DEFAULT_LLM_COMPAT_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export interface LlmClientConfig {
  baseURL: string;
  apiKey: string;
}

type LlmProvider = 'moonshot' | 'openai' | 'llm_compat' | '';

function getLlmProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === 'moonshot' || p === 'openai' || p === 'llm_compat') return p;
  return '';
}

/**
 * 读取 LLM 配置（不创建客户端）。
 * 优先 `KIMI_API_KEY` + `KIMI_BASE_URL`；其次 `OPENAI_API_KEY` + `OPENAI_BASE_URL`；
 * 最后 `LLM_API_KEY` + `LLM_BASE_URL`。
 */
export function getLlmConfig(): LlmClientConfig | null {
  const provider = getLlmProvider();
  const kimiKey = process.env.KIMI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const legacyKey = process.env.LLM_API_KEY?.trim();

  if (provider === 'moonshot') {
    if (!kimiKey) return null;
    return {
      baseURL: normalizeBaseUrl(process.env.KIMI_BASE_URL?.trim() || DEFAULT_KIMI_BASE_URL),
      apiKey: kimiKey
    };
  }
  if (provider === 'openai') {
    if (!openaiKey) return null;
    return {
      baseURL: normalizeBaseUrl(process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL),
      apiKey: openaiKey
    };
  }
  if (provider === 'llm_compat') {
    if (!legacyKey) return null;
    return {
      baseURL: normalizeBaseUrl(
        process.env.LLM_BASE_URL?.trim() || DEFAULT_LLM_COMPAT_BASE_URL
      ),
      apiKey: legacyKey
    };
  }

  const apiKey = kimiKey || openaiKey || legacyKey;
  if (!apiKey) return null;

  let baseURL: string;
  if (kimiKey) {
    baseURL = normalizeBaseUrl(process.env.KIMI_BASE_URL?.trim() || DEFAULT_KIMI_BASE_URL);
  } else if (openaiKey) {
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
  const provider = getLlmProvider();
  if (provider === 'moonshot') {
    return process.env.KIMI_MODEL?.trim() || 'qwen3.5-plus';
  }
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL?.trim() || 'qwen3.5-plus';
  }
  if (provider === 'llm_compat') {
    return process.env.LLM_MODEL?.trim() || 'qwen3.5-plus';
  }
  return process.env.KIMI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'qwen3.5-plus';
}

/**
 * 含用户图片等多模态请求时优先使用（`OPENAI_VISION_MODEL`）。
 * 未设置时回退到 `getDefaultChatModel()`，避免破坏仅文本场景。
 */
export function getVisionChatModel(): string {
  const v = process.env.OPENAI_VISION_MODEL?.trim();
  return v || getDefaultChatModel();
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
