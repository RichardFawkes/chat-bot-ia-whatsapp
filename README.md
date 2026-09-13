# whatsapp-bot

Bot de WhatsApp que responde mensagens usando um LLM — local (via [Ollama](https://ollama.com)) ou em nuvem (Claude / GPT). Conecta na sua conta pessoal do WhatsApp via QR code (Baileys, sem API oficial da Meta).

## Como funciona

```
WhatsApp (celular) <--QR / multi-device--> Baileys <--> whatsappBot.ts <--> llmClient.ts <--> Ollama local / Anthropic / OpenAI
                                                            |
                                                       store.ts (historico por chat, em disco)
                                                            |
                                                     rateLimiter.ts (limite de mensagens por pessoa)
```

- Cada chat (número ou "Mensagens para você mesmo") mantém seu próprio histórico de conversa, persistido em `data/history.json`.
- Mensagens de grupo são sempre ignoradas.
- Chamadas ao Ollama são serializadas (o servidor local só mantém 1 modelo carregado por vez); chamadas a APIs de nuvem não têm essa limitação.

## Pré-requisitos

- [Node.js](https://nodejs.org) 20+
- Um número de WhatsApp disponível para escanear o QR (pode ser seu número pessoal — ele continua funcionando normalmente no app)
- Se for usar modelo local: [Ollama](https://ollama.com) instalado e rodando (`ollama serve`), com um modelo já baixado (ex: `ollama pull qwen3:14b-q4_K_M`)
- Se for usar Claude ou GPT: uma API key da [Anthropic](https://console.anthropic.com) ou da [OpenAI](https://platform.openai.com)

## Instalação

```bash
git clone https://github.com/RichardFawkes/chat-bot-ia-whatsapp.git
cd chat-bot-ia-whatsapp
npm install
cp .env.example .env
```

Edite o `.env` (veja a seção [Configuração](#configuração) abaixo) e depois:

```bash
npm run build
npm start
```

Na primeira execução, um QR code aparece no terminal **e** é salvo como `qr.png` na raiz do projeto. Escaneie em:

**WhatsApp (celular) → Configurações → Aparelhos conectados → Conectar um aparelho**

Depois de escanear uma vez, a sessão fica salva em `auth/` — não precisa escanear de novo, mesmo reiniciando o bot.

## Conectando o WhatsApp facilmente

| Passo | O que fazer |
|---|---|
| 1 | Rode `npm start` (ou veja [Rodando permanente com PM2](#rodando-permanente-com-pm2) abaixo) |
| 2 | Abra `qr.png` gerado na raiz do projeto, ou olhe o QR desenhado no próprio terminal |
| 3 | No celular: WhatsApp → Configurações (⚙) → Aparelhos conectados → Conectar um aparelho |
| 4 | Escaneie. O terminal deve mostrar `bot conectado ao WhatsApp` |
| 5 | Mande uma mensagem de teste (padrão: qualquer conversa privada, exceto grupos) |

Se o QR expirar antes de escanear, o bot gera um novo automaticamente — só reabra `qr.png`.

Pra trocar de número (reconectar do zero), pare o bot e apague a pasta `auth/`:

```bash
rm -rf auth   # Linux/macOS
Remove-Item auth -Recurse -Force   # Windows PowerShell
```

## Configuração

Todas as opções ficam em `.env` (copie de `.env.example`):

| Variável | Descrição | Padrão |
|---|---|---|
| `LLM_PROVIDER` | `ollama`, `anthropic` ou `openai` | `ollama` |
| `SYSTEM_PROMPT` | Personalidade/instruções do bot | — |
| `ONLY_SELF_CHAT` | `true` = só responde no seu próprio chat ("Mensagens para você mesmo"); `false` = responde qualquer DM | `false` |
| `MAX_HISTORY` | Nº de mensagens de contexto mantidas por chat | `20` |
| `RATE_LIMIT_MAX` | Máx. de mensagens por pessoa dentro da janela abaixo | `8` |
| `RATE_LIMIT_WINDOW_MS` | Janela do rate limit, em ms | `60000` |

### Usando Ollama (local, gratuito)

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434/api/chat
OLLAMA_MODEL=qwen3:14b-q4_K_M
```

### Usando Claude (Anthropic)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

### Usando GPT (OpenAI)

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

> Nomes de modelo de APIs de nuvem mudam com frequência — confira o modelo atual na documentação da [Anthropic](https://docs.anthropic.com) ou da [OpenAI](https://platform.openai.com/docs/models) antes de configurar.

Trocar de provedor é só mudar `LLM_PROVIDER` e reiniciar — nenhum outro código muda.

## Rodando permanente com PM2

Pra manter o bot no ar (reiniciando sozinho se cair, e junto com o boot do sistema):

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name whatsapp-bot
pm2 save
pm2 startup   # segue as instruções impressas pra habilitar autostart no boot
```

Comandos do dia a dia:

```bash
pm2 status                  # ver se está rodando
pm2 logs whatsapp-bot       # logs em tempo real
pm2 restart whatsapp-bot    # aplicar mudanças de codigo/.env
pm2 stop whatsapp-bot
```

## Desenvolvimento

```bash
npm run dev     # tsc --watch, recompila a cada mudança
npm run build   # build de producao (dist/)
```

## Estrutura

```
src/
├── index.ts        # entrypoint
├── config.ts        # le e valida o .env
├── whatsappBot.ts   # conexao Baileys + roteamento de mensagens
├── llmClient.ts      # ollama / anthropic / openai por tras de uma interface unica
├── store.ts          # historico de conversa persistido em disco
├── rateLimiter.ts     # limite de mensagens por chat
├── logger.ts          # logs estruturados (console + data/bot.log)
└── types.ts           # tipos compartilhados
```

## Segurança e limitações

- Este bot usa [Baileys](https://github.com/WhiskeySockets/Baileys), uma biblioteca **não oficial** que emula o WhatsApp Web. Não é a API oficial da Meta — uso excessivo/automatizado pode levar a bloqueio do número. Use com moderação, especialmente com `ONLY_SELF_CHAT=false`.
- A pasta `auth/` contém as chaves de sessão do seu WhatsApp. Nunca a commite ou compartilhe (já está no `.gitignore`).
- `.env` contém API keys quando usando Claude/GPT — também já ignorado pelo git.
