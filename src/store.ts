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
    history = new Map(
      Object.entries(raw).map(([chatId, msgs]) => [
        chatId,
        msgs[0]?.role === 'system' ? msgs.slice(1) : msgs,
      ])
    );
  } catch {
    history = new Map();
  }
}

function save(): void {
  const obj = Object.fromEntries(history);
  fs.writeFileSync(FILE, JSON.stringify(obj), 'utf8');
}

load();

function buildSystemMessage(): ChatMessage {
  const now = new Date();
  const dataFormatada = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const horaFormatada = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return {
    role: 'system',
    content: `${config.systemPrompt}\n\nData e hora atuais: ${dataFormatada}, ${horaFormatada}. Use essa informacao para qualquer pergunta sobre data, dia da semana ou hora - nunca responda com uma data baseada no que voce "lembra" do treinamento.`,
  };
}

export function getMessages(chatId: string): ChatMessage[] {
  const pairs = history.get(chatId) ?? [];
  return [buildSystemMessage(), ...pairs];
}

export function appendExchange(chatId: string, userText: string, assistantText: string): void {
  const pairs = history.get(chatId) ?? [];
  pairs.push({ role: 'user', content: userText });
  pairs.push({ role: 'assistant', content: assistantText });
  history.set(chatId, pairs.slice(-config.maxHistory));
  save();
}
