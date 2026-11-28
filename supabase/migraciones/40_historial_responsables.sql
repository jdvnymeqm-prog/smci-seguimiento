-- 40. Historial de responsables de cada proyecto.
--     Cada vez que cambia el responsable principal se cierra el periodo del anterior (fecha del cambio)
--     y se abre el del nuevo (desde cuándo está). Los anteriores quedan como historial en el proyecto.
--     Se carga lo ya ocurrido a partir de la bitácora (creación del proyecto y cambios de responsable_id).

create table if not exists public.responsables_historial (
  id bigserial primary key,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  persona_nombre text,
  desde timestamptz not null,
  hasta timestamptz,
  cambiado_por text,          -- quién registró la asignación (y quién la validó)
  creado_en timestamptz not null default now()
);
create index if not exists responsables_historial_proy on public.responsables_historial (proyecto_id, desde);

alter table public.responsables_historial enable row level security;
drop policy if exists lectura on public.responsables_historial;
create policy lectura on public.responsables_historial for select to authenticated using (public.puede_ver_proyecto(proyecto_id));
revoke insert, update, delete on public.responsables_historial from anon, authenticated;
grant select on public.responsables_historial to authenticated;

-- Al asignar o cambiar el responsable: se cierra el periodo vigente y se abre el nuevo
create or replace function public.trg_responsables_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id then return null; end if;
  update responsables_historial set hasta = now() where proyecto_id = new.id and hasta is null;
  if new.responsable_id is not null then
    insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por)
    values (new.id, new.responsable_id, (select nombre from personas where id = new.responsable_id), now(), public.nombre_usuario());
  end if;
  return null;
end $$;
drop trigger if exists proyectos_responsables_historial on public.proyectos;
create trigger proyectos_responsables_historial after insert or update of responsable_id on public.proyectos
  for each row execute function public.trg_responsables_historial();

-- Carga de lo ya ocurrido (solo si la tabla está vacía)
do $$
declare p record; c record; v_desde timestamptz; v_quien text; v_actual uuid; v_primero boolean;
begin
  if exists (select 1 from responsables_historial) then return; end if;
  for p in select pr.id, pr.responsable_id, pr.creado_en,
                  (select b.creado_en from bitacora b where b.tabla = 'proyectos' and b.registro_id = pr.id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_crea,
                  (select b.usuario_nombre from bitacora b where b.tabla = 'proyectos' and b.registro_id = pr.id::text and b.accion = 'crear' order by b.creado_en limit 1) as b_quien
             from proyectos pr loop
    v_desde := coalesce(p.b_crea, p.creado_en, now()); v_quien := p.b_quien; v_primero := true; v_actual := null;
    for c in select b.valor_anterior, b.valor_nuevo, b.creado_en, b.usuario_nombre from bitacora b
              where b.tabla = 'proyectos' and b.registro_id = p.id::text and b.campo = 'responsable_id' order by b.creado_en, b.id loop
      if v_primero and c.valor_anterior is not null then
        insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, hasta, cambiado_por)
        values (p.id, c.valor_anterior::uuid, (select nombre from personas where id = c.valor_anterior::uuid), v_desde, c.creado_en, v_quien);
      else
        update responsables_historial set hasta = c.creado_en where proyecto_id = p.id and hasta is null;
      end if;
      v_primero := false;
      if c.valor_nuevo is not null then
        insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por)
        values (p.id, c.valor_nuevo::uuid, (select nombre from personas where id = c.valor_nuevo::uuid), c.creado_en, c.usuario_nombre);
      end if;
      v_actual := c.valor_nuevo::uuid;
    end loop;
    if v_primero and p.responsable_id is not null then
      insert into responsables_historial (proyecto_id, persona_id, persona_nombre, desde, cambiado_por)
      values (p.id, p.responsable_id, (select nombre from personas where id = p.responsable_id), v_desde, v_quien);
    end if;
  end loop;
end $$;
