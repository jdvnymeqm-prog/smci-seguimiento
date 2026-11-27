-- 35. Periodo de actualización y fin del plazo de 72 horas.
--   · config.periodo_actualizacion {activo, desde, por}; periodo_actualizacion_abierto().
--     Abierto (desde el 27/11/2026): todos pueden proponer editar o eliminar lo validado (proyectos, tareas, evidencias),
--     con validación. Cerrado: lo validado solo lo cambia el administrador (y la dirección); el personal completa datos vacíos.
--   · Nuevos tipos de propuesta: eliminar_tarea, editar_evidencia, eliminar_evidencia (validar_propuesta los aplica).
--   · proponer(): sin plazo de 72 h (los permisos de corrección ya no son necesarios); regla «solo datos vacíos» para
--     proyecto y tarea cuando el periodo está cerrado.
--   · editar_propuesta(): quien registró corrige también proyectos nuevos, evidencias y reportes pendientes.
alter table public.propuestas drop constraint if exists propuestas_tipo_check;
alter table public.propuestas add constraint propuestas_tipo_check check (tipo = any (array['proyecto','reprogramar_proyecto','crear_tarea','tarea',
  'reprogramar_tarea','reporte','evidencia','crear_proyecto','eliminar_tarea','editar_evidencia','eliminar_evidencia']));
