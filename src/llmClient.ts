import { config } from './config';
import { TOOL_DEFINITION, toolsEnabled, executeTool } from './tools';
import type { ChatMessage, LlmReply } from './types';

const OLLAMA_TOOLS = [{ type: 'function', function: TOOL_DEFINITION }];
const OPENAI_TOOLS = [{ type: 'function', function: TOOL_DEFINITION }];
const ANTHROPIC_TOOLS = [
  { name: TOOL_DEFINITION.name, description: TOOL_DEFINITION.description, input_schema: TOOL_DEFINITION.parameters },
];

interface OllamaToolCall {
  function: { name: string; arguments: { query: string; tipo: 'texto' | 'imagem' } };
}
interface OllamaChatResponse {
  message: { content: string; tool_calls?: OllamaToolCall[] };
}

async function callOllama(messages: ChatMessage[]): Promise<LlmReply> {
  const baseBody = { model: config.ollamaModel, think: false, stream: false };
  const tools = toolsEnabled() ? OLLAMA_TOOLS : undefined;

  const res1 = await fetch(config.ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...baseBody, messages, tools }),
  });
  if (!res1.ok) throw new Error(`Ollama respondeu ${res1.status}: ${await res1.text()}`);
  const data1 = (await res1.json()) as OllamaChatResponse;

  const calls = data1.message.tool_calls ?? [];
  if (calls.length === 0) return { text: data1.message.content, imageUrls: [] };

  const imageUrls: string[] = [];
  const toolMessages: Record<string, unknown>[] = [];
  for (const call of calls) {
    const result = await executeTool(call.function.name, call.function.arguments);
    imageUrls.push(...result.imageUrls);
    toolMessages.push({ role: 'tool', content: result.text });
  }

  const followup = [...messages, { role: 'assistant', content: '', tool_calls: calls }, ...toolMessages];
  const res2 = await fetch(config.ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...baseBody, messages: followup }),
  });
  if (!res2.ok) throw new Error(`Ollama respondeu ${res2.status}: ${await res2.text()}`);
  const data2 = (await res2.json()) as OllamaChatResponse;

  return { text: data2.message.content, imageUrls };
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: { query: string; tipo: 'texto' | 'imagem' };
}
interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

async function callAnthropic(messages: ChatMessage[]): Promise<LlmReply> {
  const [system, ...rest] = messages;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.anthropicApiKey,
    'anthropic-version': '2023-06-01',
  };
  const baseBody = {
    model: config.anthropicModel,
    system: system?.content ?? '',
    max_tokens: 1024,
    tools: toolsEnabled() ? ANTHROPIC_TOOLS : undefined,
  };
  const history = rest.map((m) => ({ role: m.role, content: m.content }));

  const res1 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...baseBody, messages: history }),
  });
  if (!res1.ok) throw new Error(`Anthropic respondeu ${res1.status}: ${await res1.text()}`);
  const data1 = (await res1.json()) as AnthropicResponse;

  const toolUses = data1.content.filter((c) => c.type === 'tool_use');
  if (toolUses.length === 0) {
    return { text: data1.content.find((c) => c.type === 'text')?.text ?? '', imageUrls: [] };
  }

  const imageUrls: string[] = [];
  const toolResults = [];
  for (const tu of toolUses) {
    const result = await executeTool(tu.name ?? '', tu.input ?? { query: '', tipo: 'texto' });
    imageUrls.push(...result.imageUrls);
    toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result.text });
  }

  const followup = [...history, { role: 'assistant', content: data1.content }, { role: 'user', content: toolResults }];
  const res2 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...baseBody, messages: followup }),
  });
  if (!res2.ok) throw new Error(`Anthropic respondeu ${res2.status}: ${await res2.text()}`);
  const data2 = (await res2.json()) as AnthropicResponse;

  return { text: data2.content.find((c) => c.type === 'text')?.text ?? '', imageUrls };
}

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}
interface OpenAiMessage {
  content: string | null;
  tool_calls?: OpenAiToolCall[];
}
interface OpenAiResponse {
  choices: { message: OpenAiMessage }[];
}

async function callOpenAi(messages: ChatMessage[]): Promise<LlmReply> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` };
  const tools = toolsEnabled() ? OPENAI_TOOLS : undefined;

  const res1 = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.openaiModel, messages, tools }),
  });
  if (!res1.ok) throw new Error(`OpenAI respondeu ${res1.status}: ${await res1.text()}`);
  const data1 = (await res1.json()) as OpenAiResponse;
  const msg1 = data1.choices[0]?.message;

  if (!msg1?.tool_calls?.length) return { text: msg1?.content ?? '', imageUrls: [] };

  const imageUrls: string[] = [];
  const toolMessages: Record<string, unknown>[] = [];
  for (const call of msg1.tool_calls) {
    const args = JSON.parse(call.function.arguments) as { query: string; tipo: 'texto' | 'imagem' };
    const result = await executeTool(call.function.name, args);
    imageUrls.push(...result.imageUrls);
    toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result.text });
  }

  const followup = [...messages, msg1, ...toolMessages];
  const res2 = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.openaiModel, messages: followup }),
  });
  if (!res2.ok) throw new Error(`OpenAI respondeu ${res2.status}: ${await res2.text()}`);
  const data2 = (await res2.json()) as OpenAiResponse;

  return { text: data2.choices[0]?.message.content ?? '', imageUrls };
}

async function dispatch(messages: ChatMessage[]): Promise<LlmReply> {
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

export function chat(messages: ChatMessage[]): Promise<LlmReply> {
  if (config.llmProvider !== 'ollama') return dispatch(messages);

  const run = ollamaQueue.then(() => dispatch(messages));
  ollamaQueue = run.catch(() => undefined);
  return run;
}
