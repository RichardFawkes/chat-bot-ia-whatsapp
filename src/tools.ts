import { config } from './config';

export interface ToolResult {
  text: string;
  imageUrls: string[];
}

export const TOOL_DEFINITION = {
  name: 'buscar_na_internet',
  description:
    'Busca informacoes atuais ou imagens na internet. Use quando o usuario pedir uma foto/imagem de algo, ' +
    'ou perguntar sobre algo atual/especifico que voce nao tem certeza.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'o que buscar' },
      tipo: {
        type: 'string',
        enum: ['texto', 'imagem'],
        description: '"texto" para pesquisa geral, "imagem" quando o usuario pede uma foto/imagem especifica',
      },
    },
    required: ['query', 'tipo'],
  },
} as const;

interface SearxngResult {
  title: string;
  content?: string;
  img_src?: string;
  engine?: string;
}
interface SearxngResponse {
  results: SearxngResult[];
}

// bancos de imagem generico (unsplash, pexels) combinam por palavra-chave solta e
// costumam trazer fotos erradas pra nomes de pessoas/marcas especificas. Preferimos
// engines que indexam a imagem real (wikipedia, noticias) e deixamos esses por ultimo.
const STOCK_PHOTO_ENGINES = new Set(['unsplash', 'pexels', 'pixabay']);

async function buscarNaInternet(query: string, tipo: 'texto' | 'imagem'): Promise<ToolResult> {
  const url = new URL('/search', config.searxngUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  if (tipo === 'imagem') url.searchParams.set('categories', 'images');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SearXNG respondeu ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as SearxngResponse;

  if (tipo === 'imagem') {
    const ranked = [...data.results].sort((a, b) => {
      const aStock = STOCK_PHOTO_ENGINES.has(a.engine ?? '') ? 1 : 0;
      const bStock = STOCK_PHOTO_ENGINES.has(b.engine ?? '') ? 1 : 0;
      return aStock - bStock;
    });
    const imageUrls = ranked
      .map((r) => r.img_src)
      .filter((src): src is string => Boolean(src))
      .slice(0, 4);
    const text = imageUrls.length
      ? `Encontrei uma imagem para "${query}" e ela ja foi enviada para o usuario automaticamente. Responda so com um comentario curto, sem incluir link ou placeholder de imagem.`
      : `Nao encontrei nenhuma imagem para "${query}". Avise o usuario.`;
    return { text, imageUrls };
  }

  const text = data.results
    .slice(0, 5)
    .map((r) => `${r.title}: ${r.content ?? ''}`)
    .join('\n');
  return { text, imageUrls: [] };
}

export function toolsEnabled(): boolean {
  return config.searxngUrl.length > 0;
}

export async function executeTool(name: string, args: { query: string; tipo: 'texto' | 'imagem' }): Promise<ToolResult> {
  if (name !== TOOL_DEFINITION.name) throw new Error(`ferramenta desconhecida: ${name}`);
  return buscarNaInternet(args.query, args.tipo);
}

const IMAGE_REQUEST_REGEX = /\b(foto|fotos|imagem|imagens|figura|print)\b/i;

export function looksLikeImageRequest(text: string): boolean {
  return IMAGE_REQUEST_REGEX.test(text);
}

export async function forceImageSearch(userText: string): Promise<ToolResult> {
  return buscarNaInternet(userText, 'imagem');
}
