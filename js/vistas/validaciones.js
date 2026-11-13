// Validación de modificaciones: el jefe de unidad (o el administrador) revisa y valida cada guardado
// de los responsables. Una validación no se puede cambiar después (lo controla la base de datos).
import { html, useState, useEffect, sb, fecha, fechaHora, exportarExcel, mensajeError } from '../lib.js';
import { Aviso, Modal } from '../componentes.js';

const TABLAS = { proyectos: 'Datos del proyecto', tareas: 'Tareas', evidencias: 'Evidencias', reportes_mensuales: 'Reporte mensual' };
const CAMPOS = {
  nombre: 'Nombre', descripcion: 'Descripción', objetivo: 'Objetivo', estado: 'Estado', avance: 'Avance',
  responsable_id: 'Responsable', fecha_inicio: 'Fecha de inicio', fecha_entrega_original: 'Entrega original',
  fecha_entrega_vigente: 'Entrega vigente', situacion_actual: 'Situación actual', proximo_paso: 'Próximo paso',
  observaciones_falta: 'Observaciones (qué falta)', beneficiarios: 'Beneficiarios', presupuesto_programado: 'Presupuesto programado',
  presupuesto_ejecutado: 'Presupuesto ejecutado', motivo_cancelacion: 'Motivo de cancelación', fecha_fin_vigente: 'Fin vigente',
  fecha_fin_original: 'Fin original', peso: 'Peso', evidencia: 'Evidencia', '(registro)': 'Registro',
  resultado_cuantitativo: 'Resultado cuantitativo', problema_resultado: 'Resultado / problema', estado_previo: 'Estado previo',
};
const OCULTOS = new Set(['estado_previo', 'creado_por', 'updated_at', 'ultima_actualizacion', 'id', 'proyecto_id', 'orden']);

function valor(campo, v, cat) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'responsable_id') return (cat.personas.find(p => p.id === v) || {}).nombre || v;
  if (/^fecha_/.test(campo) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
  if (v === 'true') return 'Sí'; if (v === 'false') return 'No';
  return v.length > 300 ? v.slice(0, 300) + '…' : v;
}

function Detalle({ m, cat }) {
  const [filas, setFilas] = useState(null);
  useEffect(() => {
    sb.from('bitacora').select('tabla,accion,campo,valor_anterior,valor_nuevo').eq('proyecto_id', m.proyecto_id).eq('txid', m.txid).order('id')
      .then(({ data }) => setFilas((data || []).filter(f => !OCULTOS.has(f.campo))));
  }, [m.id]);
  if (!filas) return html`<div class="ayuda">Cargando detalle…</div>`;
  if (!filas.length) return html`<div class="ayuda">Sin detalle visible (cambios internos del sistema).</div>`;
  return html`<table style="font-size:.85rem"><thead><tr><th>Dónde</th><th>Campo</th><th>Antes</th><th>Ahora</th></tr></thead>
    <tbody>${filas.map(f => html`<tr><td>${TABLAS[f.tabla] || f.tabla}</td>
      <td>${f.accion === 'crear' ? 'Nuevo registro' : f.accion === 'eliminar' ? 'Eliminado' : (CAMPOS[f.campo] || f.campo)}</td>
      <td class="prewrap">${f.accion === 'crear' ? '—' : valor(f.campo, f.valor_anterior, cat)}</td>
      <td class="prewrap"><b>${f.accion === 'eliminar' ? '—' : valor(f.campo, f.valor_nuevo, cat)}</b></td></tr>`)}</tbody></table>`;
}

export function Validaciones({ ctx }) {
  const { perfil, cat } = ctx;
  const [vista, setVista] = useState('pendiente');
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [validar, setValidar] = useState(null);
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState({});
  const puedeValidar = m => perfil.rol === 'admin' || (perfil.rol === 'jefe' && m.unidad_id && m.unidad_id === perfil.unidad_id);

  const cargar = () => sb.from('modificaciones').select('*, proyectos(codigo,nombre)').eq('estado', vista)
    .order('creado_en', { ascending: vista === 'pendiente' }).limit(500)
    .then(({ data, error }) => error ? setMsg({ err: mensajeError(error) }) : setLista(data || []));
  useEffect(() => { setLista(null); cargar(); }, [vista]);

  async function confirmar() {
    const { error } = await sb.rpc('validar_modificacion', { p_id: validar.id, p_observacion: obs || null });
    if (error) return setMsg({ err: mensajeError(error) });
    setValidar(null); setObs(''); setMsg({ ok: 'Modificación validada. Ya no se puede cambiar.' }); cargar();
  }
  const uni = id => (cat.todasUnidades.find(u => u.id === id) || {}).sigla || 'Por validar';
  const cols = [
    { titulo: 'Proyecto', valor: m => m.proyectos?.codigo }, { titulo: 'Nombre', valor: m => m.proyectos?.nombre, ancho: 40 },
    { titulo: 'Unidad', valor: m => uni(m.unidad_id) }, { titulo: 'Modificado por', campo: 'usuario_nombre' },
    { titulo: 'Fecha', valor: m => fechaHora(m.creado_en) }, { titulo: 'Qué cambió', valor: m => m.tablas.map(t => TABLAS[t] || t).join(', ') },
    { titulo: 'Estado', campo: 'estado' }, { titulo: 'Validado por', campo: 'validado_por_nombre' },
    { titulo: 'Validado el', valor: m => fechaHora(m.validado_en) }, { titulo: 'Observación', campo: 'observacion', ancho: 40 },
  ];
  return html`
    <div class="encabezado"><div><h1>Validaciones</h1>
      <p>${perfil.rol === 'admin' ? 'Todas las unidades.' : 'Modificaciones de su unidad.'} Cada guardado de un responsable debe ser validado por el jefe de su unidad. Una vez validado, no se puede cambiar.</p></div>
      ${lista && html`<button onClick=${() => exportarExcel('validaciones_' + vista, cols, lista, 'Validaciones')}>Exportar Excel</button>`}</div>
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <div class="tabs"><button class=${vista === 'pendiente' ? 'activo' : ''} onClick=${() => setVista('pendiente')}>Por validar</button>
      <button class=${vista === 'validada' ? 'activo' : ''} onClick=${() => setVista('validada')}>Validadas</button></div>
    ${!lista ? html`<div class="vacio">Cargando…</div>` : !lista.length ? html`<div class="vacio">${vista === 'pendiente' ? 'No hay modificaciones por validar.' : 'Aún no hay validaciones.'}</div>` : html`
      <div class="tabla-env"><table><thead><tr><th>Proyecto</th><th>Modificado por</th><th>Fecha</th><th>Qué cambió</th>
        ${vista === 'validada' && html`<th>Validado por</th>`}<th></th></tr></thead>
        <tbody>${lista.map(m => html`
          <tr><td><a href=${'#/proyecto/' + m.proyecto_id}><b>${m.proyectos?.codigo}</b></a> ${m.proyectos?.nombre}<br/><span class="pill">${uni(m.unidad_id)}</span></td>
            <td>${m.usuario_nombre}</td><td class="nowrap">${fechaHora(m.creado_en)}</td>
            <td>${m.tablas.map(t => TABLAS[t] || t).join(', ')}</td>
            ${vista === 'validada' && html`<td>${m.validado_por_nombre}<br/><span class="ayuda">${fechaHora(m.validado_en)}${m.observacion ? ' · ' + m.observacion : ''}</span></td>`}
            <td class="nowrap"><div class="acciones">
              <button onClick=${() => setAbierta(abierta === m.id ? null : m.id)}>${abierta === m.id ? 'Ocultar' : 'Ver cambios'}</button>
              ${vista === 'pendiente' && puedeValidar(m) && html`<button class="prim" onClick=${() => { setObs(''); setValidar(m); }}>Validar</button>`}
            </div></td></tr>
          ${abierta === m.id && html`<tr><td colspan="6" style="background:#fbfcfc"><${Detalle} m=${m} cat=${cat} /></td></tr>`}`)}
        </tbody></table></div>`}
    ${validar && html`<${Modal} titulo=${'Validar modificación · ' + (validar.proyectos?.codigo || '')} onCerrar=${() => setValidar(null)} acciones=${html`
        <button onClick=${() => setValidar(null)}>Cancelar</button><button class="prim" onClick=${confirmar}>Validar</button>`}>
      <p>Modificado por <b>${validar.usuario_nombre}</b> el ${fechaHora(validar.creado_en)}.</p>
      <${Detalle} m=${validar} cat=${cat} />
      <div class="form" style="margin-top:1rem"><label class="ancho">Observación (opcional)<textarea value=${obs} onInput=${e => setObs(e.target.value)} /></label></div>
      <${Aviso} tipo="atencion">Una vez validada, esta modificación queda cerrada y no se puede cambiar.<//>
    <//>`}`;
}
