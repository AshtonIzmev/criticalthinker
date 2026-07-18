import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArticleStore } from '../src/store.js';

function makeStore(): ArticleStore {
  return new ArticleStore(mkdtempSync(join(tmpdir(), 'ct-store-')));
}

describe('ArticleStore', () => {
  it('initialise un article avec son seed template', () => {
    const store = makeStore();
    store.init('mon-sujet');
    expect(() => store.readSeed('mon-sujet')).toThrow(/pas encore été rédigé/);
    writeFileSync(store.seedPath('mon-sujet'), 'Le vrai sujet de l’article.');
    expect(store.readSeed('mon-sujet')).toBe('Le vrai sujet de l’article.');
  });

  it('refuse de recréer un article existant', () => {
    const store = makeStore();
    store.init('doublon');
    expect(() => store.init('doublon')).toThrow(/existe déjà/);
  });

  it('gère les versions : v1 puis v2 par copie', () => {
    const store = makeStore();
    store.init('versionne');
    expect(store.latestVersion('versionne')).toBeNull();

    const v1 = store.createVersion('versionne');
    expect(v1.version).toBe(1);
    const cacheRef = store.writeSourceCache('versionne', 'SRC_01', 'contenu archivé');
    expect(store.sourceCacheExists('versionne', cacheRef)).toBe(true);

    const v2 = store.createVersion('versionne');
    expect(v2.version).toBe(2);
    // la copie emporte le cache de v1
    expect(store.sourceCacheExists('versionne', cacheRef, 2)).toBe(true);
    expect(store.latestVersion('versionne')).toBe(2);
  });

  it('écrit et relit les rapports', () => {
    const store = makeStore();
    store.init('rapporte');
    store.createVersion('rapporte');
    store.writeReport('rapporte', 'sourcing', { pending: [], unsourced: [] });
    const report = store.readReport<{ pending: unknown[] }>('rapporte', 'sourcing');
    expect(report.pending).toEqual([]);
  });
});
