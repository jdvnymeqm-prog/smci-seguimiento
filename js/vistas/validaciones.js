// Propuestas de cambio: las unidades proponen, el jefe de unidad valida (se aplica) o rechaza.
// Lo validado queda cerrado; nueva información sobre el mismo dato después de 72 h,
// o antes con un permiso de corrección del administrador.
import { html, useState, useEffect, sb, fecha, fechaHora, exportarExcel, mensajeError, puedeValidar, bloqueoCambios, usePestana, codigoPrincipal } from '../lib.js';
import { Aviso, Modal } from '../componentes.js';

export const TIPOS = {
  proyecto: 'Datos del proyecto', reprogramar_proyecto: 'Reprogramar entrega', crear_tarea: 'Nueva tarea', tarea: 'Cambio de tarea',
  reprogramar_tarea: 'Reprogramar tarea', reporte: 'Reporte mensual', evidencia: 'Evidencia', crear_proyecto: 'Nuevo proyecto',
};
export const CAMPOS = {
  nombre: 'Nombre', descripcion: 'Descripción', objetivo: 'Objetivo', estado: 'Estado', avance: 'Avance (%)', codigo: 'Código',
  codigo_gobierno: 'Código de gobierno', responsable_id: 'Responsable', fecha_inicio: 'Fecha de inicio', fecha_entrega_original: 'Entrega original',
  fecha_entrega_vigente: 'Entrega vigente', fecha_vigente: 'Fecha vigente', situacion_actual: 'Situación actual', proximo_paso: 'Próximo paso',
  observaciones_falta: 'Observaciones (qué falta)', beneficiarios: 'Beneficiarios', presupuesto_programado: 'Presupuesto programado (Bs)',
  presupuesto_ejecutado: 'Presupuesto ejecutado (Bs)', motivo_cancelacion: 'Motivo de cancelación', fecha_fin_original: 'Fin', fecha_fin_vigente: 'Fin vigente',
  peso: 'Peso', evidencia: 'Evidencia', observaciones: 'Observaciones', tipo: 'Tipo', periodo: 'Mes', ficha: 'Ficha', unidad_id: 'Unidad',
  resultado_cuantitativo: 'Resultado cuantitativo', problema_resultado: 'Resultado / problema', linea_base: 'Línea base', medida: 'Medida',
  evidencia_texto: 'Evidencias', url: 'Enlace', storage_path: 'Archivo', apoyos: 'Responsables de apoyo', por_validar: 'Por validar', por_validar_motivo: 'Motivo por validar',
};
const OCULTOS = new Set(['fuente']);

function valor(campo, v, cat) {
  if (v === null || v === undefined || v === '') return '—';
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
  const puedeRevisar = m => !bloqueoCambios(cat, perfil) && puedeValidar(perfil, cat.todasUnidades.find(u => u.id === m.unidad_id));

  const cargar = () => {
    let q = sb.from('propuestas').select('*, proyectos(codigo,codigo_estrategico,nombre)').eq('estado', vista);
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
    if (r.error) return setMsg({ err: mensajeError(r.error) });
    setAccion(null); setTexto('');
    setMsg({ ok: tipo === 'validar' ? 'Validada: el cambio ya se aplicó y queda cerrado.' : tipo === 'rechazar' ? 'Propuesta rechazada.' : 'Permiso de corrección otorgado: la unidad puede enviar una corrección (vence en 7 días).' });
    cargar();
  }
  const uni = id => (cat.todasUnidades.find(u => u.id === id) || {}).sigla || 'Por validar';
  const nombreProy = m => m.proyectos ? html`<a href=${'#/proyecto/' + m.proyecto_id}><b>${codigoPrincipal(m.proyectos)}</b></a> ${m.proyectos.nombre}`
    : html`<b>${m.datos?.codigo || ''}</b> ${m.datos?.nombre || ''} <span class="etiqueta">Nuevo</span>`;
  const cols = [
    { titulo: 'Proyecto', valor: m => m.proyectos?.codigo || m.datos?.codigo }, { titulo: 'Unidad', valor: m => uni(m.unidad_id) },
    { titulo: 'Tipo', valor: m => TIPOS[m.tipo] }, { titulo: 'Propuesto por', campo: 'creado_por_nombre' }, { titulo: 'Fecha', valor: m => fechaHora(m.creado_en) },
    { titulo: 'Estado', valor: m => ESTADO_TXT[m.estado] }, { titulo: 'Revisado por', campo: 'revisado_por_nombre' }, { titulo: 'Revisado el', valor: m => fechaHora(m.revisado_en) },
    { titulo: 'Observación', campo: 'observacion', ancho: 40 },
    { titulo: 'Cambios', valor: m => (m.resumen || []).map(c => `${CAMPOS[c.campo] || c.campo}: ${c.antes ?? '—'} → ${c.ahora ?? '—'}`).join(' | '), ancho: 80 },
  ];
  const ncol = 6;
  return html`
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <div class="tabs">${['pendiente', 'validada', 'rechazada'].map(v => html`<button class=${vista === v ? 'activo' : ''} onClick=${() => setVista(v)}>${{ pendiente: 'Por validar', validada: 'Validadas', rechazada: 'Rechazadas' }[v]}</button>`)}
      ${lista && lista.length > 0 && html`<span style="margin-left:auto"><button onClick=${() => exportarExcel('propuestas_' + vista, cols, lista, 'Propuestas')}>Exportar Excel</button></span>`}</div>
    ${!lista ? html`<div class="vacio">Cargando…</div>` : !lista.length ? html`<div class="vacio">${{ pendiente: 'No hay cambios por validar.', validada: 'Aún no hay cambios validados.', rechazada: 'No hay propuestas rechazadas.' }[vista]}</div>` : html`
      <div class="tabla-env"><table><thead><tr>${!compacto && html`<th>Proyecto</th>`}<th>Tipo</th><th>Propuesto por</th><th>Fecha</th><th>${vista === 'pendiente' ? '' : 'Revisión'}</th><th></th></tr></thead>
        <tbody>${lista.map(m => html`
          <tr>${!compacto && html`<td>${nombreProy(m)}<br/><span class="pill">${uni(m.unidad_id)}</span></td>`}
            <td>${TIPOS[m.tipo]}</td><td>${m.creado_por_nombre}</td><td class="nowrap">${fechaHora(m.creado_en)}</td>
            <td>${vista !== 'pendiente' && html`${m.revisado_por_nombre}<br/><span class="ayuda">${fechaHora(m.revisado_en)}${m.observacion ? ' · ' + m.observacion : ''}</span>`}</td>
            <td class="nowrap"><div class="acciones">
              <button onClick=${() => setAbierta(abierta === m.id ? null : m.id)}>${abierta === m.id ? 'Ocultar' : 'Ver cambios'}</button>
              ${vista === 'pendiente' && puedeRevisar(m) && html`
                <button class="prim" onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'validar', m }); }}>Validar</button>
                <button class="peligro" onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'rechazar', m }); }}>Rechazar</button>`}
              ${vista === 'validada' && esAdmin && m.entidad && html`<button onClick=${() => { setTexto(''); setMsg({}); setAccion({ tipo: 'permiso', m }); }}>Permitir corrección</button>`}
            </div></td></tr>
          ${abierta === m.id && html`<tr><td colspan=${ncol} style="background:#fbfcfc"><${Resumen} m=${m} cat=${cat} /></td></tr>`}`)}
        </tbody></table></div>`}
    ${accion && html`<${Modal} titulo=${{ validar: 'Validar cambio', rechazar: 'Rechazar cambio', permiso: 'Permitir corrección' }[accion.tipo] + ' · ' + (accion.m.proyectos?.codigo || accion.m.datos?.codigo || '')}
        onCerrar=${() => setAccion(null)} acciones=${html`<button onClick=${() => setAccion(null)}>Cancelar</button>
        <button class=${accion.tipo === 'rechazar' ? 'peligro' : 'prim'} onClick=${confirmar}>${{ validar: 'Validar y aplicar', rechazar: 'Rechazar', permiso: 'Otorgar permiso' }[accion.tipo]}</button>`}>
      <p><b>${TIPOS[accion.m.tipo]}</b> propuesto por <b>${accion.m.creado_por_nombre}</b> el ${fechaHora(accion.m.creado_en)}.</p>
      <${Resumen} m=${accion.m} cat=${cat} />
      <div class="form" style="margin-top:1rem"><label class="ancho">${accion.tipo === 'rechazar' ? 'Motivo del rechazo (obligatorio)' : accion.tipo === 'permiso' ? 'Motivo de la corrección (opcional)' : 'Observación (opcional)'}
        <textarea value=${texto} onInput=${e => setTexto(e.target.value)} /></label></div>
      ${accion.tipo === 'validar' && html`<${Aviso} tipo="atencion">Al validar, el cambio se aplica y queda cerrado. Solo el administrador podrá modificarlo o dar permiso de corrección.<//>`}
      ${accion.tipo === 'permiso' && html`<${Aviso} tipo="info">La unidad podrá enviar una corrección de este dato sin esperar las 72 horas. El permiso sirve una vez y vence en 7 días. La corrección también la valida el jefe de unidad (o el director, si la unidad no tiene jefe).<//>`}
    <//>`}`;
}

export function Validaciones({ ctx }) {
  const { perfil, cat } = ctx;
  const sinJefe = cat.unidades.filter(u => u.tiene_jefe === false);
  return html`
    <div class="encabezado"><div><h1>Validaciones</h1>
      <p>${perfil.rol === 'admin' ? 'Todas las unidades.' : perfil.rol === 'director'
        ? (sinJefe.length ? `Usted valida los cambios de las unidades sin jefe: ${sinJefe.map(u => u.sigla).join(', ')}. Las demás unidades las valida su jefe.` : 'Todas las unidades de su dirección tienen jefe: ellos validan. Aquí puede consultar las propuestas.')
        : 'Cambios propuestos en su unidad.'} Ningún cambio de una unidad se aplica hasta que su jefe (o el director, si la unidad no tiene jefe) lo valida. Lo validado queda cerrado: nueva información sobre el mismo dato se puede proponer pasadas 72 horas, o antes con permiso del administrador.</p></div></div>
    <${ListaPropuestas} ctx=${ctx} />`;
}
