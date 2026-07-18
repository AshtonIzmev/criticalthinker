import {
  type ArticleTotals,
  computeMetrics,
  deserializeState,
  isSynthesisUnlocked,
  openNode,
  readCardinality,
  serializeState,
  type TraversalState,
  traverseEdge,
  type UnlockThresholds,
} from './island-core.js';

/**
 * Island du moteur de lecture (SPEC §8) — vanilla TS, seul JS livré au
 * lecteur. Le HTML complet existe déjà (rendu au build) : l'island ne
 * dessine rien, elle orchestre — hash routing, machine à états, métriques,
 * anti-vortex, mini-map (toggle de classes sur le SVG existant),
 * persistance localStorage.
 */

export function initGraphArticles(): void {
  for (const root of document.querySelectorAll<HTMLElement>('.ct-article')) {
    initOne(root);
  }
}

function initOne(root: HTMLElement): void {
  const articleId = root.dataset.articleId ?? 'article';
  const storageKey = `ct:${articleId}`;
  const totals: ArticleTotals = {
    totalCardinalities: Number(root.dataset.totalCardinalities ?? '0'),
    totalPillars: Number(root.dataset.totalPillars ?? '0'),
    pillarOf: JSON.parse(root.dataset.pillarOf ?? '{}') as Record<string, string>,
  };
  const unlock: UnlockThresholds = {
    min_coverage: Number(root.dataset.minCoverage ?? '0.6'),
    min_pillar_diversity: Number(root.dataset.minDiversity ?? '1'),
  };

  let state: TraversalState = deserializeState(localStorage.getItem(storageKey));
  let activeNodeId: string | null = null;

  const persist = () => localStorage.setItem(storageKey, serializeState(state));

  const nodeElements = new Map<string, HTMLElement>();
  for (const section of root.querySelectorAll<HTMLElement>('.ct-node')) {
    if (section.id !== '') nodeElements.set(section.id, section);
  }

  // mode enrichi : le CSS masque les nœuds inactifs, la mini-map apparaît
  root.classList.add('ct-enhanced');

  function refresh(): void {
    const metrics = computeMetrics(state, totals);

    const coverageEl = root.querySelector<HTMLElement>('.ct-metric-coverage');
    if (coverageEl) coverageEl.textContent = `${Math.round(metrics.coverage * 100)} %`;
    const diversityEl = root.querySelector<HTMLElement>('.ct-metric-diversity');
    if (diversityEl)
      diversityEl.textContent = `${Math.round(metrics.diversity * totals.totalPillars)}/${totals.totalPillars}`;
    const contradictionEl = root.querySelector<HTMLElement>('.ct-metric-contradiction');
    if (contradictionEl) contradictionEl.textContent = String(metrics.contradiction);
    const bar = root.querySelector<HTMLElement>('.ct-progress-bar');
    if (bar) bar.style.width = `${Math.round(metrics.coverage * 100)}%`;

    // mini-map : états des nœuds
    for (const circle of root.querySelectorAll<SVGElement>('.ct-map-node')) {
      const nodeId = circle.dataset.node ?? '';
      circle.classList.toggle('ct-visited', state.opened.includes(nodeId));
      circle.classList.toggle('ct-active', nodeId === activeNodeId);
    }
    // mini-map : arêtes traversées
    for (const line of root.querySelectorAll<SVGElement>('.ct-map-edge')) {
      const key = `${line.dataset.from}→${line.dataset.to}`;
      line.classList.toggle('ct-traversed', state.edges.includes(key));
    }

    // anti-vortex : cardinalités déjà lues + mots-clés déjà visités
    for (const [nodeId, section] of nodeElements) {
      section.querySelectorAll<HTMLDetailsElement>('.ct-cardinality').forEach((details, index) => {
        details.classList.toggle('ct-read', state.read.includes(`${nodeId}:${index}`));
      });
    }
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a.ct-keyword')) {
      const target = anchor.dataset.node ?? '';
      anchor.classList.toggle('ct-visited', state.opened.includes(target));
    }

    // synthèse
    const synthesis = root.querySelector<HTMLElement>('.ct-synthesis');
    if (synthesis) {
      const unlocked = isSynthesisUnlocked(metrics, unlock);
      synthesis.classList.toggle('ct-locked', !unlocked);
      const gate = synthesis.querySelector<HTMLElement>('.ct-synthesis-gate');
      if (gate) gate.hidden = unlocked;
      const content = synthesis.querySelector<HTMLElement>('.ct-synthesis-content');
      if (content) content.hidden = !unlocked;
    }
  }

  function activate(nodeId: string, options: { scroll?: boolean } = {}): void {
    const section = nodeElements.get(nodeId);
    if (section === undefined) return;

    // arête traversée si on vient d'un nœud via un lien récursif
    if (activeNodeId !== null && activeNodeId !== nodeId) {
      const cameFromLink = nodeElements
        .get(activeNodeId)
        ?.querySelector(`a.ct-keyword[data-node="${nodeId}"]`);
      if (cameFromLink) state = traverseEdge(state, activeNodeId, nodeId);
    }

    state = openNode(state, nodeId);
    activeNodeId = nodeId;

    for (const [id, element] of nodeElements) {
      element.classList.toggle('ct-active', id === nodeId);
    }
    root.classList.add('ct-node-open');
    persist();
    refresh();
    if (options.scroll !== false) {
      root.querySelector<HTMLElement>('.ct-viewport')?.scrollIntoView({ block: 'nearest' });
    }
  }

  // navigation par hash — le bouton retour est l'anti-vortex natif
  function onHashChange(): void {
    const nodeId = decodeURIComponent(location.hash.slice(1));
    if (nodeId !== '' && nodeElements.has(nodeId)) activate(nodeId);
  }
  window.addEventListener('hashchange', onHashChange);
  if (location.hash !== '') onHashChange();

  // lecture d'une cardinalité (dépli du <details>)
  root.addEventListener(
    'toggle',
    (event) => {
      const details = event.target as HTMLDetailsElement;
      if (!details.classList.contains('ct-cardinality') || !details.open) return;
      const section = details.closest<HTMLElement>('.ct-node');
      if (section === null) return;
      const index = [...section.querySelectorAll('.ct-cardinality')].indexOf(details);
      if (index < 0) return;
      state = readCardinality(state, section.id, index);
      persist();
      refresh();
    },
    true,
  );

  refresh();
}

initGraphArticles();
