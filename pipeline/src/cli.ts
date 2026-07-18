#!/usr/bin/env tsx
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { diffGraphs } from '@criticalthinker/schema';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { createAzureClient } from './llm/client.js';
import { createStructuredCaller } from './llm/structured.js';
import {
  type PipelineDeps,
  runCritiquePhase,
  runJudgePhase,
  runSkeletonPhase,
  runSourcePhase,
  runValidatePhase,
  runWritePhase,
} from './orchestrate.js';
import { retrievePage } from './retrieve/retrieve.js';
import { createBingGroundingProvider } from './search/bing-grounding.js';
import { ArticleStore } from './store.js';

/**
 * CLI du pipeline (ARCHITECTURE §6) : une commande par passe, relançable
 * à n'importe quelle étape, régénération à portée de nœud via --nodes.
 */

const program = new Command('ct');
program.description('CriticalThinker — pipeline de génération d’articles-graphes');

function buildDeps(): PipelineDeps {
  const config = loadConfig();
  const client = createAzureClient(config);
  return {
    call: createStructuredCaller(client, config),
    search: createBingGroundingProvider(config),
    retrieve: retrievePage,
    store: new ArticleStore(),
    language: config.articleLanguage,
    candidatesPerClaim: config.search.candidatesPerClaim,
    criticMaxIterations: config.criticMaxIterations,
    log: (message) => console.log(message),
  };
}

function parseNodes(value?: string): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

program
  .command('new')
  .argument('<slug>', 'identifiant kebab-case de l’article')
  .description('crée articles/<slug>/ et son seed.md à remplir')
  .action((slug: string) => {
    const store = new ArticleStore();
    const dir = store.init(slug);
    console.log(`Article créé : ${dir}`);
    console.log(`Rédige le sujet dans ${store.seedPath(slug)} puis lance : ct skeleton ${slug}`);
  });

program
  .command('skeleton')
  .argument('<slug>')
  .description('architecte : sujet → squelette (porte G1 ensuite)')
  .action(async (slug: string) => {
    const deps = buildDeps();
    deps.store.workingDir(slug); // crée v1 si besoin
    await runSkeletonPhase(deps, slug);
  });

program
  .command('write')
  .argument('<slug>')
  .option('--nodes <ids>', 'liste d’ids séparés par des virgules (défaut : tous)')
  .description('rédacteur : squelette approuvé → nœuds rédigés')
  .action(async (slug: string, options: { nodes?: string }) => {
    const deps = buildDeps();
    await runWritePhase(deps, slug, parseNodes(options.nodes));
  });

program
  .command('source')
  .argument('<slug>')
  .option('--nodes <ids>', 'liste d’ids séparés par des virgules (défaut : tous)')
  .description('sourceur : recherche web + archivage + passages de soutien')
  .action(async (slug: string, options: { nodes?: string }) => {
    const deps = buildDeps();
    await runSourcePhase(deps, slug, parseNodes(options.nodes));
    console.log('Lancer ensuite : ct judge', slug);
  });

program
  .command('judge')
  .argument('<slug>')
  .description('juge sémantique : verdicts supported/partial/unsupported')
  .action(async (slug: string) => {
    const deps = buildDeps();
    await runJudgePhase(deps, slug);
  });

program
  .command('critique')
  .argument('<slug>')
  .description('critique adversarial + boucle de révision bornée')
  .action(async (slug: string) => {
    const deps = buildDeps();
    const outcome = await runCritiquePhase(deps, slug);
    if (outcome.needsResourcing.length > 0) {
      console.log(
        `Résumés modifiés — relancer : ct source ${slug} --nodes ${outcome.needsResourcing.join(',')} puis ct judge ${slug}`,
      );
    }
  });

program
  .command('validate')
  .argument('<slug>')
  .description('validateur mécanique (mêmes règles que le build du blog)')
  .action((slug: string) => {
    const deps = buildDeps();
    const result = runValidatePhase(deps, slug);
    for (const finding of result.findings) {
      const marker = finding.severity === 'error' ? '✗' : '⚠';
      console.log(`${marker} [${finding.rule}] ${finding.where ?? ''} ${finding.message}`);
    }
    process.exitCode = result.ok ? 0 : 1;
  });

program
  .command('version')
  .argument('<slug>')
  .description('fige la version courante et ouvre v(N+1) pour itérer')
  .action((slug: string) => {
    const store = new ArticleStore();
    const { version, dir } = store.createVersion(slug);
    console.log(`Version v${version} créée : ${dir}`);
  });

program
  .command('diff')
  .argument('<slug>')
  .argument('<from>', 'ex: 1')
  .argument('<to>', 'ex: 2')
  .description('diff structurel entre deux versions')
  .action((slug: string, from: string, to: string) => {
    const store = new ArticleStore();
    const before = store.readGraph(slug, Number(from));
    const after = store.readGraph(slug, Number(to));
    console.log(JSON.stringify(diffGraphs(before, after), null, 2));
  });

program
  .command('run')
  .argument('<slug>')
  .description('enchaîne les passes en s’arrêtant aux portes humaines')
  .action(async (slug: string) => {
    const deps = buildDeps();
    const workingDir = deps.store.workingDir(slug);

    if (!existsSync(join(workingDir, 'skeleton.json'))) {
      await runSkeletonPhase(deps, slug);
      console.log('\n■ PORTE G1 — relis le squelette, ajuste-le si besoin, puis relance : ct run');
      return;
    }

    if (!existsSync(join(workingDir, 'graph.json'))) {
      await runWritePhase(deps, slug);
    }
    await runSourcePhase(deps, slug);
    await runJudgePhase(deps, slug);
    const outcome = await runCritiquePhase(deps, slug);
    if (outcome.needsResourcing.length > 0) {
      await runSourcePhase(deps, slug, outcome.needsResourcing);
      await runJudgePhase(deps, slug);
    }
    const result = runValidatePhase(deps, slug);
    console.log(
      result.ok
        ? '\n■ PORTE G2 — graphe mécaniquement valide ; générer la fiche de revue et arbitrer.'
        : '\n■ PORTE G2 — erreurs de validation à arbitrer (voir reports/validation.json).',
    );
  });

program.parseAsync().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
