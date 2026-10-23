/**
 * MODO DEMO: simula el backend en el navegador (localStorage) para probar la
 * app sin Supabase. El menú adaptado del demo se calcula por FRECUENCIA de las
 * tareas de la sesión 1; en el estudio real lo sube el equipo desde el modelo.
 */
import type { Api } from './api';
import { routeIndex } from './catalog';
import type { AdaptedMenu, ParticipantState, RoleKey, TaskResult } from './types';

interface DemoDb {
  consent: boolean;
  screening: Record<string, unknown> | null;
  eligible: boolean | null;
  role: RoleKey | null;
  order: 'SA' | 'AS' | null;
  s1: boolean;
  s2: boolean;
  menu: AdaptedMenu | null;
  results: TaskResult[];
  events: number;
}

const KEY = (code: string) => `demo-db:${code}`;
const fresh = (): DemoDb => ({ consent: false, screening: null, eligible: null, role: null, order: null, s1: false, s2: false, menu: null, results: [], events: 0 });

function load(code: string): DemoDb {
  try { const s = localStorage.getItem(KEY(code)); if (s) return JSON.parse(s); } catch { /* */ }
  return fresh();
}
function save(code: string, db: DemoDb) {
  try { localStorage.setItem(KEY(code), JSON.stringify(db)); } catch { /* */ }
}

function state(db: DemoDb): ParticipantState {
  return {
    pid: 'DEMO', consent: db.consent, screened: db.screening !== null, eligible: db.eligible,
    role: db.role, order_group: db.order, session1_done: db.s1, session2_done: db.s2,
    adapted_menu_ready: db.menu !== null, session2_available_at: null,
    session2_open: db.s1 && db.menu !== null, study_open: true,
    config: { tasks_per_block: 8, practice_tasks: 2, blocks_session1: 1, min_days_between_sessions: 0 },
  };
}

function frequencyMenu(results: TaskResult[]): AdaptedMenu {
  const freq = new Map<string, number>();
  results.filter((r) => r.session_no === 1).forEach((r) => freq.set(r.target_route, (freq.get(r.target_route) ?? 0) + 1));
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const groupScore = new Map<string, number>();
  ranked.forEach((r) => { const g = routeIndex[r].groupId; groupScore.set(g, (groupScore.get(g) ?? 0) + (freq.get(r) ?? 0)); });
  const groups = [...groupScore.entries()].sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, items: ranked.filter((r) => routeIndex[r].groupId === id) }));
  return { bar: ranked.slice(0, 3), groups };
}

export function createDemoApi(): Api {
  const wrap = <T>(fn: () => T) => new Promise<T>((res) => setTimeout(() => res(fn()), 120));
  return {
    demo: true,
    getState: (code) => wrap(() => state(load(code))),
    giveConsent: (code) => wrap(() => { const db = load(code); db.consent = true; save(code, db); return state(db); }),
    submitScreening: (code, data) => wrap(() => {
      const db = load(code);
      if (!db.screening) {
        db.screening = data;
        db.eligible = data.adult === true && data.regular_computer_use === true && data.used_this_erp === false;
        if (db.eligible) {
          const roles: RoleKey[] = ['Ventas', 'Compras', 'Almacen', 'Administrador'];
          db.role = roles[Math.floor(Math.random() * roles.length)];
          db.order = Math.random() < 0.5 ? 'SA' : 'AS';
        }
        save(code, db);
      }
      return state(db);
    }),
    startSession: (code) => wrap(() => state(load(code))),
    logEvents: (code, events) => wrap(() => { const db = load(code); db.events += events.length; save(code, db); }),
    logEventsBeacon: () => { /* demo: nada */ },
    saveTaskResult: (code, r) => wrap(() => { const db = load(code); db.results.push(r); save(code, db); }),
    saveQuestionnaire: () => wrap(() => undefined),
    finishSession: (code, session) => wrap(() => {
      const db = load(code);
      if (session === 1) { db.s1 = true; db.menu = frequencyMenu(db.results); }
      if (session === 2) db.s2 = true;
      save(code, db); return state(db);
    }),
    getAdaptedMenu: (code) => wrap(() => load(code).menu),
  };
}

export function resetDemo(code: string) {
  try { localStorage.removeItem(KEY(code)); localStorage.removeItem(`progress:${code}:1`); localStorage.removeItem(`progress:${code}:2`); } catch { /* */ }
}
