import { html, useState, useEffect, sb, ROLES, fecha, fechaHora, exportarExcel, mensajeError } from '../lib.js';
import { Aviso, Modal, Estado, FechaInput } from '../componentes.js';
import { Importador } from './importador.js';

export function Admin({ ctx }) {
  const [tab, setTab] = useState('usuarios');
  const tabs = [['usuarios', 'Usuarios y roles'], ['estructura', 'Direcciones y unidades'], ['bloqueo', '🔒 Bloqueo de cambios'], ['config', 'Fecha de corte y respaldos'],
    ['carga', 'Carga inicial'], ['catalogos', 'Catálogos']];
  return html`
    <div class="encabezado"><div><h1>Administración</h1><p>Solo el administrador ve esta sección. Todos los cambios quedan en la bitácora.</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => html`<button class=${tab === k ? 'activo' : ''} onClick=${() => setTab(k)}>${t}</button>`)}</div>
    ${tab === 'usuarios' && html`<${Usuarios} ctx=${ctx} />`}
    ${tab === 'estructura' && html`<${Estructura} ctx=${ctx} />`}
    ${tab === 'bloqueo' && html`<${Bloqueo} ctx=${ctx} />`}
    ${tab === 'config' && html`<${Configuracion} ctx=${ctx} />`}
    ${tab === 'carga' && html`<${Importador} ctx=${ctx} /><${Conversiones} />`}
    ${tab === 'catalogos' && html`<${Catalogos} />`}`;
}

// ---------------------------------------------------------------------
function Usuarios({ ctx }) {
  const { cat } = ctx;
  const [lista, setLista] = useState(null);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState({});
  const cargar = () => sb.from('perfiles').select('*').order('nombre').then(({ data }) => setLista(data || []));
  useEffect(() => { cargar(); }, []);
  if (!lista) return html`<div class="vacio">Cargando…</div>`;
  const uni = id => (cat.todasUnidades.find(u => u.id === id) || {}).sigla || '—';
  const dir = id => (cat.todasDirecciones.find(u => u.id === id) || {}).sigla || '—';
  const pendientes = lista.filter(u => u.estado_acceso === 'pendiente');
  const cuentas = lista.filter(u => u.estado_acceso !== 'pendiente');
  function aprobar(u) {
    const sigla = dir(u.solicitud_direccion_id);
    setEdit({ ...u, aprobar: true, activo: true,
      rol: u.solicitud_unidad_id ? 'responsable' : 'director',
      unidad_id: u.solicitud_unidad_id, direccion_id: u.solicitud_direccion_id,
      cargo: u.cargo || u.solicitud_cargo, puede_editar: sigla === 'DEDH' });
  }
  async function rechazar(u) {
    if (!confirm(`¿Rechazar la solicitud de ${u.nombre || u.correo}? No podrá ingresar.`)) return;
    const { error } = await sb.from('perfiles').update({ estado_acceso: 'rechazado', activo: false }).eq('id', u.id).select('id').single();
    error ? setMsg({ err: mensajeError(error) }) : (setMsg({ ok: 'Solicitud rechazada.' }), cargar());
  }
  return html`<div class="panel">
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    ${pendientes.length > 0 && html`<div class="panel" style="background:#fff8e6;border-color:#f0dc9c">
      <h3>Solicitudes pendientes (${pendientes.length})</h3>
      <p class="ayuda">Personas que crearon su cuenta. Revise que la dirección y la unidad correspondan antes de aprobar.</p>
      <div class="tabla-env"><table><thead><tr><th></th><th>Nombre</th><th>Correo</th><th>Pidió</th><th>Fecha</th></tr></thead>
        <tbody>${pendientes.map(u => html`<tr><td class="nowrap"><div class="acciones" style="flex-direction:column"><button class="prim" onClick=${() => aprobar(u)}>Aprobar</button>
            <button class="peligro" onClick=${() => rechazar(u)}>Rechazar</button></div></td><td>${u.nombre || '—'}<br/><span class="ayuda">${u.solicitud_cargo || ''}</span></td><td>${u.correo}</td>
          <td>${dir(u.solicitud_direccion_id)}${u.solicitud_unidad_id ? ' · ' + uni(u.solicitud_unidad_id) : ' (dirección)'}</td>
          <td class="nowrap">${fechaHora(u.solicitud_en)}</td></tr>`)}</tbody></table></div></div>`}
    <div class="encabezado"><div><h3>Usuarios</h3><p>${cuentas.length} cuentas. Cuando alguien deje su cargo, desactive su cuenta y apruebe la de la persona que lo reemplaza.</p></div>
      <button class="prim" onClick=${() => setEdit({ nuevo: true, rol: 'responsable', activo: true })}>+ Nuevo usuario</button></div>
    <div class="tabla-env"><table><thead><tr><th></th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Dirección</th><th>Unidad</th><th>Puede editar</th><th>Activo</th></tr></thead>
      <tbody>${cuentas.map(u => html`<tr><td><button onClick=${() => setEdit(u)}>Editar</button></td><td>${u.nombre || '—'}${u.estado_acceso === 'rechazado' ? html` <span class="etiqueta">Rechazada</span>` : ''}<br/><span class="ayuda">${u.cargo || ''}</span></td><td>${u.correo}</td><td>${ROLES[u.rol]}</td>
        <td>${dir(u.direccion_id)}</td><td>${uni(u.unidad_id)}</td><td>${u.rol === 'director' ? (u.puede_editar ? 'Sí' : 'No') : '—'}</td>
        <td>${u.activo ? 'Sí' : html`<b style="color:#b3261e">No</b>`}</td></tr>`)}</tbody></table></div>
    ${edit && html`<${EditarUsuario} u=${edit} cat=${cat} onCerrar=${() => setEdit(null)} onListo=${m => { setEdit(null); setMsg({ ok: m }); cargar(); }} />`}
  </div>`;
}

function EditarUsuario({ u, cat, onCerrar, onListo }) {
  const [d, setD] = useState({ ...u });
  const [clave, setClave] = useState('');
  const [err, setErr] = useState('');
  const set = k => e => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const unidades = cat.unidades.filter(x => !d.direccion_id || x.direccion_id === d.direccion_id);
  async function guardar() {
    setErr('');
    const necesitaUnidad = d.rol === 'jefe' || d.rol === 'responsable';
    if (necesitaUnidad && !d.unidad_id) return setErr('Jefes y responsables deben tener una unidad.');
    if (d.rol === 'director' && !d.direccion_id) return setErr('El director debe tener una dirección.');
    const unidad = cat.unidades.find(x => x.id === d.unidad_id);
    const datos = {
      nombre: d.nombre || '', cargo: d.cargo || null, rol: d.rol,
      unidad_id: necesitaUnidad ? d.unidad_id : null,
      direccion_id: necesitaUnidad ? unidad?.direccion_id : (d.rol === 'director' ? d.direccion_id : (d.direccion_id || null)),
      puede_editar: d.rol === 'director' ? !!d.puede_editar : false, activo: !!d.activo,
    };
    if (u.aprobar) datos.estado_acceso = 'aprobado';
    if (d.rol === 'consulta' && u.aprobar) return setErr('Elija el rol de la persona antes de aprobar.');
    if (u.nuevo) {
      if (!d.correo || clave.length < 10) return setErr('Correo y contraseña inicial (mínimo 10 caracteres) son obligatorios.');
      const { data, error } = await sb.functions.invoke('admin-usuarios', { body: { accion: 'crear', correo: d.correo.trim(), clave, ...datos } });
      if (error || data?.error) return setErr(data?.error || mensajeError(error));
      return onListo('Usuario creado. Comunique la contraseña inicial por un canal seguro.');
    }
    const { error } = await sb.from('perfiles').update(datos).eq('id', u.id).select('id').single();
    if (error) return setErr(mensajeError(error));
    if (clave) {
      if (clave.length < 10) return setErr('La contraseña debe tener al menos 10 caracteres.');
      const r = await sb.functions.invoke('admin-usuarios', { body: { accion: 'cambiar_clave', id: u.id, clave } });
      if (r.error || r.data?.error) return setErr(r.data?.error || mensajeError(r.error));
    }
    onListo('Usuario actualizado.');
  }
  return html`<${Modal} titulo=${u.nuevo ? 'Nuevo usuario' : u.aprobar ? 'Aprobar solicitud' : 'Editar usuario'} onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button><button class="prim" onClick=${guardar}>Guardar</button>`}>
    <${Aviso} tipo="error">${err}<//>
    <div class="form">
      <label>Nombre<input value=${d.nombre || ''} onInput=${set('nombre')} /></label>
      <label>Cargo<input value=${d.cargo || ''} onInput=${set('cargo')} /></label>
      <label>Correo<input type="email" value=${d.correo || ''} disabled=${!u.nuevo} onInput=${set('correo')} /></label>
      <label>${u.nuevo ? 'Contraseña inicial' : 'Nueva contraseña (opcional)'}<input type="text" value=${clave} onInput=${e => setClave(e.target.value)} autocomplete="new-password" />
        <span class="ayuda">Mínimo 10 caracteres.</span></label>
      <label>Rol<select value=${d.rol} onChange=${set('rol')}>${Object.entries(ROLES).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></label>
      <label>Dirección<select value=${d.direccion_id || ''} onChange=${e => setD({ ...d, direccion_id: e.target.value || null, unidad_id: null })}>
        <option value="">—</option>${cat.direcciones.map(x => html`<option value=${x.id}>${x.sigla}</option>`)}</select></label>
      ${(d.rol === 'jefe' || d.rol === 'responsable') && html`<label>Unidad<select value=${d.unidad_id || ''} onChange=${set('unidad_id')}>
        <option value="">Elegir…</option>${unidades.map(x => html`<option value=${x.id}>${x.sigla} · ${x.nombre}</option>`)}</select></label>`}
      ${d.rol === 'director' && html`<label style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${!!d.puede_editar} onChange=${set('puede_editar')} /> Puede editar proyectos de su dirección</label>`}
      <label style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${!!d.activo} onChange=${set('activo')} /> Usuario activo</label>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------
function Estructura({ ctx }) {
  const { cat, recargar } = ctx;
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState({});
  async function guardar(tabla, d) {
    const fila = tabla === 'direcciones'
      ? { sigla: d.sigla, nombre: d.nombre, titular: d.titular || null, activa: d.activa !== false, orden: Number(d.orden || 0) }
      : { sigla: d.sigla, nombre: d.nombre, tiene_jefe: d.tiene_jefe !== false, jefe: d.tiene_jefe === false ? null : (d.jefe || null), direccion_id: d.direccion_id, nombre_anterior: d.nombre_anterior || null, descripcion: d.descripcion || null, activa: d.activa !== false, orden: Number(d.orden || 0) };
    if (!fila.sigla || !fila.nombre || (tabla === 'unidades' && !fila.direccion_id)) return setMsg({ err: 'Sigla, nombre (y dirección para unidades) son obligatorios.' });
    if (tabla === 'unidades' && d.tiene_jefe !== true && d.tiene_jefe !== false) return setMsg({ err: 'Responda si la unidad cuenta con jefe de unidad.' });
    const q = d.id ? sb.from(tabla).update(fila).eq('id', d.id) : sb.from(tabla).insert(fila);
    const { error } = await q.select('id').single();
    if (error) return setMsg({ err: mensajeError(error) });
    setEdit(null); setMsg({ ok: 'Guardado.' }); recargar();
  }
  const D = cat.todasDirecciones, U = cat.todasUnidades;
  return html`<div class="panel">
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <p class="ayuda">Desactivar una dirección o unidad la oculta de los selectores sin borrar sus proyectos ni su historial.</p>
    <div class="acciones" style="margin-bottom:1rem"><button onClick=${() => setEdit({ tabla: 'direcciones', d: { activa: true } })}>+ Nueva dirección</button>
      <button onClick=${() => setEdit({ tabla: 'unidades', d: { activa: true, tiene_jefe: null } })}>+ Nueva unidad</button></div>
    <p class="ayuda">Si una unidad no cuenta con jefe, los cambios que proponga los valida el director de su dirección.</p>
    ${D.map(d => html`<div class="panel" style="background:#fbfcfc">
      <div class="encabezado"><div><h3>${d.sigla} · ${d.nombre} ${!d.activa ? html`<span class="etiqueta">Inactiva</span>` : ''}</h3><p>Titular: ${d.titular || '—'}</p></div>
        <button onClick=${() => setEdit({ tabla: 'direcciones', d })}>Editar</button></div>
      <div class="tabla-env"><table><thead><tr><th>Sigla</th><th>Unidad</th><th>Jefe/a</th><th>Antes</th><th>Activa</th><th></th></tr></thead>
        <tbody>${U.filter(u => u.direccion_id === d.id).map(u => html`<tr><td><b>${u.sigla}</b></td><td>${u.nombre}<br/><span class="ayuda">${u.descripcion || ''}</span></td>
          <td>${u.tiene_jefe === false ? html`<span class="etiqueta">Sin jefe</span><br/><span class="ayuda">Valida el director</span>` : (u.jefe || '—')}</td><td>${u.nombre_anterior || '—'}</td><td>${u.activa ? 'Sí' : 'No'}</td>
          <td><button onClick=${() => setEdit({ tabla: 'unidades', d: u })}>Editar</button></td></tr>`)}</tbody></table></div></div>`)}
    ${edit && html`<${EditarEstructura} e=${edit} D=${D} onCerrar=${() => setEdit(null)} onGuardar=${d => guardar(edit.tabla, d)} />`}
  </div>`;
}

function EditarEstructura({ e, D, onCerrar, onGuardar }) {
  const [d, setD] = useState({ ...e.d });
  const set = k => ev => setD({ ...d, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });
  const esU = e.tabla === 'unidades';
  return html`<${Modal} titulo=${(d.id ? 'Editar ' : 'Nueva ') + (esU ? 'unidad' : 'dirección')} onCerrar=${onCerrar} acciones=${html`
      <button onClick=${onCerrar}>Cancelar</button><button class="prim" onClick=${() => onGuardar(d)}>Guardar</button>`}>
    <div class="form">
      <label>Sigla<input value=${d.sigla || ''} onInput=${set('sigla')} /></label>
      <label class="ancho">Nombre<input value=${d.nombre || ''} onInput=${set('nombre')} /></label>
      ${esU ? html`<label>Dirección<select value=${d.direccion_id || ''} onChange=${set('direccion_id')}><option value="">Elegir…</option>${D.map(x => html`<option value=${x.id}>${x.sigla}</option>`)}</select></label>
          <fieldset class="ancho" style="border:1px solid var(--borde);border-radius:7px;padding:.5rem .75rem">
            <legend style="font-weight:600;font-size:.85rem">¿Cuenta con jefe de unidad?</legend>
            <label style="flex-direction:row;align-items:center;gap:.4rem;display:inline-flex;margin-right:1.25rem"><input type="radio" name="tiene_jefe" style="width:auto" checked=${d.tiene_jefe === true} onChange=${() => setD({ ...d, tiene_jefe: true })} /> Sí</label>
            <label style="flex-direction:row;align-items:center;gap:.4rem;display:inline-flex"><input type="radio" name="tiene_jefe" style="width:auto" checked=${d.tiene_jefe === false} onChange=${() => setD({ ...d, tiene_jefe: false })} /> No</label>
            <p class="ayuda" style="margin:.4rem 0 0">${d.tiene_jefe === false ? 'Los cambios de esta unidad los validará el director de su dirección.' : d.tiene_jefe === true ? 'Los cambios de esta unidad los validará su jefe de unidad.' : 'Elija una opción.'}</p>
          </fieldset>
          ${d.tiene_jefe === true && html`<label>Jefe/a<input value=${d.jefe || ''} onInput=${set('jefe')} /></label>`}
          <label>Nombre o sigla anterior<input value=${d.nombre_anterior || ''} onInput=${set('nombre_anterior')} /></label>
          <label class="ancho">Descripción / funciones<input value=${d.descripcion || ''} onInput=${set('descripcion')} /></label>`
        : html`<label>Titular<input value=${d.titular || ''} onInput=${set('titular')} /></label>`}
      <label>Orden<input type="number" value=${d.orden || 0} onInput=${set('orden')} /></label>
      <label style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${d.activa !== false} onChange=${set('activa')} /> Activa</label>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------
// Bloqueo general: mientras está activo, nadie salvo el administrador propone, valida ni sube evidencias
function Bloqueo({ ctx }) {
  const { cat, recargar } = ctx;
  const actual = cat.config.bloqueo_cambios || { activo: false };
  const [motivo, setMotivo] = useState(actual.motivo || '');
  const [msg, setMsg] = useState({});
  async function cambiar(activo) {
    if (!confirm(activo ? '¿Bloquear los cambios para todos los usuarios? Solo usted podrá modificar datos.' : '¿Permitir de nuevo que las unidades envíen y validen cambios?')) return;
    const valor = { activo, motivo: activo ? (motivo.trim() || null) : null, desde: activo ? new Date().toISOString() : null };
    const { error } = await sb.from('config').upsert({ clave: 'bloqueo_cambios', valor }).select('clave').single();
    if (error) return setMsg({ err: mensajeError(error) });
    setMsg({ ok: activo ? 'Cambios bloqueados para todos los usuarios.' : 'Cambios permitidos de nuevo.' }); recargar();
  }
  return html`<div class="panel">
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <h3>Bloqueo de cambios</h3>
    <p class="ayuda">Mientras el bloqueo esté activo, nadie excepto el administrador puede proponer cambios, validarlos o rechazarlos, ni subir evidencias. Todos pueden seguir consultando la información. Úselo, por ejemplo, durante un cierre de gestión o una revisión.</p>
    <p>Estado actual: ${actual.activo
      ? html`<b style="color:#b3261e">🔒 Bloqueado</b>${actual.desde ? ' desde el ' + fechaHora(actual.desde) : ''}${actual.motivo ? ' · ' + actual.motivo : ''}`
      : html`<b style="color:#1e7d32">🔓 Cambios permitidos</b>`}</p>
    ${actual.activo
      ? html`<button class="prim" onClick=${() => cambiar(false)}>🔓 Permitir cambios</button>`
      : html`<div class="form"><label class="ancho">Motivo (opcional, lo verán los usuarios)<input value=${motivo} onInput=${e => setMotivo(e.target.value)} placeholder="p. ej. Cierre de gestión 2026" /></label></div>
        <button class="peligro" style="margin-top:.75rem" onClick=${() => cambiar(true)}>🔒 Bloquear cambios de todos</button>`}
  </div>`;
}

// ---------------------------------------------------------------------
function Configuracion({ ctx }) {
  const { cat, recargar } = ctx;
  const [corte, setCorte] = useState(cat.config.dia_corte ?? 25);
  const [simular, setSimular] = useState('');
  const [msg, setMsg] = useState({});
  const [resp, setResp] = useState([]);
  const cargarResp = () => sb.from('respaldos').select('id,creado_en,tabla,filas').order('creado_en', { ascending: false }).limit(200).then(({ data }) => setResp(data || []));
  useEffect(() => { cargarResp(); }, []);
  async function guardarCorte() {
    const n = Number(corte);
    if (!(n >= 1 && n <= 31)) return setMsg({ err: 'El día de corte debe estar entre 1 y 31.' });
    const { error } = await sb.from('config').update({ valor: n }).eq('clave', 'dia_corte').select('clave').single();
    if (error) return setMsg({ err: mensajeError(error) });
    setMsg({ ok: `Fecha de corte: día ${n} de cada mes.` }); recargar();
  }
  async function cierre() {
    const f = simular || null;
    if (!confirm(`Se marcarán «No reportada» los proyectos sin actualización en el mes${f ? ' de la fecha ' + fecha(f) : ' en curso'}, si ya pasó el día de corte. ¿Continuar?`)) return;
    const { data, error } = await sb.rpc('ejecutar_cierre_mes', { p_fecha: f });
    error ? setMsg({ err: mensajeError(error) }) : setMsg({ ok: `${data} proyecto(s) pasaron a «No reportada».` });
  }
  async function respaldar() {
    const { error } = await sb.rpc('respaldo_ahora');
    error ? setMsg({ err: mensajeError(error) }) : (setMsg({ ok: 'Respaldo creado.' }), cargarResp());
  }
  async function descargar(fechaR) {
    const ini = resp.filter(r => r.creado_en.slice(0, 16) === fechaR).map(r => r.id);
    const { data, error } = await sb.from('respaldos').select('tabla,filas,datos,creado_en').in('id', ini);
    if (error) return setMsg({ err: mensajeError(error) });
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo_smci_${fechaR.replace(/[:T]/g, '-')}.json`; a.click();
  }
  const grupos = [...new Set(resp.map(r => r.creado_en.slice(0, 16)))];
  return html`<div class="panel">
    <${Aviso} tipo="ok">${msg.ok}<//><${Aviso} tipo="error">${msg.err}<//>
    <h3>Fecha de corte mensual</h3>
    <p class="ayuda">Si una unidad no actualiza un proyecto en el mes hasta este día, el sistema lo marca «No reportada» (revisión diaria automática a las 00:05, hora de La Paz).</p>
    <div class="filtros"><label>Día de corte<input type="number" min="1" max="31" value=${corte} onInput=${e => setCorte(e.target.value)} /></label>
      <button class="prim" onClick=${guardarCorte}>Guardar</button></div>
    <h3 style="margin-top:1.25rem">Cierre de mes manual</h3>
    <p class="ayuda">Ejecuta ahora la regla «No reportada». Para probar, indique una fecha posterior al corte (simulación con esa fecha).</p>
    <div class="filtros"><label>Fecha (opcional)<${FechaInput} valor=${simular} onCambio=${setSimular} /></label>
      <button onClick=${cierre}>Ejecutar cierre</button></div>
    <h3 style="margin-top:1.25rem">Respaldos</h3>
    <p class="ayuda">La base guarda un respaldo lógico diario (00:30, hora de La Paz) y conserva 35 días. Descargue uno para guardarlo fuera del sistema. El respaldo completo de la base se describe en INSTALACION.md.</p>
    <div class="acciones" style="margin-bottom:.75rem"><button onClick=${respaldar}>Crear respaldo ahora</button></div>
    <div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Tablas</th><th>Filas</th><th></th></tr></thead>
      <tbody>${grupos.map(g => { const rs = resp.filter(r => r.creado_en.slice(0, 16) === g);
        return html`<tr><td>${fechaHora(rs[0].creado_en)}</td><td>${rs.length}</td><td>${rs.reduce((a, r) => a + r.filas, 0)}</td>
          <td><button onClick=${() => descargar(g)}>Descargar JSON</button></td></tr>`; })}</tbody></table>
      ${!grupos.length && html`<div class="vacio">Aún no hay respaldos.</div>`}</div>
  </div>`;
}

// ---------------------------------------------------------------------
function Conversiones() {
  const [filas, setFilas] = useState(null);
  const [solo, setSolo] = useState(true);
  const cargar = () => sb.from('conversiones_carga').select('*').order('id').then(({ data }) => setFilas(data || []));
  useEffect(() => { cargar(); }, []);
  if (!filas) return null;
  async function marcar(c, v) {
    const { data: u } = await sb.auth.getUser();
    await sb.from('conversiones_carga').update({ revisado: v, revisado_por: v ? u.user.id : null, revisado_en: v ? new Date().toISOString() : null }).eq('id', c.id);
    cargar();
  }
  const vis = filas.filter(c => !solo || !c.revisado);
  const cols = [{ titulo: 'Proyecto', campo: 'codigo_proyecto' }, { titulo: 'Campo', campo: 'campo' }, { titulo: 'Valor original', campo: 'valor_original', ancho: 40 },
    { titulo: 'Valor nuevo', campo: 'valor_nuevo', ancho: 40 }, { titulo: 'Regla', campo: 'regla', ancho: 50 }, { titulo: 'Fuente', campo: 'fuente', ancho: 30 },
    { titulo: 'Revisado', valor: c => c.revisado ? 'Sí' : 'No' }];
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Conversiones de la carga inicial (para revisión)</h3>
      <p>${filas.length} registros · ${filas.filter(c => !c.revisado).length} sin revisar</p></div>
      <div class="acciones"><label class="lectura"><input type="checkbox" style="width:auto" checked=${solo} onChange=${e => setSolo(e.target.checked)} /> Solo sin revisar</label>
        <button onClick=${() => exportarExcel('conversiones_carga', cols, filas, 'Conversiones')}>Exportar Excel</button></div></div>
    <div class="tabla-env"><table><thead><tr><th>Proyecto</th><th>Campo</th><th>Valor original</th><th>Valor nuevo</th><th>Regla</th><th>Revisado</th></tr></thead>
      <tbody>${vis.map(c => html`<tr><td class="nowrap">${c.codigo_proyecto || 'General'}</td><td>${c.campo}</td>
        <td class="prewrap">${c.valor_original || '—'}</td><td class="prewrap"><b>${c.valor_nuevo || '—'}</b></td>
        <td>${c.regla}<br/><span class="ayuda">${c.fuente || ''}</span></td>
        <td><input type="checkbox" style="width:auto" checked=${c.revisado} onChange=${e => marcar(c, e.target.checked)} aria-label="Revisado" /></td></tr>`)}</tbody></table>
      ${!vis.length && html`<div class="vacio">Nada pendiente de revisión.</div>`}</div></div>`;
}

// ---------------------------------------------------------------------
function Catalogos() {
  const [g, setG] = useState([]);
  const [c, setC] = useState([]);
  useEffect(() => {
    sb.from('proyectos_gobierno').select('*').order('codigo').then(({ data }) => setG(data || []));
    sb.from('compromisos').select('*').order('origen').order('numero').then(({ data }) => setC(data || []));
  }, []);
  const colG = [{ titulo: 'Código', campo: 'codigo' }, { titulo: 'Proyecto de gobierno', campo: 'nombre', ancho: 40 }, { titulo: 'Dirección', campo: 'direccion' },
    { titulo: 'Responsable', campo: 'responsable' }, { titulo: 'Estado', campo: 'estado_origen' }, { titulo: 'Situación', campo: 'situacion', ancho: 50 },
    { titulo: 'Pendiente', campo: 'pendiente', ancho: 40 }, { titulo: 'Proyectos SMCI', campo: 'proyectos_vinculados' }];
  const colC = [{ titulo: 'Origen', campo: 'origen' }, { titulo: 'N.º', campo: 'numero' }, { titulo: 'Actividad', campo: 'actividad', ancho: 40 },
    { titulo: 'Dirección', campo: 'direccion' }, { titulo: 'Responsable', campo: 'responsable' }, { titulo: 'Plazo', campo: 'plazo' },
    { titulo: 'Estado origen', campo: 'estado_origen' }, { titulo: 'Estado', campo: 'estado' }, { titulo: 'Situación', campo: 'situacion', ancho: 50 }];
  const T = ({ cols, filas }) => html`<div class="tabla-env"><table><thead><tr>${cols.map(x => html`<th>${x.titulo}</th>`)}</tr></thead>
    <tbody>${filas.map(f => html`<tr>${cols.map(x => html`<td>${x.campo === 'estado' && f.estado ? html`<${Estado} e=${f.estado} />` : f[x.campo] || '—'}</td>`)}</tr>`)}</tbody></table></div>`;
  return html`
    <div class="panel"><div class="encabezado"><h3>Proyectos de gobierno (${g.length})</h3><button onClick=${() => exportarExcel('proyectos_gobierno', colG, g)}>Exportar Excel</button></div><${T} cols=${colG} filas=${g} /></div>
    <div class="panel"><div class="encabezado"><h3>Plan 30-60-100 y Tareas del Alcalde (${c.length})</h3><button onClick=${() => exportarExcel('compromisos', colC, c)}>Exportar Excel</button></div><${T} cols=${colC} filas=${c} /></div>`;
}
