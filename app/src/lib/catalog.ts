import raw from '../data/catalog.json';
import type { RoleKey } from './types';

export interface LeafNode { id: string; title: string; route: string }
export interface BranchNode { id: string; title: string; children: MenuNode[] }
export type MenuNode = LeafNode | BranchNode;
export interface GroupNode { id: string; title: string; children: MenuNode[] }

export interface RoleDef {
  label: string;
  scenario: string;
  groups: string[];
  tasks: string[];
}

export interface Catalog {
  version: string;
  groups: GroupNode[];
  roles: Record<RoleKey, RoleDef>;
}

export const catalog = raw as unknown as Catalog;

export const isLeaf = (n: MenuNode): n is LeafNode => (n as LeafNode).route !== undefined;

export interface RouteInfo {
  route: string;
  title: string;
  groupId: string;
  groupTitle: string;
  path: string[]; // títulos desde el grupo hasta el ítem
  depth: number;  // clics desde la raíz (grupo = 1)
}

export const routeIndex: Record<string, RouteInfo> = {};
(function build() {
  const walk = (n: MenuNode, g: GroupNode, path: string[], depth: number) => {
    if (isLeaf(n)) {
      routeIndex[n.route] = {
        route: n.route, title: n.title, groupId: g.id, groupTitle: g.title,
        path: [...path, n.title], depth,
      };
    } else {
      n.children.forEach((c) => walk(c, g, [...path, n.title], depth + 1));
    }
  };
  catalog.groups.forEach((g) => g.children.forEach((c) => walk(c, g, [g.title], 2)));
})();

export const roleDef = (role: RoleKey): RoleDef => catalog.roles[role];
