-- 28. Mobiliario escolar: cada entrega es un producto = un centro educativo atendido.
--     tareas.tipo_centro (UE fiscal, UE de convenio, CEE, CEA); proyectos.meta_productos y universo_productos.
--     calcular_avance: si el proyecto tiene meta_productos, avance = productos concluidos / meta × 100.
--     validar_propuesta guarda tipo_centro al crear o cambiar tareas. v_proyectos expone meta_productos y universo_productos.
--     SMCI-10: meta 418 (312 UE fiscales, 45 de convenio, 9 CEE, 52 CEA); se quitaron los 4 productos por categoría sin datos.
alter table public.tareas add column if not exists tipo_centro text
  check (tipo_centro is null or tipo_centro in ('UE fiscal','UE de convenio','CEE','CEA'));
alter table public.proyectos add column if not exists meta_productos integer check (meta_productos is null or meta_productos > 0),
  add column if not exists universo_productos jsonb;
