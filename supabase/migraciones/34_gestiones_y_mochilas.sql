-- 34. Gestiones (2026, 2027…) con continuidad de proyectos, y agrupación de MOCHILAS.
alter table public.proyectos
  add column if not exists gestion integer not null default 2026 check (gestion between 2020 and 2100),
  add column if not exists proyecto_origen_id uuid references public.proyectos(id) on delete set null,
  add column if not exists unidad_producto text;
alter table public.proyectos drop constraint if exists proyectos_codigo_key;
create unique index if not exists proyectos_codigo_gestion_key on public.proyectos (codigo, gestion);
create index if not exists proyectos_gestion_idx on public.proyectos (gestion);
create unique index if not exists proyectos_origen_gestion_key on public.proyectos (proyecto_origen_id, gestion) where proyecto_origen_id is not null;
--  · v_proyectos: + gestion, proyecto_origen_id, unidad_producto.
--  · proponer(crear_proyecto): datos.gestion y datos.proyecto_origen_id; no permite duplicar la continuidad.
--    El administrador (igual que la dirección) aplica al instante (nota «Registrado por el administrador…»).
--  · validar_propuesta(crear_proyecto): guarda gestión y origen; con origen copia numeral, códigos unidos,
--    meta/universo y unidad de producto (formato especial). El proyecto nuevo nace sin tareas ni reportes.
--  · marcar_no_reportadas(): no marca proyectos de gestiones futuras.
--  · Mochilas (27/11/2026): SMCI-24 se unió a SMCI-09 (código inicial, julio). Tareas, evidencias y reportes con su código
--    de origen; reportes del mismo mes y ficha unidos conservando ambos textos. Meta 418 centros, unidad «mochilas o
--    morrales». Avance manual 88 % (reportado) hasta que la UIEE registre las entregas por unidad educativa.
--    SMCI-10 queda con unidad_producto «juegos de mobiliario».
