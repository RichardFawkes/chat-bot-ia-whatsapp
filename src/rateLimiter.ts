import { config } from './config';

const hits = new Map<string, number[]>();

export function allow(chatId: string): boolean {
  const now = Date.now();
  const windowStart = now - config.rateLimitWindowMs;
  const timestamps = (hits.get(chatId) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= config.rateLimitMax) {
    hits.set(chatId, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(chatId, timestamps);
  return true;
}
