-- 28. Mobiliario escolar: cada entrega es un producto = un centro educativo atendido.
--     tareas.tipo_centro (UE fiscal, UE de convenio, CEE, CEA); proyectos.meta_productos y universo_productos.
--     calcular_avance: si el proyecto tiene meta_productos, avance = productos concluidos / meta × 100.
--     validar_propuesta guarda tipo_centro al crear o cambiar tareas. v_proyectos expone meta_productos y universo_productos.
--     SMCI-10: meta 418 (312 UE fiscales, 45 de convenio, 9 CEE, 52 CEA); se quitaron los 4 productos por categoría sin datos.
alter table public.tareas add column if not exists tipo_centro text
  check (tipo_centro is null or tipo_centro in ('UE fiscal','UE de convenio','CEE','CEA'));
alter table public.proyectos add column if not exists meta_productos integer check (meta_productos is null or meta_productos > 0),
  add column if not exists universo_productos jsonb;

-- 28b. Cantidades por entrega: tareas.cantidad (mobiliario entregado) y tareas.estudiantes (beneficiados);
--      validar_propuesta los guarda al crear o corregir una entrega.
alter table public.tareas
  add column if not exists cantidad integer check (cantidad is null or cantidad >= 0),
  add column if not exists estudiantes integer check (estudiantes is null or estudiantes >= 0);

-- 28c. Juegos de mobiliario por nivel (tareas.niveles jsonb; tareas.cantidad = total de juegos).
--      calcular_avance cuenta centros educativos DISTINTOS (mismo nombre normalizado = un centro).
alter table public.tareas add column if not exists niveles jsonb;

-- 28d. tareas.centros: N.º de unidades educativas atendidas en la entrega (por defecto 1; Hampaturi = 11).
--      calcular_avance: suma, por unidad educativa distinta, su mayor N.º de U.E. / meta (418).
alter table public.tareas add column if not exists centros integer check (centros is null or centros > 0);

-- 28e. Revisión 24/11/2026: la vista v_proyectos no tenía meta_productos ni universo_productos (el cambio se
--      había revertido junto con una prueba). Se agregaron al final de sus columnas. Además, las funciones
--      direccion_edicion_abierta y es_director_de dejan de poder llamarse sin iniciar sesión (solo authenticated).
revoke execute on function public.direccion_edicion_abierta(uuid) from anon, public;
revoke execute on function public.es_director_de(uuid) from anon, public;
