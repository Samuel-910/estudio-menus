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


def _unicos(rutas):
    """Quita repetidos conservando el orden."""
    return list(dict.fromkeys(rutas))


def to_compact(entry, bar_size=3):
    if "groups" in entry:  # ya viene en formato compacto
        bar = _unicos(norm(r) for r in entry.get("bar", []))
        juntos = {}  # grupos repetidos se juntan en orden (igual que la app)
        for g in entry["groups"]:
            juntos.setdefault(g["id"], []).extend(norm(r) for r in g["items"])
        groups = [{"id": gid, "items": _unicos(it)} for gid, it in juntos.items()]
        return {"bar": bar[:bar_size], "groups": groups}

    groups, scored, bar_oe3 = {}, {}, []
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
                    scored[r] = max(scored.get(r, 0.0), float(n.get("score", 0) or 0))

        for c in g.get("children", []):
            walk(c)
        # La barra de sugerencias del OE3 NO es un grupo del menú: sus rutas ya
        # están en sus grupos reales. Tratarla como grupo duplicaba la barra y
        # creaba un grupo falso (p. ej. dos "g3") que desordenaba Reportes.
        if g.get("tipo") == "BARRA_SMART" or g.get("id") == 999:
            bar_oe3 = items
            continue
        for r in items:
            gid = ROUTE_GROUP[r]  # el id se deduce de las rutas (evita desajustes de numeración)
            groups.setdefault(gid, [])
            if r not in groups[gid]:
                groups[gid].append(r)

    if bar_oe3:
        bar = _unicos(bar_oe3)
    else:  # sin barra explícita: las rutas con mayor score
        bar = [r for r, s in sorted(scored.items(), key=lambda x: -x[1]) if s > 0]
    return {"bar": bar[:bar_size], "groups": [{"id": gid, "items": it} for gid, it in groups.items()]}


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
