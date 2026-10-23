# App del estudio con participantes: menú estático vs. menú adaptado

App web ligera (Vite + React + TypeScript) con backend en **Supabase**. Se publica en **Vercel**.
Reemplaza al ERP completo (Angular + Spring Boot) solo para el estudio: reproduce el menú del ERP
con sus 9 grupos y 60 funciones, registra cada clic y aplica el menú personalizado que genera el modelo (LSTM + DQN).

```
estudio-menus/
├── app/                 ← lo que se sube a Vercel
│   ├── src/data/catalog.json   menú, roles y tareas (ÚNICA fuente de rutas)
│   ├── src/data/texts.ts       consentimiento, preguntas, SUS (editar aquí)
│   └── ...
├── supabase/schema.sql  ← se ejecuta una vez en Supabase
└── tools/               ← scripts de Python (solo en tu PC, con la clave service_role)
```

## 1. Probarla en tu PC (modo demo, sin Supabase)

```bash
cd app
npm install
npm run dev        # abre http://localhost:5173/?c=PRUEBA1
```

Sin variables de entorno la app entra en **modo demo**: guarda todo en el navegador, usa 8 tareas
por bloque y arma el menú adaptado por frecuencia apenas terminas la sesión 1. Hay una franja
amarilla con el enlace «Reiniciar demo».

## 2. Configurar Supabase

1. Crea un proyecto en <https://supabase.com> (plan gratuito).
2. **SQL Editor → New query** → pega todo `supabase/schema.sql` → **Run**.
3. Crea las invitaciones (cuando ya tengas la URL de Vercel):
   ```sql
   select * from public.create_invites(60, 'https://TU-APP.vercel.app');
   ```
   Copia la columna `link` a una hoja de cálculo. Cada enlace es para **una sola persona**.
4. Copia de **Project Settings → API**: la *Project URL* y la clave **anon / publishable**.

> La clave **service_role** NUNCA va en Vercel ni en GitHub: solo en tu PC para los scripts de `tools/`.
> Todas las tablas tienen RLS activado y sin políticas; el navegador solo puede llamar a 9 funciones
> que exigen el código de invitación.

Parámetros (tabla `config`, se editan con SQL):

| clave | por defecto | qué hace |
|---|---|---|
| `tasks_per_block` | 20 | tareas por bloque |
| `practice_tasks` | 3 | primeras tareas del bloque 1 de la sesión 1 = práctica |
| `blocks_session1` | 2 | bloques de la sesión 1 (siempre menú estático) |
| `min_days_between_sessions` | 2 | días mínimos entre sesión 1 y 2 |
| `study_open` | true | `false` cierra el estudio |

```sql
update public.config set value = '3' where key = 'min_days_between_sessions';
```

## 3. Publicar en Vercel

1. Sube la carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `node_modules` y `.env`).
2. En Vercel: **Add New → Project** → importa el repo → **Root Directory: `app`** (framework: Vite).
3. **Environment Variables**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = clave anon/publishable
4. **Deploy**. Si cambias variables, vuelve a desplegar (**Redeploy**).

## 4. Flujo del participante

1. Abre su enlace (`/?c=CODIGO`). Solo computadora con mouse y ventana ≥ 1024 px.
2. Consentimiento → preguntas de inclusión y datos demográficos.
   - No elegible si es menor de edad, no usa computadora con regularidad o ya conoce el ERP.
   - A los elegibles se les asigna rol (Ventas/Compras/Almacén/Administrador) y orden (SA/AS)
     de forma balanceada por nivel de experiencia (ver `v_balance`).
3. **Sesión 1** (menú estático): instrucciones, 2 bloques de 20 tareas, comentario breve.
   Cada tarea: «Abre ‹función› y presiona Confirmar». Las tareas siguen un perfil de uso personal
   (Zipf) que se repite en la sesión 2.
4. Espera de al menos 2 días. El equipo genera los menús (paso 5).
5. **Sesión 2**: con el **mismo enlace**. Versión A y Versión B (estático/adaptado según el orden
   asignado; el participante no sabe cuál es cuál), SUS + 3 preguntas tras cada una, y preferencia final.
6. Si cierra la pestaña, al volver retoma en la tarea donde quedó.

Seguimiento:
```sql
select * from public.v_progress;   -- quién va en qué paso
select * from public.v_balance;    -- balance rol × orden × experiencia
```

## 5. Entre sesión 1 y sesión 2 (generar menús con el modelo)

En tu PC (Python 3.9+, sin librerías extra):

```bash
cd tools
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...            # service_role (Windows: set VAR=valor)

python export_logs.py export --sesion 1        # crea export/logs_navegacion.ndjson y CSV
# → correr el pipeline (OE1–OE3) con export/logs_navegacion.ndjson
#   (user_id = pid, rutas con "/" inicial, igual que los logs simulados)
python import_menus.py ruta/a/menus_personalizados.json --modelo lstm-dqn-v1
```

- `import_menus.py` acepta la salida del OE3 (`{pid: {role, menu:[...]}}`) y la convierte al formato de la app;
  la barra de accesos rápidos son las 3 rutas con mayor score. Prueba antes con `--dry-run`.
- `build_pipeline_catalog.py` genera `erp_menu_schema.json` y `erp_config_universal.json` desde
  `catalog.json`, para que el pipeline use exactamente el mismo menú que la app.
- `frequency_menus.py` sube menús por frecuencia: **solo para el piloto** o como línea base, no es el modelo de la tesis.

La sesión 2 se habilita sola cuando el participante tiene menú **y** pasaron los días mínimos.

## 6. Al final del estudio

```bash
python export_logs.py export_final
```

| archivo | contenido |
|---|---|
| `task_results.csv` | una fila por tarea: clics hasta la función, visitas y confirmaciones erróneas, tiempo (ms), práctica |
| `cuestionarios.csv` | SUS (con puntaje 0–100), satisfacción, comentarios, preferencia final (con `version_map` A/B → condición) |
| `participantes.csv` | pid, rol, orden, experiencia y datos demográficos |
| `eventos.csv` | todos los eventos (clics, navegaciones, inactividad > 60 s, cambio de pestaña) |

Análisis sugerido: excluir las tareas de práctica, comparar por participante la mediana de clics y
de tiempo en bloque estático vs. adaptado (Wilcoxon pareado), SUS con t pareada o Wilcoxon, y revisar
el efecto del orden (SA vs. AS). Marcar las tareas con `idle_start` o `tab_hidden` para análisis de sensibilidad.

## 7. Antes de publicar: lista de verificación

- [ ] Completar los `[corchetes]` del consentimiento en `app/src/data/texts.ts` (correo, comité de ética, código).
- [ ] Reemplazar la traducción de trabajo del SUS por una versión en español validada y citarla.
- [ ] Revisar títulos de funciones y tareas por rol en `catalog.json`. Si cambias rutas, vuelve a correr
      `build_pipeline_catalog.py` y reentrena con ese catálogo.
- [ ] Piloto con 3–5 personas (con `min_days_between_sessions = 0` y `frequency_menus.py`), luego borrar:
      `delete from public.participants;` (borra en cascada eventos y resultados).
- [ ] **Cambiar la contraseña de la base de datos de Supabase del repositorio original**: está escrita en
      `ERP-INVESTIGACION/articulos-backend/src/main/resources/application-supabase.properties` y es pública en GitHub.
"# estudio-menus" 
