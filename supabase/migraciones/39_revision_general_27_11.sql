-- 39. Revisión general (27/11/2026).
--   · proponer(): las reprogramaciones (de proyecto o tarea) siempre se validan: son información nueva, no corrección
--     de lo pasado (antes un proyecto ya cargado se reprogramaba sin validación).
--   · Funciones auxiliares sin acceso anónimo: fecha_corte_carga, fecha_corte_historico, meses_reportados,
--     meses_sin_reporte, puede_revisar_propuesta, ultimo_mes_exigible, periodo_actualizacion_abierto,
--     direccion_cambia_responsables, texto_meses (solo usuarios con sesión).
revoke execute on function public.fecha_corte_carga(), public.fecha_corte_historico(), public.meses_reportados(uuid), public.meses_sin_reporte(uuid),
  public.puede_revisar_propuesta(uuid, uuid), public.ultimo_mes_exigible(date), public.periodo_actualizacion_abierto(), public.direccion_cambia_responsables(uuid),
  public.texto_meses(date[]) from public, anon;
grant execute on function public.fecha_corte_carga(), public.fecha_corte_historico(), public.meses_reportados(uuid), public.meses_sin_reporte(uuid),
  public.puede_revisar_propuesta(uuid, uuid), public.ultimo_mes_exigible(date), public.periodo_actualizacion_abierto(), public.direccion_cambia_responsables(uuid),
  public.texto_meses(date[]) to authenticated;
