-- 25. Visibilidad por unidad:
--   · jefe y personal: ven los proyectos de su unidad (y los sin unidad de su dirección);
--   · director: ve toda su dirección;
--   · excepción (hoy DICI): si la unidad propia NO tiene jefe con cuenta activa y la otra unidad de la misma
--     dirección tampoco (el director valida ambas), su personal ve los proyectos de ambas unidades.
--     Solo ver: proponer cambios sigue limitado a la unidad propia. Cuando se cree la cuenta de un jefe,
--     su unidad vuelve a verse por separado automáticamente.
create or replace function public.puede_ver_unidad(p_unidad uuid, p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and (
       p.rol = 'admin'
    or (p.rol in ('jefe', 'responsable') and p_unidad is not null and p.unidad_id = p_unidad)
    or (p.rol in ('jefe', 'responsable') and p_unidad is null and p_direccion is not null and p.direccion_id = p_direccion)
    or (p.rol = 'responsable' and p_unidad is not null and p.unidad_id is not null
        and exists (select 1 from unidades u where u.id = p_unidad and u.direccion_id = p.direccion_id)
        and not public.unidad_tiene_jefe_activo(p.unidad_id)
        and not public.unidad_tiene_jefe_activo(p_unidad))
    or (p.rol = 'director' and p_direccion is not null and p.direccion_id = p_direccion)))
  or public.es_secretaria()
$$;

-- Unidades que el usuario puede ver (para los filtros de la aplicación)
create or replace function public.unidades_que_veo()
returns setof uuid language sql stable security definer set search_path = public as $$
  select u.id from unidades u where u.activa and public.puede_ver_unidad(u.id, u.direccion_id)
$$;
revoke all on function public.unidades_que_veo() from public, anon;
grant execute on function public.unidades_que_veo() to authenticated;
