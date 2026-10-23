import { api } from './api';
import type { Condition, LogEvent } from './types';

interface Ctx { session_no: number; block_no: number | null; condition: Condition | null; task_index: number | null }

/** Cola de eventos: se envía cada 5 s, al llegar a 25 eventos y al cerrar la pestaña. */
class Logger {
  private code = '';
  private queue: LogEvent[] = [];
  private timer: number | undefined;
  private ctx: Ctx = { session_no: 0, block_no: null, condition: null, task_index: null };

  init(code: string) {
    this.code = code;
    if (this.timer === undefined) {
      this.timer = window.setInterval(() => { void this.flush(); }, 5000);
      window.addEventListener('pagehide', () => this.flushBeacon());
      document.addEventListener('visibilitychange', () => {
        this.log(document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible');
        if (document.visibilityState === 'hidden') this.flushBeacon();
      });
    }
  }

  setContext(c: Partial<Ctx>) { this.ctx = { ...this.ctx, ...c }; }

  log(event_type: string, extra: { route?: string | null; from_route?: string | null; payload?: Record<string, unknown> } = {}) {
    if (!this.code || this.ctx.session_no === 0) return;
    this.queue.push({ ...this.ctx, event_type, route: extra.route ?? null, from_route: extra.from_route ?? null, payload: extra.payload, ts_client: new Date().toISOString() });
    if (this.queue.length >= 25) void this.flush();
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 500);
    try { await api.logEvents(this.code, batch); }
    catch { this.queue.unshift(...batch); } // reintento en el próximo ciclo
  }

  private flushBeacon() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 500);
    api.logEventsBeacon(this.code, batch);
  }
}

export const logger = new Logger();
