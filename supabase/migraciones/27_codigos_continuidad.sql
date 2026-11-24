-- 27. Proyectos con continuidad: un proyecto base reúne a otros (se conserva el código inicial).
--     Aplicado el 24/11/2026 para el mobiliario escolar: SMCI-10 (base) + SMCI-22, SMCI-35, SMCI-39.
--     Tareas, evidencias, reprogramaciones y reportes se movieron al proyecto base marcando su código de origen;
--     el reporte F-1 de octubre, presente en SMCI-35 y SMCI-39, se unió conservando los dos textos.
--     Productos: centros atendidos por tipo (universo 418 = 312 UE fiscales + 45 de convenio + 9 CEE + 52 CEA).
alter table public.proyectos add column if not exists codigos_continuidad text;
-- La vista v_proyectos se recreó agregando p.codigos_continuidad al final de sus columnas.
