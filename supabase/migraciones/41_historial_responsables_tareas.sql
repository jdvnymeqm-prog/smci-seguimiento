-- 41. Historial de responsables también en las tareas.
--     Misma tabla responsables_historial: tarea_id vacío = responsable del proyecto; con tarea_id = responsable de la tarea.
--     Cada cambio cierra el periodo del anterior (fecha del cambio) y abre el del nuevo. Carga inicial desde la bitácora.

alter table public.responsables_historial add column if not exists tarea_id uuid references public.tareas(id) on delete cascade;
create index if not exists responsables_historial_tarea on public.responsables_historial (tarea_id, desde);

-- El historial del proyecto solo mira las filas sin tarea
create or replace function public.trg_responsables_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id then return null; end if;
  update responsables_historial set hasta = now() where proyecto_id = new.id and tarea_id is null and hasta is null;
  if new.responsable_id is not null then
    insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por)
    values (new.id, new.responsable_id, (select nombre from personas where id = new.responsable_id), now(), public.nombre_usuario());
  end if;
  return null;
end $$;

create or replace function public.trg_responsables_historial_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id then return null; end if;
  update responsables_historial set hasta = now() where tarea_id = new.id and hasta is null;
  if new.responsable_id is not null then
    insert into responsables_historial (proyecto_id, tarea_id, persona_id, persona_nombre, desde, cambiado_por)
    values (new.proyecto_id, new.id, new.responsable_id, (select nombre from personas where id = new.responsable_id), now(), public.nombre_usuario());
  end if;
  return null;
end $$;
drop trigger if exists tareas_responsables_historial on public.tareas;
create trigger tareas_responsables_historial after insert or update of responsable_id on public.tareas
  for each row execute function public.trg_responsables_historial_tarea();
revoke all on function public.trg_responsables_historial_tarea() from public, anon, authenticated;

-- Carga de lo ya ocurrido en las tareas (solo si aún no hay filas de tareas)
do $$
declare t record; c record; v_desde timestamptz; v_quien text; v_primero boolean;
begin
  if exists (select 1 from responsables_historial where tarea_id is not null) then return; end if;
  for t in select ta.id, ta.proyecto_id, ta.responsable_id, ta.creado_en,
                  (select b.creado_en from bitacora b where b.tabla = 'tareas' and b.registro_id = ta.id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_crea,
                  (select b.usuario_nombre from bitacora b where b.tabla = 'tareas' and b.registro_id = ta.id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_quien
             from tareas ta loop
    v_desde := coalesce(t.b_crea, t.creado_en, now()); v_quien := t.b_quien; v_primero := true;
    for c in select b.valor_anterior, b.valor_nuevo, b.creado_en, b.usuario_nombre from bitacora b
              where b.tabla = 'tareas' and b.registro_id = t.id::text and b.campo = 'responsable_id' order by b.creado_en, b.id loop
      if v_primero and c.valor_anterior is not null then
        insert into responsables_historial (proyecto_id, tarea_id, persona_id, persona_nombre, desde, hasta, cambiado_por)
        values (t.proyecto_id, t.id, c.valor_anterior::uuid, (select nombre from personas where id = c.valor_anterior::uuid), v_desde, c.creado_en, v_quien);
      else
        update responsables_historial set hasta = c.creado_en where tarea_id = t.id and hasta is null;
      end if;
      v_primero := false;
      if c.valor_nuevo is not null then
        insert into responsables_historial (proyecto_id, tarea_id, persona_id, persona_nombre, desde, cambiado_por)
        values (t.proyecto_id, t.id, c.valor_nuevo::uuid, (select nombre from personas where id = c.valor_nuevo::uuid), c.creado_en, c.usuario_nombre);
      end if;
    end loop;
    if v_primero and t.responsable_id is not null then
      insert into responsables_historial (proyecto_id, tarea_id, persona_id, persona_nombre, desde, cambiado_por)
      values (t.proyecto_id, t.id, t.responsable_id, (select nombre from personas where id = t.responsable_id), v_desde, v_quien);
    end if;
  end loop;
end $$;

-- Si una tarea pasa a otro proyecto (unión de proyectos), su historial la acompaña
create or replace function public.trg_responsables_historial_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.proyecto_id is distinct from old.proyecto_id then
    update responsables_historial set proyecto_id = new.proyecto_id where tarea_id = new.id;
  end if;
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id then return null; end if;
  update responsables_historial set hasta = now() where tarea_id = new.id and hasta is null;
  if new.responsable_id is not null then
    insert into responsables_historial (proyecto_id, tarea_id, persona_id, persona_nombre, desde, cambiado_por)
    values (new.proyecto_id, new.id, new.responsable_id, (select nombre from personas where id = new.responsable_id), now(), public.nombre_usuario());
  end if;
  return null;
end $$;
drop trigger if exists tareas_responsables_historial on public.tareas;
create trigger tareas_responsables_historial after insert or update of responsable_id, proyecto_id on public.tareas
  for each row execute function public.trg_responsables_historial_tarea();
