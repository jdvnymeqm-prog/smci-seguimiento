-- 22 · Eliminar usuarios sin perder el historial (aplicada el 24/11/2026)
-- Al borrar una cuenta, los registros que creó se conservan y solo pierden el vínculo a la cuenta.
alter table public.proyectos alter column creado_por drop not null;
alter table public.proyectos drop constraint proyectos_creado_por_fkey,
  add constraint proyectos_creado_por_fkey foreign key (creado_por) references auth.users(id) on delete set null;
alter table public.evidencias drop constraint evidencias_subido_por_fkey,
  add constraint evidencias_subido_por_fkey foreign key (subido_por) references auth.users(id) on delete set null;
alter table public.reportes_mensuales drop constraint reportes_mensuales_registrado_por_fkey,
  add constraint reportes_mensuales_registrado_por_fkey foreign key (registrado_por) references auth.users(id) on delete set null;
alter table public.conversiones_carga drop constraint conversiones_carga_revisado_por_fkey,
  add constraint conversiones_carga_revisado_por_fkey foreign key (revisado_por) references auth.users(id) on delete set null;
