-- 24. Los jefes de unidad no podían validar: las propuestas que marcaban el proyecto como «Concluida»
--     sin 100 % de avance (o sin evidencia) hacían fallar toda la validación.
--     Ahora se validan los demás datos y el estado «Concluida» se deja pendiente con una nota.
--     Además: «Visto bueno» del director sobre las validaciones hechas por sus jefes de unidad.

alter table public.propuestas
  add column if not exists visto_bueno_por uuid references auth.users(id) on delete set null,
  add column if not exists visto_bueno_nombre text,
  add column if not exists visto_bueno_en timestamptz,
  add column if not exists visto_bueno_obs text;

-- Una propuesta revisada no cambia, salvo para registrar el visto bueno del director (una sola vez)
create or replace function public.trg_proteger_propuesta()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'pendiente' and old.proyecto_id is not null and exists (select 1 from proyectos where id = old.proyecto_id) then
      raise exception 'Una propuesta revisada no se puede borrar.';
    end if;
    return old;
  end if;
  if old.estado <> 'pendiente' then
    if old.estado = 'validada' and old.visto_bueno_en is null and new.visto_bueno_en is not null
       and (to_jsonb(new) - array['visto_bueno_por','visto_bueno_nombre','visto_bueno_en','visto_bueno_obs'])
         = (to_jsonb(old) - array['visto_bueno_por','visto_bueno_nombre','visto_bueno_en','visto_bueno_obs']) then
      return new;
    end if;
    raise exception 'Esta propuesta ya fue revisada y no se puede cambiar.';
  end if;
  return new;
end $$;

-- Director activo de la dirección de la propuesta
create or replace function public.es_director_de(p_direccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.estado_acceso = 'aprobado'
                 and p.rol = 'director' and p.direccion_id = p_direccion);
$$;

create or replace function public.dar_visto_bueno(p_id bigint, p_observacion text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m propuestas%rowtype;
begin
  select * into m from propuestas where id = p_id for update;
  if not found then raise exception 'La propuesta no existe.'; end if;
  if m.estado <> 'validada' then raise exception 'Solo se da visto bueno a cambios ya validados por el jefe de unidad.'; end if;
  if m.visto_bueno_en is not null then raise exception 'Esta validación ya tiene visto bueno.'; end if;
  if not (public.es_admin() or public.es_director_de(m.direccion_id)) then
    raise exception 'Solo el director o directora de la dirección puede dar el visto bueno.' using errcode = '42501';
  end if;
  update propuestas set visto_bueno_por = auth.uid(), visto_bueno_nombre = public.nombre_base(),
         visto_bueno_en = now(), visto_bueno_obs = nullif(trim(p_observacion), '')
   where id = p_id;
end $$;
revoke all on function public.dar_visto_bueno(bigint, text) from public, anon;
grant execute on function public.dar_visto_bueno(bigint, text) to authenticated;
grant execute on function public.es_director_de(uuid) to authenticated;

-- Validar: si «Concluida» no cumple los requisitos, se validan los demás datos y el estado no cambia
create or replace function public.validar_propuesta(p_id bigint, p_observacion text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m propuestas%rowtype; rp proyectos%rowtype; v_old proyectos%rowtype; rt tareas%rowtype;
  v_nuevo uuid; v_proy uuid; v_nota text; v_av numeric;
begin
  select * into m from propuestas where id = p_id for update;
  if not found then raise exception 'La propuesta no existe.'; end if;
  if m.estado <> 'pendiente' then raise exception 'Esta propuesta ya fue revisada y no se puede cambiar.'; end if;
  if not public.puede_revisar(m.unidad_id) then
    raise exception 'Solo el jefe de la unidad (o el director si la unidad no tiene jefe) o el administrador puede validar.' using errcode = '42501';
  end if;
  perform set_config('app.autor', coalesce(m.creado_por_nombre, ''), true);
  v_proy := m.proyecto_id;

  if m.tipo = 'proyecto' then
    select * into v_old from proyectos where id = m.proyecto_id;
    rp := jsonb_populate_record(v_old, coalesce(m.datos -> 'cambios', '{}'));
    if rp.estado = 'Concluida' and v_old.estado is distinct from 'Concluida' then
      v_av := case when v_old.avance_manual then v_old.avance else coalesce(public.calcular_avance(m.proyecto_id), 0) end;
      if v_av < 100 then
        v_nota := format('Se validaron los datos, pero el estado sigue en «%s»: para «Concluida» el avance debe ser 100 %% (ahora es %s %%). Actualice las tareas al 100 %% y vuelva a proponer «Concluida».', v_old.estado, round(v_av, 1));
      elsif not exists (select 1 from evidencias where proyecto_id = m.proyecto_id) then
        v_nota := format('Se validaron los datos, pero el estado sigue en «%s»: para «Concluida» se necesita al menos una evidencia. Súbala y vuelva a proponer «Concluida».', v_old.estado);
      end if;
      if v_nota is not null then rp.estado := v_old.estado; end if;
    end if;
    update proyectos set nombre = rp.nombre, codigo_gobierno = rp.codigo_gobierno, descripcion = rp.descripcion,
      objetivo = rp.objetivo, responsable_id = rp.responsable_id, fecha_inicio = rp.fecha_inicio,
      fecha_entrega_original = rp.fecha_entrega_original, fecha_entrega_vigente = rp.fecha_entrega_vigente,
      estado = rp.estado, motivo_cancelacion = rp.motivo_cancelacion,
      observaciones_falta = rp.observaciones_falta, situacion_actual = rp.situacion_actual, proximo_paso = rp.proximo_paso,
      presupuesto_programado = rp.presupuesto_programado, presupuesto_ejecutado = rp.presupuesto_ejecutado,
      beneficiarios = rp.beneficiarios, por_validar = rp.por_validar, por_validar_motivo = rp.por_validar_motivo
     where id = m.proyecto_id;
    if m.datos ? 'apoyos' then
      delete from proyecto_apoyos where proyecto_id = m.proyecto_id;
      insert into proyecto_apoyos (proyecto_id, persona_id)
        select m.proyecto_id, x::uuid from jsonb_array_elements_text(m.datos -> 'apoyos') x on conflict do nothing;
    end if;
  elsif m.tipo = 'reprogramar_proyecto' then
    perform set_config('app.motivo_reprog', m.motivo, true);
    update proyectos set fecha_entrega_vigente = (m.datos ->> 'fecha')::date where id = m.proyecto_id;
    perform set_config('app.motivo_reprog', '', true);
  elsif m.tipo = 'crear_tarea' then
    insert into tareas (proyecto_id, nombre, tipo, codigo, responsable_id, fecha_inicio, fecha_fin_original,
                        peso, avance, estado, evidencia, observaciones)
    select m.proyecto_id, x.nombre, coalesce(x.tipo, 'Tarea'), x.codigo, x.responsable_id, x.fecha_inicio, x.fecha_fin_original,
           coalesce(x.peso, 1), coalesce(x.avance, 0), coalesce(x.estado, 'No iniciada'), x.evidencia, x.observaciones
      from jsonb_populate_record(null::tareas, m.datos) x
    returning id into v_nuevo;
  elsif m.tipo = 'tarea' then
    select * into rt from tareas where id::text = m.registro_id;
    rt := jsonb_populate_record(rt, coalesce(m.datos -> 'cambios', '{}'));
    update tareas set nombre = rt.nombre, tipo = rt.tipo, codigo = rt.codigo, responsable_id = rt.responsable_id,
      fecha_inicio = rt.fecha_inicio, fecha_fin_original = rt.fecha_fin_original, fecha_fin_vigente = rt.fecha_fin_vigente,
      peso = rt.peso, avance = rt.avance, estado = rt.estado, evidencia = rt.evidencia, observaciones = rt.observaciones
     where id::text = m.registro_id;
  elsif m.tipo = 'reprogramar_tarea' then
    perform set_config('app.motivo_reprog', m.motivo, true);
    update tareas set fecha_fin_vigente = (m.datos ->> 'fecha')::date where id::text = m.registro_id;
    perform set_config('app.motivo_reprog', '', true);
  elsif m.tipo = 'reporte' then
    insert into reportes_mensuales (proyecto_id, periodo, ficha, avance, estado, problema_resultado, resultado_cuantitativo,
                                    linea_base, medida, beneficiarios, proximo_paso, evidencia_texto, fuente)
    select m.proyecto_id, x.periodo, coalesce(x.ficha, 'F-2'), x.avance, x.estado, x.problema_resultado, x.resultado_cuantitativo,
           x.linea_base, x.medida, x.beneficiarios, x.proximo_paso, x.evidencia_texto, coalesce(x.fuente, 'Registro en la aplicación')
      from jsonb_populate_record(null::reportes_mensuales, m.datos) x
    on conflict (proyecto_id, periodo, ficha) do update set avance = excluded.avance, estado = excluded.estado,
      problema_resultado = excluded.problema_resultado, resultado_cuantitativo = excluded.resultado_cuantitativo,
      linea_base = excluded.linea_base, medida = excluded.medida, beneficiarios = excluded.beneficiarios,
      proximo_paso = excluded.proximo_paso, evidencia_texto = excluded.evidencia_texto, fuente = excluded.fuente;
  elsif m.tipo = 'evidencia' then
    insert into evidencias (proyecto_id, tipo, nombre, url, storage_path)
    values (m.proyecto_id, coalesce(m.datos ->> 'tipo', 'enlace'), m.datos ->> 'nombre', m.datos ->> 'url', m.datos ->> 'storage_path');
  elsif m.tipo = 'crear_proyecto' then
    insert into proyectos (codigo, codigo_gobierno, nombre, descripcion, objetivo, unidad_id, direccion_id, responsable_id,
                           fecha_inicio, fecha_entrega_original, estado, por_validar, por_validar_motivo)
    select x.codigo, x.codigo_gobierno, x.nombre, x.descripcion, x.objetivo, m.unidad_id, m.direccion_id, x.responsable_id,
           x.fecha_inicio, x.fecha_entrega_original, coalesce(x.estado, 'No iniciada'), coalesce(x.por_validar, false), x.por_validar_motivo
      from jsonb_populate_record(null::proyectos, m.datos) x
    returning id into v_nuevo;
    v_proy := v_nuevo;
  end if;

  update propuestas set estado = 'validada', revisado_por = auth.uid(), revisado_por_nombre = public.nombre_base(),
         revisado_en = now(),
         observacion = nullif(concat_ws(E'\n', nullif(trim(p_observacion), ''), v_nota), ''),
         proyecto_id = v_proy,
         entidad = case when m.tipo = 'crear_tarea' then 'tarea' when m.tipo = 'crear_proyecto' then 'proyecto' else entidad end,
         registro_id = case when m.tipo in ('crear_tarea', 'crear_proyecto') then v_nuevo::text else registro_id end,
         -- El director que valida (unidad sin jefe o su propio personal) no necesita darse visto bueno a sí mismo
         visto_bueno_por = case when public.es_director_de(m.direccion_id) then auth.uid() end,
         visto_bueno_nombre = case when public.es_director_de(m.direccion_id) then public.nombre_base() end,
         visto_bueno_en = case when public.es_director_de(m.direccion_id) then now() end
   where id = p_id;
  perform set_config('app.autor', '', true);
end $$;
