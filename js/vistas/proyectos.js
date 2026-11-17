import { html, useState, useEffect, useMemo, sb, fecha, puedeEditar, exportarExcel, exportarPDF, mensajeError, bloqueoCambios, usePestana } from '../lib.js';
import { Estado, Semaforo, Barra, Aviso, QueFalta, Modal, Filtros, FechaInput, filtrosVacios, aplicarFiltros, describirFiltros, COLUMNAS_PROYECTO, Codigo } from '../componentes.js';
import { cargarMeses, cargarReportesMes } from './tablero.js';

export function ListaProyectos({ ctx }) {
  const { cat, perfil } = ctx;
  const [lista, setLista] = useState(null);
  const [f, setF] = useState(filtrosVacios());
  const [meses, setMeses] = useState([]);
  const [repMes, setRepMes] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [pest, setPest] = usePestana('pestana', 'estrategicos');
  const [err, setErr] = useState('');

  const cargar = () => sb.from('v_proyectos').select('*').order('codigo')
    .then(({ data, error }) => error ? setErr(mensajeError(error)) : setLista(data));
  useEffect(() => { cargar(); cargarMeses().then(setMeses); }, []);
  useEffect(() => { cargarReportesMes(f.mes).then(setRepMes); }, [f.mes]);

  const todos = useMemo(() => lista ? aplicarFiltros(lista, f, repMes) : [], [lista, f, repMes]);
  const esEst = pest === 'estrategicos';
  // Sin repetir: lo estratégico va solo en su pestaña; «Otros» es lo que no tiene código del Eje III
  const filtrada = todos.filter(p => esEst ? !!p.codigo_estrategico : !p.codigo_estrategico);
  const nEst = lista ? lista.filter(p => p.codigo_estrategico).length : 0;
  const puedeCrear = !bloqueoCambios(cat, perfil) && (perfil.rol === 'admin' || ((perfil.rol === 'jefe' || perfil.rol === 'responsable') && perfil.unidad_id)
    || (perfil.rol === 'director' && perfil.puede_editar));

  if (err) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!lista) return html`<div class="vacio">Cargando proyectos…</div>`;

  // Agrupación Dirección → Unidad (incluye "Por validar")
  const grupos = cat.todasDirecciones.map(d => ({
    d,
    unis: [...cat.todasUnidades.filter(u => u.direccion_id === d.id), { id: null, sigla: 'Sin unidad', nombre: 'Unidad por asignar' }]
      .map(u => ({ u, ps: filtrada.filter(p => p.direccion_id === d.id && (p.unidad_id || null) === u.id) }))
      .filter(g => g.ps.length),
  })).filter(g => g.unis.length);

  return html`
    <div class="encabezado">
      <div><h1>Proyectos</h1><p>${esEst
        ? `Proyectos estratégicos del Eje III «Ciudad Inteligente» (E3P23 a E3P28): ${filtrada.length} de ${nEst}, agrupados por programa y proyecto estratégico`
        : `Otros proyectos de la Secretaría: ${filtrada.length} de ${lista.length - nEst}, agrupados por dirección y unidad`}</p></div>
      <div class="acciones">
        ${puedeCrear && html`<button class="prim" onClick=${() => setNuevo(true)}>+ Nuevo proyecto</button>`}
        <button onClick=${() => exportarExcel(esEst ? 'proyectos_estrategicos' : 'otros_proyectos', esEst ? COLS_EST : COLUMNAS_PROYECTO, filtrada, esEst ? 'Estratégicos' : 'Otros proyectos')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF(esEst ? 'Proyectos estratégicos · Eje III Ciudad Inteligente' : 'Otros proyectos', describirFiltros(f, cat), esEst ? COLS_EST : COLUMNAS_PROYECTO, filtrada, esEst ? 'proyectos_estrategicos' : 'otros_proyectos')}>Exportar PDF</button>
      </div>
    </div>
    <div class="tabs">
      <button class=${esEst ? 'activo' : ''} onClick=${() => setPest('estrategicos')}>⭐ Proyectos estratégicos · Eje III (${nEst})</button>
      <button class=${!esEst ? 'activo' : ''} onClick=${() => setPest('otros')}>Otros proyectos (${lista.length - nEst})</button></div>
    <${Filtros} f=${f} setF=${setF} cat=${cat} meses=${meses} conTexto=${true} />
    ${esEst ? html`<${TablaEstrategicos} ps=${filtrada} cat=${cat} perfil=${perfil} />` : html`<div class="tabla-env"><table>
      <thead><tr><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th>% avance</th>
        <th>Fecha original</th><th>Fecha vigente</th><th class="num">Reprog.</th><th></th><th>Qué falta</th></tr></thead>
      <tbody>${grupos.map(g => html`
        <tr class="grupo-dir"><td colspan="10">${g.d.sigla} · ${g.d.nombre}${!g.d.activa ? ' (inactiva)' : ''}</td></tr>
        ${g.unis.map(x => html`
          <tr class="grupo-uni"><td colspan="10">${x.u.sigla} · ${x.u.nombre} <span class="pill">${x.ps.length}</span></td></tr>
          ${x.ps.map(p => html`<${FilaProyecto} p=${p} perfil=${perfil} />`)}`)}`)}
      </tbody></table>
      ${!filtrada.length && html`<div class="vacio">No hay proyectos con estos filtros.</div>`}
    </div>`}
    ${nuevo && html`<${NuevoProyecto} ctx=${ctx} lista=${lista} onCerrar=${() => setNuevo(false)} onCreado=${id => { location.hash = '#/proyecto/' + id; }} />`}`;
}

const COLS_EST = [{ titulo: 'Programa', valor: p => p.estrategico_programa || '', ancho: 9 }, ...COLUMNAS_PROYECTO];

// Fila de proyecto (misma estructura en las dos pestañas): código estratégico arriba y código SMCI debajo
function FilaProyecto({ p, perfil }) {
  return html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
    <td class="nowrap"><${Codigo} p=${p} />${!p.codigo_estrategico && p.codigo_gobierno ? html`<br/><span class="pill" title="Proyecto de gobierno">PG ${p.codigo_gobierno}</span>` : ''}</td>
    <td>${p.nombre}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}
      ${!puedeEditar(perfil, p.unidad_id, p.direccion_id) ? '' : html` <span class="pill">editable</span>`}
      ${p.codigo_estrategico && html`<br/><span class="ayuda">${p.unidad_sigla || p.direccion_sigla || ''}</span>`}</td>
    <td>${p.responsable_nombre || html`<i class="ayuda">Sin responsable</i>`}</td>
    <td><${Estado} e=${p.estado} /></td>
    <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
    <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
    <td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
    <td class="num">${p.n_reprogramaciones}</td>
    <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
    <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} /></td>
  </tr>`;
}

// Pestaña de estratégicos: Programa (E3P23…E3P28) → Proyecto estratégico (E3Pxx-PROYn) → proyectos
function TablaEstrategicos({ ps, cat, perfil }) {
  const E = cat.estrategicos || [];
  const prom = xs => xs.length ? Math.round(xs.reduce((a, p) => a + Number(p.avance || 0), 0) / xs.length * 10) / 10 : null;
  const programas = E.filter(e => e.tipo === 'programa').map(pr => {
    const delPrograma = ps.filter(p => p.estrategico_programa === pr.codigo);
    const grupos = [
      ...E.filter(e => e.tipo === 'proyecto' && e.programa === pr.codigo).map(e => ({ e, xs: delPrograma.filter(p => p.codigo_estrategico === e.codigo) })),
      { e: { codigo: pr.codigo, numeral: pr.numeral, nombre: 'Otras acciones del programa (sin proyecto estratégico específico)' }, xs: delPrograma.filter(p => p.codigo_estrategico === pr.codigo), otras: true },
    ].filter(g => g.xs.length);
    return { pr, grupos, n: delPrograma.length, av: prom(delPrograma) };
  }).filter(x => x.n);
  return html`<div class="tabla-env"><table>
    <thead><tr><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th>% avance</th>
      <th>Fecha original</th><th>Fecha vigente</th><th class="num">Reprog.</th><th></th><th>Qué falta</th></tr></thead>
    <tbody>${programas.map(x => html`
      <tr class="grupo-prog"><td colspan="10">${x.pr.codigo} · ${x.pr.numeral}. ${x.pr.nombre} <span class="pill">${x.n}</span> · avance promedio ${x.av} %</td></tr>
      ${x.grupos.map(g => html`
        <tr class="grupo-est"><td colspan="10">${g.otras ? g.e.nombre : html`<b>${g.e.codigo}</b> ${g.e.nombre}`} <span class="pill">${g.xs.length}</span>${g.xs.length > 1 ? ` · avance promedio ${prom(g.xs)} %` : ''}</td></tr>
        ${g.xs.map(p => html`<${FilaProyecto} p=${p} perfil=${perfil} />`)}`)}`)}
    </tbody></table>
    ${!ps.length && html`<div class="vacio">No hay proyectos estratégicos con estos filtros.</div>`}</div>`;
}

function siguienteCodigo(lista) {
  const n = Math.max(0, ...lista.map(p => +((/SMCI-(\d+)/.exec(p.codigo) || [])[1] || 0)));
  return 'SMCI-' + String(n + 1).padStart(2, '0');
}

export function NuevoProyecto({ ctx, lista, onCerrar, onCreado }) {
  const { cat, perfil } = ctx;
  const unidadesPermitidas = cat.unidades.filter(u => puedeEditar(perfil, u.id, u.direccion_id));
  const [d, setD] = useState({
    codigo: siguienteCodigo(lista), codigo_gobierno: '', nombre: '', descripcion: '', objetivo: '',
    unidad_id: unidadesPermitidas.length === 1 ? unidadesPermitidas[0].id : (perfil.unidad_id || ''),
    responsable_id: '', fecha_inicio: '', fecha_entrega_original: '', estado: 'No iniciada',
  });
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = k => e => setD({ ...d, [k]: e.target.value });
  const personas = cat.personas.filter(p => !d.unidad_id || p.unidad_id === d.unidad_id || !p.unidad_id);

  async function guardar() {
    setErr('');
    if (!d.codigo.trim() || !d.nombre.trim() || !d.unidad_id) { setErr('Código, nombre y unidad son obligatorios.'); return; }
    const u = cat.unidades.find(x => x.id === d.unidad_id);
    setOcupado(true);
    if (perfil.rol !== 'admin') {
      const { error } = await sb.rpc('proponer', { p_tipo: 'crear_proyecto', p_proyecto: null, p_registro: null, p_motivo: null, p_datos: {
        codigo: d.codigo.trim(), codigo_gobierno: d.codigo_gobierno.trim() || null, nombre: d.nombre.trim(),
        descripcion: d.descripcion || null, objetivo: d.objetivo || null, unidad_id: d.unidad_id, responsable_id: d.responsable_id || null,
        fecha_inicio: d.fecha_inicio || null, fecha_entrega_original: d.fecha_entrega_original || null, estado: d.estado,
        por_validar: !d.responsable_id, por_validar_motivo: !d.responsable_id ? 'Sin responsable' : null } });
      setOcupado(false);
      if (error) return setErr(mensajeError(error));
      alert('Proyecto enviado a validación. Aparecerá en la lista cuando lo valide.');
      return onCerrar();
    }
    const { data, error } = await sb.from('proyectos').insert({
      codigo: d.codigo.trim(), codigo_gobierno: d.codigo_gobierno.trim() || null, nombre: d.nombre.trim(),
      descripcion: d.descripcion || null, objetivo: d.objetivo || null,
      unidad_id: d.unidad_id, direccion_id: u.direccion_id, responsable_id: d.responsable_id || null,
      fecha_inicio: d.fecha_inicio || null, fecha_entrega_original: d.fecha_entrega_original || null,
      estado: d.estado, por_validar: !d.responsable_id, por_validar_motivo: !d.responsable_id ? 'Sin responsable' : null,
      ultima_actualizacion: new Date().toISOString(),
    }).select('id').single();
    setOcupado(false);
    if (error) setErr(mensajeError(error)); else onCreado(data.id);
  }
  return html`<${Modal} titulo="Nuevo proyecto" onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button>
      <button class="prim" disabled=${ocupado} onClick=${guardar}>Crear proyecto</button>`}>
    <${Aviso} tipo="error">${err}<//>
    <div class="form">
      <label>Código SMCI<input value=${d.codigo} onInput=${set('codigo')} /></label>
      <label>Código de proyecto de gobierno<input value=${d.codigo_gobierno} onInput=${set('codigo_gobierno')} placeholder="p. ej. 25.1" /></label>
      <label class="ancho">Nombre<input value=${d.nombre} onInput=${set('nombre')} /></label>
      <label class="ancho">Descripción<textarea value=${d.descripcion} onInput=${set('descripcion')} /></label>
      <label class="ancho">Objetivo o resultado esperado<textarea value=${d.objetivo} onInput=${set('objetivo')} /></label>
      <label>Unidad<select value=${d.unidad_id} onChange=${set('unidad_id')}>
        <option value="">Elegir…</option>
        ${unidadesPermitidas.map(u => html`<option value=${u.id}>${u.sigla} · ${u.nombre}</option>`)}
      </select></label>
      <label>Responsable principal<select value=${d.responsable_id} onChange=${set('responsable_id')}>
        <option value="">Por definir</option>
        ${personas.map(p => html`<option value=${p.id}>${p.nombre}</option>`)}
      </select></label>
      <label>Fecha de inicio<${FechaInput} valor=${d.fecha_inicio} onCambio=${v => setD(x => ({ ...x, fecha_inicio: v }))} /></label>
      <label>Fecha de entrega original<${FechaInput} valor=${d.fecha_entrega_original} onCambio=${v => setD(x => ({ ...x, fecha_entrega_original: v }))} /></label>
    </div>
    <p class="ayuda">El avance se calculará con las tareas que agregue. Podrá añadir responsables de apoyo en la ficha.</p>
  <//>`;
}
