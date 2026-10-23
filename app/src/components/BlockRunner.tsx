import { useCallback, useEffect, useRef, useState } from 'react';
import { ErpShell } from './ErpShell';
import { api } from '../lib/api';
import { logger } from '../lib/logger';
import type { LeafNode } from '../lib/catalog';
import type { MenuModel } from '../lib/menu';
import type { Task } from '../lib/tasks';
import type { Condition, TaskResult } from '../lib/types';

interface Props {
  code: string;
  session: number;
  block: number;
  condition: Condition;
  label: string;          // "Bloque 1", "Versión A"...
  roleLabel: string;
  menu: MenuModel;
  tasks: Task[];
  startIndex: number;
  onProgress: (nextIndex: number) => void;
  onDone: () => void;
}

const IDLE_MS = 60_000;

export function BlockRunner(p: Props) {
  const [idx, setIdx] = useState(p.startIndex);
  const [running, setRunning] = useState(false);
  const [route, setRoute] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [finished, setFinished] = useState(false);

  const c = useRef({ clicks: 0, clicksToTarget: null as number | null, wrongVisits: 0, wrongConfirms: 0, t0: 0 });
  const lastInput = useRef(Date.now());
  const idleSince = useRef<number | null>(null);
  const task = p.tasks[idx];

  // contexto del registro para este bloque
  useEffect(() => {
    logger.setContext({ session_no: p.session, block_no: p.block, condition: p.condition, task_index: null });
    logger.log('block_start', { payload: { label: p.label, n_tasks: p.tasks.length, start_index: p.startIndex } });
  }, [p.session, p.block, p.condition, p.label, p.tasks.length, p.startIndex]);

  // detección de inactividad (> 60 s sin mover el mouse ni teclear)
  useEffect(() => {
    const onInput = () => {
      lastInput.current = Date.now();
      if (idleSince.current !== null) {
        logger.log('idle_end', { payload: { idle_ms: Date.now() - idleSince.current } });
        idleSince.current = null;
      }
    };
    const iv = window.setInterval(() => {
      if (running && idleSince.current === null && Date.now() - lastInput.current > IDLE_MS) {
        idleSince.current = lastInput.current;
        logger.log('idle_start');
      }
    }, 5000);
    window.addEventListener('mousemove', onInput);
    window.addEventListener('keydown', onInput);
    window.addEventListener('mousedown', onInput);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('mousemove', onInput);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('mousedown', onInput);
    };
  }, [running]);

  const startTask = useCallback(() => {
    c.current = { clicks: 0, clicksToTarget: null, wrongVisits: 0, wrongConfirms: 0, t0: performance.now() };
    setExpanded(new Set());   // cada tarea empieza con el menú cerrado (costo desde la raíz)
    setRoute(null);
    setMessage(null);
    logger.setContext({ task_index: task.index });
    logger.log('task_start', { route: task.route, payload: { practice: task.practice } });
    setRunning(true);
  }, [task]);

  const onToggle = (id: string, kind: 'group' | 'submenu', level: number) => {
    if (!running) return;
    c.current.clicks += 1;
    setExpanded((prev) => {
      const next = new Set(prev);
      const open = !next.has(id);
      if (open) next.add(id); else next.delete(id);
      logger.log('menu_click', { payload: { node: id, kind, level, expanded: open, click_n: c.current.clicks } });
      return next;
    });
  };

  const onOpen = (leaf: LeafNode, source: 'menu' | 'bar', level: number) => {
    if (!running) return;
    c.current.clicks += 1;
    logger.log('menu_click', { route: leaf.route, payload: { node: leaf.id, kind: source === 'bar' ? 'bar' : 'item', level, click_n: c.current.clicks } });
    const isTarget = leaf.route === task.route;
    logger.log('nav', { route: leaf.route, from_route: route, payload: { is_target: isTarget, source } });
    if (isTarget) {
      if (c.current.clicksToTarget === null) c.current.clicksToTarget = c.current.clicks;
    } else if (leaf.route !== route) {
      c.current.wrongVisits += 1;
    }
    setRoute(leaf.route);
    setMessage(null);
  };

  const onConfirm = async () => {
    if (!running) return;
    if (route !== task.route) {
      c.current.wrongConfirms += 1;
      logger.log('confirm_wrong', { route });
      setMessage('Esta no es la función solicitada. Revisa el menú.');
      return;
    }
    const duration = Math.round(performance.now() - c.current.t0);
    const r: TaskResult = {
      session_no: p.session, block_no: p.block, condition: p.condition, task_index: task.index,
      target_route: task.route, practice: task.practice,
      clicks: c.current.clicksToTarget ?? c.current.clicks,
      wrong_visits: c.current.wrongVisits, wrong_confirms: c.current.wrongConfirms,
      duration_ms: duration, completed: true,
    };
    logger.log('task_end', { route: task.route, payload: { ...r } });
    setRunning(false);
    setFlash(true);
    api.saveTaskResult(p.code, r).catch(() => {
      // reintento único; si falla, el resultado se puede reconstruir desde los eventos
      setTimeout(() => api.saveTaskResult(p.code, r).catch(() => undefined), 3000);
    });
    const next = idx + 1;
    p.onProgress(next);
    setTimeout(async () => {
      if (next >= p.tasks.length) {
        setFinished(true);
        logger.setContext({ task_index: null });
        logger.log('block_end');
        await logger.flush();
        p.onDone();
      } else {
        setFlash(false);
        setIdx(next);
      }
    }, 700);
  };

  if (!task || finished) return <div className="overlay light"><div className="card center">Guardando…</div></div>;

  const header = (
    <>
      <span>{p.label}</span>
      <span className="muted">Rol: {p.roleLabel}</span>
      <span className="muted">Tarea {idx + 1} de {p.tasks.length}</span>
      <div className="progress"><div style={{ width: `${(idx / p.tasks.length) * 100}%` }} /></div>
    </>
  );

  const banner = running ? (
    <div className="task-banner" data-target={task.route}>
      Abre la función <b>«{task.title}»</b> y presiona <b>Confirmar</b>.
      {task.practice && <span className="badge">Práctica</span>}
    </div>
  ) : null;

  return (
    <div className="block-wrap">
      <ErpShell menu={p.menu} expanded={expanded} route={running ? route : null} header={header} banner={banner}
        message={message} onToggle={onToggle} onOpen={onOpen} onConfirm={onConfirm} />
      {!running && !flash && (
        <div className="overlay">
          <div className="card center">
            <div className="muted">Tarea {idx + 1} de {p.tasks.length}{task.practice ? ' · práctica' : ''}</div>
            <h2>Abre «{task.title}»</h2>
            <p>Busca esta función en el menú, ábrela y presiona <b>Confirmar</b>. Trabaja a tu ritmo normal.</p>
            <button className="btn primary" data-action="start-task" onClick={startTask} autoFocus>Empezar</button>
          </div>
        </div>
      )}
      {flash && <div className="overlay light"><div className="card center ok">✓ ¡Listo!</div></div>}
    </div>
  );
}
