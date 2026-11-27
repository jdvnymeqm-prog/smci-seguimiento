// Propuestas de cambio: las unidades proponen, el jefe de unidad valida (se aplica) o rechaza.
// El director da su «visto bueno» a lo que validan sus jefes; valida él mismo su personal y las unidades sin jefe.
// Lo validado solo lo cambia el administrador, salvo durante el «periodo de actualización» (sin plazo de 72 h).
import { html, useState, useEffect, sb, fecha, fechaHora, exportarExcel, mensajeError, bloqueoCambios, usePestana, codigoPrincipal, codigoTexto } from '../lib.js';
import { Aviso, Modal } from '../componentes.js';

export const TIPOS = {
  proyecto: 'Datos del proyecto', reprogramar_proyecto: 'Reprogramar entrega', crear_tarea: 'Nueva tarea', tarea: 'Cambio de tarea',
  reprogramar_tarea: 'Reprogramar tarea', reporte: 'Reporte mensual', evidencia: 'Evidencia', crear_proyecto: 'Nuevo proyecto',
  eliminar_tarea: 'Eliminar tarea', eliminar_proyecto: 'Eliminar proyecto', editar_evidencia: 'Corregir evidencia', eliminar_evidencia: 'Eliminar evidencia',
};
export const CAMPOS = {
  nombre: 'Nombre', descripcion: 'Descripción', objetivo: 'Objetivo', estado: 'Estado', avance: 'Avance (%)', codigo: 'Código',
  codigo_gobierno: 'Código de gobierno', responsable_id: 'Responsable', fecha_inicio: 'Fecha de inicio', fecha_entrega_original: 'Entrega original',
  fecha_entrega_vigente: 'Entrega vigente', fecha_vigente: 'Fecha vigente', situacion_actual: 'Situación actual', proximo_paso: 'Próximo paso',
  observaciones_falta: 'Observaciones (qué falta)', beneficiarios: 'Beneficiarios', presupuesto_programado: 'Presupuesto programado (Bs)',
  presupuesto_ejecutado: 'Presupuesto ejecutado (Bs)', motivo_cancelacion: 'Motivo de cancelación', fecha_fin_original: 'Fin', fecha_fin_vigente: 'Fin vigente',
  peso: 'Peso', tipo_centro: 'Tipo de centro', cantidad: 'Juegos de mobiliario', niveles: 'Juegos por nivel', centros: 'N.º de unidades educativas', estudiantes: 'Estudiantes beneficiados', evidencia: 'Evidencia', observaciones: 'Observaciones', tipo: 'Tipo', periodo: 'Mes', ficha: 'Ficha', unidad_id: 'Unidad',
  resultado_cuantitativo: 'Resultado cuantitativo', problema_resultado: 'Resultado / problema', linea_base: 'Línea base', medida: 'Medida',
  evidencia_texto: 'Evidencias', url: 'Enlace', storage_path: 'Archivo', apoyos: 'Responsables de apoyo', por_validar: 'Por validar', por_validar_motivo: 'Motivo por validar',
};
const OCULTOS = new Set(['fuente']);

function valor(campo, v, cat) {
  if (v === null || v === undefined || v === '') return '—';
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(' · ') || '—';
  if (typeof v !== 'string') v = String(v);
  if (campo === 'responsable_id') return (cat.personas.find(p => p.id === v) || {}).nombre || 'Otra persona';
  if (campo === 'unidad_id') return (cat.todasUnidades.find(u => u.id === v) || {}).sigla || v;
  if (campo === 'storage_path') return v.split('/').pop().replace(/^\d+_/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
  if (v === 'true') return 'Sí'; if (v === 'false') return 'No';
  return v.length > 400 ? v.slice(0, 400) + '…' : v;
}

export function Resumen({ m, cat }) {
  const filas = (m.resumen || []).filter(c => !OCULTOS.has(c.campo));
  return html`<table style="font-size:.85rem"><thead><tr><th>Campo</th><th>Antes</th><th>Propuesto</th></tr></thead>
    <tbody>${filas.map(c => html`<tr><td>${CAMPOS[c.campo] || c.campo}</td><td class="prewrap">${valor(c.campo, c.antes, cat)}</td>
      <td class="prewrap"><b>${valor(c.campo, c.ahora, cat)}</b></td></tr>`)}</tbody></table>
    ${m.motivo && html`<p class="ayuda">Motivo: ${m.motivo}</p>`}`;
}

const ESTADO_TXT = { pendiente: 'Pendiente', validada: 'Validada', rechazada: 'Rechazada' };

export function ListaPropuestas({ ctx, proyectoId, compacto }) {
  const { perfil, cat } = ctx;
  const [vista, setVista] = usePestana('estado', 'pendiente');
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [accion, setAccion] = useState(null);   // {tipo:'validar'|'rechazar'|'permiso', m}
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState({});
  const esAdmin = perfil.rol === 'admin';
  const esDirector = perfil.rol === 'director';
  const daVisto = esAdmin || esDirector;
  // Qué unidades valida este usuario: lo decide la base (jefe con cuenta activa o, si no hay, el director)
  const [valido, setValido] = useState(null);
  useEffect(() => { sb.rpc('unidades_que_valido').then(({ data }) => setValido(new Set((data || []).map(x => x.unidades_que_valido || x)))); }, []);
  // Proyectos sin unidad: los revisa el director de su dirección (o el administrador)
  const puedeRevisar = m => !bloqueoCambios(cat, perfil) && (esAdmin || (m.unidad_id ? !!valido?.has(m.unidad_id)
    : esDirector && m.direccion_id === perfil.direccion_id && !(cat.todasDirecciones || []).find(d => d.id === m.direccion_id)?.es_despacho_secretaria));

  const cargar = () => {
    let q = sb.from('propuestas').select('*, proyectos(codigo,codigo_estrategico,nombre)').eq('estado', vista === 'visto' ? 'validada' : vista);
    if (vista === 'visto') q = q.is('visto_bueno_en', null);
    if (esDirector && vista === 'visto') q = q.eq('direccion_id', perfil.direccion_id);
    if (proyectoId) q = q.eq('proyecto_id', proyectoId);
    q.order(vista === 'pendiente' ? 'creado_en' : 'revisado_en', { ascending: vista === 'pendiente' }).limit(500)
      .then(({ data, error }) => error ? setMsg({ err: mensajeError(error) }) : setLista(data || []));
  };
  useEffect(() => { setLista(null); cargar(); }, [vista, proyectoId]);

  async function confirmar() {
    const { tipo, m } = accion;
    let r;
    if (tipo === 'validar') r = await sb.rpc('validar_propuesta', { p_id: m.id, p_observacion: texto || null });
    if (tipo === 'rechazar') { if (!texto.trim()) return setMsg({ err: 'Indique el motivo del rechazo.' }); r = await sb.rpc('rechazar_propuesta', { p_id: m.id, p_motivo: texto }); }
    if (tipo === 'permiso') r = await sb.rpc('otorgar_permiso', { p_propuesta: m.id, p_motivo: texto || null });
    if (tipo === 'visto') r = await sb.rpc('dar_visto_bueno', { p_id: m.id, p_observacion: texto || null });
    if (r.error) return setMsg({ err: mensajeError(r.error) });
    setAccion(null); setTexto('');
    let ok = { validar: 'Validada: el cambio ya se aplicó y queda cerrado.', rechazar: 'Propuesta rechazada.',
      permiso: 'Permiso de corrección otorgado: la unidad puede enviar una corrección (vence en 7 días).', visto: 'Visto bueno registrado.' }[tipo];
    if (tipo === 'validar') {
      // Si se pidió «Concluida» sin cumplir los requisitos, la base valida lo demás y deja una nota
      const { data } = await sb.from('propuestas').select('observacion').eq('id', m.id).maybeSingle();
      if (data?.observacion && /Se validaron los datos, pero/.test(data.observacion)) ok += ' ' + data.observacion.split('\n').pop();
    }
    setMsg({ ok });
    cargar();
  }
  const uni = id => (cat.todasUnidades.find(u => u.id === id) || {}).sigla || 'Por validar';
  const nombreProy = m => m.proyectos ? html`<a href=${'#/proyecto/' + m.proyecto_id}><b>${codigoPrincipal(m.proyectos)}</b></a> ${m.proyectos.nombre}`
    : html`<b>${m.datos?.codigo || ''}</b> ${m.datos?.nombre || ''} <span class="etiqueta">${m.datos?.proyecto_origen_id ? 'Continuidad ' + m.datos.gestion : 'Nuevo' + (m.datos?.gestion && m.datos.gestion !== 2026 ? ' · Gestión ' + m.datos.gestion : '')}</span>`;
  const cols = [
    { titulo: 'Proyecto', valor: m => m.proyectos ? codigoTexto(m.proyectos) : m.datos?.codigo }, { titulo: 'Unidad', valor: m => uni(m.unidad_id) },
    { titulo: 'Tipo', valor: m => TIPOS[m.tipo] }, { titulo: 'Propuesto por', campo: 'creado_por_nombre' }, { titulo: 'Fecha', valor: m => fechaHora(m.creado_en) },
    { titulo: 'Estado', valor: m => ESTADO_TXT[m.estado] }, { titulo: 'Revisado por', campo: 'revisado_por_nombre' }, { titulo: 'Revisado el', valor: m => fechaHora(m.revisado_en) },
    { titulo: 'Observación', campo: 'observacion', ancho: 40 },
    { titulo: 'Visto bueno del director', valor: m => m.visto_bueno_en ? `${m.visto_bueno_nombre} · ${fechaHora(m.visto_bueno_en)}${m.visto_bueno_obs ? ' · ' + m.visto_bueno_obs : ''}` : (m.estado === 'validada' ? 'Pendiente' : '') },
    { titulo: 'Cambios', valor: m => (m.resumen || []).map(c => `${CAMPOS[c.campo] || c.campo}: ${c.antes ?? '—'} → ${c.ahora ?? '—'}`).join(' | '), ancho: 80 },
  ];
  const ncol = 6;
  return html`
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <div class="tabs">${['pendiente', ...(daVisto && !compacto ? ['visto'] : []), 'validada', 'rechazada'].map(v => html`<button class=${vista === v ? 'activo' : ''} onClick=${() => setVista(v)}>${{ pendiente: 'Por validar', visto: 'Visto bueno pendiente', validada: 'Validadas', rechazada: 'Rechazadas' }[v]}</button>`)}
      ${lista && lista.length > 0 && html`<span style="margin-left:auto"><button onClick=${() => exportarExcel('propuestas_' + vista, cols, lista, 'Propuestas')}>Exportar Excel</button></span>`}</div>
    ${!lista ? html`<div class="vacio">Cargando…</div>` : !lista.length ? html`<div class="vacio">${{ pendiente: 'No hay cambios por validar.', visto: 'No hay validaciones de los jefes de unidad esperando su visto bueno.', validada: 'Aún no hay cambios validados.', rechazada: 'No hay propuestas rechazadas.' }[vista]}</div>` : html`
      <div class="tabla-env"><table><thead><tr>${!compacto && html`<th>Proyecto</th>`}<th>Tipo</th><th>Propuesto por</th><th>Fecha</th><th>${vista === 'pendiente' ? '' : 'Revisión'}</th><th></th></tr></thead>
        <tbody>${lista.map(m => html`
          <tr>${!compacto && html`<td>${nombreProy(m)}<br/><span class="pill">${uni(m.unidad_id)}</span></td>`}
            <td>${TIPOS[m.tipo]}</td><td>${m.creado_por_nombre}</td><td class="nowrap">${fechaHora(m.creado_en)}</td>
            <td>${vista !== 'pendiente' && html`${m.revisado_por_nombre}<br/><span class="ayuda">${fechaHora(m.revisado_en)}${m.observacion ? ' · ' + m.observacion : ''}</span>
              ${m.estado === 'validada' && html`<br/>${m.visto_bueno_en
                ? html`<span class="pill" title=${m.visto_bueno_obs || ''}>✔ Visto bueno: ${m.visto_bueno_nombre} · ${fechaHora(m.visto_bueno_en)}</span>`
                : html`<span class="ayuda">Visto bueno del director: pendiente</span>`}`}`}</td>
            <td class="nowrap"><div class="acciones">
              <button onClick=${() => setAbierta(abierta === m.id ? null : m.id)}>${abierta === m.id ? 'Ocultar' : 'Ver cambios'}</button>
              ${vista === 'pendiente' && puedeRevisar(m) && html`
                <button class="prim" onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'validar', m }); }}>Validar</button>
                <button class="peligro" onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'rechazar', m }); }}>Rechazar</button>`}
              ${m.estado === 'validada' && !m.visto_bueno_en && daVisto && (esAdmin || m.direccion_id === perfil.direccion_id) && html`<button class="prim" onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'visto', m }); }}>Dar visto bueno</button>`}
              ${false && m.entidad && html`<button onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'permiso', m }); }}>Permitir corrección</button>`}
            </div></td></tr>
          ${abierta === m.id && html`<tr><td colspan=${ncol} style="background:#fbfcfc"><${Resumen} m=${m} cat=${cat} /></td></tr>`}`)}
        </tbody></table></div>`}
    ${accion && html`<${Modal} titulo=${{ validar: 'Validar cambio', rechazar: 'Rechazar cambio', permiso: 'Permitir corrección', visto: 'Visto bueno' }[accion.tipo] + ' · ' + (accion.m.proyectos ? codigoTexto(accion.m.proyectos) : accion.m.datos?.codigo || '')}
        onCerrar=${() => setAccion(null)} acciones=${html`<button onClick=${() => setAccion(null)}>Cancelar</button>
        <button class=${accion.tipo === 'rechazar' ? 'peligro' : 'prim'} onClick=${confirmar}>${{ validar: 'Validar y aplicar', rechazar: 'Rechazar', permiso: 'Otorgar permiso', visto: 'Dar visto bueno' }[accion.tipo]}</button>`}>
      <p><b>${TIPOS[accion.m.tipo]}</b> propuesto por <b>${accion.m.creado_por_nombre}</b> el ${fechaHora(accion.m.creado_en)}.
        ${accion.tipo === 'visto' && html` Validado por <b>${accion.m.revisado_por_nombre}</b> el ${fechaHora(accion.m.revisado_en)}.`}</p>
      <${Resumen} m=${accion.m} cat=${cat} />
      <div class="form" style="margin-top:1rem"><label class="ancho">${accion.tipo === 'rechazar' ? 'Motivo del rechazo (obligatorio)' : accion.tipo === 'permiso' ? 'Motivo de la corrección (opcional)' : 'Observación (opcional)'}
        <textarea value=${texto} onInput=${e => setTexto(e.target.value)} /></label></div>
      ${accion.tipo === 'visto' && html`<${Aviso} tipo="info">El visto bueno confirma la validación del jefe de unidad. No cambia los datos. Si encuentra un error, pida la corrección al Encargado de Planificación.<//>`}
      ${accion.tipo === 'validar' && accion.m.tipo === 'proyecto' && (accion.m.resumen || []).some(c => c.campo === 'estado' && c.ahora === 'Concluida') && html`<${Aviso} tipo="info">Se propone «Concluida». Si el proyecto aún no tiene 100 % de avance y al menos una evidencia, se validan los demás datos y el estado se mantiene; la unidad podrá volver a proponer «Concluida» cuando cumpla.<//>`}
      ${accion.tipo === 'validar' && html`<${Aviso} tipo="atencion">Al validar, el cambio se aplica. Después solo el administrador podrá modificarlo (salvo durante el periodo de actualización).<//>`}
      ${accion.tipo === 'permiso' && html`<${Aviso} tipo="info">La unidad podrá enviar una corrección de este dato sin esperar las 72 horas. El permiso sirve una vez y vence en 7 días. La corrección también la valida el jefe de unidad (o el director, si la unidad no tiene jefe).<//>`}
    <//>`}`;
}

export function Validaciones({ ctx }) {
  const { perfil, cat } = ctx;
  const [mias, setMias] = useState([]);
  useEffect(() => { if (perfil.rol === 'director') sb.rpc('unidades_que_valido').then(({ data }) => setMias((data || []).map(x => x.unidades_que_valido || x))); }, []);
  const sinJefe = cat.unidades.filter(u => mias.includes(u.id));
  return html`
    <div class="encabezado"><div><h1>Validaciones</h1>
      <p>${perfil.rol === 'admin' ? 'Todas las direcciones, unidades y el personal del Despacho de la Secretaría: como Encargado de Planificación usted revisa y valida todo.' : perfil.rol === 'director'
        ? (sinJefe.length ? `Usted valida los cambios de: ${sinJefe.map(u => u.sigla).join(', ')} (su personal de la dirección y las unidades sin jefe con cuenta activa). Las unidades con jefe las valida su jefe y usted da el visto bueno en la pestaña «Visto bueno pendiente».` : 'Todas las unidades de su dirección tienen jefe: ellos validan y usted da el visto bueno en la pestaña «Visto bueno pendiente».')
        : 'Cambios propuestos en su unidad.'} Ningún cambio de una unidad se aplica hasta que su jefe (o el director, si la unidad no tiene jefe) lo valida. Lo pendiente lo puede corregir o eliminar quien lo registró. Lo validado solo lo modifica el administrador, salvo durante el periodo de actualización.</p></div></div>
    <${ListaPropuestas} ctx=${ctx} />`;
}
