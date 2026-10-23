"""Cliente mínimo de la API REST de Supabase (solo biblioteca estándar).

Requiere dos variables de entorno, SOLO en tu computadora (nunca en Vercel ni en GitHub):
  SUPABASE_URL          https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  clave service_role (Project Settings > API)
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def _check():
    if not URL or not KEY:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en las variables de entorno.")


def _req(method, path, body=None, headers=None):
    _check()
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Error {e.code} en {method} {path}: {e.read().decode()}")


def select_all(table, query="select=*", page=1000):
    """Lee una tabla completa paginando de `page` en `page` filas."""
    out, offset = [], 0
    while True:
        rows = _req("GET", f"{table}?{query}&limit={page}&offset={offset}")
        out.extend(rows)
        if len(rows) < page:
            return out
        offset += page


def upsert(table, rows, on_conflict):
    return _req("POST", f"{table}?on_conflict={on_conflict}", rows,
                {"Prefer": "resolution=merge-duplicates,return=minimal"})
