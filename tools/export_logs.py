"""Exporta los datos del estudio desde Supabase.

Genera en la carpeta de salida (por defecto ./export):
  logs_navegacion.ndjson  eventos de navegación en el formato de entrada del OE1
  eventos.csv             todos los eventos crudos
  task_results.csv        una fila por tarea (clics, errores, tiempo)
  cuestionarios.csv       respuestas (SUS con puntaje, satisfacción, final...)
  participantes.csv       pid, rol, orden, nivel de experiencia, datos demográficos

Los archivos usan solo el pid (P001...), nunca el código secreto del enlace.

Uso:
  python export_logs.py [carpeta_salida] [--sesion 1]
"""
import argparse
import csv
import json
from pathlib import Path

from _sb import select_all


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default="export")
    ap.add_argument("--sesion", type=int, choices=[1, 2], help="exportar solo esa sesión")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    parts = select_all("participants", "select=id,pid,role,order_group,experience_level,eligible,screening,"
                                       "consent_at,session1_done_at,session2_done_at&order=pid")
    by_id = {p["id"]: p for p in parts}
    sfilter = f"&session_no=eq.{a.sesion}" if a.sesion else ""

    # participantes
    with open(out / "participantes.csv", "w", newline="", encoding="utf-8") as f:
        demo_keys = ["age_range", "gender", "education", "occupation", "computer_freq", "mgmt_software_experience"]
        w = csv.writer(f)
        w.writerow(["pid", "role", "order_group", "experience_level", "eligible", "consent_at",
                    "session1_done_at", "session2_done_at", *demo_keys])
        for p in parts:
            s = p.get("screening") or {}
            w.writerow([p["pid"], p["role"], p["order_group"], p["experience_level"], p["eligible"], p["consent_at"],
                        p["session1_done_at"], p["session2_done_at"], *[s.get(k) for k in demo_keys]])

    # eventos
    events = select_all("events", "select=*&order=participant_id,id" + sfilter)
    with open(out / "eventos.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["pid", "session_no", "block_no", "condition", "task_index", "event_type", "route",
                    "from_route", "ts_client", "ts_server", "payload"])
        for e in events:
            p = by_id.get(e["participant_id"], {})
            w.writerow([p.get("pid"), e["session_no"], e["block_no"], e["condition"], e["task_index"], e["event_type"],
                        e["route"], e["from_route"], e["ts_client"], e["ts_server"],
                        json.dumps(e["payload"], ensure_ascii=False) if e["payload"] else ""])

    # NDJSON para el pipeline (OE1): solo navegaciones reales a funciones
    n = 0
    with open(out / "logs_navegacion.ndjson", "w", encoding="utf-8") as f:
        for e in events:
            if e["event_type"] != "nav" or not e["route"]:
                continue
            p = by_id.get(e["participant_id"], {})
            rec = {
                "timestamp": e["ts_client"] or e["ts_server"],
                "user_id": p.get("pid"),
                "role": p.get("role"),
                "session_id": f'{p.get("pid")}-S{e["session_no"]}-B{e["block_no"]}',
                "route": "/" + e["route"].lstrip("/"),
                "from_route": ("/" + e["from_route"].lstrip("/")) if e["from_route"] else None,
                "elemento_texto": (e["payload"] or {}).get("source", "menu"),
                "tipo_evento": "clic_navegacion",
                "condition": e["condition"],
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1

    # resultados por tarea
    tr = select_all("task_results", "select=*&order=participant_id,session_no,block_no,task_index" + sfilter)
    cols = ["session_no", "block_no", "condition", "task_index", "target_route", "practice", "clicks",
            "wrong_visits", "wrong_confirms", "duration_ms", "completed", "created_at"]
    with open(out / "task_results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["pid", *cols])
        for r in tr:
            w.writerow([by_id.get(r["participant_id"], {}).get("pid"), *[r[c] for c in cols]])

    # cuestionarios
    qs = select_all("questionnaires", "select=*&order=participant_id,session_no,block_no" + sfilter)
    with open(out / "cuestionarios.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["pid", "session_no", "block_no", "condition", "kind", "score", "answers"])
        for q in qs:
            ans = q["answers"] or {}
            w.writerow([by_id.get(q["participant_id"], {}).get("pid"), q["session_no"], q["block_no"], q["condition"],
                        q["kind"], ans.get("score", ""), json.dumps(ans, ensure_ascii=False)])

    print(f"Participantes: {len(parts)} | eventos: {len(events)} | navegaciones (NDJSON): {n} | "
          f"tareas: {len(tr)} | cuestionarios: {len(qs)}  ->  {out.resolve()}")


if __name__ == "__main__":
    main()
