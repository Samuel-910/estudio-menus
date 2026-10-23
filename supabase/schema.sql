-- =====================================================================
-- Estudio de menús adaptativos -- esquema de Supabase
-- ---------------------------------------------------------------------
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run.
-- Seguridad: todas las tablas tienen RLS activado y NINGUNA política,
-- así que el navegador (clave anon) no puede leerlas ni escribirlas
-- directamente. El navegador solo puede llamar a las funciones RPC
-- marcadas como "PÚBLICA", que validan el código de invitación.
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

create table if not exists public.config (
  key   text primary key,
  value text not null
);

insert into public.config (key, value) values
  ('min_days_between_sessions', '2'),   -- días mínimos entre sesión 1 y 2
  ('tasks_per_block',           '20'),  -- tareas por bloque
  ('practice_tasks',            '3'),   -- primeras tareas del bloque 1 de la sesión 1 = práctica
  ('blocks_session1',           '2'),   -- bloques de la sesión 1 (menú estático)
  ('study_open',                'true') -- poner 'false' para cerrar el estudio
on conflict (key) do nothing;

create table if not exists public.participants (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,            -- secreto: va en el enlace
  pid              text not null unique,            -- público: P001, P002... (para exportar)
  created_at       timestamptz not null default now(),
  consent_at       timestamptz,
  screening        jsonb,
  eligible         boolean,
  experience_level text,                            -- ninguna | basica | frecuente
  role             text,                            -- Ventas | Compras | Almacen | Administrador
  order_group      text,                            -- SA (estático primero) | AS (adaptado primero)
  session1_started_at timestamptz,
  session1_done_at timestamptz,
  session2_started_at timestamptz,
  session2_done_at timestamptz,
  notes            text
);

create table if not exists public.sessions (
  id             bigserial primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_no     int  not null check (session_no in (1,2)),
  started_at     timestamptz not null default now(),
  device         jsonb
);

create table if not exists public.events (
  id             bigserial primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_no     int,
  block_no       int,
  condition      text,          -- static | adapted
  task_index     int,
  event_type     text not null,
  route          text,
  from_route     text,
  ts_client      timestamptz,
  ts_server      timestamptz not null default now(),
  payload        jsonb
);
create index if not exists events_participant_idx on public.events (participant_id, session_no, block_no);

create table if not exists public.task_results (
  id             bigserial primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_no     int  not null,
  block_no       int  not null,
  condition      text not null,
  task_index     int  not null,
  target_route   text not null,
  practice       boolean not null,
  clicks         int,           -- clics en el menú hasta abrir la función objetivo
  wrong_visits   int,           -- funciones equivocadas abiertas
  wrong_confirms int,           -- "Confirmar" pulsado en una función equivocada
  duration_ms    int,
  completed      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (participant_id, session_no, block_no, task_index)
);

create table if not exists public.questionnaires (
  id             bigserial primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_no     int  not null,
  block_no       int,
  condition      text,
  kind           text not null, -- sus | satisfaction | open | final | session1_feedback
  answers        jsonb not null,
  created_at     timestamptz not null default now(),
  unique (participant_id, session_no, block_no, kind)
);

-- Menú adaptado de cada participante (lo sube el equipo con tools/import_menus.py)
-- Formato: {"bar": ["ruta", ...], "groups": [{"id": "g5", "items": ["ruta", ...]}, ...]}
create table if not exists public.adapted_menus (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  menu           jsonb not null,
  model_version  text,
  created_at     timestamptz not null default now()
);

alter table public.config         enable row level security;
alter table public.participants   enable row level security;
alter table public.sessions       enable row level security;
alter table public.events         enable row level security;
alter table public.task_results   enable row level security;
alter table public.questionnaires enable row level security;
alter table public.adapted_menus  enable row level security;

-- ---------- Funciones internas ----------------------------------------

create or replace function public._cfg(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.config where key = p_key), p_default);
$$;

create or replace function public._participant(p_code text)
returns public.participants language plpgsql stable security definer set search_path = public as $$
declare v public.participants;
begin
  select * into v from public.participants where code = upper(trim(p_code));
  if not found then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ---------- Funciones PÚBLICAS (llamadas desde el navegador) ----------

-- PÚBLICA: estado del participante y configuración del estudio
create or replace function public.get_state(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.participants;
  v_min_days int := public._cfg('min_days_between_sessions','2')::int;
  v_has_menu boolean;
  v_available_at timestamptz;
begin
  v := public._participant(p_code);
  select exists(select 1 from public.adapted_menus where participant_id = v.id) into v_has_menu;
  v_available_at := v.session1_done_at + make_interval(days => v_min_days);
  return jsonb_build_object(
    'pid', v.pid,
    'consent', v.consent_at is not null,
    'screened', v.screening is not null,
    'eligible', v.eligible,
    'role', v.role,
    'order_group', v.order_group,
    'session1_done', v.session1_done_at is not null,
    'session2_done', v.session2_done_at is not null,
    'adapted_menu_ready', v_has_menu,
    'session2_available_at', v_available_at,
    'session2_open', (v.session1_done_at is not null and now() >= v_available_at and v_has_menu),
    'study_open', public._cfg('study_open','true')::boolean,
    'config', jsonb_build_object(
       'tasks_per_block', public._cfg('tasks_per_block','20')::int,
       'practice_tasks',  public._cfg('practice_tasks','3')::int,
       'blocks_session1', public._cfg('blocks_session1','2')::int,
       'min_days_between_sessions', v_min_days)
  );
end $$;

-- PÚBLICA: registrar consentimiento
create or replace function public.give_consent(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.participants;
begin
  v := public._participant(p_code);
  update public.participants set consent_at = coalesce(consent_at, now()) where id = v.id;
  return public.get_state(p_code);
end $$;

-- PÚBLICA: cuestionario inicial + criterios de inclusión + asignación equilibrada
create or replace function public.submit_screening(p_code text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.participants;
  v_eligible boolean;
  v_level text;
  v_role text;
  v_order text;
begin
  v := public._participant(p_code);
  if v.consent_at is null then
    raise exception 'sin_consentimiento' using errcode = 'P0001';
  end if;
  if v.screening is not null then
    return public.get_state(p_code);          -- ya respondido: no reasignar
  end if;

  v_eligible := coalesce((p_data->>'adult')::boolean, false)
            and coalesce((p_data->>'regular_computer_use')::boolean, false)
            and not coalesce((p_data->>'used_this_erp')::boolean, true);
  v_level := coalesce(nullif(p_data->>'mgmt_software_experience',''), 'ninguna');

  if v_eligible then
    -- Celda (rol x orden) con menos participantes dentro del mismo nivel de
    -- experiencia; los empates se rompen al azar (aleatorización por bloques).
    with cells as (
      select r.role, o.ord
      from unnest(array['Ventas','Compras','Almacen','Administrador']) as r(role)
      cross join unnest(array['SA','AS']) as o(ord)
    ), counts as (
      select c.role, c.ord,
             (select count(*) from public.participants p
               where p.eligible and p.role = c.role and p.order_group = c.ord
                 and p.experience_level = v_level) as n_level,
             (select count(*) from public.participants p
               where p.eligible and p.role = c.role and p.order_group = c.ord) as n_total
      from cells c
    )
    select role, ord into v_role, v_order
    from counts order by n_level, n_total, random() limit 1;
  end if;

  update public.participants
     set screening = p_data, eligible = v_eligible, experience_level = v_level,
         role = v_role, order_group = v_order
   where id = v.id;
  return public.get_state(p_code);
end $$;

-- PÚBLICA: inicio de sesión (1 o 2)
create or replace function public.start_session(p_code text, p_session int, p_device jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.participants; v_state jsonb;
begin
  v := public._participant(p_code);
  v_state := public.get_state(p_code);
  if not (v_state->>'study_open')::boolean then
    raise exception 'estudio_cerrado' using errcode = 'P0001';
  end if;
  if v.eligible is not true or v.role is null then
    raise exception 'no_elegible' using errcode = 'P0001';
  end if;
  if p_session = 2 and not (v_state->>'session2_open')::boolean then
    raise exception 'sesion2_no_disponible' using errcode = 'P0001';
  end if;
  insert into public.sessions (participant_id, session_no, device) values (v.id, p_session, p_device);
  if p_session = 1 then
    update public.participants set session1_started_at = coalesce(session1_started_at, now()) where id = v.id;
  else
    update public.participants set session2_started_at = coalesce(session2_started_at, now()) where id = v.id;
  end if;
  return v_state;
end $$;

-- PÚBLICA: registrar eventos en lote (máximo 500 por llamada)
create or replace function public.log_events(p_code text, p_events jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v public.participants; n int;
begin
  v := public._participant(p_code);
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 500 then
    raise exception 'lote_invalido' using errcode = 'P0001';
  end if;
  insert into public.events (participant_id, session_no, block_no, condition, task_index,
                             event_type, route, from_route, ts_client, payload)
  select v.id,
         (e->>'session_no')::int, (e->>'block_no')::int, e->>'condition',
         (e->>'task_index')::int, left(e->>'event_type', 40),
         left(e->>'route', 120), left(e->>'from_route', 120),
         (e->>'ts_client')::timestamptz, e->'payload'
  from jsonb_array_elements(p_events) as e;
  get diagnostics n = row_count;
  return n;
end $$;

-- PÚBLICA: resultado de una tarea
create or replace function public.save_task_result(p_code text, p_r jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v public.participants;
begin
  v := public._participant(p_code);
  insert into public.task_results (participant_id, session_no, block_no, condition, task_index,
         target_route, practice, clicks, wrong_visits, wrong_confirms, duration_ms, completed)
  values (v.id, (p_r->>'session_no')::int, (p_r->>'block_no')::int, p_r->>'condition',
          (p_r->>'task_index')::int, p_r->>'target_route', (p_r->>'practice')::boolean,
          (p_r->>'clicks')::int, (p_r->>'wrong_visits')::int, (p_r->>'wrong_confirms')::int,
          (p_r->>'duration_ms')::int, coalesce((p_r->>'completed')::boolean, true))
  on conflict (participant_id, session_no, block_no, task_index) do nothing;
end $$;

-- PÚBLICA: cuestionarios (SUS, satisfacción, preguntas abiertas, preferencia final)
create or replace function public.save_questionnaire(p_code text, p_q jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v public.participants;
begin
  v := public._participant(p_code);
  insert into public.questionnaires (participant_id, session_no, block_no, condition, kind, answers)
  values (v.id, (p_q->>'session_no')::int, (p_q->>'block_no')::int, p_q->>'condition',
          p_q->>'kind', p_q->'answers')
  on conflict (participant_id, session_no, block_no, kind) do update set answers = excluded.answers;
end $$;

-- PÚBLICA: fin de sesión
create or replace function public.finish_session(p_code text, p_session int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.participants;
begin
  v := public._participant(p_code);
  if p_session = 1 then
    update public.participants set session1_done_at = coalesce(session1_done_at, now()) where id = v.id;
  elsif p_session = 2 then
    update public.participants set session2_done_at = coalesce(session2_done_at, now()) where id = v.id;
  end if;
  return public.get_state(p_code);
end $$;

-- PÚBLICA: menú adaptado del participante (solo cuando la sesión 2 está abierta)
create or replace function public.get_adapted_menu(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.participants; v_menu jsonb;
begin
  v := public._participant(p_code);
  if v.session1_done_at is null then
    raise exception 'sesion2_no_disponible' using errcode = 'P0001';
  end if;
  select menu into v_menu from public.adapted_menus where participant_id = v.id;
  return v_menu;
end $$;

-- ---------- Funciones de ADMINISTRACIÓN (solo SQL Editor) -------------

-- Crea N códigos de invitación y devuelve los enlaces.
-- Uso: select * from public.create_invites(10, 'https://tu-app.vercel.app');
create or replace function public.create_invites(p_n int, p_base_url text default '')
returns table (pid text, code text, link text)
language plpgsql security definer set search_path = public as $$
declare i int; v_code text; v_pid text; v_next int;
begin
  for i in 1..p_n loop
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.participants p where p.code = v_code);
    end loop;
    select coalesce(max(substr(p.pid, 2)::int), 0) + 1 into v_next from public.participants p;
    v_pid := 'P' || lpad(v_next::text, 3, '0');
    insert into public.participants (code, pid) values (v_code, v_pid);
    pid := v_pid; code := v_code;
    link := case when p_base_url = '' then '' else rtrim(p_base_url, '/') || '/?c=' || v_code end;
    return next;
  end loop;
end $$;

-- Vista de avance del estudio (consultar desde el SQL Editor)
create or replace view public.v_progress as
select p.pid, p.created_at, p.consent_at is not null as consent, p.eligible,
       p.experience_level, p.role, p.order_group,
       p.session1_done_at, p.session2_done_at,
       exists(select 1 from public.adapted_menus m where m.participant_id = p.id) as adapted_menu_ready,
       (select count(*) from public.task_results t where t.participant_id = p.id) as tasks_done
from public.participants p
order by p.pid;

-- Vista de balance de la asignación
create or replace view public.v_balance as
select experience_level, role, order_group, count(*) as n
from public.participants where eligible
group by 1,2,3 order by 1,2,3;

-- ---------- Permisos --------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke select on public.v_progress, public.v_balance from anon, authenticated;

grant execute on function public.get_state(text)                 to anon, authenticated;
grant execute on function public.give_consent(text)              to anon, authenticated;
grant execute on function public.submit_screening(text, jsonb)   to anon, authenticated;
grant execute on function public.start_session(text, int, jsonb) to anon, authenticated;
grant execute on function public.log_events(text, jsonb)         to anon, authenticated;
grant execute on function public.save_task_result(text, jsonb)   to anon, authenticated;
grant execute on function public.save_questionnaire(text, jsonb) to anon, authenticated;
grant execute on function public.finish_session(text, int)       to anon, authenticated;
grant execute on function public.get_adapted_menu(text)          to anon, authenticated;
-- create_invites, _cfg y _participant NO se exponen: solo el SQL Editor (rol postgres)
-- y la clave service_role (scripts de tools/) pueden usarlas.
