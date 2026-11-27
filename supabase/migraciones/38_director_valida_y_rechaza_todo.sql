-- 38. El director (máxima autoridad) valida y rechaza todo lo de su dirección, también en unidades con jefe.
create or replace function public.puede_revisar(p_unidad uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from perfiles p join unidades u on u.id = p_unidad join direcciones d on d.id = u.direccion_id
     where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado' and not d.es_despacho_secretaria and (
          (p.rol = 'jefe' and p.unidad_id = p_unidad)
       or (p.rol = 'director' and p.direccion_id = u.direccion_id)))
$$;
--   · trg_proyectos_validar(): durante el periodo de actualización se pueden corregir la fecha de entrega original
--     y la vigente sin «Reprogramar» (puesta al día).
--   · proponer()/validar_propuesta(): aviso claro si un proyecto nuevo repite un código existente en la gestión.
--   · Pantalla: los errores al validar o rechazar se muestran dentro de la ventana (antes quedaban detrás).
