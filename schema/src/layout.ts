import type { GraphArticle } from './graph-article.js';
import { collectEdges, nodesByPillar } from './graph-utils.js';

/**
 * Layout déterministe du graphe (SPEC §12, tranché : calculé au build).
 * Les piliers occupent des secteurs angulaires autour du hub central ;
 * les nœuds d'un pilier sont placés sur des anneaux, triés par id.
 * Même graphe → mêmes coordonnées, toujours : versionnable, testable,
 * partagé entre la mini-map du moteur et l'outillage de revue.
 */

export interface LayoutPoint {
  id: string;
  pillar: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string | null; // null = hub
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  hub: { x: number; y: number };
  nodes: LayoutPoint[];
  edges: LayoutEdge[];
}

export interface LayoutOptions {
  size?: number;
  innerRadius?: number;
  ringGap?: number;
  maxPerRing?: number;
}

const DEFAULTS = { size: 400, innerRadius: 90, ringGap: 55, maxPerRing: 5 };

export function computeLayout(graph: GraphArticle, options: LayoutOptions = {}): GraphLayout {
  const { size, innerRadius, ringGap, maxPerRing } = { ...DEFAULTS, ...options };
  const center = size / 2;
  const pillars = graph.article.hub.pillars;
  const groups = nodesByPillar(graph);
  const sectorAngle = (2 * Math.PI) / pillars.length;

  const points = new Map<string, LayoutPoint>();

  pillars.forEach((pillar, pillarIndex) => {
    // secteur du pilier, départ en haut (-π/2), petite marge interne
    const sectorStart = -Math.PI / 2 + pillarIndex * sectorAngle;
    const margin = sectorAngle * 0.12;
    const usableStart = sectorStart + margin;
    const usableSpan = sectorAngle - 2 * margin;

    const nodes = [...(groups.get(pillar.id) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    nodes.forEach((node, nodeIndex) => {
      const ring = Math.floor(nodeIndex / maxPerRing);
      const indexInRing = nodeIndex % maxPerRing;
      const countInRing = Math.min(nodes.length - ring * maxPerRing, maxPerRing);
      const angle =
        countInRing === 1
          ? usableStart + usableSpan / 2
          : usableStart + (usableSpan * indexInRing) / (countInRing - 1);
      const radius = innerRadius + ring * ringGap;
      points.set(node.id, {
        id: node.id,
        pillar: pillar.id,
        x: round2(center + radius * Math.cos(angle)),
        y: round2(center + radius * Math.sin(angle)),
      });
    });
  });

  const hub = { x: center, y: center };
  const edges: LayoutEdge[] = [];
  for (const edge of collectEdges(graph)) {
    const to = points.get(edge.to);
    if (to === undefined) continue;
    const from = edge.from === null ? hub : points.get(edge.from);
    if (from === undefined) continue;
    edges.push({ from: edge.from, to: edge.to, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  }

  return { width: size, height: size, hub, nodes: [...points.values()], edges };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
