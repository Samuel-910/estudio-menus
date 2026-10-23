import { catalog, isLeaf, routeIndex, roleDef, type GroupNode, type LeafNode, type MenuNode } from './catalog';
import type { AdaptedMenu, RoleKey } from './types';

export interface MenuModel {
  bar: LeafNode[];        // barra de accesos sugeridos (1 clic); vacía en el menú estático
  groups: GroupNode[];    // grupos visibles para el rol, en orden
}

/** Menú estático: orden original del ERP, filtrado por permisos del rol (RBAC). */
export function staticMenu(role: RoleKey): MenuModel {
  const allowed = new Set(roleDef(role).groups);
  return { bar: [], groups: catalog.groups.filter((g) => allowed.has(g.id)) };
}

function leaves(n: MenuNode): string[] {
  return isLeaf(n) ? [n.route] : n.children.flatMap(leaves);
}

/** Reordena los hijos de un nodo según la posición de sus rutas en `order`. */
function sortNodes(nodes: MenuNode[], pos: Map<string, number>): MenuNode[] {
  const key = (n: MenuNode) => Math.min(...leaves(n).map((r) => pos.get(r) ?? Number.MAX_SAFE_INTEGER));
  return nodes
    .map((n, i) => ({ n, i, k: key(n) }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map(({ n }) => (isLeaf(n) ? n : { ...n, children: sortNodes(n.children, pos) }));
}

/**
 * Menú adaptado: aplica el orden calculado por el modelo (LSTM + DQN) a los
 * grupos permitidos. El filtro RBAC se aplica SIEMPRE aquí, aunque el JSON
 * traiga rutas de grupos no autorizados.
 */
export function adaptedMenu(role: RoleKey, adapted: AdaptedMenu | null): MenuModel {
  const base = staticMenu(role);
  if (!adapted) return base;
  const allowed = new Set(base.groups.map((g) => g.id));

  const groupOrder = (adapted.groups ?? []).map((g) => g.id).filter((id) => allowed.has(id));
  const gpos = new Map(groupOrder.map((id, i) => [id, i] as [string, number]));
  const groups = base.groups
    .map((g, i) => ({ g, i, k: gpos.get(g.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map(({ g }) => {
      const items = adapted.groups?.find((x) => x.id === g.id)?.items ?? [];
      const pos = new Map(items.map((r, i) => [r, i] as [string, number]));
      return { ...g, children: sortNodes(g.children, pos) };
    });

  const bar = (adapted.bar ?? [])
    .map((r) => routeIndex[r])
    .filter((info) => info && allowed.has(info.groupId))
    .slice(0, 3)
    .map((info) => ({ id: `bar-${info.route}`, title: info.title, route: info.route }));

  return { bar, groups };
}
