import { useState } from 'react';
import {
  AGE_RANGES, COMPUTER_FREQ, CONSENT_CHECK, CONSENT_PARAGRAPHS, EDUCATION, GENDERS, LIKERT_5,
  MGMT_EXPERIENCE, OCCUPATIONS, SATISFACTION_ITEMS, STUDY_TITLE, SUS_ITEMS,
} from '../data/texts';

/* ---------- utilidades ---------- */

function Radio({ name, options, value, onChange }: {
  name: string; options: { value: string; label: string }[]; value: string | undefined; onChange: (v: string) => void;
}) {
  return (
    <div className="radios">
      {options.map((o) => (
        <label key={o.value} className={`radio ${value === o.value ? 'on' : ''}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const YES_NO = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }];

function Likert({ name, value, onChange }: { name: string; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="likert">
      {LIKERT_5.map((l, i) => (
        <label key={l} className={`lk ${value === i + 1 ? 'on' : ''}`} title={l}>
          <input type="radio" name={name} checked={value === i + 1} onChange={() => onChange(i + 1)} />
          <span className="lk-n">{i + 1}</span>
          <span className="lk-l">{l}</span>
        </label>
      ))}
    </div>
  );
}

/* ---------- Consentimiento ---------- */

export function Consent({ onAccept, busy }: { onAccept: () => void; busy: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="card wide">
      <h1>{STUDY_TITLE}</h1>
      <h3>Consentimiento informado</h3>
      {CONSENT_PARAGRAPHS.map((p, i) => <p key={i}>{p}</p>)}
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-field="consent" /> {CONSENT_CHECK}
      </label>
      <div className="actions">
        <button className="btn primary" disabled={!ok || busy} onClick={onAccept} data-action="consent">Acepto y continúo</button>
      </div>
      <p className="muted small">Si no deseas participar, simplemente cierra esta pestaña.</p>
    </div>
  );
}

/* ---------- Cuestionario inicial (criterios + datos demográficos) ---------- */

export function Screening({ onSubmit, busy }: { onSubmit: (d: Record<string, unknown>) => void; busy: boolean }) {
  const [d, setD] = useState<Record<string, string>>({});
  const set = (k: string) => (v: string) => setD((p) => ({ ...p, [k]: v }));
  const keys = ['adult', 'regular_computer_use', 'used_this_erp', 'age_range', 'gender', 'education', 'occupation', 'computer_freq', 'mgmt_software_experience'];
  const complete = keys.every((k) => d[k]);
  const [confirming, setConfirming] = useState(false);

  // Respuestas que excluyen del estudio (mismos criterios que submit_screening en la base de datos)
  const exclusions = [
    d.adult === 'no' && 'Indicaste que tienes menos de 18 años.',
    d.regular_computer_use === 'no' && 'Indicaste que no usas una computadora con regularidad.',
    d.used_this_erp === 'si' && 'Indicaste que ya usaste el sistema «ERP Artículos» de este estudio.',
  ].filter(Boolean) as string[];

  // Si cambia alguna respuesta, se vuelve a pedir confirmación
  const setAnswer = (k: string) => (v: string) => { setConfirming(false); set(k)(v); };

  const send = () => onSubmit({
    adult: d.adult === 'si',
    regular_computer_use: d.regular_computer_use === 'si',
    used_this_erp: d.used_this_erp === 'si',
    age_range: d.age_range, gender: d.gender, education: d.education, occupation: d.occupation,
    computer_freq: d.computer_freq, mgmt_software_experience: d.mgmt_software_experience,
  });
  const submit = () => (exclusions.length && !confirming ? setConfirming(true) : send());

  return (
    <div className="card wide">
      <h2>Antes de empezar</h2>
      <p className="muted">Unas preguntas breves. Tus respuestas no te identifican.</p>

      <div className="q"><div className="ql">1. ¿Tienes 18 años o más?</div><Radio name="adult" options={YES_NO} value={d.adult} onChange={setAnswer('adult')} /></div>
      <div className="q"><div className="ql">2. ¿Usas una computadora con regularidad (al menos una vez por semana)?</div><Radio name="rcu" options={YES_NO} value={d.regular_computer_use} onChange={setAnswer('regular_computer_use')} /></div>
      <div className="q"><div className="ql">3. ¿Has usado antes el sistema «ERP Artículos» de este estudio?</div>
        <div className="muted small">Se refiere solo al sistema de prueba de esta investigación, no a otros sistemas de ventas o inventario.</div>
        <Radio name="erp" options={YES_NO} value={d.used_this_erp} onChange={setAnswer('used_this_erp')} /></div>
      <div className="q"><div className="ql">4. Edad</div><Radio name="age" options={opts(AGE_RANGES)} value={d.age_range} onChange={set('age_range')} /></div>
      <div className="q"><div className="ql">5. Género</div><Radio name="gender" options={opts(GENDERS)} value={d.gender} onChange={set('gender')} /></div>
      <div className="q"><div className="ql">6. Nivel de estudios</div><Radio name="edu" options={opts(EDUCATION)} value={d.education} onChange={set('education')} /></div>
      <div className="q"><div className="ql">7. Ocupación principal</div><Radio name="occ" options={opts(OCCUPATIONS)} value={d.occupation} onChange={set('occupation')} /></div>
      <div className="q"><div className="ql">8. ¿Con qué frecuencia usas una computadora?</div><Radio name="cf" options={opts(COMPUTER_FREQ)} value={d.computer_freq} onChange={set('computer_freq')} /></div>
      <div className="q"><div className="ql">9. Experiencia con sistemas de gestión (ventas, inventario, facturación, etc.)</div><Radio name="mx" options={MGMT_EXPERIENCE} value={d.mgmt_software_experience} onChange={set('mgmt_software_experience')} /></div>

      {confirming && (
        <div className="exclusion-warning" role="alertdialog" aria-labelledby="excl-title">
          <h3 id="excl-title">Revisa tus respuestas</h3>
          <ul>{exclusions.map((e) => <li key={e}>{e}</li>)}</ul>
          <p>Con {exclusions.length > 1 ? 'estas respuestas' : 'esta respuesta'} <b>no podrás participar</b> en el estudio y
            no podrás volver a responder. Si fue un error, corrígela antes de continuar.</p>
          <div className="actions">
            <button className="btn" onClick={() => setConfirming(false)} data-action="screening-fix">Corregir mis respuestas</button>
            <button className="btn danger" disabled={busy} onClick={send} data-action="screening-confirm">Sí, son correctas</button>
          </div>
        </div>
      )}

      {!confirming && (
        <div className="actions">
          <button className="btn primary" disabled={!complete || busy} onClick={submit} data-action="screening">Continuar</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Cuestionarios tras cada versión (sesión 2) ---------- */

export interface BlockAnswers { sus: number[]; satisfaction: number[]; comment: string }

/** Puntaje SUS 0–100 (ítems impares: x−1; pares: 5−x; suma × 2,5). */
export function susScore(a: number[]): number {
  return a.reduce((s, x, i) => s + (i % 2 === 0 ? x - 1 : 5 - x), 0) * 2.5;
}

export function BlockQuestionnaire({ label, onSubmit, busy }: { label: string; onSubmit: (a: BlockAnswers) => void; busy: boolean }) {
  const [sus, setSus] = useState<(number | undefined)[]>(Array(SUS_ITEMS.length).fill(undefined));
  const [sat, setSat] = useState<(number | undefined)[]>(Array(SATISFACTION_ITEMS.length).fill(undefined));
  const [comment, setComment] = useState('');
  const complete = sus.every((x) => x) && sat.every((x) => x);
  const upd = (arr: (number | undefined)[], f: typeof setSus, i: number) => (v: number) => { const n = [...arr]; n[i] = v; f(n); };

  return (
    <div className="card wide">
      <h2>Tu opinión sobre la {label}</h2>
      <p className="muted">Piensa solo en el menú que acabas de usar. No hay respuestas correctas.</p>
      <h3>Parte 1</h3>
      {SUS_ITEMS.map((t, i) => (
        <div className="q" key={i} data-q={`sus${i + 1}`}><div className="ql">{i + 1}. {t}</div><Likert name={`sus${i}`} value={sus[i]} onChange={upd(sus, setSus, i)} /></div>
      ))}
      <h3>Parte 2</h3>
      {SATISFACTION_ITEMS.map((t, i) => (
        <div className="q" key={i} data-q={`sat${i + 1}`}><div className="ql">{i + 1}. {t}</div><Likert name={`sat${i}`} value={sat[i]} onChange={upd(sat, setSat, i)} /></div>
      ))}
      <div className="q"><div className="ql">¿Algo que quieras comentar sobre este menú? (opcional)</div>
        <textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      <div className="actions">
        <button className="btn primary" disabled={!complete || busy} data-action="submit-q"
          onClick={() => onSubmit({ sus: sus as number[], satisfaction: sat as number[], comment: comment.trim() })}>Continuar</button>
      </div>
    </div>
  );
}

/* ---------- Pregunta final (preferencia) ---------- */

export function FinalQuestionnaire({ onSubmit, busy }: { onSubmit: (a: Record<string, unknown>) => void; busy: boolean }) {
  const [pref, setPref] = useState<string>();
  const [noticed, setNoticed] = useState<string>();
  const [why, setWhy] = useState('');
  return (
    <div className="card wide">
      <h2>Última pregunta</h2>
      <div className="q"><div className="ql">¿Qué versión del menú preferiste?</div>
        <Radio name="pref" value={pref} onChange={setPref} options={[
          { value: 'A', label: 'Versión A' }, { value: 'B', label: 'Versión B' }, { value: 'igual', label: 'Me dio igual' }]} /></div>
      <div className="q"><div className="ql">¿Notaste alguna diferencia entre las dos versiones?</div>
        <Radio name="noticed" value={noticed} onChange={setNoticed} options={[
          { value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }, { value: 'no_seguro', label: 'No estoy seguro(a)' }]} /></div>
      <div className="q"><div className="ql">¿Por qué? (opcional)</div>
        <textarea rows={3} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} /></div>
      <div className="actions">
        <button className="btn primary" disabled={!pref || !noticed || busy} data-action="submit-final"
          onClick={() => onSubmit({ preferred: pref, noticed_difference: noticed, why: why.trim() })}>Terminar</button>
      </div>
    </div>
  );
}

/* ---------- Comentario breve al final de la sesión 1 ---------- */

export function Session1Feedback({ onSubmit, busy }: { onSubmit: (a: Record<string, unknown>) => void; busy: boolean }) {
  const [diff, setDiff] = useState<number>();
  const [problems, setProblems] = useState('');
  return (
    <div className="card wide">
      <h2>¡Terminaste las tareas de hoy!</h2>
      <div className="q"><div className="ql">En general, encontrar las funciones fue…</div>
        <Radio name="diff" value={diff ? String(diff) : undefined} onChange={(v) => setDiff(Number(v))} options={[
          { value: '1', label: 'Muy difícil' }, { value: '2', label: 'Difícil' }, { value: '3', label: 'Normal' },
          { value: '4', label: 'Fácil' }, { value: '5', label: 'Muy fácil' }]} /></div>
      <div className="q"><div className="ql">¿Tuviste algún problema técnico? (opcional)</div>
        <textarea rows={3} maxLength={1000} value={problems} onChange={(e) => setProblems(e.target.value)} /></div>
      <div className="actions">
        <button className="btn primary" disabled={!diff || busy} data-action="submit-s1"
          onClick={() => onSubmit({ difficulty: diff, problems: problems.trim() })}>Enviar</button>
      </div>
    </div>
  );
}
