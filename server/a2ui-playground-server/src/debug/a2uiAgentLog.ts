/**
 * A2UI Agent 链路调试日志。
 *
 * - `A2UI_AGENT_DEBUG=1`：详细日志（LLM 耗时、原始输出长度、每条事件类型等）
 * - 未设置时：仍输出每条请求的摘要（开始 / 结束），便于 Playground 联调
 * - `A2UI_AGENT_LOG_SYSTEM_PROMPT=0`：关闭将完整 system prompt 写入日志文件（默认写入）
 * - `A2UI_AGENT_SYSTEM_PROMPT_LOG_PATH`：日志文件路径（可选；默认 server 包下 `logs/a2ui-agent-system-prompt.log`）
 * - `A2UI_AGENT_LOG_LLM_RAW=0`：关闭将 LLM assistant 完整原文写入日志文件（默认写入，便于对照缓冲区/SSE 是否与模型一致）
 * - `A2UI_AGENT_LLM_RAW_LOG_PATH`：LLM 原文日志路径（可选；默认 `logs/a2ui-agent-llm-raw.log`）
 */

import fs from 'fs';
import path from 'path';

function resolveSystemPromptLogFilePath(): string {
  const env = process.env.A2UI_AGENT_SYSTEM_PROMPT_LOG_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  return path.resolve(__dirname, '../../logs/a2ui-agent-system-prompt.log');
}

function resolveLlmRawLogFilePath(): string {
  const env = process.env.A2UI_AGENT_LLM_RAW_LOG_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  return path.resolve(__dirname, '../../logs/a2ui-agent-llm-raw.log');
}

function shouldLogLlmRawToFile(): boolean {
  const v = process.env.A2UI_AGENT_LOG_LLM_RAW?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

/** 将 OpenAI 返回的 assistant 原文（解析前）追加写入日志，用于对照客户端缓冲/SSE 是否与模型一致 */
export function logA2uiLlmAssistantRaw(
  raw: string,
  meta: { model: string; threadId: string; runId: string; ms: number }
): void {
  if (!shouldLogLlmRawToFile()) return;
  const filePath = resolveLlmRawLogFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const header =
      `\n${'='.repeat(72)}\n` +
      `${new Date().toISOString()}  LLM assistant content (full, pre-parse)\n` +
      `model=${meta.model}  threadId=${meta.threadId}  runId=${meta.runId}  ms=${meta.ms}  chars=${raw.length}\n` +
      `${'='.repeat(72)}\n`;
    fs.appendFileSync(filePath, header + raw + '\n', 'utf8');
  } catch (e) {
    console.error('[a2ui-agent] failed to write LLM raw log file:', filePath, e);
  }
}

export function isA2uiAgentDebugVerbose(): boolean {
  const v = process.env.A2UI_AGENT_DEBUG?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** 详细调试（需 A2UI_AGENT_DEBUG=1） */
export function a2uiAgentDbg(...args: unknown[]): void {
  if (!isA2uiAgentDebugVerbose()) return;
  console.log('[a2ui-agent]', ...args);
}

/** 每条请求摘要（始终输出，便于定位「无返回」） */
export function a2uiAgentInfo(...args: unknown[]): void {
  console.log('[a2ui-agent]', ...args);
}

function shouldLogA2uiSystemPromptFull(): boolean {
  const v = process.env.A2UI_AGENT_LOG_SYSTEM_PROMPT?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

/** 将组装好的完整 system prompt 追加写入日志文件（不写 console；设 A2UI_AGENT_LOG_SYSTEM_PROMPT=0 关闭） */
export function logA2uiSystemPromptFull(systemPrompt: string): void {
  if (!shouldLogA2uiSystemPromptFull()) return;
  const filePath = resolveSystemPromptLogFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const block = `\n${'='.repeat(72)}\n${new Date().toISOString()}  A2UI Agent system prompt (full)\n${'='.repeat(72)}\n${systemPrompt}\n`;
    fs.appendFileSync(filePath, block, 'utf8');
  } catch (e) {
    console.error('[a2ui-agent] failed to write system prompt log file:', filePath, e);
  }
}
