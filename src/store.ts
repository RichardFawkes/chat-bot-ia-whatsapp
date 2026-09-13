import fs from 'fs';
import path from 'path';
import { config } from './config';
import type { ChatMessage } from './types';

const FILE = path.join(__dirname, '..', 'data', 'history.json');

let history = new Map<string, ChatMessage[]>();

function load(): void {
  if (!fs.existsSync(FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, ChatMessage[]>;
    history = new Map(Object.entries(raw));
  } catch {
    history = new Map();
  }
}

function save(): void {
  const obj = Object.fromEntries(history);
  fs.writeFileSync(FILE, JSON.stringify(obj), 'utf8');
}

load();

export function getMessages(chatId: string): ChatMessage[] {
  return history.get(chatId) ?? [{ role: 'system', content: config.systemPrompt }];
}

export function appendExchange(chatId: string, userText: string, assistantText: string): void {
  const [system, ...rest] = getMessages(chatId);
  rest.push({ role: 'user', content: userText });
  rest.push({ role: 'assistant', content: assistantText });
  history.set(chatId, [system as ChatMessage, ...rest.slice(-config.maxHistory)]);
  save();
}
