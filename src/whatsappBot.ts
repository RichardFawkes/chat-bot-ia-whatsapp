import makeWASocket, { useMultiFileAuthState, DisconnectReason, type WAMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import qrcodePng from 'qrcode';
import path from 'path';
import pino from 'pino';

import { config } from './config';
import { logger } from './logger';
import * as store from './store';
import * as rateLimiter from './rateLimiter';
import * as llm from './llmClient';

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcodeTerminal.generate(qr, { small: true });
      qrcodePng
        .toFile(path.join(__dirname, '..', 'qr.png'), qr)
        .catch((err: Error) => logger.error(err, 'falha ao salvar qr.png'));
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ shouldReconnect }, 'conexao caiu');
      if (shouldReconnect) start();
    } else if (connection === 'open') {
      logger.info('bot conectado ao WhatsApp');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0] as WAMessage | undefined;
    if (!msg?.message || !msg.key.remoteJid) return;

    const chatId = msg.key.remoteJid;
    const myNumber = `${sock.user?.id.split(':')[0]}@s.whatsapp.net`;
    const isSelfChat = chatId === myNumber || msg.key.remoteJidAlt === myNumber;
    const isGroup = chatId.endsWith('@g.us');
    const isBroadcast = chatId.endsWith('@broadcast');

    if (isGroup || isBroadcast) return;
    if (msg.key.fromMe && !isSelfChat) return;
    if (config.onlySelfChat && !isSelfChat) return;

    const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? '';
    if (!text) return;

    if (!rateLimiter.allow(chatId)) {
      logger.warn({ chatId }, 'rate limit atingido');
      await sock.sendMessage(chatId, {
        text: 'Calma ai, muitas mensagens em pouco tempo. Tenta de novo em 1 minuto.',
      });
      return;
    }

    logger.info({ chatId, text }, 'mensagem recebida');

    try {
      const history = store.getMessages(chatId);
      const reply = await llm.chat([...history, { role: 'user', content: text }]);
      store.appendExchange(chatId, text, reply.text);

      let imageBuffer: Buffer | null = null;
      for (const candidateUrl of reply.imageUrls) {
        imageBuffer = await downloadImage(candidateUrl);
        if (imageBuffer) break;
        logger.warn({ candidateUrl }, 'falha ao baixar imagem, tentando proxima');
      }

      if (imageBuffer) {
        await sock.sendMessage(chatId, { image: imageBuffer, caption: reply.text });
      } else if (reply.imageUrls.length > 0) {
        await sock.sendMessage(chatId, { text: `${reply.text}\n${reply.imageUrls[0]}` });
      } else {
        await sock.sendMessage(chatId, { text: reply.text });
      }
    } catch (err) {
      logger.error(err, 'erro ao consultar o LLM');
      await sock.sendMessage(chatId, { text: 'Erro ao consultar o modelo. Tenta de novo em instantes.' });
    }
  });
}
