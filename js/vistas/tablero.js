import { html, useState, useEffect, useRef, useMemo, sb, ESTADOS, fecha, pct, mesActualISO, nombreMes, exportarExcel, exportarPDF, mensajeError, colorDir } from '../lib.js';
import { Estado, EstadoProyecto, Semaforo, Barra, Aviso, QueFalta, Filtros, filtrosVacios, aplicarFiltros, resumen, describirFiltros, COLUMNAS_PROYECTO, Codigo, LeyendaDirecciones } from '../componentes.js';
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

// Gráfico de avance: barras horizontales (0–100 %) con su resumen
const COLOR_PROGRAMA = { E3P23: '#18465c', E3P24: '#2b6cb0', E3P25: '#2e7d4f', E3P26: '#8e44ad', E3P27: '#c98a00', E3P28: '#c0392b' };
const corto = (t, n = 48) => t && t.length > n ? t.slice(0, n - 1) + '…' : (t || '');
const prom = xs => xs.length ? +(xs.reduce((a, p) => a + Number(p.avance || 0), 0) / xs.length).toFixed(1) : 0;

function PanelAvance({ titulo, nota, filas, ps, destacado }) {
  const activos = ps.filter(p => p.estado !== 'Cancelada');
  const kpis = [
    ['Proyectos', ps.length], ['Avance promedio', pct(prom(activos))],
    ['Concluidos', ps.filter(p => p.estado === 'Concluida').length], ['En ejecución', ps.filter(p => p.estado === 'En ejecución').length],
    ['No iniciados', ps.filter(p => p.estado === 'No iniciada').length], ['Vencidos', ps.filter(p => p.vencido).length],
  ];
  const datos = {
    labels: filas.map(f => f.etiqueta),
    datasets: [{ label: 'Avance (%)', data: filas.map(f => f.avance), backgroundColor: filas.map(f => f.color), borderRadius: 3 }],
  };
  const opciones = {
    indexAxis: 'y', plugins: { legend: { display: false },
      tooltip: { callbacks: { title: it => filas[it[0].dataIndex].titulo, label: it => ` Avance: ${it.raw} %${filas[it.dataIndex].n > 1 ? ' (promedio de ' + filas[it.dataIndex].n + ' proyectos)' : ''}` } } },
    scales: { x: { min: 0, max: 100, title: { display: true, text: '% de avance' } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } },
    onClick: (_e, el) => { if (el.length && filas[el[0].index].id) location.hash = '#/proyecto/' + filas[el[0].index].id; },
  };
  return html`<div class="panel" style=${destacado ? 'border:2px solid #18465c' : ''}>
    <h2 style="margin-top:0">${titulo}</h2>
    ${nota && html`<p class="ayuda">${nota}</p>`}
    <div class="rejilla kpis" style="margin-bottom:.75rem">${kpis.map(([t, v]) => html`<div class="kpi"><div class="v">${v}</div><div class="t">${t}</div></div>`)}</div>
    ${filas.length ? html`<${Grafico} tipo="bar" datos=${datos} opciones=${opciones} alto=${Math.max(160, filas.length * 26 + 60)} />`
      : html`<div class="vacio">No hay proyectos con estos filtros.</div>`}
  </div>`;
}

function Grafico({ tipo, datos, opciones, alto }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    const g = new Chart(ref.current, { type: tipo, data: datos, options: { responsive: true, maintainAspectRatio: false, ...opciones } });
    return () => g.destroy();
  }, [JSON.stringify(datos)]);
  return html`<div class="graf" style=${alto ? `height:${alto}px` : ''}><canvas ref=${ref}></canvas></div>`;
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
    sb.from('v_proyectos').select('*').eq('gestion', ctx.gestion || 2026).order('codigo').then(({ data, error }) => error ? setErr(mensajeError(error)) : setLista(data));
    cargarMeses().then(setMeses);
  }, []);
  useEffect(() => { cargarReportesMes(f.mes).then(setRepMes); }, [f.mes]);

  const filtrada = useMemo(() => lista ? aplicarFiltros(lista, f, repMes) : [], [lista, f, repMes]);
  const r = resumen(filtrada);
  // Detalle separado: primero los proyectos estratégicos (en el orden del Eje III), abajo los demás
  const ordenEst = Object.fromEntries((cat.estrategicos || []).map(e => [e.codigo, e.orden]));
  const est = filtrada.filter(p => p.codigo_estrategico).sort((x, y) => (ordenEst[x.codigo_estrategico] - ordenEst[y.codigo_estrategico]) || x.codigo.localeCompare(y.codigo));
  const otros = filtrada.filter(p => !p.codigo_estrategico);

  if (err) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!lista) return html`<div class="vacio">Cargando tablero…</div>`;

  const dirs = cat.direcciones;
  const porDir = {
    labels: dirs.map(d => d.sigla),
    datasets: ESTADOS.map(e => ({ label: e, backgroundColor: COLOR_ESTADO[e], data: dirs.map(d => filtrada.filter(p => p.direccion_id === d.id && p.estado === e).length) })),
  };
  const unis = [...cat.unidades.map(u => ({ id: u.id, sigla: u.sigla, direccion_id: u.direccion_id })), { id: null, sigla: 'Por validar' }]
    .map(u => ({ ...u, ps: filtrada.filter(p => (p.unidad_id || null) === u.id) })).filter(u => u.ps.length);
  const porUni = {
    labels: unis.map(u => u.sigla),
    datasets: [
      { label: 'Avance promedio (%)', backgroundColor: unis.map(u => colorDir((cat.direcciones.find(d => d.id === u.direccion_id) || {}).sigla).fuerte), data: unis.map(u => +(u.ps.reduce((a, p) => a + Number(p.avance || 0), 0) / u.ps.length).toFixed(1)), xAxisID: 'x' },
      { label: 'N.º de proyectos', backgroundColor: '#f2c14e', data: unis.map(u => u.ps.length), xAxisID: 'x2' },
    ],
  };
  // Dentro del plan: una barra por numeral (23, 23.1, 24, 24.1…), con el promedio de sus proyectos
  const E = cat.estrategicos || [];
  // Dentro del plan: una barra por proyecto (cada proyecto es independiente), en el orden del Eje III
  const filasEst = est.map(p => ({ e: { numeral: (E.find(e => e.codigo === p.codigo_estrategico) || {}).numeral || p.codigo_estrategico,
      nombre: p.codigo === p.codigo_estrategico ? p.nombre : p.codigo + ' · ' + p.nombre, tipo: 'proyecto',
      programa: (E.find(e => e.codigo === p.codigo_estrategico) || {}).programa || p.codigo_estrategico }, xs: [p] }))
    .filter(x => x.xs.length).map(({ e, xs }) => ({
    etiqueta: `${e.numeral}  ${corto(e.tipo === 'programa' ? 'Otras acciones del programa: ' + e.nombre : e.nombre)}`,
    titulo: `${e.numeral} ${e.tipo === 'programa' ? '(programa) ' : ''}${e.nombre}`,
    avance: prom(xs.filter(p => p.estado !== 'Cancelada').length ? xs.filter(p => p.estado !== 'Cancelada') : xs),
    n: xs.length, id: xs.length === 1 ? xs[0].id : null, color: COLOR_PROGRAMA[e.programa] || '#23637f' }));
  // Fuera del plan: una barra por proyecto
  const filasOtros = otros.map(p => ({ etiqueta: `${p.codigo}  ${corto(p.nombre)}`, titulo: `${p.codigo} ${p.nombre}`,
    avance: Number(p.avance || 0), n: 1, id: p.id, color: COLOR_ESTADO[p.estado] || '#23637f' }));
  const sub = describirFiltros(f, cat);
  const enMes = f.mes && f.mes !== mesActualISO();

  return html`
    <div class="encabezado">
      <div><h1>${ctx.perfil.rol === 'admin' ? 'Consolidado SMCI' : 'Tablero de ' + (ctx.perfil.rol === 'director'
          ? (cat.direcciones[0]?.sigla || 'mi dirección') : (cat.unidades[0]?.sigla || 'mi unidad'))} <span class="pill">Gestión ${ctx.gestion || 2026}</span></h1>
        <p>${enMes ? `Situación reportada en ${nombreMes(f.mes)}` : 'Situación actual'} · ${r.total} proyectos · fecha de corte: día ${cat.config.dia_corte ?? 25} de cada mes</p></div>
      <div class="acciones">
        <${BotonesExportarTodo} lista=${filtrada} ctx=${ctx} sub=${sub} />
        <button onClick=${() => exportarExcel('tablero_smci', COLUMNAS_PROYECTO, filtrada, 'Tablero')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF(ctx.perfil.rol === 'admin' ? 'Reporte consolidado de la SMCI' : 'Tablero de proyectos', sub, COLUMNAS_PROYECTO, filtrada, 'tablero_smci')}>Exportar PDF</button>
      </div>
    </div>
    <${Filtros} f=${f} setF=${setF} cat=${cat} meses=${meses} />
    <${LeyendaDirecciones} cat=${cat} />
    ${enMes && html`<${Aviso} tipo="info">Estado y avance tomados de las fichas de ${nombreMes(f.mes)}. Los proyectos sin ficha ese mes figuran como «No reportada». El semáforo y las fechas son los vigentes hoy.<//>`}
    <div class="rejilla kpis" style="margin-bottom:1rem">
      <div class="kpi"><div class="v">${r.total}</div><div class="t">Proyectos</div></div>
      <div class="kpi"><div class="v">${pct(+r.avancePromedio.toFixed(1))}</div><div class="t">Avance promedio</div></div>
      ${ESTADOS.map(e => html`<div class="kpi ${e === 'No reportada' && r.porEstado[e] ? 'alerta' : ''}"><div class="v">${r.porEstado[e]}</div><div class="t">${e}</div></div>`)}
      <div class="kpi ${r.vencidos ? 'alerta' : ''}"><div class="v">${r.vencidos}</div><div class="t">Vencidos sin concluir</div></div>
      ${!enMes && html`<div class="kpi ${filtrada.some(p => p.sin_reporte) ? 'aviso' : ''}" title="Proyectos con al menos un mes sin reporte (se indica cuál junto a su estado)"><div class="v">${filtrada.filter(p => p.sin_reporte).length}</div><div class="t">Con meses sin reporte</div></div>`}
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
          <td class="nowrap"><${Codigo} p=${p} /></td><td>${p.nombre}</td><td class="nowrap">${p.unidad_sigla || html`<span class="etiqueta">Sin unidad</span>`}</td>
          <td>${p.por_validar_motivo || '—'}</td></tr>`)}</tbody></table></div></div>`}
    <${PanelAvance} destacado=${true} titulo=${'Proyectos dentro del plan de gobierno · Eje III Ciudad Inteligente'}
      nota="Avance por proyecto estratégico. Cuando un numeral tiene varios proyectos SMCI, la barra es su promedio. Color por programa: 23 azul oscuro · 24 azul · 25 verde · 26 violeta · 27 ámbar · 28 rojo. Haga clic en una barra de un solo proyecto para abrirlo."
      filas=${filasEst} ps=${est} />
    <${PanelAvance} titulo="Proyectos fuera del plan de gobierno"
      nota="Avance de cada proyecto. Color según su estado: azul en ejecución, verde concluido, gris no iniciado, rojo no reportado. Haga clic en una barra para abrir el proyecto."
      filas=${filasOtros} ps=${otros} />
    <div class="rejilla dos">
      <div class="panel"><h3>Proyectos por dirección y estado</h3>
        <${Grafico} tipo="bar" datos=${porDir} opciones=${{ scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }} /></div>
      <div class="panel"><h3>Avance y cantidad por unidad</h3>
        <${Grafico} tipo="bar" datos=${porUni} opciones=${{ indexAxis: 'y', scales: { x: { min: 0, max: 100, position: 'bottom', title: { display: true, text: '% avance' } }, x2: { position: 'top', grid: { drawOnChartArea: false }, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }} /></div>
    </div>
    <div class="panel">
      <h3>Proyectos dentro del plan de gobierno · Eje III Ciudad Inteligente (${est.length})</h3>
      <div class="tabla-env"><table>
        <thead><tr><th>Código</th><th>Proyecto</th><th>Estado</th><th>% avance</th><th>Fecha original</th><th>Fecha vigente</th><th></th><th>Qué falta</th></tr></thead>
        <tbody>${est.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
          <td class="nowrap" style=${'border-left:5px solid ' + colorDir(p.direccion_sigla).fuerte}><${Codigo} p=${p} /><br/><span class="pill" style=${'background:' + colorDir(p.direccion_sigla).suave + ';color:' + colorDir(p.direccion_sigla).fuerte}>${p.direccion_sigla} · ${p.unidad_sigla || 'Sin unidad'}</span></td>
          <td>${p.nombre}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}</td>
          <td><${EstadoProyecto} p=${p} /></td>
          <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
          <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
          <td class="nowrap">${fecha(p.fecha_entrega_vigente)}${p.n_reprogramaciones ? html` <span class="pill" title="Reprogramaciones">↻${p.n_reprogramaciones}</span>` : ''}</td>
          <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
          <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} max=${3} /></td>
        </tr>`)}</tbody>
      </table>${!est.length && html`<div class="vacio">No hay proyectos dentro del plan de gobierno con estos filtros.</div>`}</div>
    </div>
    <div class="panel">
      <h3>Proyectos fuera del plan de gobierno (${otros.length})</h3>
      <div class="tabla-env"><table>
        <thead><tr><th>Código</th><th>Proyecto</th><th>Estado</th><th>% avance</th><th>Fecha original</th><th>Fecha vigente</th><th></th><th>Qué falta</th></tr></thead>
        <tbody>${otros.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
          <td class="nowrap" style=${'border-left:5px solid ' + colorDir(p.direccion_sigla).fuerte}><${Codigo} p=${p} /><br/><span class="pill" style=${'background:' + colorDir(p.direccion_sigla).suave + ';color:' + colorDir(p.direccion_sigla).fuerte}>${p.direccion_sigla} · ${p.unidad_sigla || 'Sin unidad'}</span></td>
          <td>${p.nombre}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}</td>
          <td><${EstadoProyecto} p=${p} /></td>
          <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
          <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
          <td class="nowrap">${fecha(p.fecha_entrega_vigente)}${p.n_reprogramaciones ? html` <span class="pill" title="Reprogramaciones">↻${p.n_reprogramaciones}</span>` : ''}</td>
          <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
          <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} max=${3} /></td>
        </tr>`)}</tbody>
      </table>${!otros.length && html`<div class="vacio">No hay proyectos con estos filtros.</div>`}</div>
    </div>`;
}
