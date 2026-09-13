export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LlmProvider = 'ollama' | 'anthropic' | 'openai';

export interface BotConfig {
  llmProvider: LlmProvider;
  systemPrompt: string;
  onlySelfChat: boolean;
  maxHistory: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  ollamaUrl: string;
  ollamaModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  searxngUrl: string;
}

export interface LlmReply {
  text: string;
  imageUrls: string[];
}
