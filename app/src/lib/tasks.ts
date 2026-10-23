import { roleDef, routeIndex } from './catalog';
import { seededRng, shuffle } from './rng';
import type { RoleKey } from './types';

export interface Task {
  index: number;
  route: string;
  title: string;
  practice: boolean;
}

/**
 * Perfil de uso personal: cada participante recibe una permutación propia de
 * las funciones de su rol con frecuencias tipo Zipf (s = 1). Es el mismo en
 * ambas sesiones, para que la personalización tenga sobre qué actuar.
 */
export function personalProfile(code: string, role: RoleKey): { route: string; weight: number }[] {
  const routes = shuffle(roleDef(role).tasks, seededRng(`profile:${code}`));
  const raw = routes.map((r, i) => ({ route: r, weight: 1 / (i + 1) }));
  const total = raw.reduce((s, x) => s + x.weight, 0);
  return raw.map((x) => ({ ...x, weight: x.weight / total }));
}

export function generateTasks(
  code: string, role: RoleKey, session: number, block: number, n: number, practice: number,
): Task[] {
  const profile = personalProfile(code, role);
  const rnd = seededRng(`tasks:${code}:${session}:${block}`);
  const pick = () => {
    let u = rnd();
    for (const p of profile) { if ((u -= p.weight) <= 0) return p.route; }
    return profile[profile.length - 1].route;
  };
  const out: Task[] = [];
  let prev = '';
  for (let i = 0; i < n; i++) {
    let r = pick();
    for (let tries = 0; r === prev && tries < 10; tries++) r = pick(); // evita repetir seguido
    prev = r;
    out.push({ index: i, route: r, title: routeIndex[r].title, practice: i < practice });
  }
  return out;
}
