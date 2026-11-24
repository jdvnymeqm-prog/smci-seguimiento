-- 23 · El director valida automáticamente si la unidad no tiene un jefe con cuenta activa (aplicada el 24/11/2026)
create or replace function public.unidad_tiene_jefe_activo(p_unidad uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from perfiles j where j.unidad_id = p_unidad and j.rol = 'jefe' and j.activo and j.estado_acceso = 'aprobado')
$$;
create or replace function public.puede_revisar(p_unidad uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.es_admin() or exists (
    select 1 from perfiles p join unidades u on u.id = p_unidad
     where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and (
          (p.rol = 'jefe' and p.unidad_id = p_unidad)
       or (p.rol = 'director' and p.direccion_id = u.direccion_id
           and (not u.tiene_jefe or not public.unidad_tiene_jefe_activo(p_unidad)))))
$$;
create or replace function public.unidades_que_valido()
 returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select u.id from unidades u where public.puede_revisar(u.id)
$$;
create or replace function public.validador_por_unidad()
 returns table (unidad_id uuid, valida text) language sql stable security definer set search_path to 'public' as $$
  select u.id, case when u.tiene_jefe and public.unidad_tiene_jefe_activo(u.id) then 'jefe' else 'director' end
    from unidades u where public.es_admin()
$$;
