import { config as loadEnv } from 'dotenv';
import type { BotConfig, LlmProvider } from './types';

loadEnv({ quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

function requireEnvNumber(name: string): number {
  const value = Number(requireEnv(name));
  if (Number.isNaN(value)) throw new Error(`Variavel de ambiente ${name} deve ser numerica`);
  return value;
}

function parseProvider(): LlmProvider {
  const raw = process.env.LLM_PROVIDER ?? 'ollama';
  if (raw !== 'ollama' && raw !== 'anthropic' && raw !== 'openai') {
    throw new Error(`LLM_PROVIDER invalido: "${raw}". Use ollama, anthropic ou openai.`);
  }
  return raw;
}

const llmProvider = parseProvider();

export const config: BotConfig = {
  llmProvider,
  systemPrompt: requireEnv('SYSTEM_PROMPT'),
  onlySelfChat: process.env.ONLY_SELF_CHAT === 'true',
  maxHistory: requireEnvNumber('MAX_HISTORY'),
  rateLimitMax: requireEnvNumber('RATE_LIMIT_MAX'),
  rateLimitWindowMs: requireEnvNumber('RATE_LIMIT_WINDOW_MS'),

  ollamaUrl: llmProvider === 'ollama' ? requireEnv('OLLAMA_URL') : (process.env.OLLAMA_URL ?? ''),
  ollamaModel: llmProvider === 'ollama' ? requireEnv('OLLAMA_MODEL') : (process.env.OLLAMA_MODEL ?? ''),

  anthropicApiKey: llmProvider === 'anthropic' ? requireEnv('ANTHROPIC_API_KEY') : (process.env.ANTHROPIC_API_KEY ?? ''),
  anthropicModel: llmProvider === 'anthropic' ? requireEnv('ANTHROPIC_MODEL') : (process.env.ANTHROPIC_MODEL ?? ''),

  openaiApiKey: llmProvider === 'openai' ? requireEnv('OPENAI_API_KEY') : (process.env.OPENAI_API_KEY ?? ''),
  openaiModel: llmProvider === 'openai' ? requireEnv('OPENAI_MODEL') : (process.env.OPENAI_MODEL ?? ''),

  searxngUrl: process.env.SEARXNG_URL ?? '',
};
