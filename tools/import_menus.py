"""Sube a Supabase los menús adaptados que produce el pipeline (OE3).

Acepta el archivo menus_personalizados.json del OE3:
  { "P001": { "role": "Ventas", "menu": [ {"id": 5, "children": [ {"ruta": "/venta/venta", "score": 0.3, ...}, ... ]}, ... ] }, ... }
o directamente el formato compacto de la app:
  { "P001": { "bar": [...], "groups": [ {"id": "g5", "items": [...]} ] }, ... }

Las claves deben ser los pid (P001...) usados al exportar con export_logs.py.
La barra de accesos rápidos = las 3 rutas con mayor score (BARRA_SMART top-3).

Uso:
  python import_menus.py menus_personalizados.json [--modelo lstm-dqn-v1] [--dry-run]
"""
import argparse
import json
import sys
from pathlib import Path

from _sb import select_all, upsert

CATALOG = json.loads((Path(__file__).resolve().parent.parent / "app/src/data/catalog.json").read_text(encoding="utf-8"))


def _route_groups():
    idx = {}
    def walk(n, gid):
        if "route" in n:
            idx[n["route"]] = gid
        else:
            for c in n["children"]:
                walk(c, gid)
    for g in CATALOG["groups"]:
        for c in g["children"]:
            walk(c, g["id"])
    return idx


ROUTE_GROUP = _route_groups()
norm = lambda r: (r or "").strip().lstrip("/")


def to_compact(entry, bar_size=3):
    if "groups" in entry:  # ya viene en formato compacto
        return {"bar": entry.get("bar", [])[:bar_size], "groups": entry["groups"]}
    groups, scored = [], []
    for g in entry.get("menu", []):
        items = []
        def walk(n):
            if n.get("children"):
                for c in n["children"]:
                    walk(c)
            else:
                r = norm(n.get("ruta") or n.get("route"))
                if r in ROUTE_GROUP:
                    items.append(r)
                    scored.append((float(n.get("score", 0) or 0), r))
        for c in g.get("children", []):
            walk(c)
        if not items:
            continue
        gid = ROUTE_GROUP[items[0]]  # el id se deduce de las rutas (evita desajustes de numeración)
        groups.append({"id": gid, "items": items})
    scored.sort(key=lambda x: -x[0])
    bar = [r for s, r in scored if s > 0][:bar_size]
    return {"bar": bar, "groups": groups}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--modelo", default="lstm-dqn")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    data = json.loads(Path(a.archivo).read_text(encoding="utf-8"))

    parts = {p["pid"]: p for p in select_all("participants", "select=id,pid,role,session1_done_at")} if not a.dry_run else {}
    rows, skipped = [], []
    for pid, entry in data.items():
        menu = to_compact(entry)
        if a.dry_run:
            print(pid, json.dumps(menu, ensure_ascii=False))
            continue
        p = parts.get(pid)
        if not p:
            skipped.append(f"{pid} (no existe)")
            continue
        if not p["session1_done_at"]:
            skipped.append(f"{pid} (no terminó la sesión 1)")
            continue
        rows.append({"participant_id": p["id"], "menu": menu, "model_version": a.modelo})
    if a.dry_run:
        return
    if rows:
        upsert("adapted_menus", rows, "participant_id")
    print(f"Menús subidos: {len(rows)}")
    if skipped:
        print("Omitidos:", ", ".join(skipped), file=sys.stderr)


if __name__ == "__main__":
    main()
