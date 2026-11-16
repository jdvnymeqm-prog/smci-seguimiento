import { html, useState, useEffect, useMemo, sb, fecha, puedeEditar, exportarExcel, exportarPDF, mensajeError, mesActualISO } from '../lib.js';
import { Estado, Semaforo, Barra, Aviso, QueFalta, Modal, Filtros, FechaInput, filtrosVacios, aplicarFiltros, describirFiltros, COLUMNAS_PROYECTO } from '../componentes.js';
import { cargarMeses, cargarReportesMes } from './tablero.js';

export function ListaProyectos({ ctx }) {
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

  const filtrada = useMemo(() => lista ? aplicarFiltros(lista, f, repMes) : [], [lista, f, repMes]);
  const puedeCrear = perfil.rol === 'admin' || ((perfil.rol === 'jefe' || perfil.rol === 'responsable') && perfil.unidad_id)
    || (perfil.rol === 'director' && perfil.puede_editar);

  if (err) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!lista) return html`<div class="vacio">Cargando proyectos…</div>`;

  // Agrupación Dirección → Unidad (incluye "Por validar")
  const grupos = cat.todasDirecciones.map(d => ({
    d,
    unis: [...cat.todasUnidades.filter(u => u.direccion_id === d.id), { id: null, sigla: 'Por validar', nombre: 'Sin unidad asignada' }]
      .map(u => ({ u, ps: filtrada.filter(p => p.direccion_id === d.id && (p.unidad_id || null) === u.id) }))
      .filter(g => g.ps.length),
  })).filter(g => g.unis.length);

  return html`
    <div class="encabezado">
      <div><h1>Proyectos</h1><p>${filtrada.length} de ${lista.length} proyectos, agrupados por dirección y unidad</p></div>
      <div class="acciones">
        ${puedeCrear && html`<button class="prim" onClick=${() => setNuevo(true)}>+ Nuevo proyecto</button>`}
        <button onClick=${() => exportarExcel('proyectos_smci', COLUMNAS_PROYECTO, filtrada, 'Proyectos')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF('Lista de proyectos', describirFiltros(f, cat), COLUMNAS_PROYECTO, filtrada, 'proyectos_smci')}>Exportar PDF</button>
      </div>
    </div>
    <${Filtros} f=${f} setF=${setF} cat=${cat} meses=${meses} conTexto=${true} />
    <div class="tabla-env"><table>
      <thead><tr><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado</th><th>% avance</th>
        <th>Fecha original</th><th>Fecha vigente</th><th class="num">Reprog.</th><th></th><th>Qué falta</th></tr></thead>
      <tbody>${grupos.map(g => html`
        <tr class="grupo-dir"><td colspan="10">${g.d.sigla} · ${g.d.nombre}${!g.d.activa ? ' (inactiva)' : ''}</td></tr>
        ${g.unis.map(x => html`
          <tr class="grupo-uni"><td colspan="10">${x.u.sigla} · ${x.u.nombre} <span class="pill">${x.ps.length}</span></td></tr>
          ${x.ps.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
            <td class="nowrap"><b>${p.codigo}</b>${p.codigo_gobierno ? html`<br/><span class="pill" title="Proyecto de gobierno">PG ${p.codigo_gobierno}</span>` : ''}</td>
            <td>${p.nombre}${p.por_validar ? html` <span class="etiqueta" title=${p.por_validar_motivo || ''}>Datos por revisar</span>` : ''}
              ${!puedeEditar(perfil, p.unidad_id, p.direccion_id) ? '' : html` <span class="pill">editable</span>`}</td>
            <td>${p.responsable_nombre || html`<i class="ayuda">Sin responsable</i>`}</td>
            <td><${Estado} e=${p.estado} /></td>
            <td style="min-width:120px"><${Barra} v=${p.avance} /></td>
            <td class="nowrap">${fecha(p.fecha_entrega_original)}</td>
            <td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
            <td class="num">${p.n_reprogramaciones}</td>
            <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>
            <td><${QueFalta} items=${p.que_falta} obs=${p.observaciones_falta} /></td>
          </tr>`)}`)}`)}
      </tbody></table>
      ${!filtrada.length && html`<div class="vacio">No hay proyectos con estos filtros.</div>`}
    </div>
    ${nuevo && html`<${NuevoProyecto} ctx=${ctx} lista=${lista} onCerrar=${() => setNuevo(false)} onCreado=${id => { location.hash = '#/proyecto/' + id; }} />`}`;
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
