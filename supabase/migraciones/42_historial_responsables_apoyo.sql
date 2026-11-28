-- 42. Historial de los responsables de apoyo de cada proyecto.
--     Misma tabla responsables_historial con tipo = 'apoyo' (el responsable principal queda con tipo = 'principal').
--     Al quitar un apoyo se cierra su periodo (fecha del cambio); al agregarlo se abre uno nuevo.
--     La validación reemplaza la lista completa (borra e inserta): quien sigue en la lista no se corta.
--     Carga inicial: cambios de apoyo de las propuestas validadas y, para el resto, desde la creación del proyecto.

alter table public.responsables_historial add column if not exists tipo text not null default 'principal';
alter table public.responsables_historial drop constraint if exists responsables_historial_tipo;
alter table public.responsables_historial add constraint responsables_historial_tipo check (tipo in ('principal', 'apoyo'));

create or replace function public.trg_responsables_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id then return null; end if;
  update responsables_historial set hasta = now()
   where proyecto_id = new.id and tarea_id is null and tipo = 'principal' and hasta is null;
  if new.responsable_id is not null then
    insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por)
    values (new.id, new.responsable_id, (select nombre from personas where id = new.responsable_id), now(), public.nombre_usuario());
  end if;
  return null;
end $$;

create or replace function public.trg_responsables_historial_apoyo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update responsables_historial set hasta = now()
     where proyecto_id = old.proyecto_id and persona_id = old.persona_id and tipo = 'apoyo' and hasta is null;
    return null;
  end if;
  -- Borrado y vuelto a insertar en la misma operación: sigue siendo apoyo sin interrupción
  update responsables_historial set hasta = null
   where id = (select id from responsables_historial where proyecto_id = new.proyecto_id and persona_id = new.persona_id
                 and tipo = 'apoyo' and hasta = now() order by desde desc limit 1);
  if not found and not exists (select 1 from responsables_historial where proyecto_id = new.proyecto_id and persona_id = new.persona_id
                                  and tipo = 'apoyo' and hasta is null) then
    insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por, tipo)
    values (new.proyecto_id, new.persona_id, (select nombre from personas where id = new.persona_id), now(), public.nombre_usuario(), 'apoyo');
  end if;
  return null;
end $$;
drop trigger if exists apoyos_responsables_historial on public.proyecto_apoyos;
create trigger apoyos_responsables_historial after insert or delete on public.proyecto_apoyos
  for each row execute function public.trg_responsables_historial_apoyo();
revoke all on function public.trg_responsables_historial_apoyo() from public, anon, authenticated;

-- Carga inicial
do $$
declare m record; v_prev uuid[]; v_new uuid[]; v_proy uuid; x uuid; v_quien text; p record;
begin
  if exists (select 1 from responsables_historial where tipo = 'apoyo') then return; end if;
  v_proy := null;
  for m in select pr.proyecto_id, pr.revisado_en, pr.creado_por_nombre, pr.revisado_por_nombre,
                  array(select jsonb_array_elements_text(pr.datos -> 'apoyos')::uuid) as lista
             from propuestas pr where pr.estado = 'validada' and pr.datos ? 'apoyos' and pr.proyecto_id is not null
            order by pr.proyecto_id, pr.revisado_en, pr.id loop
    if v_proy is distinct from m.proyecto_id then v_prev := '{}'; v_proy := m.proyecto_id; end if;
    v_new := m.lista;
    v_quien := m.creado_por_nombre || case when m.revisado_por_nombre is distinct from m.creado_por_nombre then ' (validó ' || m.revisado_por_nombre || ')' else '' end;
    foreach x in array v_prev loop
      if not x = any(v_new) then
        update responsables_historial set hasta = m.revisado_en where proyecto_id = m.proyecto_id and persona_id = x and tipo = 'apoyo' and hasta is null;
      end if;
    end loop;
    foreach x in array v_new loop
      if not x = any(v_prev) then
        insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por, tipo)
        values (m.proyecto_id, x, (select nombre from personas where id = x), m.revisado_en, v_quien, 'apoyo');
      end if;
    end loop;
    v_prev := v_new;
  end loop;
  -- Apoyos actuales que no vinieron de una propuesta: desde la creación del proyecto
  for p in select a.proyecto_id, a.persona_id, pr.creado_en,
                  (select b.creado_en from bitacora b where b.tabla = 'proyectos' and b.registro_id = a.proyecto_id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_crea,
                  (select b.usuario_nombre from bitacora b where b.tabla = 'proyectos' and b.registro_id = a.proyecto_id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_quien
             from proyecto_apoyos a join proyectos pr on pr.id = a.proyecto_id
            where not exists (select 1 from responsables_historial h where h.proyecto_id = a.proyecto_id and h.persona_id = a.persona_id and h.tipo = 'apoyo' and h.hasta is null) loop
    insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por, tipo)
    values (p.proyecto_id, p.persona_id, (select nombre from personas where id = p.persona_id), coalesce(p.b_crea, p.creado_en, now()), p.b_quien, 'apoyo');
  end loop;
  -- Abiertos que ya no son apoyo (quitados fuera de una propuesta): se cierran hoy
  update responsables_historial h set hasta = now()
   where h.tipo = 'apoyo' and h.hasta is null
     and not exists (select 1 from proyecto_apoyos a where a.proyecto_id = h.proyecto_id and a.persona_id = h.persona_id);
end $$;
