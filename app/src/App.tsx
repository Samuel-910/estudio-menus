import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './lib/api';
import { resetDemo } from './lib/demo';
import { logger } from './lib/logger';
import { deviceInfo, isDesktopOk } from './lib/device';
import { roleDef } from './lib/catalog';
import { adaptedMenu, staticMenu, type MenuModel } from './lib/menu';
import { generateTasks } from './lib/tasks';
import type { Condition, ParticipantState } from './lib/types';
import { BlockRunner } from './components/BlockRunner';
import { BlockQuestionnaire, Consent, FinalQuestionnaire, Screening, Session1Feedback, susScore } from './components/Forms';
import { STUDY_TITLE } from './data/texts';

/* ---------- pasos de cada sesión ---------- */

type Step =
  | { t: 'intro' }
  | { t: 'block'; block: number; cond: Condition; label: string }
  | { t: 'qblock'; block: number; cond: Condition; label: string }
  | { t: 's1feedback' }
  | { t: 'final' };

function buildSteps(st: ParticipantState, session: number): Step[] {
  if (session === 1) {
    const blocks: Step[] = Array.from({ length: st.config.blocks_session1 }, (_, i) => ({
      t: 'block', block: i + 1, cond: 'static', label: `Bloque ${i + 1} de ${st.config.blocks_session1}`,
    }));
    return [{ t: 'intro' }, ...blocks, { t: 's1feedback' }];
  }
  // Sesión 2: los participantes NO saben cuál versión es la adaptada (A/B neutro).
  const order: Condition[] = st.order_group === 'AS' ? ['adapted', 'static'] : ['static', 'adapted'];
  const steps: Step[] = [{ t: 'intro' }];
  order.forEach((cond, i) => {
    const label = i === 0 ? 'Versión A' : 'Versión B';
    steps.push({ t: 'block', block: i + 1, cond, label }, { t: 'qblock', block: i + 1, cond, label });
  });
  steps.push({ t: 'final' });
  return steps;
}

interface Progress { step: number; taskIndex: number }
const progKey = (code: string, s: number) => `progress:${code}:${s}`;
function loadProgress(code: string, s: number): Progress {
  try { return JSON.parse(localStorage.getItem(progKey(code, s)) ?? '') as Progress; } catch { return { step: 0, taskIndex: 0 }; }
}
function saveProgress(code: string, s: number, p: Progress) {
  try { localStorage.setItem(progKey(code, s), JSON.stringify(p)); } catch { /* sin almacenamiento: no se puede reanudar */ }
}

const ERRORS: Record<string, string> = {
  codigo_invalido: 'El enlace no es válido. Revisa que lo hayas copiado completo.',
  estudio_cerrado: 'El estudio está cerrado por el momento. Gracias por tu interés.',
  no_elegible: 'Según tus respuestas, no cumples los requisitos de este estudio.',
  sesion2_no_disponible: 'La sesión 2 todavía no está disponible.',
  error_red: 'No pudimos conectar con el servidor. Revisa tu internet y vuelve a intentar.',
};

/* ---------- código de invitación ---------- */

function readCode(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('c');
  if (fromUrl) {
    const c = fromUrl.trim().toUpperCase();
    try { localStorage.setItem('study-code', c); } catch { /* */ }
    return c;
  }
  try { return localStorage.getItem('study-code'); } catch { return null; }
}

/* ---------- componente principal ---------- */

export default function App() {
  const [code, setCode] = useState<string | null>(readCode);
  const [st, setSt] = useState<ParticipantState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [desktop, setDesktop] = useState(isDesktopOk());
  const [session, setSession] = useState<number | null>(null);   // sesión en curso
  const [prog, setProg] = useState<Progress>({ step: 0, taskIndex: 0 });
  const [menuA, setMenuA] = useState<MenuModel | null>(null);    // menú adaptado (sesión 2)

  useEffect(() => {
    const f = () => setDesktop(isDesktopOk());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  const run = useCallback(async (fn: () => Promise<ParticipantState | void>) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); if (r) setSt(r); }
    catch (e) { setErr(ERRORS[e instanceof ApiError ? e.code : 'error_red'] ?? ERRORS.error_red); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!code) return;
    logger.init(code);
    void run(() => api.getState(code));
  }, [code, run]);

  const steps = useMemo(() => (st && session ? buildSteps(st, session) : []), [st, session]);

  /* entrar a una sesión (también al reanudar) */
  const enterSession = (s: number) => run(async () => {
    if (!code) return;
    const state = await api.startSession(code, s, deviceInfo());
    if (s === 2) {
      const m = await api.getAdaptedMenu(code);
      setMenuA(adaptedMenu(state.role!, m));
    }
    logger.setContext({ session_no: s, block_no: null, condition: null, task_index: null });
    logger.log('session_start', { payload: { resumed: loadProgress(code, s).step > 0 } });
    setProg(loadProgress(code, s));
    setSession(s);
    return state;
  });

  const goto = (p: Progress) => { if (code && session) saveProgress(code, session, p); setProg(p); };

  const nextStep = async () => {
    if (!code || !session) return;
    const n = prog.step + 1;
    if (n < steps.length) { goto({ step: n, taskIndex: 0 }); return; }
    await run(async () => {
      logger.setContext({ block_no: null, condition: null, task_index: null });
      logger.log('session_end');
      await logger.flush();
      const s = await api.finishSession(code, session);
      setSession(null);
      return s;
    });
  };

  /* ---------- pantallas ---------- */

  const shell = (body: React.ReactNode) => (
    <div className="page">
      {api.demo && (
        <div className="demo-ribbon">
          MODO DEMO (sin Supabase, datos solo en este navegador) ·{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); if (code) resetDemo(code); window.location.reload(); }}>Reiniciar demo</a>
        </div>
      )}
      {err && <div className="error" role="alert">{err} <button className="link" onClick={() => setErr(null)}>×</button></div>}
      {body}
    </div>
  );

  if (!desktop) {
    return shell(<div className="card center"><h2>Usa una computadora</h2>
      <p>Este estudio requiere una computadora (laptop o PC) con mouse o touchpad y una ventana de al menos 1024 píxeles de ancho.</p>
      <p className="muted">Si estás en una computadora, maximiza la ventana del navegador.</p></div>);
  }

  if (!code) return shell(<CodeEntry onCode={setCode} />);
  if (!st) return shell(<div className="card center">{busy ? 'Cargando…' : <button className="btn" onClick={() => run(() => api.getState(code))}>Reintentar</button>}</div>);
  if (!st.study_open && session === null) return shell(<Msg title="Estudio cerrado" text={ERRORS.estudio_cerrado} />);
  if (!st.consent) return shell(<Consent busy={busy} onAccept={() => run(() => api.giveConsent(code))} />);
  if (!st.screened) return shell(<Screening busy={busy} onSubmit={(d) => run(() => api.submitScreening(code, d))} />);
  if (!st.eligible) return shell(<Msg title="Gracias por tu interés" text="Según tus respuestas, este estudio no es para ti en esta ocasión (se busca a personas mayores de edad, que usen computadora con regularidad y que no conozcan este sistema). ¡Gracias por tu tiempo!" />);

  const role = st.role!;
  const rd = roleDef(role);

  /* ---------- sesión en curso ---------- */
  if (session !== null) {
    const step = steps[prog.step];
    if (!step) return shell(<div className="card center">Cargando…</div>);

    if (step.t === 'intro') {
      return shell(
        <div className="card wide" data-screen={`intro-s${session}`}>
          <h1>Sesión {session} de 2</h1>
          <p><b>Tu rol:</b> {rd.label}. {rd.scenario}</p>
          {session === 1 ? (
            <>
              <p>Verás un sistema de gestión con un <b>menú a la izquierda</b>. En cada tarea te pediremos abrir una función. Búscala en el menú, ábrela y presiona <b>Confirmar</b>.</p>
              <p>Harás {st.config.blocks_session1} bloque(s) de {st.config.tasks_per_block} tareas. Las primeras {st.config.practice_tasks} son de práctica.</p>
            </>
          ) : (
            <>
              <p>Hoy usarás <b>dos versiones del menú</b> (Versión A y Versión B), con {st.config.tasks_per_block} tareas cada una. Después de cada versión responderás unas preguntas.</p>
              <p>Las versiones pueden parecer iguales o distintas: solo usa cada una con normalidad.</p>
            </>
          )}
          <ul>
            <li>Trabaja a tu ritmo habitual, sin apurarte ni detenerte.</li>
            <li>Hazlo tú solo(a), sin ayuda, y evita cambiar de pestaña durante las tareas.</li>
            <li>Si te equivocas, no pasa nada: sigue buscando.</li>
          </ul>
          <div className="actions"><button className="btn primary" data-action="begin" onClick={() => goto({ step: prog.step + 1, taskIndex: 0 })}>Comenzar</button></div>
        </div>,
      );
    }

    if (step.t === 'block') {
      const tasks = generateTasks(code, role, session, step.block, st.config.tasks_per_block, session === 1 && step.block === 1 ? st.config.practice_tasks : 0);
      const menu = step.cond === 'adapted' ? (menuA ?? staticMenu(role)) : staticMenu(role);
      return (
        <>
          {api.demo && <div className="demo-ribbon floating">DEMO · condición real: {step.cond}</div>}
          <BlockRunner key={`${session}-${step.block}`} code={code} session={session} block={step.block} condition={step.cond}
            label={step.label} roleLabel={rd.label} menu={menu} tasks={tasks} startIndex={prog.taskIndex}
            onProgress={(i) => { if (session) saveProgress(code, session, { step: prog.step, taskIndex: i }); }}
            onDone={() => void nextStep()} />
        </>
      );
    }

    if (step.t === 'qblock') {
      return shell(<BlockQuestionnaire label={step.label} busy={busy} onSubmit={(a) => void run(async () => {
        const base = { session_no: session, block_no: step.block, condition: step.cond };
        await api.saveQuestionnaire(code, { ...base, kind: 'sus', answers: { items: a.sus, score: susScore(a.sus), label: step.label } });
        await api.saveQuestionnaire(code, { ...base, kind: 'satisfaction', answers: { items: a.satisfaction, label: step.label } });
        if (a.comment) await api.saveQuestionnaire(code, { ...base, kind: 'open', answers: { text: a.comment, label: step.label } });
        await nextStep();
      })} />);
    }

    if (step.t === 'final') {
      return shell(<FinalQuestionnaire busy={busy} onSubmit={(a) => void run(async () => {
        // se guarda también qué condición era A y cuál B para poder interpretar la preferencia
        const blocks = steps.filter((s): s is Extract<Step, { t: 'block' }> => s.t === 'block');
        const map = { A: blocks[0]?.cond ?? null, B: blocks[1]?.cond ?? null };
        await api.saveQuestionnaire(code, { session_no: session, block_no: null, condition: null, kind: 'final', answers: { ...a, version_map: map } });
        await nextStep();
      })} />);
    }

    return shell(<Session1Feedback busy={busy} onSubmit={(a) => void run(async () => {
      await api.saveQuestionnaire(code, { session_no: 1, block_no: null, condition: null, kind: 'session1_feedback', answers: a });
      await nextStep();
    })} />);
  }

  /* ---------- fuera de sesión: decidir qué toca ---------- */
  if (!st.session1_done) {
    const resuming = loadProgress(code, 1).step > 0;
    return shell(<div className="card wide" data-screen="home-s1">
      <h1>{STUDY_TITLE}</h1>
      <p>Tu código de participante es <b>{st.pid}</b>. Guárdalo por si necesitas contactarnos.</p>
      <p>Esta es la <b>sesión 1 de 2</b> (unos 30 minutos). Busca un lugar tranquilo y reserva ese tiempo.</p>
      <div className="actions"><button className="btn primary" disabled={busy} data-action="enter-s1" onClick={() => enterSession(1)}>{resuming ? 'Continuar sesión 1' : 'Empezar sesión 1'}</button></div>
    </div>);
  }

  if (!st.session2_done) {
    if (st.session2_open) {
      const resuming = loadProgress(code, 2).step > 0;
      return shell(<div className="card wide" data-screen="home-s2">
        <h1>¡Bienvenido(a) de nuevo!</h1>
        <p>Ya puedes hacer la <b>sesión 2 de 2</b> (unos 30–40 minutos). Es la última.</p>
        <div className="actions"><button className="btn primary" disabled={busy} data-action="enter-s2" onClick={() => enterSession(2)}>{resuming ? 'Continuar sesión 2' : 'Empezar sesión 2'}</button></div>
      </div>);
    }
    const when = st.session2_available_at ? new Date(st.session2_available_at) : null;
    const dateReady = when && when.getTime() <= Date.now();
    return shell(<div className="card wide" data-screen="wait-s2">
      <h1>¡Gracias! Terminaste la sesión 1</h1>
      {when && !dateReady && <p>La sesión 2 estará disponible desde el <b>{when.toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short' })}</b>.</p>}
      {(!when || dateReady) && <p>Estamos preparando tu sesión 2. Te avisaremos cuando esté lista.</p>}
      <p>Vuelve a abrir <b>el mismo enlace</b> que usaste hoy. Tu código: <b>{st.pid}</b>.</p>
      <div className="actions"><button className="btn" disabled={busy} onClick={() => run(() => api.getState(code))}>Revisar de nuevo</button></div>
    </div>);
  }

  return shell(<Msg title="¡Estudio completado!" text={`Muchas gracias por tu participación. Tu código es ${st.pid}. Ya puedes cerrar esta pestaña.`} />);
}

function Msg({ title, text }: { title: string; text: string }) {
  return <div className="card center" data-screen="message"><h2>{title}</h2><p>{text}</p></div>;
}

function CodeEntry({ onCode }: { onCode: (c: string) => void }) {
  const [v, setV] = useState(api.demo ? 'DEMO-0001' : '');
  return (
    <div className="card center">
      <h2>{STUDY_TITLE}</h2>
      {api.demo
        ? <p>Modo demo: escribe cualquier código para probar el flujo completo.</p>
        : <p>Para participar necesitas tu <b>enlace de invitación</b>. Si tienes un código, escríbelo aquí.</p>}
      <input className="code-input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Código" data-field="code" />
      <div className="actions"><button className="btn primary" disabled={v.trim().length < 4} data-action="code" onClick={() => {
        const c = v.trim().toUpperCase();
        try { localStorage.setItem('study-code', c); } catch { /* */ }
        onCode(c);
      }}>Entrar</button></div>
    </div>
  );
}
