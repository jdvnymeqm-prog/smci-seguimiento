import { html, useState, useEffect, useMemo, sb, fecha, puedeEditar, exportarExcel, exportarPDF, mensajeError, bloqueoCambios, colorDir } from '../lib.js';
import { Estado, Semaforo, Barra, Aviso, QueFalta, Modal, Filtros, FechaInput, filtrosVacios, aplicarFiltros, describirFiltros, COLUMNAS_PROYECTO, Codigo, CodigoContinuidad, LeyendaDirecciones } from '../componentes.js';
import { cargarMeses, cargarReportesMes } from './tablero.js';

export function ListaProyectos({ ctx, modo = 'otros' }) {
  const { cat, perfil } = ctx;
  const [lista, setLista] = useState(null);
  const [f, setF] = useState(filtrosVacios());
  const [meses, setMeses] = useState([]);
  const [repMes, setRepMes] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [err, setErr] = useState('');

  const cargar = () => sb.from('v_proyectos').select('*').order('codigo')
    .then(({ data, error }) => error ? setErr(mensajeError(error)) : setLista(data));
  useEffect(() => { cargar(); cargarMeses().then(setMeses); }, []);
  useEffect(() => { cargarReportesMes(f.mes).then(setRepMes); }, [f.mes]);

  const todos = useMemo(() => lista ? aplicarFiltros(lista, f, repMes) : [], [lista, f, repMes]);
  const esEst = modo === 'estrategicos';
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
      <div><h1>${esEst ? 'Proyectos dentro del plan de gobierno' : 'Proyectos fuera del plan de gobierno'}</h1><p>${esEst
        ? 'Proyectos estratégicos del Eje III «Ciudad Inteligente» · programas E3P23 a E3P28. Cada proyecto con su numeral; si también tiene código SMCI, va debajo.'
        : `Proyectos de la Secretaría que no forman parte del plan de gobierno (Eje III): ${filtrada.length} de ${lista.length - nEst}, agrupados por dirección y unidad.`}</p></div>
      <div class="acciones">
        ${puedeCrear && html`<button class="prim" onClick=${() => setNuevo(true)}>+ Nuevo proyecto</button>`}
        <button onClick=${() => exportarExcel(esEst ? 'proyectos_dentro_plan_gobierno' : 'proyectos_fuera_plan_gobierno', esEst ? COLS_EST : COLUMNAS_PROYECTO, filtrada, esEst ? 'Dentro del plan' : 'Fuera del plan')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF(esEst ? 'Proyectos dentro del plan de gobierno · Eje III Ciudad Inteligente' : 'Proyectos fuera del plan de gobierno', describirFiltros(f, cat), esEst ? COLS_EST : COLUMNAS_PROYECTO, filtrada, esEst ? 'proyectos_dentro_plan_gobierno' : 'proyectos_fuera_plan_gobierno')}>Exportar PDF</button>
      </div>
    </div>
    <${Filtros} f=${f} setF=${setF} cat=${cat} meses=${meses} conTexto=${true} />
    <${LeyendaDirecciones} cat=${cat} />
    ${esEst ? html`<${TablaEstrategicos} ps=${filtrada} cat=${cat} perfil=${perfil} />` : html`<div class="tabla-env"><table>
      <thead><tr><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th>% avance</th>
        <th>Fecha original</th><th>Fecha vigente</th><th class="num">Reprog.</th><th></th><th>Qué falta</th></tr></thead>
      <tbody>${grupos.map(g => html`
        <tr class="grupo-dir"><td colspan="10" style=${'background:' + colorDir(g.d.sigla).fuerte + ';color:#fff'}>${g.d.sigla} · ${g.d.nombre}${!g.d.activa ? ' (inactiva)' : ''}</td></tr>
        ${g.unis.map(x => html`
          <tr class="grupo-uni"><td colspan="10">${x.u.sigla} · ${x.u.nombre} <span class="pill">${x.ps.length}</span></td></tr>
          ${x.ps.map(p => html`<${FilaProyecto} p=${p} perfil=${perfil} cat=${cat} />`)}`)}`)}
      </tbody></table>
      ${!filtrada.length && html`<div class="vacio">No hay proyectos con estos filtros.</div>`}
    </div>`}
    ${nuevo && html`<${NuevoProyecto} ctx=${ctx} lista=${lista} onCerrar=${() => setNuevo(false)} onCreado=${id => { location.hash = '#/proyecto/' + id; }} />`}`;
}

const COLS_EST = [{ titulo: 'Programa', valor: p => p.estrategico_programa || '', ancho: 9 }, ...COLUMNAS_PROYECTO];

// Fila de proyecto (misma estructura en las dos pestañas): código estratégico arriba y código SMCI debajo
function FilaProyecto({ p, perfil, cat, celdaCodigo, celdaNombre, sub }) {
  const c = colorDir(p.direccion_sigla);
  return html`<tr class=${'clic' + (sub ? ' sub' : '')} onClick=${() => location.hash = '#/proyecto/' + p.id}>
    <td class="nowrap" style=${'border-left:5px solid ' + c.fuerte}>${celdaCodigo || html`<${Codigo} p=${p} />${!p.codigo_estrategico && p.codigo_gobierno ? html`<br/><span class="pill" title="Proyecto de gobierno">PG ${p.codigo_gobierno}</span>` : ''}`}</td>
    <td>${celdaNombre || p.nombre}${p.codigos_continuidad ? html` <span class="ayuda" title=${'Reúne: ' + p.codigos_continuidad}>↻ proyecto con continuidad</span>` : ''}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}
      ${!puedeEditar(perfil, p.unidad_id, p.direccion_id) ? '' : html` <span class="pill">editable</span>`}
      <br/><span class="pill" style=${'background:' + c.suave + ';color:' + c.fuerte + ';border:1px solid ' + c.fuerte}>${p.direccion_sigla}${p.unidad_sigla ? ' · ' + p.unidad_sigla : ' · sin unidad'}</span></td>
    <td>${p.responsable_nombre || (cat && puedeEditar(perfil, p.unidad_id, p.direccion_id) && !bloqueoCambios(cat, perfil)
      ? html`<${AsignarResponsable} p=${p} cat=${cat} perfil=${perfil} />` : html`<span class="etiqueta">Falta responsable</span>`)}</td>
    <td><${Estado} e=${p.estado} /></td>
    <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
    <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
    <td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
    <td class="num">${p.n_reprogramaciones}</td>
    <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
    <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} /></td>
  </tr>`;
}

// Proyectos estratégicos con la estructura del Excel: Programa (E3P23…E3P28) → proyecto estratégico (23.1, 24.1…).
// Cada proyecto estratégico es una fila; si tiene también código SMCI, va debajo del numeral.
// Dato faltante en la lista: casilla para asignar el responsable sin abrir la ficha (se valida como cualquier cambio)
function AsignarResponsable({ p, cat, perfil }) {
  const [msg, setMsg] = useState('');
  const personas = cat.personas.filter(x => x.activa !== false && (!p.unidad_id || x.unidad_id === p.unidad_id || (!x.unidad_id && x.direccion_id === p.direccion_id)));
  async function elegir(id) {
    if (!id) return;
    const r = perfil.rol === 'admin'
      ? await sb.from('proyectos').update({ responsable_id: id }).eq('id', p.id).select('id').single()
      : await sb.rpc('proponer', { p_tipo: 'proyecto', p_proyecto: p.id, p_registro: null, p_datos: { cambios: { responsable_id: id } }, p_motivo: null });
    setMsg(r.error ? mensajeError(r.error) : perfil.rol === 'admin' ? 'Asignado. Actualice la lista.' : 'Enviado a validación.');
  }
  return html`<span onClick=${e => e.stopPropagation()}>${msg ? html`<span class="ayuda">${msg}</span>` : html`
    <select class="falta" value="" onChange=${e => elegir(e.target.value)} title="Falta responsable: elíjalo aquí">
      <option value="">Asignar responsable…</option>${personas.map(x => html`<option value=${x.id}>${x.nombre}</option>`)}</select>`}</span>`;
}

function TablaEstrategicos({ ps, cat, perfil }) {
  const E = cat.estrategicos || [];
  // Cada proyecto es independiente: una fila por proyecto, con su numeral real arriba y su código SMCI debajo.
  // Orden: programa (23…28) → numeral oficial (23.1 … 28.3) → proyectos con solo el código del programa.
  const ordenE = Object.fromEntries(E.map(e => [e.codigo, e.orden]));
  const programas = E.filter(e => e.tipo === 'programa').map(pr => ({
    pr, filas: ps.filter(p => p.codigo_estrategico === pr.codigo || E.some(e => e.codigo === p.codigo_estrategico && e.programa === pr.codigo))
      .sort((a, b) => ((ordenE[a.codigo_estrategico] ?? 0) - (ordenE[b.codigo_estrategico] ?? 0))
        || ((a.codigo_estrategico === pr.codigo) - (b.codigo_estrategico === pr.codigo)) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
  })).filter(x => x.filas.length);
  const total = programas.reduce((a, x) => a + x.filas.length, 0);
  const celda = (p, pr) => {
    const num = html`<span class="cod-est">${p.codigo_estrategico === pr.codigo ? pr.numeral : p.codigo_estrategico}</span>`;
    if (p.codigos_continuidad) return html`<${CodigoContinuidad} p=${p} previo=${html`${num}<br/>`} />`;
    return html`${num}${p.codigo !== p.codigo_estrategico ? html`<span class="cod-smci">${p.codigo}</span>` : ''}`;
  };
  return html`<div class="tabla-env"><table class="tabla-est">
    <thead><tr><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th>% avance</th>
      <th>Fecha original</th><th>Fecha vigente</th><th class="num">Reprog.</th><th></th><th>Qué falta</th></tr></thead>
    <tbody>${programas.map(x => html`
      <tr class="grupo-prog"><td colspan="10">${x.pr.codigo} · ${x.pr.numeral}. ${x.pr.nombre} <span class="pill">${x.filas.length} ${x.filas.length === 1 ? 'proyecto' : 'proyectos'}</span></td></tr>
      ${x.filas.map(p => html`<${FilaProyecto} p=${p} perfil=${perfil} cat=${cat} celdaCodigo=${celda(p, x.pr)} />`)}`)}
    </tbody></table>
    ${!total && html`<div class="vacio">No hay proyectos dentro del plan de gobierno con estos filtros.</div>`}</div>`;
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
