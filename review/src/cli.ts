#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  diffGraphs,
  type Finding,
  graphArticleSchema,
  skeletonSchema,
} from '@criticalthinker/schema';
import { Command } from 'commander';
import { generateDiffView } from './diff-view.js';
import { generateReviewSheet } from './review-sheet.js';
import { generateSkeletonView } from './skeleton-view.js';

/**
 * CLI de revue (SPEC §9) : génère les pages HTML autonomes des portes
 * humaines. Prend des répertoires de version en argument — aucune
 * dépendance au pipeline, seulement au contrat (schema).
 *
 *   ctr g1 articles/<slug>/v1        → review-g1.html
 *   ctr g2 articles/<slug>/v1        → review-g2.html
 *   ctr diff articles/<slug>/v1 articles/<slug>/v2 → diff.html
 */

const program = new Command('ctr');
program.description('CriticalThinker — pages de revue éditeur');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

program
  .command('g1')
  .argument('<versionDir>', 'répertoire contenant skeleton.json')
  .description('génère la vue squelette (porte G1)')
  .action((versionDir: string) => {
    const dir = resolve(versionDir);
    const skeleton = skeletonSchema.parse(readJson(join(dir, 'skeleton.json')));
    const output = join(dir, 'review-g1.html');
    writeFileSync(output, generateSkeletonView(skeleton));
    console.log(`Vue G1 : ${output}`);
  });

program
  .command('g2')
  .argument('<versionDir>', 'répertoire contenant graph.json')
  .description('génère la fiche de revue (porte G2)')
  .action((versionDir: string) => {
    const dir = resolve(versionDir);
    const graph = graphArticleSchema.parse(readJson(join(dir, 'graph.json')));
    let findings: Finding[] = [];
    try {
      const validation = readJson(join(dir, 'reports', 'validation.json')) as {
        findings?: Finding[];
      };
      findings = validation.findings ?? [];
    } catch {
      // pas encore de rapport de validation — la fiche l'indiquera par l'absence
    }
    const output = join(dir, 'review-g2.html');
    writeFileSync(output, generateReviewSheet(graph, findings));
    console.log(`Fiche G2 : ${output}`);
  });

program
  .command('diff')
  .argument('<fromDir>', 'répertoire de la version de départ')
  .argument('<toDir>', 'répertoire de la version d’arrivée')
  .description('génère le diff structurel entre deux versions')
  .action((fromDir: string, toDir: string) => {
    const before = graphArticleSchema.parse(readJson(join(resolve(fromDir), 'graph.json')));
    const after = graphArticleSchema.parse(readJson(join(resolve(toDir), 'graph.json')));
    const diff = diffGraphs(before, after);
    const title = `Diff — ${before.article.id} (${fromDir} → ${toDir})`;
    const output = join(resolve(toDir), 'diff.html');
    writeFileSync(output, generateDiffView(diff, title));
    console.log(`Diff : ${output}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
