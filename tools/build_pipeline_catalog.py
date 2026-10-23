"""Convierte el catálogo de la app (app/src/data/catalog.json) a los archivos de
configuración del pipeline de Python, para que la app y el modelo usen
EXACTAMENTE las mismas rutas, grupos y permisos.

Genera (en la carpeta indicada, por defecto ./pipeline_config):
  erp_menu_schema.json       árbol del menú (grupos > submenús > ítems)
  erp_config_universal.json  MENU_ERP, GRUPOS_RUTAS y PERMISOS_ROL

Revisa que las claves coincidan con lo que lee tu código de implementacion/ y
ajusta los nombres si hiciera falta.

Uso:
  python build_pipeline_catalog.py [carpeta_salida]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
cat = json.loads((ROOT / "app/src/data/catalog.json").read_text(encoding="utf-8"))
out = Path(sys.argv[1] if len(sys.argv) > 1 else "pipeline_config")
out.mkdir(parents=True, exist_ok=True)

gnum = {g["id"]: i + 1 for i, g in enumerate(cat["groups"])}  # g1 -> 1 ...


def conv(n, order):
    if "route" in n:
        return {"id": n["id"], "titulo": n["title"], "ruta": "/" + n["route"], "orden_default": order}
    return {"id": n["id"], "titulo": n["title"], "orden_default": order,
            "children": [conv(c, i + 1) for i, c in enumerate(n["children"])]}


def leaves(n):
    return ["/" + n["route"]] if "route" in n else [r for c in n["children"] for r in leaves(c)]


menu = [{"id": gnum[g["id"]], "clave": g["id"], "titulo": g["title"], "orden_default": i + 1,
         "children": [conv(c, j + 1) for j, c in enumerate(g["children"])]} for i, g in enumerate(cat["groups"])]
grupos_rutas = {gnum[g["id"]]: [r for c in g["children"] for r in leaves(c)] for g in cat["groups"]}
permisos = {role: [gnum[x] for x in d["groups"]] for role, d in cat["roles"].items()}
tareas = {role: ["/" + r for r in d["tasks"]] for role, d in cat["roles"].items()}

(out / "erp_menu_schema.json").write_text(json.dumps({"version": cat.get("version"), "menu": menu}, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "erp_config_universal.json").write_text(json.dumps({
    "MENU_ERP": menu, "GRUPOS_RUTAS": grupos_rutas, "PERMISOS_ROL": permisos, "TAREAS_ROL": tareas,
}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"{sum(len(v) for v in grupos_rutas.values())} rutas, {len(menu)} grupos -> {out.resolve()}")
