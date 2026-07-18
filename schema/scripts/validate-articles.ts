import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { validateGraphArticle } from '../src/index.js';

/**
 * Valide tous les articles/<slug>/vN/graph.json du repo (CI, ARCHITECTURE §9).
 * La CI valide des artefacts — elle ne fait jamais d'appels LLM.
 * Sortie non nulle si au moins une erreur.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const articlesDir = join(repoRoot, 'articles');

function findGraphFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findGraphFiles(full));
    } else if (entry === 'graph.json') {
      results.push(full);
    }
  }
  return results;
}

const graphFiles = findGraphFiles(articlesDir);
if (graphFiles.length === 0) {
  console.log('Aucun graph.json dans articles/ — rien à valider.');
  process.exit(0);
}

let hasErrors = false;
for (const file of graphFiles) {
  const versionDir = dirname(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    console.error(`✗ ${file} — JSON invalide : ${(error as Error).message}`);
    hasErrors = true;
    continue;
  }

  const result = validateGraphArticle(parsed, {
    sourceCacheExists: (cacheRef) => {
      const cachePath = join(versionDir, cacheRef);
      return existsSync(cachePath) && statSync(cachePath).size > 0;
    },
  });

  const errors = result.findings.filter((f) => f.severity === 'error');
  const warnings = result.findings.filter((f) => f.severity === 'warning');
  const relative = file.slice(repoRoot.length + 1);

  if (errors.length > 0) {
    hasErrors = true;
    console.error(
      `✗ ${relative} — ${errors.length} erreur(s), ${warnings.length} avertissement(s)`,
    );
    for (const finding of result.findings) {
      const marker = finding.severity === 'error' ? '  ✗' : '  ⚠';
      console.error(`${marker} [${finding.rule}] ${finding.where ?? ''} ${finding.message}`);
    }
  } else {
    console.log(`✓ ${relative} — valide (${warnings.length} avertissement(s))`);
    for (const finding of warnings) {
      console.log(`  ⚠ [${finding.rule}] ${finding.where ?? ''} ${finding.message}`);
    }
  }
}

process.exit(hasErrors ? 1 : 0);
