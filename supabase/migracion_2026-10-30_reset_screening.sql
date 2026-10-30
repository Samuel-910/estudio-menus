-- Migración 2026-10-30: función reset_screening (desbloquear participantes excluidos por error)
-- Pegar en Supabase -> SQL Editor -> New query -> Run. Se puede ejecutar más de una vez.

-- Desbloquea a un participante excluido por error en el cuestionario inicial:
-- borra sus respuestas para que vuelva a responder con su MISMO enlace.
-- Conserva el consentimiento y guarda en `notes` las respuestas anteriores y el motivo.
-- No se puede usar si ya empezó las tareas. Si se excluyó por ser menor de edad,
-- exige p_confirmo_mayor_edad = true (solo tras verificar que sí es mayor de edad).
-- Uso: select public.reset_screening('P010', 'Confirmó por mensaje que nunca usó el sistema');
create or replace function public.reset_screening(p_pid text, p_motivo text, p_confirmo_mayor_edad boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v public.participants;
begin
  select * into v from public.participants where pid = upper(trim(p_pid));
  if not found then
    raise exception 'No existe el participante %', p_pid;
  end if;
  if v.screening is null then
    return v.pid || ': todavía no respondió el cuestionario, no hay nada que reiniciar';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del desbloqueo (queda registrado)';
  end if;
  if v.session1_started_at is not null
     or exists (select 1 from public.task_results t where t.participant_id = v.id) then
    raise exception '% ya empezó las tareas: no se reinicia para no mezclar datos', v.pid;
  end if;
  if coalesce((v.screening->>'adult')::boolean, false) = false and not p_confirmo_mayor_edad then
    raise exception '% se excluyó por ser menor de edad. Solo reinicia si verificaste que es mayor de edad (p_confirmo_mayor_edad => true)', v.pid;
  end if;

  update public.participants
     set notes = concat_ws(E'\n', notes,
                   format('[%s] reset_screening: %s | respuestas anteriores: %s',
                          to_char(now(), 'YYYY-MM-DD HH24:MI'), p_motivo, v.screening::text)),
         screening = null, eligible = null, experience_level = null, role = null, order_group = null
   where id = v.id;
  return v.pid || ': desbloqueado; al abrir su enlace volverá a ver el cuestionario inicial';
end $$;

-- Solo el investigador (SQL Editor / service_role) puede usarla; nunca el navegador.
revoke all on function public.reset_screening(text, text, boolean) from public, anon, authenticated;

-- Comprobación: debe devolver false para anon
select has_function_privilege('anon', 'public.reset_screening(text, text, boolean)', 'execute') as anon_puede_usarla;
