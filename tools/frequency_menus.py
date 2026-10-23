"""Menú adaptado por FRECUENCIA (solo para el piloto o como línea base).

Calcula, para cada participante que terminó la sesión 1 y aún no tiene menú,
un menú ordenado por cuántas veces abrió cada función. NO es el modelo de la
tesis: úsalo para probar el flujo completo antes de tener el pipeline listo.

Uso:
  python frequency_menus.py [--todos] [--dry-run]
"""
import argparse
import json
from collections import Counter

from _sb import select_all, upsert
from import_menus import ROUTE_GROUP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--todos", action="store_true", help="recalcular también a quienes ya tienen menú")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    parts = [p for p in select_all("participants", "select=id,pid,session1_done_at") if p["session1_done_at"]]
    have = {m["participant_id"] for m in select_all("adapted_menus", "select=participant_id")}
    rows = []
    for p in parts:
        if p["id"] in have and not a.todos:
            continue
        tr = select_all("task_results", f"select=target_route&participant_id=eq.{p['id']}&session_no=eq.1")
        freq = Counter(r["target_route"] for r in tr)
        ranked = [r for r, _ in freq.most_common()]
        gscore = Counter()
        for r, c in freq.items():
            gscore[ROUTE_GROUP.get(r)] += c
        groups = [{"id": g, "items": [r for r in ranked if ROUTE_GROUP.get(r) == g]} for g, _ in gscore.most_common() if g]
        menu = {"bar": ranked[:3], "groups": groups}
        if a.dry_run:
            print(p["pid"], json.dumps(menu, ensure_ascii=False))
        rows.append({"participant_id": p["id"], "menu": menu, "model_version": "frecuencia"})
    if rows and not a.dry_run:
        upsert("adapted_menus", rows, "participant_id")
    print(f"Menús por frecuencia: {len(rows)}")


if __name__ == "__main__":
    main()
