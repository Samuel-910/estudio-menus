export type Condition = 'static' | 'adapted';
export type RoleKey = 'Ventas' | 'Compras' | 'Almacen' | 'Administrador';

export interface StudyConfig {
  tasks_per_block: number;
  practice_tasks: number;
  blocks_session1: number;
  min_days_between_sessions: number;
}

export interface ParticipantState {
  pid: string;
  consent: boolean;
  screened: boolean;
  eligible: boolean | null;
  role: RoleKey | null;
  order_group: 'SA' | 'AS' | null;
  session1_done: boolean;
  session2_done: boolean;
  adapted_menu_ready: boolean;
  session2_available_at: string | null;
  session2_open: boolean;
  study_open: boolean;
  config: StudyConfig;
}

/** Menú adaptado en formato compacto: rutas ordenadas. */
export interface AdaptedMenu {
  bar?: string[];
  groups?: { id: string; items: string[] }[];
}

export interface LogEvent {
  session_no: number;
  block_no: number | null;
  condition: Condition | null;
  task_index: number | null;
  event_type: string;
  route?: string | null;
  from_route?: string | null;
  ts_client: string;
  payload?: Record<string, unknown>;
}

export interface TaskResult {
  session_no: number;
  block_no: number;
  condition: Condition;
  task_index: number;
  target_route: string;
  practice: boolean;
  clicks: number;
  wrong_visits: number;
  wrong_confirms: number;
  duration_ms: number;
  completed: boolean;
}

export interface QuestionnaireData {
  session_no: number;
  block_no: number | null;
  condition: Condition | null;
  kind: 'sus' | 'satisfaction' | 'open' | 'final' | 'session1_feedback';
  answers: Record<string, unknown>;
}
