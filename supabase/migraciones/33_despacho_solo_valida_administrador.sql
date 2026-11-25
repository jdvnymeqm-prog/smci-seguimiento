-- 33. Despacho de la Secretaría (DESP-SMCI): sus cambios solo los valida el administrador (Encargado de Planificación).
--   · puede_revisar(): ningún jefe ni director valida unidades de una dirección con es_despacho_secretaria.
--   · es_director_de(): el titular del Despacho no tiene atribuciones de director (aplicar sin validación ni visto bueno).
create or replace function public.puede_revisar(p_unidad uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from perfiles p join unidades u on u.id = p_unidad join direcciones d on d.id = u.direccion_id
     where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and not d.es_despacho_secretaria and (
          (p.rol = 'jefe' and p.unidad_id = p_unidad)
       or (p.rol = 'director' and p.direccion_id = u.direccion_id
           and (not u.tiene_jefe or not public.unidad_tiene_jefe_activo(p_unidad)))))
$$;
create or replace function public.es_director_de(p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p join direcciones d on d.id = p.direccion_id
                  where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado'
                    and p.rol = 'director' and p.direccion_id = p_direccion and not d.es_despacho_secretaria);
$$;
