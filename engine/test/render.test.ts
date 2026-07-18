import { describe, expect, it } from 'vitest';
import { escapeHtml, renderParagraphs, renderRichText } from '../src/render.js';

describe('renderRichText', () => {
  it('transforme [[texte|ID]] en ancre hash', () => {
    const html = renderRichText('Voir [[le concept|PIL_A_N01]] pour comprendre.');
    expect(html).toBe(
      'Voir <a class="ct-keyword" href="#PIL_A_N01" data-node="PIL_A_N01">le concept</a> pour comprendre.',
    );
  });

  it('échappe le HTML avant de poser les liens', () => {
    const html = renderRichText('<script>alert(1)</script> et [[x|PIL_A_N01]]');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="#PIL_A_N01"');
  });

  it('laisse intact un texte sans lien', () => {
    expect(renderRichText('Un texte simple.')).toBe('Un texte simple.');
  });
});

describe('renderParagraphs', () => {
  it('découpe sur les lignes vides', () => {
    const html = renderParagraphs('Premier paragraphe.\n\nSecond avec [[lien|PIL_B_N01]].');
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html).toContain('data-node="PIL_B_N01"');
  });
});

describe('escapeHtml', () => {
  it('échappe les caractères sensibles', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
