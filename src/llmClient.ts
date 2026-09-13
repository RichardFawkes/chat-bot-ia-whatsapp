import { config } from './config';
import type { ChatMessage } from './types';

interface OllamaChatResponse {
  message: { content: string };
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
}

interface OpenAiResponse {
  choices: { message: { content: string } }[];
}

async function callOllama(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(config.ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.ollamaModel, messages, think: false, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaChatResponse;
  return data.message.content;
}

async function callAnthropic(messages: ChatMessage[]): Promise<string> {
  const [system, ...rest] = messages;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      system: system?.content ?? '',
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic respondeu ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as AnthropicResponse;
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

async function callOpenAi(messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model: config.openaiModel, messages }),
  });
  if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OpenAiResponse;
  return data.choices[0]?.message.content ?? '';
}

async function dispatch(messages: ChatMessage[]): Promise<string> {
  switch (config.llmProvider) {
    case 'ollama':
      return callOllama(messages);
    case 'anthropic':
      return callAnthropic(messages);
    case 'openai':
      return callOpenAi(messages);
  }
}

// Chamadas locais (Ollama) sao serializadas: o servidor so mantem 1 modelo
// carregado por vez, entao rodar em paralelo so causaria fila do lado dele.
// APIs de nuvem nao tem essa restricao e vao direto.
let ollamaQueue: Promise<unknown> = Promise.resolve();

export function chat(messages: ChatMessage[]): Promise<string> {
  if (config.llmProvider !== 'ollama') return dispatch(messages);

  const run = ollamaQueue.then(() => dispatch(messages));
  ollamaQueue = run.catch(() => undefined);
  return run;
}
