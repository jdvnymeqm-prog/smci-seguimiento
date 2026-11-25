-- 31. Modificación de responsables activable por dirección (DICI, DEDH y Despacho de la Secretaría).
alter table public.direcciones
  add column if not exists cambio_responsables boolean not null default false,
  add column if not exists cambio_responsables_desde timestamptz,
  add column if not exists cambio_responsables_por text;
--  · direccion_cambia_responsables(uuid) y cambiar_modificacion_responsables(uuid, boolean) (solo administrador).
--  · proponer(): con la opción desactivada, el personal no puede cambiar el responsable ni los apoyos de un proyecto
--    que ya los tiene (sí asignarlos cuando faltan). El administrador y la dirección no tienen esta restricción.
--  · Estado inicial (25/11/2026): DICI activada (reorganización); DEDH y DESP-SMCI desactivadas.
