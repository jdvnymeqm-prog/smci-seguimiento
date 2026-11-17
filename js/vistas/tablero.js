import { html, useState, useEffect, useRef, useMemo, sb, ESTADOS, fecha, pct, mesActualISO, nombreMes, exportarExcel, exportarPDF, mensajeError } from '../lib.js';
import { Estado, Semaforo, Barra, Aviso, QueFalta, Filtros, filtrosVacios, aplicarFiltros, resumen, describirFiltros, COLUMNAS_PROYECTO } from '../componentes.js';
import { exportarTodoExcel, exportarTodoPDF } from '../exportar.js';

function BotonesExportarTodo({ lista, ctx, sub }) {
  const [ocupado, setOcupado] = useState('');
  const correr = async (tipo, fn) => { setOcupado(tipo); try { await fn(); } catch (e) { alert('No se pudo exportar: ' + e.message); } setOcupado(''); };
  return html`
    <button class="prim" disabled=${!!ocupado} onClick=${() => correr('x', () => exportarTodoExcel(lista, ctx))}>${ocupado === 'x' ? 'Preparando…' : '⬇ Exportar todo (Excel)'}</button>
    <button class="prim" disabled=${!!ocupado} onClick=${() => correr('p', () => exportarTodoPDF(lista, ctx, sub))}>${ocupado === 'p' ? 'Preparando…' : '⬇ Informe completo con Gantt (PDF)'}</button>`;
}

const COLOR_ESTADO = {
  'No reportada': '#c0392b', 'No iniciada': '#8a979e', 'En ejecución': '#2b6cb0',
  'Concluida': '#2e7d4f', 'Cancelada': '#8d6e4f',
};

export async function cargarMeses() {
  const { data } = await sb.from('reportes_mensuales').select('periodo').order('periodo', { ascending: false }).limit(2000);
  const s = new Set((data || []).map(r => r.periodo));
  s.add(mesActualISO());
  return [...s].sort().reverse();
}

export async function cargarReportesMes(mes) {
  if (!mes || mes === mesActualISO()) return null;
  const { data } = await sb.from('reportes_mensuales').select('proyecto_id,ficha,estado,avance').eq('periodo', mes);
  const orden = { 'Seguimiento': 1, 'F-1': 2, 'F-2': 3 };
  const m = {};
  for (const r of data || []) {
    const prev = m[r.proyecto_id];
    // prioridad: F-2 > F-1 > Seguimiento; se combina el avance si falta
    if (!prev || orden[r.ficha] > orden[prev.ficha]) m[r.proyecto_id] = { ...r, avance: r.avance ?? prev?.avance ?? null, estado: r.estado ?? prev?.estado };
    else if (prev.avance === null && r.avance !== null) prev.avance = r.avance;
  }
  return m;
}

function Grafico({ tipo, datos, opciones }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    const g = new Chart(ref.current, { type: tipo, data: datos, options: { responsive: true, maintainAspectRatio: false, ...opciones } });
    return () => g.destroy();
  }, [JSON.stringify(datos)]);
  return html`<div class="graf"><canvas ref=${ref}></canvas></div>`;
}

export function Tablero({ ctx }) {
  const { cat } = ctx;
  const [lista, setLista] = useState(null);
  const [f, setF] = useState(filtrosVacios());
  const [meses, setMeses] = useState([]);
  const [repMes, setRepMes] = useState(null);
  const [err, setErr] = useState('');
  const [verRevisar, setVerRevisar] = useState(false);

  useEffect(() => {
    sb.from('v_proyectos').select('*').order('codigo').then(({ data, error }) => error ? setErr(mensajeError(error)) : setLista(data));
    cargarMeses().then(setMeses);
  }, []);
  useEffect(() => { cargarReportesMes(f.mes).then(setRepMes); }, [f.mes]);

  const filtrada = useMemo(() => lista ? aplicarFiltros(lista, f, repMes) : [], [lista, f, repMes]);
  const r = resumen(filtrada);

  if (err) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!lista) return html`<div class="vacio">Cargando tablero…</div>`;

  const dirs = cat.direcciones;
  const porDir = {
    labels: dirs.map(d => d.sigla),
    datasets: ESTADOS.map(e => ({ label: e, backgroundColor: COLOR_ESTADO[e], data: dirs.map(d => filtrada.filter(p => p.direccion_id === d.id && p.estado === e).length) })),
  };
  const unis = [...cat.unidades.map(u => ({ id: u.id, sigla: u.sigla })), { id: null, sigla: 'Por validar' }]
    .map(u => ({ ...u, ps: filtrada.filter(p => (p.unidad_id || null) === u.id) })).filter(u => u.ps.length);
  const porUni = {
    labels: unis.map(u => u.sigla),
    datasets: [
      { label: 'Avance promedio (%)', backgroundColor: '#23637f', data: unis.map(u => +(u.ps.reduce((a, p) => a + Number(p.avance || 0), 0) / u.ps.length).toFixed(1)), xAxisID: 'x' },
      { label: 'N.º de proyectos', backgroundColor: '#f2c14e', data: unis.map(u => u.ps.length), xAxisID: 'x2' },
    ],
  };
  const sub = describirFiltros(f, cat);
  const enMes = f.mes && f.mes !== mesActualISO();

  return html`
    <div class="encabezado">
      <div><h1>${ctx.perfil.rol === 'admin' ? 'Consolidado SMCI' : 'Tablero de ' + (ctx.perfil.rol === 'director'
          ? (cat.direcciones[0]?.sigla || 'mi dirección') : (cat.unidades[0]?.sigla || 'mi unidad'))}</h1>
        <p>${enMes ? `Situación reportada en ${nombreMes(f.mes)}` : 'Situación actual'} · ${r.total} proyectos · fecha de corte: día ${cat.config.dia_corte ?? 25} de cada mes</p></div>
      <div class="acciones">
        <${BotonesExportarTodo} lista=${filtrada} ctx=${ctx} sub=${sub} />
        <button onClick=${() => exportarExcel('tablero_smci', COLUMNAS_PROYECTO, filtrada, 'Tablero')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF(ctx.perfil.rol === 'admin' ? 'Reporte consolidado de la SMCI' : 'Tablero de proyectos', sub, COLUMNAS_PROYECTO, filtrada, 'tablero_smci')}>Exportar PDF</button>
      </div>
    </div>
    <${Filtros} f=${f} setF=${setF} cat=${cat} meses=${meses} />
    ${enMes && html`<${Aviso} tipo="info">Estado y avance tomados de las fichas de ${nombreMes(f.mes)}. Los proyectos sin ficha ese mes figuran como «No reportada». El semáforo y las fechas son los vigentes hoy.<//>`}
    <div class="rejilla kpis" style="margin-bottom:1rem">
      <div class="kpi"><div class="v">${r.total}</div><div class="t">Proyectos</div></div>
      <div class="kpi"><div class="v">${pct(+r.avancePromedio.toFixed(1))}</div><div class="t">Avance promedio</div></div>
      ${ESTADOS.map(e => html`<div class="kpi ${e === 'No reportada' && r.porEstado[e] ? 'alerta' : ''}"><div class="v">${r.porEstado[e]}</div><div class="t">${e}</div></div>`)}
      <div class="kpi ${r.vencidos ? 'alerta' : ''}"><div class="v">${r.vencidos}</div><div class="t">Vencidos sin concluir</div></div>
      <div class="kpi ${r.reprogramados ? 'aviso' : ''}"><div class="v">${r.reprogramados}</div><div class="t">Reprogramados</div></div>
      <div class="kpi ${r.porValidar ? 'aviso' : ''}" style=${r.porValidar ? 'cursor:pointer' : ''} onClick=${() => r.porValidar && setVerRevisar(!verRevisar)}
        title="Proyectos cuyos datos de la carga inicial deben revisarse (unidad o responsable dudosos). No son cambios pendientes de validación.">
        <div class="v">${r.porValidar}</div><div class="t">Datos por revisar${r.porValidar ? (verRevisar ? ' (clic para ocultar)' : ' (clic para ver)') : ''}</div></div>
    </div>
    ${verRevisar && r.porValidar > 0 && html`<div class="panel" style="background:#fff8e6;border-color:#f0dc9c">
      <h3>Datos por revisar (${r.porValidar})</h3>
      <p class="ayuda">Proyectos marcados en la carga inicial porque su unidad o su responsable no estaban claros en la fuente. No son cambios esperando validación: hay que abrir cada proyecto, corregir el dato si hace falta y quitar la marca «Por validar» (en la ficha, pestaña de datos, solo el administrador).</p>
      <div class="tabla-env"><table><thead><tr><th>Código</th><th>Proyecto</th><th>Unidad</th><th>Qué revisar</th></tr></thead>
        <tbody>${filtrada.filter(p => p.por_validar).map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
          <td class="nowrap"><b>${p.codigo}</b></td><td>${p.nombre}</td><td class="nowrap">${p.unidad_sigla || html`<span class="etiqueta">Sin unidad</span>`}</td>
          <td>${p.por_validar_motivo || '—'}</td></tr>`)}</tbody></table></div></div>`}
    <div class="rejilla dos">
      <div class="panel"><h3>Proyectos por dirección y estado</h3>
        <${Grafico} tipo="bar" datos=${porDir} opciones=${{ scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }} /></div>
      <div class="panel"><h3>Avance y cantidad por unidad</h3>
        <${Grafico} tipo="bar" datos=${porUni} opciones=${{ indexAxis: 'y', scales: { x: { min: 0, max: 100, position: 'bottom', title: { display: true, text: '% avance' } }, x2: { position: 'top', grid: { drawOnChartArea: false }, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }} /></div>
    </div>
    <div class="panel">
      <h3>Detalle por proyecto</h3>
      <div class="tabla-env"><table>
        <thead><tr><th>Código</th><th>Proyecto</th><th>Estado</th><th>% avance</th><th>Fecha original</th><th>Fecha vigente</th><th></th><th>Qué falta</th></tr></thead>
        <tbody>${filtrada.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
          <td class="nowrap">${p.codigo_estrategico ? html`<span class="cod-est">${p.codigo_estrategico}</span>${p.codigo !== p.codigo_estrategico ? html`<span class="cod-smci">${p.codigo}</span>` : ''}` : html`<b>${p.codigo}</b>`}<br/><span class="pill">${p.unidad_sigla || 'Sin unidad'}</span></td>
          <td>${p.nombre}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}</td>
          <td><${Estado} e=${p.estado} /></td>
          <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
          <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
          <td class="nowrap">${fecha(p.fecha_entrega_vigente)}${p.n_reprogramaciones ? html` <span class="pill" title="Reprogramaciones">↻${p.n_reprogramaciones}</span>` : ''}</td>
          <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
          <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} max=${3} /></td>
        </tr>`)}</tbody>
      </table>${!filtrada.length && html`<div class="vacio">No hay proyectos con estos filtros.</div>`}</div>
    </div>`;
}
