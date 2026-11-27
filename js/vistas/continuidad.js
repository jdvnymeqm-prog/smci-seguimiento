// Continuidad de proyectos a la nueva gestión: lista de los proyectos de la gestión anterior, por dirección y unidad,
// para marcar cuáles continúan. Al confirmar, el proyecto aparece en la nueva gestión con sus mismos códigos, unidad,
// responsable y formato, pero vacío (sin tareas ni reportes) para cargar lo del nuevo año.
// Personal: queda pendiente de validación del jefe de unidad. Dirección y administrador: se aplica al instante.
import { html, useState, useEffect, sb, puedeEditar, mensajeError, colorDir, bloqueoCambios, prefijoGestion } from '../lib.js';
import { EstadoProyecto, Barra, Aviso, Codigo } from '../componentes.js';

export function Continuidad({ ctx }) {
  const { perfil, cat } = ctx;
  const nueva = ctx.gestion, anterior = nueva - 1;
  const [antes, setAntes] = useState(null);
  const [ya, setYa] = useState({});           // id de origen → id del proyecto en la nueva gestión
  const [pend, setPend] = useState(new Set()); // id de origen con continuidad pendiente de validación
  const [sel, setSel] = useState(new Set());
  const [f, setF] = useState({ dir: '', uni: '', texto: '', solo: true });
  const [msg, setMsg] = useState({});
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const [a, b, c] = await Promise.all([
      sb.from('v_proyectos').select('*').eq('gestion', anterior).order('codigo'),
      sb.from('proyectos').select('id,proyecto_origen_id').eq('gestion', nueva).not('proyecto_origen_id', 'is', null),
      sb.from('propuestas').select('datos').eq('tipo', 'crear_proyecto').eq('estado', 'pendiente'),
    ]);
    if (a.error) return setMsg({ err: mensajeError(a.error) });
    setAntes(a.data || []);
    setYa(Object.fromEntries((b.data || []).map(x => [x.proyecto_origen_id, x.id])));
    setPend(new Set((c.data || []).filter(x => Number(x.datos?.gestion) === nueva && x.datos?.proyecto_origen_id).map(x => x.datos.proyecto_origen_id)));
    setSel(new Set());
  }
  useEffect(() => { cargar(); }, [nueva]);
  if (!antes) return html`<div class="vacio">Cargando proyectos de la gestión ${anterior}…</div>`;

  const bloqueo = bloqueoCambios(cat, perfil);
  const puede = p => !bloqueo && !!p.unidad_id && puedeEditar(perfil, p.unidad_id, p.direccion_id) && !ya[p.id] && !pend.has(p.id);
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lista = antes.filter(p => (!f.dir || p.direccion_id === f.dir) && (!f.uni || (f.uni === '__sin' ? !p.unidad_id : p.unidad_id === f.uni))
    && (!f.texto || norm(p.codigo + ' ' + (p.codigo_estrategico || '') + ' ' + p.nombre).includes(norm(f.texto)))
    && (!f.solo || (!ya[p.id] && !pend.has(p.id))));
  const grupos = cat.direcciones.map(d => ({ d, unis: [...cat.unidades.filter(u => u.direccion_id === d.id).map(u => ({ u, ps: lista.filter(p => p.unidad_id === u.id) })),
    { u: { id: null, sigla: 'Sin unidad' }, ps: lista.filter(p => !p.unidad_id && p.direccion_id === d.id) }].filter(x => x.ps.length) })).filter(x => x.unis.length);
  const elegibles = lista.filter(puede);
  const marcar = (id, v) => setSel(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });

  async function continuar() {
    const ps = antes.filter(p => sel.has(p.id));
    if (!ps.length) return;
    if (!confirm(`¿Dar continuidad en la gestión ${nueva} a ${ps.length} proyecto(s)? Aparecerán en ${nueva} con sus mismos códigos, unidad y responsable, sin tareas ni reportes.`)) return;
    setOcupado(true); setMsg({});
    let aplicados = 0, pendientes = 0; const errores = [];
    for (const p of ps) {
      const { error } = await sb.rpc('proponer', { p_tipo: 'crear_proyecto', p_proyecto: null, p_registro: null, p_motivo: null, p_datos: {
        codigo: p.codigo, codigo_gobierno: p.codigo_gobierno || null, nombre: p.nombre, descripcion: p.descripcion || null, objetivo: p.objetivo || null,
        unidad_id: p.unidad_id, responsable_id: p.responsable_id || null, estado: 'No iniciada', gestion: nueva, proyecto_origen_id: p.id,
        por_validar: !p.responsable_id, por_validar_motivo: !p.responsable_id ? 'Sin responsable' : null } });
      if (error) errores.push(`${p.codigo}: ${mensajeError(error)}`);
      else if (perfil.rol === 'admin' || perfil.rol === 'director') aplicados++; else pendientes++;
    }
    setOcupado(false);
    setMsg({ ok: [aplicados && `${aplicados} proyecto(s) ya están en la gestión ${nueva}.`, pendientes && `${pendientes} enviado(s) a validación del jefe de unidad: aparecerán en ${nueva} al validarse.`].filter(Boolean).join(' '),
      err: errores.length ? 'No se pudo: ' + errores.join(' · ') : '' });
    cargar();
  }

  const estadoCont = p => ya[p.id] ? html`<a class="pill" style="background:#e8f5ed;color:#2e7d4f" href=${'#/proyecto/' + ya[p.id]}>✔ Continúa en ${nueva}</a>`
    : pend.has(p.id) ? html`<span class="etiqueta">Pendiente de validación</span>`
    : !p.unidad_id ? html`<span class="ayuda">Asigne una unidad para darle continuidad</span>` : html`<span class="ayuda">Sin continuidad</span>`;

  return html`
    <div class="encabezado"><div><h1>Continuidad de proyectos ${anterior} → ${nueva}</h1>
      <p>Marque los proyectos de la gestión ${anterior} que continuarán en ${nueva}. Aparecerán en «Gestión ${nueva}» con sus mismos códigos (numeral y SMCI),
        unidad, responsable y formato, pero vacíos, para que se carguen sus tareas y reportes del nuevo año. ${perfil.rol === 'admin' || perfil.rol === 'director'
          ? 'Lo que usted marque se aplica al instante.' : 'Lo que usted marque se aplica cuando lo valide su jefe de unidad.'}</p></div></div>
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    ${bloqueo && html`<${Aviso} tipo="error">El administrador bloqueó temporalmente los cambios.<//>`}
    <div class="panel"><div class="filtros">
      <label>Dirección<select value=${f.dir} onChange=${e => setF({ ...f, dir: e.target.value, uni: '' })}><option value="">Todas</option>
        ${cat.direcciones.map(d => html`<option value=${d.id}>${d.sigla}</option>`)}</select></label>
      <label>Unidad<select value=${f.uni} onChange=${e => setF({ ...f, uni: e.target.value })}><option value="">Todas</option>
        ${cat.unidades.filter(u => !f.dir || u.direccion_id === f.dir).map(u => html`<option value=${u.id}>${u.sigla}</option>`)}<option value="__sin">Sin unidad</option></select></label>
      <label>Buscar<input value=${f.texto} onInput=${e => setF({ ...f, texto: e.target.value })} placeholder="Código o nombre" /></label>
      <label style="flex-direction:row;align-items:center;gap:.4rem"><input type="checkbox" style="width:auto" checked=${f.solo} onChange=${e => setF({ ...f, solo: e.target.checked })} /> Solo los que aún no continúan</label>
    </div>
      <div class="acciones" style="margin-top:.6rem">
        <button disabled=${!elegibles.length} onClick=${() => setSel(new Set(elegibles.map(p => p.id)))}>Marcar todos los visibles (${elegibles.length})</button>
        <button disabled=${!sel.size} onClick=${() => setSel(new Set())}>Quitar marcas</button>
        <button class="prim" disabled=${!sel.size || ocupado} onClick=${continuar}>${ocupado ? 'Procesando…' : `Dar continuidad en ${nueva} (${sel.size})`}</button>
        <a href=${prefijoGestion(nueva) + 'tablero'} class="ayuda" style="margin-left:auto">Ver la gestión ${nueva} →</a></div></div>
    ${!grupos.length ? html`<div class="vacio">${f.solo ? `Todos los proyectos visibles ya tienen continuidad en ${nueva} o no hay proyectos con estos filtros.` : 'No hay proyectos con estos filtros.'}</div>`
      : grupos.map(({ d, unis }) => html`<div class="panel">
        <h3 style=${'border-left:5px solid ' + colorDir(d.sigla).fuerte + ';padding-left:.5rem'}>${d.sigla} · ${d.nombre}</h3>
        ${unis.map(({ u, ps }) => html`<h4 style="margin:.8rem 0 .3rem">${u.sigla}${u.nombre ? ' · ' + u.nombre : ''} <span class="pill">${ps.length}</span></h4>
          <div class="tabla-env"><table><thead><tr><th style="width:2rem"></th><th>Código</th><th>Proyecto</th><th>Responsable</th><th>Estado ${anterior}</th><th>Avance</th><th>Continuidad ${nueva}</th></tr></thead>
            <tbody>${ps.map(p => html`<tr>
              <td>${puede(p) && html`<input type="checkbox" style="width:auto" checked=${sel.has(p.id)} onChange=${e => marcar(p.id, e.target.checked)} aria-label=${'Dar continuidad a ' + p.codigo} />`}</td>
              <td class="nowrap"><${Codigo} p=${p} /></td><td><a href=${'#/proyecto/' + p.id}>${p.nombre}</a></td>
              <td>${p.responsable_nombre || html`<span class="ayuda">Sin responsable</span>`}</td>
              <td><${EstadoProyecto} p=${p} /></td><td style="min-width:110px"><${Barra} v=${p.avance} /></td><td>${estadoCont(p)}</td></tr>`)}</tbody></table></div>`)}
      </div>`)}`;
}
