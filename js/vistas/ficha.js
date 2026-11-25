import { html, useState, useEffect, useRef, sb, ESTADOS, fecha, fechaHora, pct, bs, hoyISO, mesActualISO, nombreMes, diasEntre, puedeEditar, bloqueoCambios, exportarExcel, mensajeError, usePestana, codigoTexto, codigoPrincipal, colorDir } from '../lib.js';
import { Estado, EstadoProyecto, Semaforo, Barra, Aviso, Modal, QueFalta, FechaInput, MontoInput } from '../componentes.js';
import { ListaPropuestas } from './validaciones.js';

const ESTADOS_EDITABLES = ESTADOS.filter(e => e !== 'No reportada');

export function Ficha({ ctx, id }) {
  const { perfil, cat } = ctx;
  const [p, setP] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [reprog, setReprog] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [evid, setEvid] = useState([]);
  const [apoyos, setApoyos] = useState([]);
  const [pendientes, setPendientes] = useState([]);   // tareas nuevas que esperan validación
  const [tab, setTab] = usePestana('pestana', 'datos');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function cargar() {
    const [a, b, c, d, e, f, g] = await Promise.all([
      sb.from('v_proyectos').select('*').eq('id', id).single(),
      sb.from('tareas').select('*').eq('proyecto_id', id).order('orden').order('fecha_fin_vigente', { nullsFirst: false }),
      sb.from('reprogramaciones').select('*').eq('proyecto_id', id).order('creado_en', { ascending: false }),
      sb.from('reportes_mensuales').select('*').eq('proyecto_id', id).order('periodo', { ascending: false }),
      sb.from('evidencias').select('*').eq('proyecto_id', id).order('creado_en', { ascending: false }),
      sb.from('proyecto_apoyos').select('persona_id').eq('proyecto_id', id),
      sb.from('propuestas').select('id,datos,creado_por,creado_por_nombre,creado_en').eq('proyecto_id', id).eq('tipo', 'crear_tarea').eq('estado', 'pendiente').order('creado_en'),
    ]);
    const er = a.error || b.error || c.error || d.error || e.error || f.error;
    if (a.error && a.error.code === 'PGRST116') { setErr('Este proyecto no existe o no pertenece a su unidad o dirección.'); return; }
    if (er) { setErr(mensajeError(er)); return; }
    setP(a.data); setTareas(b.data); setReprog(c.data); setReportes(d.data); setEvid(e.data);
    setApoyos(f.data.map(x => x.persona_id));
    // Cada tarea pendiente se muestra como tarea (marcada «pendiente») con su propuesta para editarla o eliminarla
    setPendientes((g.data || []).map(m => ({ ...m.datos, id: 'prop-' + m.id, _prop: m.id, _autor: m.creado_por, _autorNombre: m.creado_por_nombre,
      estado: m.datos?.estado || 'No iniciada', fecha_fin_vigente: m.datos?.fecha_fin_original || null })));
  }
  useEffect(() => { cargar(); }, [id]);
  // El director es la máxima autoridad de su dirección: lo que registra se aplica sin validación
  const listo = (msg) => {
    if (perfil.rol === 'director' && /validaci/i.test(msg || '')) msg = 'Guardado. Como dirección, el registro se aplica sin validación y queda en la bitácora.';
    setOk(msg); setErr(''); cargar(); setTimeout(() => setOk(''), 4000); };
  const fallo = (e) => { setErr(mensajeError(e)); setOk(''); };

  if (err && !p) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!p) return html`<div class="vacio">Cargando ficha…</div>`;
  // Con el bloqueo general activo, solo el administrador edita
  const editable = puedeEditar(perfil, p.unidad_id, p.direccion_id) && !bloqueoCambios(cat, perfil);
  const h = { p, tareas, pendientes, reprog, reportes, evid, apoyos, editable, ctx, listo, fallo, recargar: cargar };

  const tabs = [
    ['datos', 'Datos generales'], ['tareas', `Tareas (${tareas.length}${pendientes.length ? ' + ' + pendientes.length + ' por validar' : ''})`],
    ['reprog', `Reprogramaciones (${reprog.length})`], ['historial', `Historial mensual (${reportes.length})`],
    ['evid', `Evidencias (${evid.length})`], ['propuestas', `Cambios propuestos${p.n_mod_pendientes ? ' (' + p.n_mod_pendientes + ')' : ''}`], ['bitacora', 'Bitácora'],
  ];
  return html`
    <div class="panel">
      <div class="ficha-cab" style=${'border-left:6px solid ' + colorDir(p.direccion_sigla).fuerte + ';padding-left:.9rem'}>
        <div style="min-width:0;flex:1">
          <div class="acciones" style="margin-bottom:.3rem"><span class="pill" style=${'background:' + colorDir(p.direccion_sigla).fuerte + ';color:#fff'}>${p.direccion_sigla}${p.unidad_sigla ? ' · ' + p.unidad_sigla : ''}</span>${p.codigo_estrategico
              ? html`<span class="pill" style="background:#18465c;color:#fff" title=${'Proyecto estratégico Eje III · ' + (p.estrategico_nombre || '')}>${codigoPrincipal(p)}</span>${p.codigo !== p.codigo_estrategico ? html`<span class="pill">${p.codigo}</span>` : ''}`
              : html`<span class="pill">${p.codigo}</span>`}
            ${p.codigos_continuidad && html`<span class="pill" style="background:#fff;font-size:.72rem" title="Códigos que se unieron a este proyecto">también: ${p.codigos_continuidad}</span>`}
            ${p.codigo_gobierno && html`<span class="pill">Proyecto de gobierno ${p.codigo_gobierno}</span>`}
            <${Estado} e=${p.estado} /> <${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} />${p.sin_reporte ? html` <span class="etiqueta" title="Meses que debían reportarse y no tienen reporte">Sin reporte: ${p.sin_reporte}</span>` : ''}
            ${p.por_validar && html`<span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>`}</div>
          <h1>${p.nombre}</h1>
          ${p.codigos_continuidad && html`<p class="ayuda" style="margin:.2rem 0 .4rem">↻ <b>Proyecto al que se dio continuidad.</b> Código inicial: <b>${p.codigo}</b>. Se le unieron: ${p.codigos_continuidad}. Las tareas, evidencias y reportes muestran entre corchetes el código con el que se registraron.</p>`}
          <div class="meta">
            <span>${p.direccion_sigla} · ${p.unidad_sigla || 'Unidad por validar'}</span>
            <span>Responsable: <b>${p.responsable_nombre || 'Sin responsable'}</b>${p.apoyos_nombres ? ' · Apoyo: ' + p.apoyos_nombres : ''}</span>
            <span>Entrega original ${fecha(p.fecha_entrega_original)} · vigente <b>${fecha(p.fecha_entrega_vigente)}</b>${p.n_reprogramaciones ? ` · reprogramado ${p.n_reprogramaciones} ${p.n_reprogramaciones === 1 ? 'vez' : 'veces'}` : ''}</span>
            <span>Última actualización: ${fechaHora(p.ultima_actualizacion)}</span>
          </div>
        </div>
        <div style="min-width:220px">
          <small class="ayuda">Avance ${p.avance_manual ? '(manual autorizado)' : '(ponderado por tareas)'}</small>
          <${Barra} v=${p.avance} />
          <div class="acciones" style="margin-top:.6rem">
            ${editable ? html`<${BotonReprogramar} titulo="Reprogramar entrega" actual=${p.fecha_entrega_vigente}
                 onGuardar=${async (f, m) => {
                   if (perfil.rol === 'admin') { const { error } = await sb.rpc('reprogramar_proyecto', { p_id: p.id, p_fecha: f, p_motivo: m }); if (error) throw error; return listo('Proyecto reprogramado.'); }
                   const { error } = await sb.rpc('proponer', { p_tipo: 'reprogramar_proyecto', p_proyecto: p.id, p_registro: null, p_datos: { fecha: f }, p_motivo: m });
                   if (error) throw error; listo('Reprogramación enviada a validación. Se aplicará cuando la valide.'); }} />`
              : html`<span class="lectura">🔒 ${bloqueoCambios(cat, perfil) ? 'Cambios bloqueados por el administrador' : perfil.rol === 'director' ? 'Su dirección tiene acceso de revisión y consulta' : 'Solo lectura'}</span>`}
            <button onClick=${() => exportarFichaPDF(h)}>Ficha PDF</button>
          </div>
        </div>
      </div>
    </div>
    ${p.n_mod_pendientes > 0 && html`<${Aviso} tipo="atencion">
      ${p.n_mod_pendientes} ${p.n_mod_pendientes === 1 ? 'modificación guardada está' : 'modificaciones guardadas están'} pendiente${p.n_mod_pendientes === 1 ? '' : 's'} de validación.
      ${['jefe', 'director', 'admin'].includes(perfil.rol) && html` <a href="#/validaciones">Ir a validaciones</a>`}<//>`}
    <${Aviso} tipo="error">${err}<//><${Aviso} tipo="ok">${ok}<//>
    ${puedeCompletar(perfil, p, cat) && html`<${CompletarDatos} p=${p} ctx=${ctx} listo=${listo} fallo=${fallo} />`}
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => html`<button role="tab" class=${tab === k ? 'activo' : ''} onClick=${() => setTab(k)}>${t}</button>`)}</div>
    ${tab === 'datos' && html`<${Datos} ...${h} />`}
    ${tab === 'tareas' && html`<${Tareas} ...${h} />`}
    ${tab === 'reprog' && html`<${Reprogramaciones} ...${h} />`}
    ${tab === 'historial' && html`<${Historial} ...${h} />`}
    ${tab === 'evid' && html`<${Evidencias} ...${h} />`}
    ${tab === 'propuestas' && html`<div class="panel"><${ListaPropuestas} ctx=${ctx} proyectoId=${p.id} compacto=${true} /></div>`}
    ${tab === 'bitacora' && html`<${Bitacora} ...${h} />`}`;
}

// ---------------------------------------------------------------------
function BotonReprogramar({ titulo, actual, onGuardar, chico }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState('');
  const [m, setM] = useState('');
  const [err, setErr] = useState('');
  async function guardar() {
    if (!f) return setErr('Indique la nueva fecha (dd/mm/aaaa).');
    if (!m.trim()) return setErr('El motivo es obligatorio.');
    try { await onGuardar(f, m.trim()); setAbierto(false); setF(''); setM(''); } catch (e) { setErr(mensajeError(e)); }
  }
  return html`<button class=${chico ? '' : 'prim'} onClick=${() => { setErr(''); setAbierto(true); }}>${chico ? 'Reprogramar' : titulo}</button>
    ${abierto && html`<${Modal} titulo=${titulo} onCerrar=${() => setAbierto(false)} acciones=${html`
        <button onClick=${() => setAbierto(false)}>Cancelar</button><button class="prim" onClick=${guardar}>Guardar reprogramación</button>`}>
      <${Aviso} tipo="error">${err}<//>
      <p>Fecha vigente actual: <b>${fecha(actual)}</b></p>
      <div class="form">
        <label>Nueva fecha<${FechaInput} valor=${f} onCambio=${setF} /></label>
        <label class="ancho">Motivo (obligatorio)<textarea value=${m} onInput=${e => setM(e.target.value)} /></label>
      </div>
      <p class="ayuda">Queda registrado quién reprogramó, cuándo, la fecha anterior y la nueva. La fecha original no cambia.</p>
    <//>`}`;
}

// ---------------------------------------------------------------------
// Proyecto sin unidad: el personal de su dirección lo completa (unidad, responsable y fechas)
export function puedeCompletar(perfil, p, cat) {
  if (p.unidad_id || bloqueoCambios(cat, perfil) || !perfil.activo) return false;
  if (perfil.rol === 'admin') return true;
  return ['director', 'jefe', 'responsable'].includes(perfil.rol) && perfil.direccion_id === p.direccion_id;
}

function CompletarDatos({ p, ctx, listo, fallo }) {
  const { perfil, cat } = ctx;
  const esUnidad = perfil.rol === 'jefe' || perfil.rol === 'responsable';
  const unidades = cat.unidades.filter(u => u.activa && u.direccion_id === p.direccion_id && (!esUnidad || perfil.edicion_abierta || u.id === perfil.unidad_id));
  const [d, setD] = useState({ unidad_id: esUnidad ? perfil.unidad_id : (unidades.length === 1 ? unidades[0].id : ''),
    responsable_id: p.responsable_id || '', nuevo: '', fecha_inicio: p.fecha_inicio || '', fecha_entrega: p.fecha_entrega_original || '' });
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const personas = cat.personas.filter(x => x.activa !== false && x.unidad_id === d.unidad_id);
  async function guardar() {
    if (!d.unidad_id) return fallo({ message: 'Elija la unidad.' });
    if (!d.responsable_id && !d.nuevo.trim()) return fallo({ message: 'Elija o escriba el nombre del responsable.' });
    setOcupado(true);
    const { error } = await sb.rpc('completar_proyecto', { p_id: p.id, p_unidad: d.unidad_id,
      p_responsable: d.responsable_id && d.responsable_id !== '__nuevo' ? d.responsable_id : null,
      p_responsable_nombre: d.responsable_id === '__nuevo' || !d.responsable_id ? d.nuevo.trim() || null : null,
      p_fecha_inicio: d.fecha_inicio || null, p_fecha_entrega: d.fecha_entrega || null });
    setOcupado(false);
    if (error) return fallo(error);
    await ctx.recargar();
    listo('Datos completados. El proyecto ahora pertenece a su unidad y se actualiza como los demás.');
  }
  return html`<div class="panel" style="background:#fff8e6;border-color:#f0dc9c">
    <h3>Este proyecto aún no tiene unidad ni responsable</h3>
    <p class="ayuda">Pertenece a ${p.direccion_sigla}. ${esUnidad
      ? 'Si su unidad está a cargo, asígnelo a su unidad e indique el responsable. Desde ese momento lo actualiza su unidad y su jefe valida los cambios.'
      : 'Asígnelo a la unidad que estará a cargo e indique el responsable.'}</p>
    ${!abierto ? html`<button class="prim" onClick=${() => setAbierto(true)}>Completar datos del proyecto</button>` : html`
      <div class="form">
        <label>Unidad a cargo<select value=${d.unidad_id} disabled=${esUnidad && !perfil.edicion_abierta} onChange=${e => setD({ ...d, unidad_id: e.target.value, responsable_id: '' })}>
          <option value="">Elegir…</option>${unidades.map(u => html`<option value=${u.id}>${u.sigla} · ${u.nombre}</option>`)}</select></label>
        <label>Responsable<select value=${d.responsable_id} onChange=${e => setD({ ...d, responsable_id: e.target.value })}>
          <option value="">Elegir…</option>${personas.map(x => html`<option value=${x.id}>${x.nombre}</option>`)}
          <option value="__nuevo">Otra persona (escribir nombre)…</option></select></label>
        ${(d.responsable_id === '__nuevo' || (!personas.length && !d.responsable_id)) && html`<label>Nombre completo del responsable<input value=${d.nuevo} onInput=${e => setD({ ...d, nuevo: e.target.value })} /></label>`}
        ${!p.fecha_inicio && html`<label>Fecha de inicio (opcional)<${FechaInput} valor=${d.fecha_inicio} onCambio=${v => setD(x => ({ ...x, fecha_inicio: v }))} /></label>`}
        ${!p.fecha_entrega_original && html`<label>Fecha de entrega (opcional)<${FechaInput} valor=${d.fecha_entrega} onCambio=${v => setD(x => ({ ...x, fecha_entrega: v }))} /></label>`}
      </div>
      <div class="acciones" style="margin-top:.75rem"><button onClick=${() => setAbierto(false)}>Cancelar</button>
        <button class="prim" disabled=${ocupado} onClick=${guardar}>${ocupado ? 'Guardando…' : 'Guardar'}</button></div>`}
  </div>`;
}

// ---------------------------------------------------------------------
function Datos({ p, apoyos, tareas, editable, ctx, listo, fallo }) {
  const { cat, perfil } = ctx;
  const esAdmin = perfil.rol === 'admin';
  const [d, setD] = useState(null);
  const [ap, setAp] = useState(apoyos);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setD({ ...p }); setAp(apoyos); }, [p, apoyos]);
  if (!d) return null;
  const set = k => e => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setD(x => ({ ...x, [k]: v })); };
  const unidad = cat.unidades.find(u => u.id === d.unidad_id);
  const personas = cat.personas;
  const nom = id => (personas.find(x => x.id === id) || {}).nombre;
  // Cambiar responsables: el administrador y la dirección siempre; el personal, si el administrador lo activó para la dirección
  // (asignar uno cuando falta siempre se permite)
  const dirP = (cat.todasDirecciones || []).find(x => x.id === p.direccion_id);
  const puedeCambiarResp = esAdmin || perfil.rol === 'director' || !!dirP?.cambio_responsables || !p.responsable_id;

  async function nuevaPersona() {
    const n = prompt('Nombre completo de la persona:');
    if (!n || !n.trim()) return;
    const { error } = await sb.from('personas').insert({ nombre: n.trim(), unidad_id: p.unidad_id, direccion_id: p.direccion_id });
    if (error) return fallo(error);
    await ctx.recargar();
  }

  async function guardar() {
    setOcupado(true);
    const cambios = {
      nombre: d.nombre, codigo_gobierno: d.codigo_gobierno || null, descripcion: d.descripcion || null,
      objetivo: d.objetivo || null, responsable_id: d.responsable_id || null, fecha_inicio: d.fecha_inicio || null,
      estado: d.estado, motivo_cancelacion: d.motivo_cancelacion || null, observaciones_falta: d.observaciones_falta || null,
      situacion_actual: d.situacion_actual || null, proximo_paso: d.proximo_paso || null,
      presupuesto_programado: d.presupuesto_programado, presupuesto_ejecutado: d.presupuesto_ejecutado,
      beneficiarios: d.beneficiarios || null, por_validar: d.por_validar, por_validar_motivo: d.por_validar ? d.por_validar_motivo : null,
    };
    if (esAdmin) cambios.codigo_estrategico = d.codigo_estrategico || null;
    if (!p.fecha_entrega_original || esAdmin) cambios.fecha_entrega_original = d.fecha_entrega_original || null;
    if (!p.fecha_entrega_vigente) cambios.fecha_entrega_vigente = d.fecha_entrega_original || null;
    if (esAdmin) {
      cambios.unidad_id = d.unidad_id || null; cambios.direccion_id = d.direccion_id;
      cambios.avance_manual = d.avance_manual; cambios.avance_manual_justificacion = d.avance_manual_justificacion || null;
      if (d.avance_manual) cambios.avance = Number(d.avance);
    }
    if (d.estado === 'Cancelada' && !(d.motivo_cancelacion || '').trim()) { setOcupado(false); return fallo({ message: 'Para "Cancelada" indique el motivo.' }); }
    if (!esAdmin) {
      // Solo se envían los campos que cambiaron; el cambio se aplica cuando el jefe de unidad lo valida
      const solo = {};
      for (const [k, v] of Object.entries(cambios)) {
        const a = p[k] === undefined ? null : p[k];
        if (String(v ?? '') !== String(a ?? '')) solo[k] = v;
      }
      const datos = { cambios: solo };
      const apoyosCambian = ap.length !== apoyos.length || ap.some(x => !apoyos.includes(x));
      if (apoyosCambian) { datos.apoyos = ap; datos.apoyos_nombres = ap.map(nom).join(', '); }
      if (!Object.keys(solo).length && !apoyosCambian) { setOcupado(false); return fallo({ message: 'No hay cambios que enviar.' }); }
      const { error } = await sb.rpc('proponer', { p_tipo: 'proyecto', p_proyecto: p.id, p_registro: null, p_datos: datos, p_motivo: null });
      setOcupado(false);
      return error ? fallo(error) : listo('Cambios enviados a validación. Se aplicarán cuando los valide.');
    }
    const { error } = await sb.from('proyectos').update(cambios).eq('id', p.id).select('id').single();
    if (error) { setOcupado(false); return fallo(error); }
    // Apoyos
    const quitar = apoyos.filter(x => !ap.includes(x)), poner = ap.filter(x => !apoyos.includes(x));
    if (quitar.length) { const r = await sb.from('proyecto_apoyos').delete().eq('proyecto_id', p.id).in('persona_id', quitar); if (r.error) { setOcupado(false); return fallo(r.error); } }
    if (poner.length) { const r = await sb.from('proyecto_apoyos').insert(poner.map(x => ({ proyecto_id: p.id, persona_id: x }))); if (r.error) { setOcupado(false); return fallo(r.error); } }
    setOcupado(false); listo('Cambios guardados. Quedaron registrados en la bitácora.');
  }

  // Proyecto medido por centros educativos (mobiliario): totales y % de cumplimiento en los datos generales
  const meta = p.meta_productos ? html`<${MetaCentros} p=${p} tareas=${tareas} ctx=${ctx} listo=${listo} fallo=${fallo} />` : '';
  if (!editable) {
    return html`${meta}<div class="panel"><div class="datos">
      <div><small>Nombre</small><b>${p.nombre}</b></div><div><small>Código de proyecto</small><b>${p.codigo}</b>${p.codigos_continuidad ? html`<span class="cod-unidos">${p.codigos_continuidad}</span>` : ''}</div>
      <div><small>Estado</small><${EstadoProyecto} p=${p} /></div>
      <div class="ancho"><small>Descripción</small><div class="prewrap">${p.descripcion || '—'}</div></div>
      <div class="ancho"><small>Objetivo o resultado esperado</small><div class="prewrap">${p.objetivo || '—'}</div></div>
      <div><small>Dirección</small>${p.direccion_nombre}</div>
      <div><small>Unidad</small>${p.unidad_nombre || 'Por validar'}</div>
      <div><small>Responsable</small>${p.responsable_nombre || '—'}</div>
      <div><small>Apoyo</small>${p.apoyos_nombres || '—'}</div>
      <div><small>Fecha de inicio</small>${fecha(p.fecha_inicio)}</div>
      <div><small>Entrega original / vigente</small>${fecha(p.fecha_entrega_original)} / ${fecha(p.fecha_entrega_vigente)}</div>
      <div><small>Presupuesto programado</small>${bs(p.presupuesto_programado)}</div>
      <div><small>Presupuesto ejecutado</small>${bs(p.presupuesto_ejecutado)}</div>
      <div class="ancho"><small>Situación actual</small><div class="prewrap">${p.situacion_actual || '—'}</div></div>
      <div class="ancho"><small>Próximo paso</small><div class="prewrap">${p.proximo_paso || '—'}</div></div>
      <div class="ancho"><small>Beneficiarios</small><div class="prewrap">${p.beneficiarios || '—'}</div></div>
      <div class="ancho"><small>Qué falta para completarlo</small><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} max=${50} /></div>
      ${p.estado === 'Cancelada' && html`<div class="ancho"><small>Motivo de cancelación</small>${p.motivo_cancelacion}</div>`}
      ${p.avance_manual && html`<div class="ancho"><small>Justificación del avance manual</small>${p.avance_manual_justificacion}</div>`}
    </div></div>`;
  }

  return html`${meta}<div class="panel">
    <div class="form">
      <label class="ancho">Nombre<input value=${d.nombre} onInput=${set('nombre')} /></label>
      <label>Código de proyecto<input value=${p.codigo} disabled />${p.codigos_continuidad ? html`<span class="ayuda">Se le unieron: ${p.codigos_continuidad}</span>` : ''}</label>
      <label>Código de proyecto de gobierno<input value=${d.codigo_gobierno || ''} onInput=${set('codigo_gobierno')} /></label>
      <label>Estado<select value=${d.estado} onChange=${set('estado')}>
        ${d.estado === 'No reportada' && html`<option value="No reportada">No reportada (lo asigna el sistema)</option>`}
        ${ESTADOS_EDITABLES.map(e => html`<option>${e}</option>`)}</select>
        <span class="ayuda">«Concluida» exige 100 % y al menos una evidencia. «Cancelada» exige motivo.</span></label>
      ${d.estado === 'Cancelada' && html`<label class="ancho">Motivo de cancelación<textarea value=${d.motivo_cancelacion || ''} onInput=${set('motivo_cancelacion')} /></label>`}
      <label class="ancho">Descripción<textarea value=${d.descripcion || ''} onInput=${set('descripcion')} /></label>
      <label class="ancho">Objetivo o resultado esperado<textarea value=${d.objetivo || ''} onInput=${set('objetivo')} /></label>
      ${esAdmin ? html`<label>Unidad<select value=${d.unidad_id || ''} onChange=${e => { const u = cat.unidades.find(x => x.id === e.target.value); setD({ ...d, unidad_id: e.target.value || null, direccion_id: u ? u.direccion_id : d.direccion_id }); }}>
          <option value="">Por validar (sin unidad)</option>${cat.unidades.map(u => html`<option value=${u.id}>${u.sigla}</option>`)}</select></label>`
        : html`<label>Unidad<input disabled value=${unidad ? unidad.sigla : 'Por validar'} /></label>`}
      ${!puedeCambiarResp && html`<div class="ancho"><${Aviso} tipo="info">👥 La modificación de responsables está desactivada en ${p.direccion_sigla}. Si hay que reasignar este proyecto, solicítelo al administrador.<//></div>`}
      <label>Responsable principal<select value=${d.responsable_id || ''} disabled=${!puedeCambiarResp} onChange=${set('responsable_id')}>
        <option value="">Sin responsable</option>${personas.map(x => html`<option value=${x.id}>${x.nombre}</option>`)}</select>
        <button type="button" style="margin-top:.3rem;width:fit-content" onClick=${nuevaPersona}>+ Agregar persona</button></label>
      <label>Responsables de apoyo
        <select value="" disabled=${!puedeCambiarResp && apoyos.length > 0} onChange=${e => e.target.value && !ap.includes(e.target.value) && setAp([...ap, e.target.value])}>
          <option value="">Agregar…</option>${personas.filter(x => x.id !== d.responsable_id && !ap.includes(x.id)).map(x => html`<option value=${x.id}>${x.nombre}</option>`)}</select>
        <span>${ap.map(x => html`<span class="pill" style="margin:.2rem .2rem 0 0;display:inline-block">${nom(x)} ${(puedeCambiarResp || apoyos.length === 0) && html`<a href="#" onClick=${e => { e.preventDefault(); setAp(ap.filter(y => y !== x)); }}>✕</a>`}</span>`)}</span></label>
      <label>Fecha de inicio<${FechaInput} valor=${d.fecha_inicio} onCambio=${v => setD(x => ({ ...x, fecha_inicio: v }))} /></label>
      <label>Fecha de entrega original<${FechaInput} valor=${d.fecha_entrega_original} disabled=${!!p.fecha_entrega_original && !esAdmin} onCambio=${v => setD(x => ({ ...x, fecha_entrega_original: v }))} />
        <span class="ayuda">Para cambiar la fecha vigente use «Reprogramar entrega».</span></label>
      <label>Presupuesto programado (Bs)<${MontoInput} valor=${d.presupuesto_programado} onCambio=${v => setD(x => ({ ...x, presupuesto_programado: v }))} /></label>
      <label>Presupuesto ejecutado (Bs)<${MontoInput} valor=${d.presupuesto_ejecutado} onCambio=${v => setD(x => ({ ...x, presupuesto_ejecutado: v }))} /></label>
      <label class="ancho">Situación actual<textarea value=${d.situacion_actual || ''} onInput=${set('situacion_actual')} /></label>
      <label class="ancho">Próximo paso<textarea value=${d.proximo_paso || ''} onInput=${set('proximo_paso')} /></label>
      <label class="ancho">Beneficiarios<textarea value=${d.beneficiarios || ''} onInput=${set('beneficiarios')} /></label>
      <div class="ancho"><small class="ayuda"><b>Qué falta para completarlo</b> (se arma solo con las tareas pendientes)</small>
        <${QueFalta} items=${p.que_falta} max=${50} /></div>
      <label class="ancho">Observaciones sobre lo que falta<textarea value=${d.observaciones_falta || ''} onInput=${set('observaciones_falta')} /></label>
      <label class="ancho">Proyecto del plan de gobierno (Eje III Ciudad Inteligente)<select value=${d.codigo_estrategico || ''} onChange=${set('codigo_estrategico')}>
        <option value="">— Fuera del plan de gobierno —</option>
        ${(cat.estrategicos || []).map(e => html`<option value=${e.codigo}>${e.tipo === 'programa' ? e.codigo + ' (programa ' + e.numeral + ')' : e.codigo} · ${e.nombre.slice(0, 80)}</option>`)}</select></label>
      <label style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${d.por_validar} onChange=${set('por_validar')} /> Marcado «Datos por revisar» (quite la marca cuando esté corregido)</label>
      ${d.por_validar && html`<label>Motivo<input value=${d.por_validar_motivo || ''} onInput=${set('por_validar_motivo')} /></label>`}
    </div>
    ${esAdmin && html`<div class="panel" style="margin-top:1rem;background:#fbfcfc">
      <h3>Avance manual (solo administrador)</h3>
      <div class="form">
        <label style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${d.avance_manual} onChange=${set('avance_manual')} /> Permitir avance manual</label>
        ${d.avance_manual && html`<label>Avance (%)<input type="number" min="0" max="100" step="0.1" value=${d.avance} onInput=${set('avance')} /></label>
          <label class="ancho">Justificación (obligatoria)<textarea value=${d.avance_manual_justificacion || ''} onInput=${set('avance_manual_justificacion')} /></label>`}
      </div>
      <p class="ayuda">Sin avance manual, el avance es el promedio ponderado del avance de las tareas según su peso.</p>
    </div>`}
    <div class="acciones" style="margin-top:1rem"><button class="prim" disabled=${ocupado} onClick=${guardar}>${ocupado ? 'Guardando…' : esAdmin || perfil.rol === 'director' ? 'Guardar cambios' : 'Guardar y enviar a validación'}</button>
      ${!esAdmin && html`<span class="ayuda">${perfil.rol === 'director' ? 'Como dirección, sus cambios se aplican sin validación y quedan registrados en la bitácora.'
        : 'Los cambios se aplican cuando el jefe de su unidad (o el director, si la unidad no tiene jefe) los valida.'}</span>`}</div>
  </div>`;
}

// ---------------------------------------------------------------------
function Gantt({ tareas, p }) {
  const conFecha = tareas.filter(t => t.fecha_fin_vigente || t.fecha_inicio);
  if (!conFecha.length) return html`<div class="vacio">Las tareas no tienen fechas para dibujar la línea de tiempo.</div>`;
  const hoy = hoyISO();
  const ini = t => t.fecha_inicio || t.fecha_fin_original || t.fecha_fin_vigente;
  const fechas = conFecha.flatMap(t => [ini(t), t.fecha_fin_vigente, t.fecha_fin_original].filter(Boolean)).concat([hoy]);
  if (p.fecha_entrega_vigente) fechas.push(p.fecha_entrega_vigente);
  let min = fechas.reduce((a, b) => a < b ? a : b), max = fechas.reduce((a, b) => a > b ? a : b);
  min = min.slice(0, 8) + '01';
  const total = Math.max(1, diasEntre(min, max) + 7);
  const x = d => (diasEntre(min, d) / total) * 100;
  const meses = [];
  let m = min;
  while (m <= max) { meses.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, '0')}-01`; }
  return html`<div class="gantt"><div class="gantt-int">
    <div class="g-meses"><div class="g-nom">Tarea</div><div class="g-pista" style="height:24px">
      ${meses.map(mm => html`<span style=${`left:${x(mm)}%`}>${nombreMes(mm).slice(0, 3)} ${mm.slice(2, 4)}</span>`)}</div></div>
    ${tareas.map(t => {
      const a = ini(t), b = t.fecha_fin_vigente || a;
      const vencida = b && b < hoy && !['Concluida', 'Cancelada'].includes(t.estado);
      return html`<div class="g-fila"><div class="g-nom" title=${t.nombre}>${t.nombre.length > 60 ? t.nombre.slice(0, 60) + '…' : t.nombre}<br/><span class="pill">${pct(t.avance)} · ${t.estado}</span></div>
        <div class="g-pista">
          ${a && (t.tipo === 'Hito' ? html`<i class="g-hito" style=${`left:calc(${x(b)}% - 7px)`} title=${'Hito: ' + fecha(b)}></i>`
            : html`<div class="g-barra ${vencida ? 'rojo' : ''}" title=${`${fecha(a)} → ${fecha(b)}`} style=${`left:${x(a)}%;width:max(4px,${x(b) - x(a)}%)`}><i style=${`width:${t.avance}%`}></i></div>`)}
          ${t.fecha_fin_original && t.fecha_fin_original !== t.fecha_fin_vigente && html`<i class="g-orig" title=${'Fin original: ' + fecha(t.fecha_fin_original)} style=${`left:${x(t.fecha_fin_original)}%`}></i>`}
        </div></div>`;
    })}
    <div class="g-hoy" style=${`left:calc(260px + (100% - 260px) * ${x(hoy) / 100})`} title=${'Hoy ' + fecha(hoy)}></div>
  </div></div>
  <p class="ayuda">Barra: inicio → fin vigente (relleno = avance). Línea punteada: fin original. Línea roja: hoy. Contorno rojo: vencida sin concluir.</p>`;
}

function Tareas({ p, tareas: validadas, pendientes = [], editable, ctx, listo, fallo }) {
  const [edit, setEdit] = useState(null);
  const [entregaNueva, setEntregaNueva] = useState(false);
  const { perfil } = ctx;
  const todas = [...validadas, ...pendientes];
  // En el proyecto de mobiliario los productos (entregas) van en su propia tabla; aquí quedan las demás tareas
  const tareas = p.meta_productos ? todas.filter(t => t.tipo !== 'Producto') : todas;
  // Editar o eliminar: la tarea pendiente, quien la registró (o el administrador); la validada, solo el administrador (o la dirección)
  const puedeTocar = t => t._prop ? (perfil.rol === 'admin' || t._autor === perfil.id) : (perfil.rol === 'admin' || perfil.rol === 'director');
  async function retirar(t) {
    if (!confirm(`¿Eliminar la tarea «${t.nombre}»? Aún no fue validada, así que se descarta.`)) return;
    const { error } = await sb.rpc('retirar_propuesta', { p_id: t._prop });
    error ? fallo(error) : listo('Tarea eliminada (no había sido validada).');
  }
  const pesoTotal = tareas.filter(t => t.estado !== 'Cancelada').reduce((a, t) => a + Number(t.peso), 0);
  async function borrar(t) {
    if (!confirm(`¿Eliminar la tarea «${t.nombre}»? Queda registrado en la bitácora.`)) return;
    const { error } = await sb.from('tareas').delete().eq('id', t.id).select('id').single();
    error ? fallo(error) : listo('Tarea eliminada.');
  }
  return html`
    ${p.meta_productos && html`<${Entregas} p=${p} tareas=${todas} editable=${editable} ctx=${ctx} listo=${listo} fallo=${fallo} puedeTocar=${puedeTocar} retirar=${retirar} />`}
    <div class="panel"><h3>Línea de tiempo</h3><${Gantt} tareas=${todas.filter(t => !t._prop)} p=${p} />
      ${p.meta_productos && html`<p class="ayuda">Incluye las entregas de mobiliario con su fecha de entrega.</p>`}</div>
    <div class="panel">
      <div class="encabezado"><div><h3>${p.meta_productos ? 'Otras tareas' : 'Tareas'}</h3><p>Peso total ${pesoTotal}. El avance del proyecto es Σ(peso × avance) / Σ peso.</p></div>
        <div class="acciones">${editable && html`<button class="prim" onClick=${() => p.meta_productos ? setEntregaNueva(true) : setEdit({})}>+ Nueva tarea</button>`}
          <button onClick=${() => exportarExcel('tareas_' + p.codigo, COL_TAREAS, tareas, 'Tareas')}>Exportar Excel</button></div></div>
      <div class="tabla-env"><table>
        <thead><tr><th>Tarea</th><th>Responsable</th><th>Inicio</th><th>Fin original</th><th>Fin vigente</th><th class="num">Peso</th><th>Avance</th><th>Estado</th><th>Evidencia</th>${editable && html`<th></th>`}</tr></thead>
        <tbody>${tareas.map(t => html`<tr>
          <td><span class="pill">${t.tipo}</span> ${t.codigo ? html`<span class="pill">${t.codigo}</span>` : ''}${t.tipo_centro ? html` <span class="pill">${t.tipo_centro}</span>` : ''}
            ${t._prop ? html` <span class="etiqueta" title=${'Registrada por ' + (t._autorNombre || '') + '; espera validación'}>Pendiente de validación</span>` : ''}<br/>${t.nombre}</td>
          <td>${(ctx.cat.personas.find(x => x.id === t.responsable_id) || {}).nombre || t.responsable_texto || '—'}</td>
          <td class="nowrap">${fecha(t.fecha_inicio)}</td><td class="nowrap">${fecha(t.fecha_fin_original)}</td>
          <td class="nowrap">${fecha(t.fecha_fin_vigente)}</td><td class="num">${t.peso}</td>
          <td style="min-width:110px"><${Barra} v=${t.avance} /></td><td><${Estado} e=${t.estado} /></td>
          <td>${t.evidencia || '—'}</td>
          ${editable && html`<td class="nowrap"><div class="acciones">
            ${puedeTocar(t) && html`<button onClick=${() => setEdit(t)}>Editar</button>`}
            ${t._prop && puedeTocar(t) && html`<button class="peligro" onClick=${() => retirar(t)}>Eliminar</button>`}
            ${!t._prop && !puedeTocar(t) && html`<span class="ayuda" title="La tarea ya fue validada: para cambiarla o eliminarla consulte al administrador">🔒 Validada</span>`}
            ${!t._prop && html`
            <${BotonReprogramar} chico titulo=${'Reprogramar tarea: ' + t.nombre} actual=${t.fecha_fin_vigente}
              onGuardar=${async (f, m) => {
                if (ctx.perfil.rol === 'admin') { const { error } = await sb.rpc('reprogramar_tarea', { p_id: t.id, p_fecha: f, p_motivo: m }); if (error) throw error; return listo('Tarea reprogramada. La fecha vigente del proyecto y el semáforo se actualizaron si correspondía.'); }
                const { error } = await sb.rpc('proponer', { p_tipo: 'reprogramar_tarea', p_proyecto: p.id, p_registro: t.id, p_datos: { fecha: f }, p_motivo: m });
                if (error) throw error; listo('Reprogramación enviada a validación. Se aplicará cuando la valide.'); }} />
            `}
            ${!t._prop && ctx.perfil.rol === 'admin' && html`<button class="peligro" onClick=${() => borrar(t)}>Eliminar</button>`}</div></td>`}
        </tr>`)}</tbody></table>
        ${!tareas.length && html`<div class="vacio">Sin tareas. ${editable ? 'Agregue la primera.' : ''}</div>`}</div>
    </div>
    ${edit && html`<${EditarTarea} t=${edit} p=${p} ctx=${ctx} onCerrar=${() => setEdit(null)} onGuardado=${m => { setEdit(null); listo(m); }} />`}
    ${entregaNueva && html`<${FormEntrega} t=${{}} p=${p} ctx=${ctx} onCerrar=${() => setEntregaNueva(false)} onGuardado=${m => { setEntregaNueva(false); listo(m); }} />`}`;
}

// ---------------------------------------------------------------------
// Unidades educativas atendidas: un centro con varias entregas cuenta una vez (su mayor N.º de U.E.)
const claveCentro = n => (n || '').trim().replace(/\s+/g, ' ').toLowerCase();
const nUE = t => Number(t.centros || 1);
function ueAtendidas(xs) {
  return Object.values(xs.reduce((m, t) => { const k = claveCentro(t.nombre); m[k] = Math.max(m[k] || 0, nUE(t)); return m; }, {})).reduce((a, v) => a + v, 0);
}

// Datos generales del proyecto de mobiliario: centros educativos totales, por categoría, atendidos y % de cumplimiento
function MetaCentros({ p, tareas, ctx, listo, fallo }) {
  const esAdmin = ctx.perfil.rol === 'admin';
  const [u, setU] = useState({ ...(p.universo_productos || {}) });
  const [editar, setEditar] = useState(false);
  const hechas = (tareas || []).filter(t => t.tipo === 'Producto' && t.estado === 'Concluida');
  const total = TIPOS_CENTRO.reduce((a, [k]) => a + Number(u[k] || 0), 0);
  const metaTotal = p.meta_productos;
  const at = ueAtendidas(hechas);
  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
  async function guardar() {
    const universo = Object.fromEntries(TIPOS_CENTRO.map(([k]) => [k, Math.max(0, Math.round(Number(u[k] || 0)))]));
    const suma = Object.values(universo).reduce((a, v) => a + v, 0);
    if (!suma) return fallo({ message: 'Indique la cantidad de centros educativos.' });
    const { error } = await sb.from('proyectos').update({ universo_productos: universo, meta_productos: suma }).eq('id', p.id).select('id').single();
    if (error) return fallo(error);
    setEditar(false); listo('Totales de centros educativos actualizados.');
  }
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Centros educativos y cumplimiento</h3>
      <p>Porcentaje de cumplimiento = unidades educativas que recibieron juegos de mobiliario / total de centros educativos.</p></div>
      ${esAdmin && !editar && html`<button onClick=${() => setEditar(true)}>Editar totales</button>`}</div>
    <div class="rejilla kpis" style="margin-bottom:.8rem">
      <div class="kpi"><div class="v">${metaTotal}</div><div class="t">centros educativos totales</div></div>
      <div class="kpi"><div class="v">${at}</div><div class="t">unidades educativas atendidas</div></div>
      <div class="kpi"><div class="v">${pct(at, metaTotal)} %</div><div class="t">cumplimiento (${at} de ${metaTotal})</div></div></div>
    <div class="tabla-env"><table><thead><tr><th>Categoría</th><th class="num">Cantidad total</th><th class="num">Atendidas</th><th>Cumplimiento</th></tr></thead>
      <tbody>${TIPOS_CENTRO.map(([k, n]) => { const a = ueAtendidas(hechas.filter(t => t.tipo_centro === k)); return html`<tr><td>${n}</td>
          <td class="num">${editar ? html`<input type="number" min="0" step="1" style="width:90px" value=${u[k] ?? ''} onInput=${e => setU({ ...u, [k]: e.target.value })} />` : (p.universo_productos || {})[k] ?? '—'}</td>
          <td class="num">${a}</td><td style="min-width:130px"><${Barra} v=${pct(a, (p.universo_productos || {})[k])} /></td></tr>`; })}
        ${hechas.some(t => !t.tipo_centro) && html`<tr><td class="ayuda">Sin categoría indicada (por completar en Tareas)</td><td></td>
          <td class="num">${ueAtendidas(hechas.filter(t => !t.tipo_centro))}</td><td></td></tr>`}
        <tr><td><b>Total de centros educativos</b></td><td class="num"><b>${editar ? total : metaTotal}</b></td><td class="num"><b>${at}</b></td>
          <td><${Barra} v=${pct(at, metaTotal)} /></td></tr></tbody></table></div>
    ${editar && html`<div class="acciones" style="margin-top:.6rem"><button onClick=${() => { setU({ ...(p.universo_productos || {}) }); setEditar(false); }}>Cancelar</button>
      <button class="prim" onClick=${guardar}>Guardar totales</button></div>`}
  </div>`;
}

// Proyectos medidos por productos (mobiliario): cada entrega es un producto = un centro educativo atendido.
// Avance = centros atendidos (productos concluidos) / meta (418). Las entregas nuevas se validan como siempre.
const TIPOS_CENTRO = [['UE fiscal', 'Unidades educativas fiscales'], ['UE de convenio', 'Unidades educativas de convenio'],
  ['CEE', 'Centros de educación especial'], ['CEA', 'Centros de educación alternativa']];

const NIVELES = ['Inicial', 'Primaria', 'Secundaria'];
const juegos = t => Number(t.cantidad || 0);

// Pestaña Tareas del proyecto de mobiliario: cada entrega es un producto (unidad educativa + juegos por nivel).
// Los datos que falten quedan como casillas libres para llenar; al final, totales por nivel, U.E. atendidas y % sobre el total.
function Entregas({ p, tareas, editable, ctx, listo, fallo, puedeTocar = () => false, retirar }) {
  const [form, setForm] = useState(null);          // {} = nueva entrega; tarea = corregir
  const [pend, setPend] = useState(0);
  useEffect(() => {
    sb.from('propuestas').select('id', { count: 'exact', head: true }).eq('proyecto_id', p.id).in('tipo', ['crear_tarea', 'tarea']).eq('estado', 'pendiente')
      .then(({ count }) => setPend(count || 0));
  }, [tareas]);
  const meta = p.meta_productos;
  const entregas = tareas.filter(t => t.tipo === 'Producto')
    .sort((a, b) => (a.fecha_fin_original || '9').localeCompare(b.fecha_fin_original || '9') || (a.orden ?? 0) - (b.orden ?? 0));
  const hechas = entregas.filter(t => t.estado === 'Concluida' && !t._prop);   // solo lo validado suma
  const nivel = (t, n) => (t.niveles || {})[n];
  const asignado = t => NIVELES.reduce((a, n) => a + Number(nivel(t, n) || 0), 0);
  const porAsignar = t => Math.max(0, juegos(t) - asignado(t));
  const totNivel = n => hechas.reduce((a, t) => a + Number(nivel(t, n) || 0), 0);
  const totJuegos = hechas.reduce((a, t) => a + juegos(t), 0);
  const totPorAsignar = hechas.reduce((a, t) => a + porAsignar(t), 0);
  const at = ueAtendidas(hechas);
  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
  const nombreTipo = k => (TIPOS_CENTRO.find(x => x[0] === k) || [k, k])[1];
  async function eliminarValidada(t) {
    if (!confirm(`¿Eliminar la entrega «${t.nombre}»? Ya fue validada; quedará registrado en la bitácora y los totales se recalcularán.`)) return;
    const { error } = await sb.from('tareas').delete().eq('id', t.id).select('id').single();
    error ? fallo(error) : listo('Entrega eliminada. Los totales y el avance se recalcularon.');
  }
  const c = (t, campo, valor, extra = {}) => html`<${Celda} t=${t} p=${p} ctx=${ctx} listo=${listo} editable=${editable && !t._prop} campo=${campo} valor=${valor} ...${extra} />`;
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Productos: entregas de mobiliario</h3>
      <p>Cada fila es una entrega registrada con «+ Nueva tarea»: se ordena sola por fecha y suma a los totales y a la línea de tiempo al ser validada. Las casillas vacías quedan libres para completar el dato que falta.</p></div>
      <div class="acciones">${editable && html`<button class="prim" onClick=${() => setForm({})}>+ Agregar tarea (entrega de mobiliario)</button>`}
        <button onClick=${() => exportarExcel('entregas_mobiliario_' + p.codigo, COL_ENTREGAS, entregas.map(t => ({ ...t, ue: nUE(t), por_asignar: porAsignar(t) || '' })), 'Entregas')}>Exportar Excel</button></div></div>
    ${pend > 0 && html`<${Aviso} tipo="info">${pend} registro(s) esperan validación del jefe de unidad; se sumarán al validarlos.<//>`}
    ${!entregas.length && !editable ? html`<div class="vacio">Aún no hay entregas registradas.</div>` : html`
    <div class="tabla-env"><table class="tabla-productos">
      <thead><tr><th rowspan="2">N.º</th><th rowspan="2">Fecha</th><th rowspan="2">Unidad educativa</th><th rowspan="2">Categoría</th><th rowspan="2" class="num">N.º de U.E.</th>
          <th colspan="3" class="centro">Juegos de mobiliario por nivel</th><th rowspan="2" class="num">Total juegos</th><th rowspan="2">Evidencia</th>${editable && html`<th rowspan="2"></th>`}</tr>
        <tr>${NIVELES.map(n => html`<th class="num">${n}</th>`)}</tr></thead>
      <tbody>${entregas.map((t, i) => html`<tr>
          <td>${t.codigo || i + 1}${t._prop ? html`<br/><span class="etiqueta" title=${'Registrada por ' + (t._autorNombre || '')}>Por validar</span>` : ''}</td>
          <td class="nowrap">${c(t, 'fecha_fin_original', t.fecha_fin_original, { tipo: 'date', mostrar: fecha(t.fecha_fin_original) })}</td>
          <td>${c(t, 'nombre', t.nombre, { tipo: 'text', negrita: true })}</td>
          <td>${c(t, 'tipo_centro', t.tipo_centro, { opciones: TIPOS_CENTRO, mostrar: t.tipo_centro && nombreTipo(t.tipo_centro) })}</td>
          <td class="num">${t.centros ?? 1}</td>
          ${NIVELES.map(n => html`<td class="num">${c(t, 'nivel:' + n, nivel(t, n), { tipo: 'number' })}</td>`)}
          <td class="num"><b>${juegos(t) || ''}</b>${porAsignar(t) > 0 && html`<div class="ayuda" title="Juegos registrados sin nivel: anótelos en Inicial, Primaria o Secundaria">${porAsignar(t)} sin nivel</div>`}</td>
          <td class="ayuda">${c(t, 'evidencia', t.evidencia, { tipo: 'text' })}</td>
          ${editable && html`<td class="nowrap">${puedeTocar(t) ? html`<div class="acciones"><button onClick=${() => setForm(t)}>Editar</button>
              ${t._prop && html`<button class="peligro" onClick=${() => retirar(t)}>Eliminar</button>`}
              ${!t._prop && ctx.perfil.rol === 'admin' && html`<button class="peligro" onClick=${() => eliminarValidada(t)}>Eliminar</button>`}</div>`
            : html`<span class="ayuda" title="Entrega validada: para cambiarla o eliminarla consulte al administrador">🔒 Validada</span>`}</td>`}</tr>`)}</tbody>
      <tfoot><tr class="total"><td colspan="5"><b>Total juegos de mobiliario por nivel</b></td>
          ${NIVELES.map(n => html`<td class="num"><b>${totNivel(n)}</b></td>`)}
          <td class="num"><b>${totJuegos}</b>${totPorAsignar > 0 && html`<div class="ayuda">${totPorAsignar} sin nivel</div>`}</td><td colspan=${editable ? 2 : 1}></td></tr>
        <tr class="total"><td colspan="5"><b>Unidades educativas atendidas</b></td>
          <td colspan="3" class="num"><b>${at} de ${meta}</b></td><td class="num"><b>${pct(at, meta)} %</b></td><td colspan=${editable ? 2 : 1} class="ayuda">avance respecto al total de centros educativos</td></tr></tfoot>
    </table></div>`}
    ${form && html`<${FormEntrega} t=${form} p=${p} ctx=${ctx} onCerrar=${() => setForm(null)} onGuardado=${m => { setForm(null); listo(m); }} />`}
  </div>`;
}

// Guarda una entrega nueva (producto). Administrador: directo; demás: va a validación del jefe de unidad.
async function guardarEntregaNueva(p, ctx, fila, fechaEntrega) {
  const datos = { ...fila, tipo: 'Producto', fecha_fin_original: fechaEntrega, peso: 1, avance: 100, estado: 'Concluida' };
  return ctx.perfil.rol === 'admin'
    ? sb.from('tareas').insert({ ...datos, proyecto_id: p.id, fecha_fin_vigente: fechaEntrega }).select('id').single()
    : sb.rpc('proponer', { p_tipo: 'crear_tarea', p_proyecto: p.id, p_registro: null, p_datos: datos, p_motivo: null });
}

// Celda de la tabla de productos: muestra el dato; si falta y se puede editar, deja la casilla libre para llenarlo
function Celda({ t, p, ctx, listo, editable, campo, valor, tipo, opciones, mostrar, negrita }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const vacio = valor === null || valor === undefined || valor === '';
  if (!vacio) return negrita ? html`<b>${mostrar ?? valor}</b>` : html`${mostrar ?? valor}`;
  if (!editable) return html`<span class="ayuda">—</span>`;
  async function guardar(x) {
    if (x === '' || x === null || x === undefined) return;
    let cambios;
    if (campo.startsWith('nivel:')) {
      const n = Math.max(0, Math.round(Number(x)));
      if (Number.isNaN(n)) return setErr('Número');
      const niveles = { ...(t.niveles || {}), [campo.slice(6)]: n };
      const suma = Object.values(niveles).reduce((a, y) => a + Number(y || 0), 0);
      cambios = { niveles, cantidad: Math.max(Number(t.cantidad || 0), suma) };
    } else if (campo === 'fecha_fin_original') cambios = ctx.perfil.rol === 'admin' ? { fecha_fin_original: x, fecha_fin_vigente: x } : { fecha_fin_original: x };
    else cambios = { [campo]: String(x).trim() };
    const r = ctx.perfil.rol === 'admin'
      ? await sb.from('tareas').update(cambios).eq('id', t.id).select('id').single()
      : await sb.rpc('proponer', { p_tipo: 'tarea', p_proyecto: p.id, p_registro: t.id, p_datos: { cambios }, p_motivo: null });
    if (r.error) return setErr(mensajeError(r.error));
    listo(ctx.perfil.rol === 'admin' ? 'Dato guardado.' : 'Dato enviado a validación del jefe de unidad.');
  }
  if (opciones) return html`<select class="falta" value="" onChange=${e => guardar(e.target.value)} title="Dato faltante: elíjalo aquí">
      <option value="">Elegir…</option>${opciones.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
    ${err && html`<div class="ayuda" style="color:var(--rojo)">${err}</div>`}`;
  return html`<span class="falta-caja"><input class=${'falta' + (tipo === 'number' ? ' corto' : '')} type=${tipo || 'text'} min="0" value=${v} placeholder=""
      title="Dato faltante: escríbalo y pulse Enter" onInput=${e => setV(e.target.value)} onKeyDown=${e => e.key === 'Enter' && guardar(v)} />
    ${v !== '' && html`<button class="mini" onClick=${() => guardar(v)}>✓</button>`}</span>
    ${err && html`<div class="ayuda" style="color:var(--rojo)">${err}</div>`}`;
}

const COL_ENTREGAS = [
  { titulo: 'N.º', campo: 'codigo' }, { titulo: 'Fecha de entrega', valor: t => fecha(t.fecha_fin_original) }, { titulo: 'Unidad educativa', campo: 'nombre', ancho: 40 },
  { titulo: 'Categoría', campo: 'tipo_centro' }, { titulo: 'N.º de U.E.', campo: 'ue' },
  ...NIVELES.map(n => ({ titulo: 'Juegos ' + n, valor: t => (t.niveles || {})[n] ?? '' })),
  { titulo: 'Juegos sin nivel', campo: 'por_asignar' }, { titulo: 'Total juegos', campo: 'cantidad' },
  { titulo: 'Estudiantes beneficiados', campo: 'estudiantes' }, { titulo: 'Descripción', campo: 'observaciones', ancho: 60 },
  { titulo: 'Evidencia', campo: 'evidencia', ancho: 30 }, { titulo: 'Estado', campo: 'estado' },
];

function FormEntrega({ t, p, ctx, onCerrar, onGuardado }) {
  const nueva = !t.id;
  const [d, setD] = useState({ nombre: t.nombre || '', tipo_centro: t.tipo_centro || '', fecha: t.fecha_fin_original || '',
    lineas: Object.entries(t.niveles || {}).length ? Object.entries(t.niveles).map(([nivel, juegos]) => ({ nivel, juegos }))
      : [{ nivel: '', juegos: t.cantidad ?? '' }],
    centros: t.centros ?? 1, estudiantes: t.estudiantes ?? '', detalle: t.observaciones || '', evidencia: t.evidencia || '' });
  const [err, setErr] = useState('');
  const set = k => e => { const v = e.target.value; setD(x => ({ ...x, [k]: v })); };
  const entero = v => v === '' || v === null || v === undefined ? null : Math.max(0, Math.round(Number(v)));
  const niv = {};
  d.lineas.forEach(l => { const v = entero(l.juegos); if (l.nivel && v) niv[l.nivel] = (niv[l.nivel] || 0) + v; });
  const total = d.lineas.reduce((a, l) => a + (entero(l.juegos) || 0), 0);
  const linea = (i, k, v) => setD(x => ({ ...x, lineas: x.lineas.map((l, j) => j === i ? { ...l, [k]: v } : l) }));
  async function guardar() {
    if (!d.nombre.trim()) return setErr('Escriba el nombre del centro educativo.');
    if (!d.tipo_centro) return setErr('Elija la categoría de la unidad educativa (fiscal, de convenio, especial o alternativa).');
    if (!d.fecha) return setErr('Indique la fecha de entrega.');
    if (!total) return setErr('Indique la cantidad de juegos de mobiliario entregados.');
    if (d.lineas.some(l => entero(l.juegos) && !l.nivel)) return setErr('Elija el nivel al que pertenecen los juegos de cada fila.');
    if (!entero(d.centros)) return setErr('Indique cuántas unidades educativas se atendieron en esta entrega (1 o más).');
    const fila = { nombre: d.nombre.trim().replace(/\s+/g, ' '), tipo_centro: d.tipo_centro, cantidad: total, niveles: niv, centros: entero(d.centros),
      estudiantes: entero(d.estudiantes), observaciones: d.detalle.trim() || null, evidencia: d.evidencia.trim() || null };
    const admin = ctx.perfil.rol === 'admin';
    let r;
    if (t._prop) {
      r = await sb.rpc('editar_propuesta', { p_id: t._prop, p_datos: { ...fila, tipo: 'Producto', fecha_fin_original: d.fecha, peso: 1, avance: 100, estado: 'Concluida' } });
      if (r.error) return setErr(mensajeError(r.error));
      return onGuardado('Entrega corregida. Sigue pendiente de validación.');
    }
    if (nueva) {
      r = await guardarEntregaNueva(p, ctx, fila, d.fecha);
    } else {
      const cambios = {};
      for (const [k, v] of Object.entries(fila)) if (JSON.stringify(v ?? null) !== JSON.stringify(t[k] ?? null)) cambios[k] = v;
      if (admin && d.fecha !== t.fecha_fin_original) { cambios.fecha_fin_original = d.fecha; cambios.fecha_fin_vigente = d.fecha; }
      if (!Object.keys(cambios).length) return setErr('No hay cambios que guardar.');
      r = admin ? await sb.from('tareas').update(cambios).eq('id', t.id).select('id').single()
        : await sb.rpc('proponer', { p_tipo: 'tarea', p_proyecto: p.id, p_registro: t.id, p_datos: { cambios }, p_motivo: null });
    }
    if (r.error) return setErr(mensajeError(r.error));
    onGuardado(admin ? (nueva ? 'Entrega registrada.' : 'Entrega corregida.')
      : (nueva ? 'Entrega enviada a validación: se sumará a los centros atendidos cuando la valide su jefe de unidad.' : 'Corrección enviada a validación.'));
  }
  return html`<${Modal} titulo=${nueva ? 'Nueva tarea: entrega de mobiliario' : 'Corregir entrega · ' + t.nombre} onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button><button class="prim" onClick=${guardar}>Guardar</button>`}>
    <${Aviso} tipo="error">${err}<//>
    <div class="form">
      <label class="ancho">Nombre del centro educativo que recibió el mobiliario<input value=${d.nombre} onInput=${set('nombre')} placeholder="p. ej. U.E. Natalia Palacios" />
        <span class="ayuda">Escríbalo siempre igual: si el mismo centro recibe otra entrega, se suman los juegos pero cuenta una sola vez en los 418.</span></label>
      <label>N.º de unidades educativas atendidas en esta entrega<input type="number" min="1" step="1" value=${d.centros} onInput=${set('centros')} />
        <span class="ayuda">Normalmente 1. Si la entrega abarcó varias U.E. con un solo registro (p. ej. un macrodistrito), indique cuántas.</span></label>
      <label>Categoría de unidad educativa<select value=${d.tipo_centro} onChange=${set('tipo_centro')}><option value="">Elija…</option>
        ${TIPOS_CENTRO.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
      <label>Fecha de entrega<${FechaInput} valor=${d.fecha} disabled=${!nueva && !t._prop && ctx.perfil.rol !== 'admin'} onCambio=${v => setD(x => ({ ...x, fecha: v }))} />
        ${!nueva && !t._prop && ctx.perfil.rol !== 'admin' && html`<span class="ayuda">La fecha la corrige el administrador.</span>`}</label>
      <fieldset class="ancho" style="border:1px solid var(--borde,#d6dde1);border-radius:8px;padding:.6rem .8rem">
        <legend>Juegos de mobiliario entregados <span class="ayuda">(unidad de medida: juego)</span></legend>
        ${d.lineas.map((l, i) => html`<div class="form" style="margin:0 0 .4rem;align-items:end">
          <label>Nivel al que pertenecen los juegos<select value=${l.nivel} onChange=${e => linea(i, 'nivel', e.target.value)}>
            <option value="">Elija…</option>${NIVELES.map(n => html`<option>${n}</option>`)}</select></label>
          <label>Cantidad de juegos<input type="number" min="0" step="1" value=${l.juegos} onInput=${e => linea(i, 'juegos', e.target.value)} /></label>
          ${d.lineas.length > 1 && html`<button type="button" onClick=${() => setD(x => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }))}>Quitar</button>`}
        </div>`)}
        <button type="button" onClick=${() => setD(x => ({ ...x, lineas: [...x.lineas, { nivel: '', juegos: '' }] }))}>+ Otro nivel en la misma entrega</button>
        <p style="margin:.5rem 0 0"><b>Total: ${total} juegos de mobiliario</b></p></fieldset>
      <label>Estudiantes beneficiados (opcional)<input type="number" min="0" step="1" value=${d.estudiantes} onInput=${set('estudiantes')} /></label>
      <label class="ancho">Descripción (opcional)<textarea value=${d.detalle} onInput=${set('detalle')} placeholder="Lo que indiquen las evidencias: p. ej. 22 juegos (22 mesas y 44 sillas) para 3.º y 4.º de primaria; macrodistrito Sur" /></label>
      <label class="ancho">Evidencia (acta de entrega, enlace o referencia)<input value=${d.evidencia} onInput=${set('evidencia')} /></label>
    </div>
    ${t._prop && html`<${Aviso} tipo="info">Esta entrega aún no fue validada: puede corregirla libremente.<//>`}
  <//>`;
}

const COL_TAREAS = [
  { titulo: 'Código', campo: 'codigo' }, { titulo: 'Tipo', campo: 'tipo' }, { titulo: 'Tipo de centro', campo: 'tipo_centro' }, { titulo: 'Tarea', campo: 'nombre', ancho: 50 },
  { titulo: 'Inicio', valor: t => fecha(t.fecha_inicio) }, { titulo: 'Fin original', valor: t => fecha(t.fecha_fin_original) },
  { titulo: 'Fin vigente', valor: t => fecha(t.fecha_fin_vigente) }, { titulo: 'Peso', campo: 'peso' },
  { titulo: '% avance', excel: t => Number(t.avance), pdf: t => pct(t.avance) }, { titulo: 'Estado', campo: 'estado' },
  { titulo: 'Evidencia', campo: 'evidencia' },
];

function EditarTarea({ t, p, ctx, onCerrar, onGuardado }) {
  const nueva = !t.id;
  const [d, setD] = useState({ tipo: 'Tarea', peso: 1, avance: 0, estado: 'No iniciada', ...t });
  const [err, setErr] = useState('');
  const set = k => e => { const v = e.target.value; setD(x => ({ ...x, [k]: v })); };
  async function guardar() {
    if (!(d.nombre || '').trim()) return setErr('El nombre es obligatorio.');
    const fila = {
      nombre: d.nombre.trim(), tipo: d.tipo, codigo: d.codigo || null, responsable_id: d.responsable_id || null,
      fecha_inicio: d.fecha_inicio || null, peso: Number(d.peso), avance: Number(d.avance), estado: d.estado,
      evidencia: d.evidencia || null, observaciones: d.observaciones || null,
    };
    if (t._prop) {
      // Tarea pendiente de validación: se corrige la misma propuesta (sigue esperando validación)
      const { error } = await sb.rpc('editar_propuesta', { p_id: t._prop, p_datos: { ...fila, fecha_fin_original: d.fecha_fin_original || null } });
      return error ? setErr(mensajeError(error)) : onGuardado('Tarea corregida. Sigue pendiente de validación.');
    }
    if (nueva) { fila.proyecto_id = p.id; fila.fecha_fin_original = d.fecha_fin_original || null; fila.fecha_fin_vigente = d.fecha_fin_original || null; }
    else if (!t.fecha_fin_original && d.fecha_fin_original) { fila.fecha_fin_original = d.fecha_fin_original; fila.fecha_fin_vigente = d.fecha_fin_original; }
    if (ctx.perfil.rol !== 'admin') {
      let res;
      if (nueva) { const { proyecto_id, fecha_fin_vigente, ...datos } = fila; res = await sb.rpc('proponer', { p_tipo: 'crear_tarea', p_proyecto: p.id, p_registro: null, p_datos: datos, p_motivo: null }); }
      else {
        const solo = {};
        for (const [k, v] of Object.entries(fila)) if (String(v ?? '') !== String(t[k] ?? '')) solo[k] = v;
        if (!Object.keys(solo).length) return setErr('No hay cambios que enviar.');
        res = await sb.rpc('proponer', { p_tipo: 'tarea', p_proyecto: p.id, p_registro: t.id, p_datos: { cambios: solo }, p_motivo: null });
      }
      return res.error ? setErr(mensajeError(res.error)) : onGuardado((nueva ? 'Tarea nueva enviada' : 'Cambio de la tarea enviado') + ' a validación. Se aplicará cuando lo valide.');
    }
    const q = nueva ? sb.from('tareas').insert(fila) : sb.from('tareas').update(fila).eq('id', t.id);
    const { error } = await q.select('id').single();
    error ? setErr(mensajeError(error)) : onGuardado(nueva ? 'Tarea creada.' : 'Tarea actualizada.');
  }
  return html`<${Modal} titulo=${nueva ? 'Nueva tarea' : 'Editar tarea'} onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button><button class="prim" onClick=${guardar}>Guardar</button>`}>
    <${Aviso} tipo="error">${err}<//>
    <div class="form">
      <label class="ancho">Nombre<input value=${d.nombre || ''} onInput=${set('nombre')} /></label>
      <label>Tipo<select value=${d.tipo} onChange=${set('tipo')}><option>Tarea</option><option>Hito</option><option>Producto</option></select></label>
      <label>Responsable<select value=${d.responsable_id || ''} onChange=${set('responsable_id')}><option value="">—</option>
        ${ctx.cat.personas.map(x => html`<option value=${x.id}>${x.nombre}</option>`)}</select></label>
      <label>Fecha de inicio<${FechaInput} valor=${d.fecha_inicio} onCambio=${v => setD(x => ({ ...x, fecha_inicio: v }))} /></label>
      <label>Fecha de fin ${nueva || t._prop || !t.fecha_fin_original ? '' : 'original'}<${FechaInput} valor=${d.fecha_fin_original} disabled=${!nueva && !t._prop && !!t.fecha_fin_original} onCambio=${v => setD(x => ({ ...x, fecha_fin_original: v }))} />
        ${!nueva && !t._prop && t.fecha_fin_original && html`<span class="ayuda">Vigente: ${fecha(t.fecha_fin_vigente)}. Para cambiarla use «Reprogramar».</span>`}</label>
      <label>Peso<input type="number" min="0" step="0.5" value=${d.peso} onInput=${set('peso')} /></label>
      <label>Avance (%)<input type="number" min="0" max="100" step="1" value=${d.avance} onInput=${set('avance')} /></label>
      <label>Estado<select value=${d.estado} onChange=${set('estado')}>${ESTADOS_EDITABLES.map(e => html`<option>${e}</option>`)}</select></label>
      <label class="ancho">Evidencia (referencia o enlace)<input value=${d.evidencia || ''} onInput=${set('evidencia')} /></label>
      <label class="ancho">Observaciones<textarea value=${d.observaciones || ''} onInput=${set('observaciones')} /></label>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------
function Reprogramaciones({ p, reprog }) {
  const delProyecto = reprog.filter(r => r.entidad === 'proyecto');
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Historial de reprogramaciones</h3>
      <p>Proyecto: ${delProyecto.length} · Tareas: ${reprog.length - delProyecto.length} · Fecha original ${fecha(p.fecha_entrega_original)} → vigente <b>${fecha(p.fecha_entrega_vigente)}</b></p></div>
      <button onClick=${() => exportarExcel('reprogramaciones_' + p.codigo, [
        { titulo: 'Fecha del registro', valor: r => fechaHora(r.creado_en) }, { titulo: 'Tipo', valor: r => r.entidad === 'proyecto' ? 'Proyecto' : 'Tarea: ' + r.tarea_nombre },
        { titulo: 'Fecha anterior', valor: r => fecha(r.fecha_anterior) }, { titulo: 'Fecha nueva', valor: r => fecha(r.fecha_nueva) },
        { titulo: 'Motivo', campo: 'motivo', ancho: 60 }, { titulo: 'Usuario', campo: 'usuario_nombre' }], reprog, 'Reprogramaciones')}>Exportar Excel</button></div>
    <div class="tabla-env"><table><thead><tr><th>Registrado</th><th>Qué</th><th>Fecha anterior</th><th>Fecha nueva</th><th>Motivo</th><th>Quién</th></tr></thead>
      <tbody>${reprog.map(r => html`<tr><td class="nowrap">${fechaHora(r.creado_en)}</td>
        <td>${r.entidad === 'proyecto' ? html`<b>Proyecto</b>` : html`Tarea: ${r.tarea_nombre}`}</td>
        <td class="nowrap">${fecha(r.fecha_anterior)}</td><td class="nowrap"><b>${fecha(r.fecha_nueva)}</b></td>
        <td>${r.motivo}</td><td>${r.usuario_nombre || '—'}</td></tr>`)}</tbody></table>
      ${!reprog.length && html`<div class="vacio">Sin reprogramaciones.</div>`}</div></div>`;
}

// ---------------------------------------------------------------------
function Historial({ p, reportes, editable, ctx, listo, fallo }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const serie = Object.values(reportes.reduce((a, r) => { if (r.avance !== null) { const k = r.periodo; if (!a[k] || r.ficha === 'F-2') a[k] = { periodo: k, avance: Number(r.avance) }; } return a; }, {}))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  useEffect(() => {
    if (!ref.current || !serie.length || !window.Chart) return;
    const g = new Chart(ref.current, { type: 'line', data: { labels: serie.map(s => nombreMes(s.periodo)), datasets: [{ label: '% avance', data: serie.map(s => s.avance), borderColor: '#23637f', backgroundColor: '#23637f', tension: .2 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
    return () => g.destroy();
  }, [JSON.stringify(serie)]);
  const yaEsteMes = reportes.some(r => r.periodo === mesActualISO() && r.ficha !== 'Seguimiento');
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Historial mensual (fichas F-1 y F-2)</h3>
      <p>${yaEsteMes ? `Ya hay reporte de ${nombreMes(mesActualISO())}.` : html`<b>Falta el reporte de ${nombreMes(mesActualISO())}.</b>`}</p></div>
      ${editable && html`<button class="prim" onClick=${() => setAbierto(true)}>Registrar reporte del mes</button>`}</div>
    ${serie.length > 0 && html`<div class="graf" style="height:200px"><canvas ref=${ref}></canvas></div>`}
    <div class="tabla-env" style="margin-top:1rem"><table><thead><tr><th>Mes</th><th>Ficha</th><th>Estado</th><th>Avance</th><th>Resultado / problema</th><th>Resultado cuantitativo</th><th>Próximo paso</th><th>Evidencias</th></tr></thead>
      <tbody>${reportes.map(r => html`<tr><td class="nowrap"><b>${nombreMes(r.periodo)}</b></td><td>${r.ficha}</td>
        <td>${r.estado ? html`<${Estado} e=${r.estado} />` : '—'}${r.estado_origen ? html`<br/><span class="ayuda">${r.estado_origen}</span>` : ''}</td>
        <td class="num">${pct(r.avance)}</td><td class="prewrap">${r.problema_resultado || '—'}</td>
        <td class="prewrap">${r.resultado_cuantitativo || '—'}</td><td class="prewrap">${r.proximo_paso || '—'}</td>
        <td class="prewrap" style="font-size:.8rem">${r.evidencia_texto || '—'}</td></tr>`)}</tbody></table>
      ${!reportes.length && html`<div class="vacio">Sin reportes mensuales.</div>`}</div>
    ${abierto && html`<${NuevoReporte} p=${p} ctx=${ctx} onCerrar=${() => setAbierto(false)} onGuardado=${m => { setAbierto(false); listo(m + ' El proyecto queda como actualizado este mes.'); }} />`}
  </div>`;
}

function NuevoReporte({ p, ctx, onCerrar, onGuardado }) {
  const [d, setD] = useState({ periodo: mesActualISO(), ficha: 'F-2', avance: p.avance, estado: p.estado === 'No reportada' ? (p.estado_previo || 'En ejecución') : p.estado });
  const [err, setErr] = useState('');
  const set = k => e => { const v = e.target.value; setD(x => ({ ...x, [k]: v })); };
  const prev = (() => { const [y, m] = mesActualISO().split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; })();
  async function guardar() {
    if (!(d.problema_resultado || '').trim() && !(d.resultado_cuantitativo || '').trim()) return setErr('Indique al menos el avance o resultado del mes.');
    const fila = {
      periodo: d.periodo, ficha: d.ficha, avance: Number(d.avance), estado: d.estado,
      problema_resultado: d.problema_resultado || null, resultado_cuantitativo: d.resultado_cuantitativo || null,
      linea_base: d.linea_base || null, medida: d.medida || null, beneficiarios: d.beneficiarios || null,
      proximo_paso: d.proximo_paso || null, evidencia_texto: d.evidencia_texto || null, fuente: 'Registro en la aplicación',
    };
    if (ctx.perfil.rol !== 'admin') {
      const { error } = await sb.rpc('proponer', { p_tipo: 'reporte', p_proyecto: p.id, p_registro: null, p_datos: fila, p_motivo: null });
      return error ? setErr(mensajeError(error)) : onGuardado('Reporte enviado a validación. Se registrará cuando lo valide.');
    }
    const { error } = await sb.from('reportes_mensuales').upsert({ proyecto_id: p.id, ...fila }, { onConflict: 'proyecto_id,periodo,ficha' }).select('id').single();
    error ? setErr(mensajeError(error)) : onGuardado('Reporte registrado.');
  }
  return html`<${Modal} titulo=${'Reporte mensual · ' + codigoTexto(p)} onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button><button class="prim" onClick=${guardar}>Guardar reporte</button>`}>
    <${Aviso} tipo="error">${err}<//>
    <div class="form">
      <label>Mes<select value=${d.periodo} onChange=${set('periodo')}><option value=${mesActualISO()}>${nombreMes(mesActualISO())}</option><option value=${prev}>${nombreMes(prev)}</option></select></label>
      <label>Ficha<select value=${d.ficha} onChange=${set('ficha')}><option value="F-2">F-2 · Resultado</option><option value="F-1">F-1 · Estado inicial / problema</option></select></label>
      <label>Avance del proyecto (%)<input type="number" min="0" max="100" value=${d.avance} onInput=${set('avance')} />
        <span class="ayuda">Valor de la ficha. El avance oficial se calcula con las tareas.</span></label>
      <label>Estado reportado<select value=${d.estado} onChange=${set('estado')}>${ESTADOS_EDITABLES.map(e => html`<option>${e}</option>`)}</select></label>
      <label class="ancho">${d.ficha === 'F-1' ? 'Problema identificado' : 'Avance o resultado del mes'}<textarea value=${d.problema_resultado || ''} onInput=${set('problema_resultado')} /></label>
      <label class="ancho">Resultado cuantitativo<textarea value=${d.resultado_cuantitativo || ''} onInput=${set('resultado_cuantitativo')} /></label>
      <label class="ancho">Línea base<input value=${d.linea_base || ''} onInput=${set('linea_base')} /></label>
      <label class="ancho">Medida o acción<textarea value=${d.medida || ''} onInput=${set('medida')} /></label>
      <label class="ancho">Beneficiarios<input value=${d.beneficiarios || ''} onInput=${set('beneficiarios')} /></label>
      <label class="ancho">Próximo paso (con fecha comprometida)<textarea value=${d.proximo_paso || ''} onInput=${set('proximo_paso')} /></label>
      <label class="ancho">Evidencias (nombres de archivo o enlaces)<textarea value=${d.evidencia_texto || ''} onInput=${set('evidencia_texto')} /></label>
    </div>
    <p class="ayuda">Puede adjuntar archivos en la pestaña «Evidencias».</p>
  <//>`;
}

// ---------------------------------------------------------------------
function Evidencias({ p, evid, editable, ctx, listo, fallo }) {
  const esAdmin = ctx.perfil.rol === 'admin';
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  async function enlace() {
    if (!nombre.trim() || !/^https?:\/\//i.test(url.trim())) return fallo({ message: 'Indique un nombre y un enlace que empiece con http:// o https://' });
    const fila = { tipo: 'enlace', nombre: nombre.trim(), url: url.trim() };
    const { error } = esAdmin ? await sb.from('evidencias').insert({ proyecto_id: p.id, ...fila })
      : await sb.rpc('proponer', { p_tipo: 'evidencia', p_proyecto: p.id, p_registro: null, p_datos: fila, p_motivo: null });
    if (error) return fallo(error);
    setNombre(''); setUrl(''); listo(esAdmin ? 'Evidencia agregada.' : 'Evidencia enviada a validación. Se agregará cuando la valide.');
  }
  async function archivo(e) {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) return fallo({ message: 'El archivo supera 25 MB.' });
    setSubiendo(true);
    const ruta = `${p.id}/${Date.now()}_${f.name.replace(/[^\w.\-]+/g, '_')}`;
    const up = await sb.storage.from('evidencias').upload(ruta, f);
    if (up.error) { setSubiendo(false); return fallo(up.error); }
    const fila = { tipo: 'archivo', nombre: f.name, storage_path: ruta };
    const { error } = esAdmin ? await sb.from('evidencias').insert({ proyecto_id: p.id, ...fila })
      : await sb.rpc('proponer', { p_tipo: 'evidencia', p_proyecto: p.id, p_registro: null, p_datos: fila, p_motivo: null });
    setSubiendo(false); e.target.value = '';
    error ? fallo(error) : listo(esAdmin ? 'Archivo subido.' : 'Archivo enviado a validación. Se agregará como evidencia cuando lo valide.');
  }
  async function abrir(ev) {
    if (ev.url) return window.open(ev.url, '_blank', 'noopener');
    const { data, error } = await sb.storage.from('evidencias').createSignedUrl(ev.storage_path, 300);
    error ? fallo(error) : window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function borrar(ev) {
    if (!confirm(`¿Quitar la evidencia «${ev.nombre}»?`)) return;
    if (ev.storage_path) await sb.storage.from('evidencias').remove([ev.storage_path]);
    const { error } = await sb.from('evidencias').delete().eq('id', ev.id).select('id').single();
    error ? fallo(error) : listo('Evidencia quitada.');
  }
  return html`<div class="panel">
    <h3>Evidencias</h3>
    ${editable && html`<div class="filtros" style="margin-bottom:1rem">
      <label>Subir archivo (máx. 25 MB)<input type="file" disabled=${subiendo} onChange=${archivo} /></label>
      <label>Nombre del enlace<input value=${nombre} onInput=${e => setNombre(e.target.value)} /></label>
      <label>Enlace (URL)<input value=${url} onInput=${e => setUrl(e.target.value)} placeholder="https://" /></label>
      <button onClick=${enlace}>Agregar enlace</button></div>`}
    <div class="tabla-env"><table><thead><tr><th>Evidencia</th><th>Tipo</th><th>Registrada</th><th></th></tr></thead>
      <tbody>${evid.map(ev => html`<tr><td>${ev.nombre}</td><td>${{ archivo: 'Archivo', enlace: 'Enlace', referencia: 'Referencia (carga inicial)' }[ev.tipo]}</td>
        <td class="nowrap">${fechaHora(ev.creado_en)}</td>
        <td class="nowrap"><div class="acciones">${ev.tipo !== 'referencia' && html`<button onClick=${() => abrir(ev)}>Abrir</button>`}
          ${esAdmin && html`<button class="peligro" onClick=${() => borrar(ev)}>Quitar</button>`}</div></td></tr>`)}</tbody></table>
      ${!evid.length && html`<div class="vacio">Sin evidencias. «Concluida» exige al menos una.</div>`}</div></div>`;
}

// ---------------------------------------------------------------------
const CAMPOS = {
  nombre: 'Nombre', codigo_gobierno: 'Código de gobierno', descripcion: 'Descripción', objetivo: 'Objetivo',
  unidad_id: 'Unidad', direccion_id: 'Dirección', responsable_id: 'Responsable', fecha_inicio: 'Fecha de inicio',
  fecha_entrega_original: 'Entrega original', fecha_entrega_vigente: 'Entrega vigente', estado: 'Estado',
  estado_previo: 'Estado previo', avance: 'Avance', avance_manual: 'Avance manual', avance_manual_justificacion: 'Justificación avance',
  observaciones_falta: 'Observaciones (qué falta)', situacion_actual: 'Situación actual', proximo_paso: 'Próximo paso',
  presupuesto_programado: 'Presupuesto programado', presupuesto_ejecutado: 'Presupuesto ejecutado', beneficiarios: 'Beneficiarios',
  motivo_cancelacion: 'Motivo de cancelación', por_validar: 'Por validar', por_validar_motivo: 'Motivo por validar',
  fecha_fin_original: 'Fin original', fecha_fin_vigente: 'Fin vigente', peso: 'Peso', evidencia: 'Evidencia', '(registro)': 'Registro',
};
const TABLAS = { proyectos: 'Proyecto', tareas: 'Tarea', evidencias: 'Evidencia', reportes_mensuales: 'Reporte mensual' };

function Bitacora({ p, ctx }) {
  const [filas, setFilas] = useState(null);
  useEffect(() => {
    sb.from('bitacora').select('*').eq('proyecto_id', p.id).order('creado_en', { ascending: false }).limit(1000).then(({ data }) => setFilas(data || []));
  }, [p.id, p.updated_at]);
  const { cat } = ctx;
  const nombreDe = (campo, v) => {
    if (v === null || v === undefined) return '—';
    if (campo === 'unidad_id') return (cat.todasUnidades.find(u => u.id === v) || {}).sigla || v;
    if (campo === 'direccion_id') return (cat.todasDirecciones.find(u => u.id === v) || {}).sigla || v;
    if (campo === 'responsable_id') return (cat.personas.find(u => u.id === v) || {}).nombre || v;
    if (/^fecha_/.test(campo) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
    if (v === 'true') return 'Sí'; if (v === 'false') return 'No';
    return v.length > 200 ? v.slice(0, 200) + '…' : v;
  };
  if (!filas) return html`<div class="vacio">Cargando bitácora…</div>`;
  const cols = [
    { titulo: 'Fecha y hora', valor: b => fechaHora(b.creado_en) }, { titulo: 'Usuario', campo: 'usuario_nombre' },
    { titulo: 'Registro', valor: b => TABLAS[b.tabla] || b.tabla }, { titulo: 'Acción', campo: 'accion' },
    { titulo: 'Campo', valor: b => CAMPOS[b.campo] || b.campo }, { titulo: 'Valor anterior', valor: b => nombreDe(b.campo, b.valor_anterior), ancho: 40 },
    { titulo: 'Valor nuevo', valor: b => nombreDe(b.campo, b.valor_nuevo), ancho: 40 },
  ];
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Bitácora de cambios</h3><p>Quién, cuándo, qué campo, valor anterior y valor nuevo.</p></div>
      <button onClick=${() => exportarExcel('bitacora_' + p.codigo, cols, filas, 'Bitácora')}>Exportar Excel</button></div>
    <div class="tabla-env"><table><thead><tr>${cols.map(c => html`<th>${c.titulo}</th>`)}</tr></thead>
      <tbody>${filas.map(b => html`<tr>${cols.map(c => html`<td class=${c.titulo === 'Fecha y hora' ? 'nowrap' : ''}>${c.valor ? c.valor(b) : b[c.campo]}</td>`)}</tr>`)}</tbody></table>
      ${!filas.length && html`<div class="vacio">Sin cambios registrados.</div>`}</div></div>`;
}

// ---------------------------------------------------------------------
function exportarFichaPDF({ p, tareas, reprog, reportes }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const izq = 40; let y = 40;
  doc.setFontSize(8); doc.setTextColor(90);
  doc.text('GAMLP · Secretaría Municipal de Ciudad Inteligente · Ficha de proyecto', izq, y); y += 18;
  doc.setFontSize(14); doc.setTextColor(20);
  doc.text(doc.splitTextToSize(`${codigoTexto(p)} · ${p.nombre}`, 515), izq, y); y += 30;
  doc.autoTable({
    startY: y, theme: 'plain', styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } },
    body: [
      ['Dirección / unidad', `${p.direccion_sigla} / ${p.unidad_sigla || 'Por validar'}`],
      ['Responsable', `${p.responsable_nombre || '—'}${p.apoyos_nombres ? ' · Apoyo: ' + p.apoyos_nombres : ''}`],
      ['Estado / avance', `${p.estado} · ${pct(p.avance)}${p.avance_manual ? ' (manual)' : ''}`],
      ['Entrega original / vigente', `${fecha(p.fecha_entrega_original)} / ${fecha(p.fecha_entrega_vigente)} · ${p.n_reprogramaciones} reprogramación(es)`],
      ['Presupuesto prog. / ejec.', `${bs(p.presupuesto_programado)} / ${bs(p.presupuesto_ejecutado)}`],
      ['Objetivo', p.objetivo || '—'], ['Situación actual', p.situacion_actual || '—'], ['Próximo paso', p.proximo_paso || '—'],
      ['Qué falta', (p.que_falta || []).map(t => '• ' + t.nombre).join('\n') + (p.observaciones_falta ? '\nObs.: ' + p.observaciones_falta : '') || '—'],
    ],
  });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Tarea', 'Fin orig.', 'Fin vig.', 'Peso', 'Avance', 'Estado']],
    body: tareas.map(t => [t.nombre, fecha(t.fecha_fin_original), fecha(t.fecha_fin_vigente), t.peso, pct(t.avance), t.estado]),
    styles: { fontSize: 7 }, headStyles: { fillColor: [24, 70, 92] } });
  if (reprog.length) doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Reprogramación', 'Anterior', 'Nueva', 'Motivo', 'Quién / cuándo']],
    body: reprog.map(r => [r.entidad === 'proyecto' ? 'Proyecto' : 'Tarea: ' + r.tarea_nombre, fecha(r.fecha_anterior), fecha(r.fecha_nueva), r.motivo, `${r.usuario_nombre || ''} ${fechaHora(r.creado_en)}`]),
    styles: { fontSize: 7 }, headStyles: { fillColor: [24, 70, 92] } });
  if (reportes.length) doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Mes', 'Ficha', 'Estado', 'Avance', 'Resultado']],
    body: reportes.map(r => [nombreMes(r.periodo), r.ficha, r.estado || '', pct(r.avance), (r.resultado_cuantitativo || r.problema_resultado || '').slice(0, 300)]),
    styles: { fontSize: 7 }, headStyles: { fillColor: [24, 70, 92] } });
  doc.save(`ficha_${p.codigo}_${hoyISO().split('-').reverse().join('-')}.pdf`);
}
