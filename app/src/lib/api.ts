import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoApi } from './demo';
import type { AdaptedMenu, LogEvent, ParticipantState, QuestionnaireData, TaskResult } from './types';

export interface Api {
  demo: boolean;
  getState(code: string): Promise<ParticipantState>;
  giveConsent(code: string): Promise<ParticipantState>;
  submitScreening(code: string, data: Record<string, unknown>): Promise<ParticipantState>;
  startSession(code: string, session: number, device: Record<string, unknown>): Promise<ParticipantState>;
  logEvents(code: string, events: LogEvent[]): Promise<void>;
  /** Envío "a prueba de cierre de pestaña" (fetch keepalive). */
  logEventsBeacon(code: string, events: LogEvent[]): void;
  saveTaskResult(code: string, r: TaskResult): Promise<void>;
  saveQuestionnaire(code: string, q: QuestionnaireData): Promise<void>;
  finishSession(code: string, session: number): Promise<ParticipantState>;
  getAdaptedMenu(code: string): Promise<AdaptedMenu | null>;
}

export class ApiError extends Error {
  constructor(public code: string) { super(code); }
}

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      const known = ['codigo_invalido', 'sin_consentimiento', 'no_elegible', 'sesion2_no_disponible', 'estudio_cerrado', 'lote_invalido'];
      const hit = known.find((k) => error.message?.includes(k));
      throw new ApiError(hit ?? 'error_red');
    }
    return data as T;
  }

  return {
    demo: false,
    getState: (code) => rpc('get_state', { p_code: code }),
    giveConsent: (code) => rpc('give_consent', { p_code: code }),
    submitScreening: (code, data) => rpc('submit_screening', { p_code: code, p_data: data }),
    startSession: (code, session, device) => rpc('start_session', { p_code: code, p_session: session, p_device: device }),
    logEvents: async (code, events) => { await rpc('log_events', { p_code: code, p_events: events }); },
    logEventsBeacon: (code, events) => {
      try {
        fetch(`${url}/rest/v1/rpc/log_events`, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({ p_code: code, p_events: events }),
        });
      } catch { /* sin conexión: se pierde este lote */ }
    },
    saveTaskResult: async (code, r) => { await rpc('save_task_result', { p_code: code, p_r: r }); },
    saveQuestionnaire: async (code, q) => { await rpc('save_questionnaire', { p_code: code, p_q: q }); },
    finishSession: (code, session) => rpc('finish_session', { p_code: code, p_session: session }),
    getAdaptedMenu: (code) => rpc('get_adapted_menu', { p_code: code }),
  };
}

export const api: Api = URL_ && KEY ? createSupabaseApi(URL_, KEY) : createDemoApi();
