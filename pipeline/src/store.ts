import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type GraphArticle,
  graphArticleSchema,
  type Skeleton,
  skeletonSchema,
} from '@criticalthinker/schema';

/**
 * Accès disque aux articles (SPEC §10) :
 * articles/<slug>/{seed.md, vN/{graph.json, skeleton.json, sources-cache/, reports/}}
 */

export class ArticleStore {
  readonly root: string;

  constructor(repoRoot?: string) {
    this.root = join(repoRoot ?? findRepoRoot(), 'articles');
  }

  articleDir(slug: string): string {
    return join(this.root, slug);
  }

  seedPath(slug: string): string {
    return join(this.articleDir(slug), 'seed.md');
  }

  init(slug: string): string {
    const dir = this.articleDir(slug);
    if (existsSync(dir)) throw new Error(`L'article ${slug} existe déjà`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      this.seedPath(slug),
      '# Sujet\n\nDécris ici le sujet de l’article — une phrase à un paragraphe.\n',
    );
    return dir;
  }

  readSeed(slug: string): string {
    const seed = readFileSync(this.seedPath(slug), 'utf-8').trim();
    if (seed === '' || seed.includes('Décris ici le sujet')) {
      throw new Error(`Le seed de ${slug} n'a pas encore été rédigé (${this.seedPath(slug)})`);
    }
    return seed;
  }

  /** Numéros de version existants, croissants. */
  versions(slug: string): number[] {
    const dir = this.articleDir(slug);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((entry) => /^v(\d+)$/.exec(entry)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  latestVersion(slug: string): number | null {
    const versions = this.versions(slug);
    return versions.length > 0 ? (versions[versions.length - 1] as number) : null;
  }

  versionDir(slug: string, version: number): string {
    return join(this.articleDir(slug), `v${version}`);
  }

  /** Crée v1, ou v(N+1) en copiant v(N) (itération à portée de nœud, SPEC §5.2). */
  createVersion(slug: string): { version: number; dir: string } {
    const latest = this.latestVersion(slug);
    const version = (latest ?? 0) + 1;
    const dir = this.versionDir(slug, version);
    if (latest !== null) {
      cpSync(this.versionDir(slug, latest), dir, { recursive: true });
    } else {
      mkdirSync(dir, { recursive: true });
    }
    mkdirSync(join(dir, 'sources-cache'), { recursive: true });
    mkdirSync(join(dir, 'reports'), { recursive: true });
    return { version, dir };
  }

  /** Répertoire de travail : la dernière version, créée si nécessaire. */
  workingDir(slug: string): string {
    const latest = this.latestVersion(slug);
    if (latest !== null) return this.versionDir(slug, latest);
    return this.createVersion(slug).dir;
  }

  readSkeleton(slug: string, version?: number): Skeleton {
    const raw = readFileSync(join(this.resolveDir(slug, version), 'skeleton.json'), 'utf-8');
    return skeletonSchema.parse(JSON.parse(raw));
  }

  writeSkeleton(slug: string, skeleton: Skeleton): string {
    const path = join(this.workingDir(slug), 'skeleton.json');
    writeFileSync(path, `${JSON.stringify(skeleton, null, 2)}\n`);
    return path;
  }

  readGraph(slug: string, version?: number): GraphArticle {
    const raw = readFileSync(join(this.resolveDir(slug, version), 'graph.json'), 'utf-8');
    return graphArticleSchema.parse(JSON.parse(raw));
  }

  writeGraph(slug: string, graph: GraphArticle): string {
    const path = join(this.workingDir(slug), 'graph.json');
    writeFileSync(path, `${JSON.stringify(graph, null, 2)}\n`);
    return path;
  }

  writeSourceCache(slug: string, sourceId: string, text: string): string {
    const cacheDir = join(this.workingDir(slug), 'sources-cache');
    mkdirSync(cacheDir, { recursive: true });
    const cacheRef = `sources-cache/${sourceId}.txt`;
    writeFileSync(join(this.workingDir(slug), cacheRef), text);
    return cacheRef;
  }

  readSourceCache(slug: string, cacheRef: string, version?: number): string {
    return readFileSync(join(this.resolveDir(slug, version), cacheRef), 'utf-8');
  }

  sourceCacheExists(slug: string, cacheRef: string, version?: number): boolean {
    const path = join(this.resolveDir(slug, version), cacheRef);
    return existsSync(path) && readFileSync(path, 'utf-8').trim().length > 0;
  }

  readReport<T>(slug: string, name: string, version?: number): T {
    const path = join(this.resolveDir(slug, version), 'reports', `${name}.json`);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  }

  writeReport(slug: string, name: string, data: unknown): string {
    const reportsDir = join(this.workingDir(slug), 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const path = join(reportsDir, `${name}.json`);
    writeFileSync(
      path,
      `${JSON.stringify({ generated_at: new Date().toISOString(), ...asObject(data) }, null, 2)}\n`,
    );
    return path;
  }

  private resolveDir(slug: string, version?: number): string {
    if (version !== undefined) return this.versionDir(slug, version);
    const latest = this.latestVersion(slug);
    if (latest === null) throw new Error(`Aucune version pour l'article ${slug}`);
    return this.versionDir(slug, latest);
  }
}

function asObject(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : { data };
}

/** Remonte jusqu'à la racine du workspace (pnpm-workspace.yaml). */
export function findRepoRoot(from?: string): string {
  let current = resolve(from ?? process.cwd());
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error('Racine du repo introuvable (pnpm-workspace.yaml)');
    }
    current = parent;
  }
}
