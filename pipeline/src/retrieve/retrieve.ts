import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

/**
 * Récupération et extraction du contenu des sources (ARCHITECTURE §5.2).
 * fetch natif + Readability ; le texte extrait est archivé par l'appelant
 * dans sources-cache/. Page non récupérable → null, la source est écartée
 * (jamais de source non archivée).
 */

export interface RetrievedPage {
  url: string;
  title: string;
  text: string;
}

export type Retriever = (url: string) => Promise<RetrievedPage | null>;

const FETCH_TIMEOUT_MS = 20_000;
const MAX_TEXT_LENGTH = 40_000;

export const retrievePage: Retriever = async (url) => {
  let html: string;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; criticalthinker-sourcer/0.1)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return null;
    html = await response.text();
  } catch {
    return null;
  }

  try {
    const virtualConsole = new VirtualConsole(); // étouffe les erreurs CSS/JS des pages réelles
    const dom = new JSDOM(html, { url, virtualConsole });
    const article = new Readability(dom.window.document).parse();
    if (article?.textContent == null) return null;
    const text = article.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    if (text.length < 200) return null; // trop court pour être une source exploitable
    return { url, title: article.title ?? url, text };
  } catch {
    return null;
  }
};
