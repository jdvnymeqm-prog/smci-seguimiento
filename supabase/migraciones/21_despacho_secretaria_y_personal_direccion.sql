-- 21 · Despacho de la Secretaría y personal directo de cada dirección
-- Aplicada el 18/11/2026. Se puede volver a ejecutar sin duplicar nada.

-- 1) Despacho de la Secretaría Municipal: nivel por encima de las direcciones
alter table public.direcciones add column if not exists es_despacho_secretaria boolean not null default false;

insert into public.direcciones (sigla, nombre, titular, activa, orden, es_despacho_secretaria)
select 'DESP-SMCI', 'Despacho de la Secretaría Municipal de Ciudad Inteligente',
       (select valor ->> 'titular' from public.config where clave = 'secretaria'), true, 0, true
where not exists (select 1 from public.direcciones where sigla = 'DESP-SMCI');

-- 2) Espacio para el personal directo de cada nivel (sin jefe: valida el titular de la dirección)
insert into public.unidades (direccion_id, sigla, nombre, descripcion, activa, orden, tiene_jefe)
select d.id, 'DESP-SMCI', 'Personal del Despacho de la Secretaría (SMCI)',
       'Responsables de proyectos que dependen directamente del Despacho de la Secretaría', true, 0, false
  from public.direcciones d where d.sigla = 'DESP-SMCI'
   and not exists (select 1 from public.unidades where sigla = 'DESP-SMCI');

insert into public.unidades (direccion_id, sigla, nombre, descripcion, activa, orden, tiene_jefe)
select d.id, 'DESP-DICI', 'Personal de la Dirección (Despacho DICI)',
       'Responsables de proyectos que dependen directamente de la Dirección de Innovación y Ciudad Inteligente', true, 0, false
  from public.direcciones d where d.sigla = 'DICI'
   and not exists (select 1 from public.unidades where sigla = 'DESP-DICI');

update public.unidades set nombre = 'Personal de la Dirección (Despacho DEDH)', tiene_jefe = false, orden = 0,
       descripcion = coalesce(descripcion, 'Responsables de proyectos que dependen directamente de la Dirección de Educación y Desarrollo Humano')
 where sigla = 'DESP-DEDH';

-- 3) El titular del Despacho de la Secretaría ve todas las direcciones y unidades
create or replace function public.es_secretaria()
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from perfiles p join direcciones d on d.id = p.direccion_id
                  where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado'
                    and p.rol = 'director' and d.es_despacho_secretaria)
$$;
revoke execute on function public.es_secretaria() from public, anon;
grant execute on function public.es_secretaria() to authenticated;

create or replace function public.puede_ver_unidad(p_unidad uuid, p_direccion uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and (
       p.rol = 'admin'
    or (p.rol in ('jefe', 'responsable') and p_unidad is not null and p.unidad_id = p_unidad)
    or (p.rol in ('jefe', 'responsable') and p_unidad is null and p_direccion is not null and p.direccion_id = p_direccion)
    or (p.rol = 'director' and p_direccion is not null and p.direccion_id = p_direccion)))
  or public.es_secretaria()
$$;

alter policy lectura on public.direcciones
  using (public.es_admin() or public.es_secretaria() or id = public.mi_direccion());

insert into public.app_migraciones (nombre)
select '21_despacho_secretaria_y_personal_direccion.sql'
where not exists (select 1 from public.app_migraciones where nombre = '21_despacho_secretaria_y_personal_direccion.sql');
