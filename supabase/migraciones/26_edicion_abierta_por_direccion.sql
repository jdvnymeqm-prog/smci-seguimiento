-- 26. «Edición abierta» temporal por dirección (p. ej. DICI durante su reorganización).
--     Mientras está activa, todo el personal y los jefes de esa dirección ven y pueden proponer cambios
--     en los proyectos de todas sus unidades (incluido cambiar responsables). Las propuestas siguen
--     pasando por validación (jefe de la unidad del proyecto o, si no tiene, el director).
--     Solo el administrador la activa o la desactiva; queda registrado en la bitácora de la tabla direcciones.
alter table public.direcciones
  add column if not exists edicion_abierta boolean not null default false,
  add column if not exists edicion_abierta_desde timestamptz,
  add column if not exists edicion_abierta_por text;

create or replace function public.direccion_edicion_abierta(p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select edicion_abierta from direcciones where id = p_direccion), false)
$$;
grant execute on function public.direccion_edicion_abierta(uuid) to authenticated;

create or replace function public.puede_editar_unidad(p_unidad uuid, p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and (
       p.rol = 'admin'
    or (p.rol in ('jefe', 'responsable') and p_unidad is not null and p.unidad_id = p_unidad)
    or (p.rol in ('jefe', 'responsable') and p_direccion is not null and p.direccion_id = p_direccion
        and public.direccion_edicion_abierta(p_direccion))
    or (p.rol = 'director' and p.puede_editar and p_direccion is not null and p.direccion_id = p_direccion)))
$$;

create or replace function public.puede_ver_unidad(p_unidad uuid, p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and (
       p.rol = 'admin'
    or (p.rol in ('jefe', 'responsable') and p_unidad is not null and p.unidad_id = p_unidad)
    or (p.rol in ('jefe', 'responsable') and p_unidad is null and p_direccion is not null and p.direccion_id = p_direccion)
    or (p.rol in ('jefe', 'responsable') and p_direccion is not null and p.direccion_id = p_direccion
        and public.direccion_edicion_abierta(p_direccion))
    or (p.rol = 'responsable' and p_unidad is not null and p.unidad_id is not null
        and exists (select 1 from unidades u where u.id = p_unidad and u.direccion_id = p.direccion_id)
        and not public.unidad_tiene_jefe_activo(p.unidad_id)
        and not public.unidad_tiene_jefe_activo(p_unidad))
    or (p.rol = 'director' and p_direccion is not null and p.direccion_id = p_direccion)))
  or public.es_secretaria()
$$;

-- Activar / desactivar (solo administrador)
create or replace function public.cambiar_edicion_abierta(p_direccion uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede abrir o cerrar la edición de una dirección.' using errcode = '42501'; end if;
  update direcciones set edicion_abierta = p_activa,
         edicion_abierta_desde = case when p_activa then now() end,
         edicion_abierta_por = case when p_activa then public.nombre_base() end
   where id = p_direccion;
  if not found then raise exception 'La dirección no existe.'; end if;
end $$;
revoke all on function public.cambiar_edicion_abierta(uuid, boolean) from public, anon;
grant execute on function public.cambiar_edicion_abierta(uuid, boolean) to authenticated;
