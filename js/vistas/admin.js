import { html, useState, useEffect, sb, ROLES, fecha, fechaHora, exportarExcel, exportarPDF, mensajeError, usePestana, codigoTexto } from '../lib.js';
import { Aviso, Modal, Estado, FechaInput } from '../componentes.js';
import { Importador } from './importador.js';
import { TIPOS, CAMPOS } from './validaciones.js';
import { respaldoMensual, nombreCarpetaMes, puedeEscribirCarpeta } from '../respaldo_mensual.js';

export function Admin({ ctx }) {
  const [tab] = usePestana('pestana', 'usuarios');
  const tabs = [['usuarios', 'Usuarios y roles'], ['actividad', 'Actividad por usuario'], ['estructura', 'Direcciones y unidades'], ['bloqueo', '🔒 Bloqueo de cambios'], ['config', 'Respaldos y fecha de corte'],
    ['carga', 'Carga inicial'], ['catalogos', 'Catálogos']];
  return html`
    <div class="encabezado"><div><h1>Administración</h1><p>Solo el administrador ve esta sección. Todos los cambios quedan en la bitácora.</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => html`<button class=${tab === k ? 'activo' : ''} onClick=${() => { if (k !== tab) location.hash = '#/admin' + (k === 'usuarios' ? '' : '?pestana=' + k); }}>${t}</button>`)}</div>
    ${tab === 'usuarios' && html`<${Usuarios} ctx=${ctx} />`}
    ${tab === 'actividad' && html`<${Actividad} ctx=${ctx} />`}
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
    <div class="encabezado"><div><h3>Usuarios</h3><p>${cuentas.length} cuentas. Cuando alguien deje su cargo, pulse «Editar» y luego «Eliminar usuario» (o desactívelo si es temporal), y apruebe la cuenta de quien lo reemplaza.</p></div>
      <button class="prim" onClick=${() => setEdit({ nuevo: true, rol: 'responsable', activo: true })}>+ Nuevo usuario</button></div>
    <div class="tabla-env"><table><thead><tr><th></th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Dirección</th><th>Unidad</th><th>Puede editar</th><th>Activo</th></tr></thead>
      <tbody>${cuentas.map(u => html`<tr><td><button onClick=${() => setEdit(u)}>Editar</button></td><td>${u.nombre || '—'}${u.estado_acceso === 'rechazado' ? html` <span class="etiqueta">Rechazada</span>` : ''}<br/><span class="ayuda">${u.cargo || ''}</span></td><td>${u.correo}</td><td>${ROLES[u.rol]}</td>
        <td>${dir(u.direccion_id)}</td><td>${uni(u.unidad_id)}</td><td>${u.rol === 'director' ? (u.puede_editar ? 'Sí' : 'No') : '—'}</td>
        <td>${u.activo ? 'Sí' : html`<b style="color:#b3261e">No</b>`}</td></tr>`)}</tbody></table></div>
    ${edit && html`<${EditarUsuario} u=${edit} cat=${cat} yo=${ctx.perfil.id} onCerrar=${() => setEdit(null)} onListo=${m => { setEdit(null); setMsg({ ok: m }); cargar(); }} />`}
  </div>`;
}

function EditarUsuario({ u, cat, yo, onCerrar, onListo }) {
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
  // Baja definitiva: la persona ya no puede ingresar; su historial se conserva con su nombre
  async function eliminar() {
    const quien = u.nombre || u.correo;
    if (!confirm(`¿Eliminar definitivamente la cuenta de ${quien}?\n\nYa no podrá ingresar a la aplicación. Sus proyectos, tareas, reportes, validaciones y la bitácora se conservan con su nombre. Esta acción no se puede deshacer.`)) return;
    const motivo = prompt('Motivo (opcional), por ejemplo «Desvinculado el 20/11/2026»:', '') ?? null;
    if (motivo === null) return;
    setErr('');
    const r = await sb.functions.invoke('admin-usuarios', { body: { accion: 'eliminar', id: u.id, motivo } });
    let m = r.data?.error;
    if (r.error && !m) { try { m = (await r.error.context.json()).error; } catch { m = mensajeError(r.error); } }
    if (m) return setErr(m);
    onListo(`Cuenta de ${quien} eliminada. Su historial se conserva.`);
  }
  return html`<${Modal} titulo=${u.nuevo ? 'Nuevo usuario' : u.aprobar ? 'Aprobar solicitud' : 'Editar usuario'} onCerrar=${onCerrar} acciones=${html`
      ${!u.nuevo && !u.aprobar && u.id !== yo && html`<button class="peligro" style="margin-right:auto" onClick=${eliminar}>🗑 Eliminar usuario</button>`}
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
      ${!u.nuevo && !u.aprobar && u.id !== yo && html`<p class="ayuda ancho" style="margin:0">Para una ausencia temporal, desmarque «Usuario activo» (podrá reactivarlo). Si la persona fue desvinculada, use «Eliminar usuario»: la cuenta se borra y ya no podrá ingresar, pero su historial se conserva.</p>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------
// Actividad por usuario: qué hizo cada persona (cambios, propuestas, validaciones) y cuándo ingresó
const TABLAS_ACT = { proyectos: 'Proyecto', tareas: 'Tarea', evidencias: 'Evidencia', reportes_mensuales: 'Reporte mensual',
  perfiles: 'Usuario', unidades: 'Unidad', direcciones: 'Dirección', config: 'Configuración', personas: 'Persona' };
const ACCION_ACT = { crear: 'Creó', modificar: 'Modificó', eliminar: 'Eliminó' };
// Bolivia está en UTC-4 todo el año
const iniDia = d => d ? d + 'T00:00:00-04:00' : null;
const finDia = d => d ? d + 'T23:59:59.999-04:00' : null;

function Actividad({ ctx }) {
  const { cat } = ctx;
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [lista, setLista] = useState(null);
  const [err, setErr] = useState('');
  const [selId, setSelId] = usePestana('usuario', '');
  const cargar = () => {
    setLista(null);
    sb.rpc('actividad_usuarios', { p_desde: desde || null, p_hasta: hasta || null })
      .then(({ data, error }) => error ? setErr(mensajeError(error)) : setLista(data || []));
  };
  useEffect(() => { cargar(); }, [desde, hasta]);
  const uni = id => (cat.todasUnidades.find(u => u.id === id) || {}).sigla;
  const dir = id => (cat.todasDirecciones.find(u => u.id === id) || {}).sigla;
  const area = u => [dir(u.direccion_id), uni(u.unidad_id)].filter(Boolean).join(' · ') || '—';
  const total = u => Number(u.n_cambios) + Number(u.n_propuestas) + Number(u.n_validadas) + Number(u.n_rechazadas);
  const cols = [
    { titulo: 'Usuario', valor: u => u.nombre || u.correo, ancho: 28 }, { titulo: 'Correo', campo: 'correo', ancho: 28 },
    { titulo: 'Rol', valor: u => ROLES[u.rol] || u.rol }, { titulo: 'Área', valor: area },
    { titulo: 'Último ingreso', valor: u => u.ultimo_ingreso ? fechaHora(u.ultimo_ingreso) : 'Nunca' },
    { titulo: 'Cambios registrados', campo: 'n_cambios' }, { titulo: 'Propuestas enviadas', campo: 'n_propuestas' },
    { titulo: 'Validó', campo: 'n_validadas' }, { titulo: 'Rechazó', campo: 'n_rechazadas' },
    { titulo: 'Reprogramaciones', campo: 'n_reprogramaciones' },
    { titulo: 'Última actividad', valor: u => u.ultima_actividad ? fechaHora(u.ultima_actividad) : '—' },
  ];
  const periodo = (desde || hasta) ? `Periodo: ${desde ? fecha(desde) : 'inicio'} al ${hasta ? fecha(hasta) : 'hoy'}` : 'Todo el historial';
  const sel = selId && lista ? lista.find(x => x.id === selId) : null;
  const setSel = u => setSelId(u ? u.id : '');
  if (sel) return html`<${HistorialUsuario} u=${sel} desde=${desde} hasta=${hasta} periodo=${periodo} area=${area(sel)} onVolver=${() => setSel(null)} />`;
  return html`<div class="panel">
    <${Aviso} tipo="error">${err}<//>
    <div class="encabezado"><div><h3>Actividad por usuario</h3>
      <p>Lo que hizo cada persona en la aplicación. Los números cuentan solo el periodo elegido; el último ingreso es siempre el más reciente.</p></div>
      ${lista && html`<div class="acciones"><button onClick=${() => exportarExcel('actividad_usuarios', cols, lista, 'Actividad')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF('Actividad por usuario', periodo, cols, lista, 'actividad_usuarios')}>Exportar PDF</button></div>`}</div>
    <div class="filtros"><label>Desde<${FechaInput} valor=${desde} onCambio=${setDesde} /></label>
      <label>Hasta<${FechaInput} valor=${hasta} onCambio=${setHasta} /></label>
      ${(desde || hasta) && html`<button onClick=${() => { setDesde(''); setHasta(''); }}>Quitar fechas</button>`}</div>
    ${!lista ? html`<div class="vacio">Cargando…</div>` : html`<div class="tabla-env"><table>
      <thead><tr><th>Usuario</th><th>Rol · área</th><th>Último ingreso</th><th class="num">Cambios</th><th class="num">Propuestas</th>
        <th class="num">Validó</th><th class="num">Rechazó</th><th>Última actividad</th><th></th></tr></thead>
      <tbody>${lista.map(u => html`<tr class="clic" onClick=${() => setSel(u)}>
        <td><b>${u.nombre || '—'}</b>${!u.activo ? html` <span class="etiqueta">Inactivo</span>` : ''}${u.estado_acceso === 'pendiente' ? html` <span class="etiqueta">Pendiente</span>` : ''}<br/><span class="ayuda">${u.correo}</span></td>
        <td>${ROLES[u.rol] || u.rol}<br/><span class="ayuda">${area(u)}</span></td>
        <td class="nowrap">${u.ultimo_ingreso ? fechaHora(u.ultimo_ingreso) : html`<span class="ayuda">Nunca</span>`}</td>
        <td class="num">${u.n_cambios}</td><td class="num">${u.n_propuestas}</td><td class="num">${u.n_validadas}</td><td class="num">${u.n_rechazadas}</td>
        <td class="nowrap">${u.ultima_actividad ? fechaHora(u.ultima_actividad) : '—'}</td>
        <td><button onClick=${e => { e.stopPropagation(); setSel(u); }}>${total(u) ? 'Ver historial' : 'Ver'}</button></td></tr>`)}</tbody></table>
      ${!lista.length && html`<div class="vacio">No hay usuarios.</div>`}</div>`}
  </div>`;
}

function HistorialUsuario({ u, desde, hasta, periodo, area, onVolver }) {
  const [filas, setFilas] = useState(null);
  const [err, setErr] = useState('');
  const [tipo, setTipo] = useState('');
  const LIM = 1000;
  useEffect(() => {
    (async () => {
      let b = sb.from('bitacora').select('id,tabla,proyecto_id,accion,campo,valor_anterior,valor_nuevo,usuario_nombre,creado_en')
        .eq('usuario_id', u.id).order('creado_en', { ascending: false }).limit(LIM);
      let m = sb.from('propuestas').select('id,tipo,proyecto_id,datos,resumen,motivo,estado,creado_por,creado_por_nombre,creado_en,revisado_por,revisado_en,observacion')
        .or(`creado_por.eq.${u.id},revisado_por.eq.${u.id}`).order('creado_en', { ascending: false }).limit(LIM);
      if (desde) { b = b.gte('creado_en', iniDia(desde)); }
      if (hasta) { b = b.lte('creado_en', finDia(hasta)); }
      const [rb, rm, rp] = await Promise.all([b, m, sb.from('proyectos').select('id,codigo,codigo_estrategico,nombre')]);
      const e = rb.error || rm.error || rp.error;
      if (e) return setErr(mensajeError(e));
      const proy = Object.fromEntries(rp.data.map(p => [p.id, p]));
      const enRango = f => (!desde || f >= iniDia(desde)) && (!hasta || f <= finDia(hasta));
      const cod = id => proy[id] ? codigoTexto(proy[id]) : '';
      const nom = id => proy[id]?.nombre || '';
      const res = [];
      for (const x of rb.data) res.push({
        fecha: x.creado_en, tipo: 'Cambio registrado', proyecto_id: x.proyecto_id, codigo: cod(x.proyecto_id), proyecto: nom(x.proyecto_id),
        accion: `${ACCION_ACT[x.accion] || x.accion} ${(TABLAS_ACT[x.tabla] || x.tabla).toLowerCase()}`,
        detalle: x.campo === '(registro)' ? (x.valor_nuevo || x.valor_anterior || '').slice(0, 200)
          : `${CAMPOS[x.campo] || x.campo}: ${(x.valor_anterior ?? '—').slice(0, 120)} → ${(x.valor_nuevo ?? '—').slice(0, 120)}`,
        nota: /\(validó /.test(x.usuario_nombre || '') ? 'Aplicado al validar la propuesta de ' + x.usuario_nombre.replace(/ \(validó .*$/, '') : '' });
      for (const x of rm.data) {
        const resumen = (x.resumen || []).map(c => CAMPOS[c.campo] || c.campo).join(', ');
        const pid = x.proyecto_id, c = cod(pid) || x.datos?.codigo || '', n = nom(pid) || x.datos?.nombre || '';
        if (x.creado_por === u.id && enRango(x.creado_en)) res.push({ fecha: x.creado_en, tipo: 'Propuesta enviada', proyecto_id: pid, codigo: c, proyecto: n,
          accion: TIPOS[x.tipo] || x.tipo, detalle: resumen + (x.motivo ? ` · Motivo: ${x.motivo}` : ''),
          nota: { pendiente: 'Pendiente de validación', validada: 'Validada', rechazada: 'Rechazada' + (x.observacion ? ': ' + x.observacion : '') }[x.estado] });
        if (x.revisado_por === u.id && x.revisado_en && enRango(x.revisado_en)) res.push({ fecha: x.revisado_en,
          tipo: x.estado === 'validada' ? 'Validó' : 'Rechazó', proyecto_id: pid, codigo: c, proyecto: n,
          accion: TIPOS[x.tipo] || x.tipo, detalle: `Propuesta de ${x.creado_por_nombre || '—'}: ${resumen}`, nota: x.observacion || '' });
      }
      res.sort((a, b2) => b2.fecha.localeCompare(a.fecha));
      setFilas({ res, truncado: rb.data.length === LIM || rm.data.length === LIM });
    })();
  }, [u.id, desde, hasta]);
  const tipos = filas ? [...new Set(filas.res.map(f => f.tipo))] : [];
  const vis = filas ? filas.res.filter(f => !tipo || f.tipo === tipo) : [];
  const cols = [{ titulo: 'Fecha y hora', valor: f => fechaHora(f.fecha) }, { titulo: 'Tipo', campo: 'tipo' }, { titulo: 'Proyecto', valor: f => f.codigo },
    { titulo: 'Nombre del proyecto', campo: 'proyecto', ancho: 35 }, { titulo: 'Acción', campo: 'accion' },
    { titulo: 'Detalle', campo: 'detalle', ancho: 60 }, { titulo: 'Observación', campo: 'nota', ancho: 35 }];
  const sub = `${u.nombre || ''} (${u.correo}) · ${ROLES[u.rol] || u.rol} · ${area} · ${periodo}`;
  const archivo = 'historial_' + (u.correo || 'usuario').split('@')[0];
  return html`<div class="panel">
    <div class="encabezado"><div><h3>Historial de ${u.nombre || u.correo}</h3>
      <p>${u.correo} · ${ROLES[u.rol] || u.rol} · ${area}<br/>Último ingreso: ${u.ultimo_ingreso ? fechaHora(u.ultimo_ingreso) : 'nunca'} · ${periodo}</p></div>
      ${filas && filas.res.length > 0 && html`<div class="acciones"><button onClick=${() => exportarExcel(archivo, cols, vis, 'Historial')}>Exportar Excel</button>
        <button onClick=${() => exportarPDF('Historial de actividad', sub, cols, vis, archivo)}>Exportar PDF</button></div>`}</div>
    <${Aviso} tipo="error">${err}<//>
    ${!filas && !err ? html`<div class="vacio">Cargando historial…</div>` : filas && html`
      ${filas.truncado && html`<${Aviso} tipo="atencion">Se muestran los ${LIM} movimientos más recientes. Use las fechas para ver periodos anteriores.<//>`}
      ${tipos.length > 1 && html`<div class="filtros"><label>Tipo<select value=${tipo} onChange=${e => setTipo(e.target.value)}>
        <option value="">Todos (${filas.res.length})</option>${tipos.map(t => html`<option value=${t}>${t} (${filas.res.filter(f => f.tipo === t).length})</option>`)}</select></label></div>`}
      <div class="tabla-env"><table><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Proyecto</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>${vis.map(f => html`<tr class=${f.proyecto_id ? 'clic' : ''} onClick=${() => f.proyecto_id && (location.hash = '#/proyecto/' + f.proyecto_id)}>
          <td class="nowrap">${fechaHora(f.fecha)}</td><td class="nowrap"><span class="pill">${f.tipo}</span></td>
          <td>${f.codigo ? html`<b>${f.codigo}</b><br/><span class="ayuda">${f.proyecto}</span>` : '—'}</td>
          <td>${f.accion}</td><td class="prewrap">${f.detalle}${f.nota ? html`<br/><span class="ayuda">${f.nota}</span>` : ''}</td></tr>`)}</tbody></table>
        ${!vis.length && html`<div class="vacio">Esta persona no registró actividad${desde || hasta ? ' en el periodo elegido' : ''}.</div>`}</div>`}
  </div>`;
}

// ---------------------------------------------------------------------
function Estructura({ ctx }) {
  const { cat, recargar } = ctx;
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState({});
  async function guardar(tabla, d) {
    const fila = tabla === 'direcciones'
      ? { sigla: d.sigla, nombre: d.nombre, titular: d.titular || null, activa: d.activa !== false, orden: Number(d.orden || 0), es_despacho_secretaria: !!d.es_despacho_secretaria }
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
    <p class="ayuda">Si una unidad no cuenta con jefe, los cambios que proponga los valida el director de su dirección. El «Personal de la Dirección» de cada dirección (y el «Personal del Despacho» de la Secretaría) es una unidad sin jefe: su avance lo valida el director de esa dirección. El personal del Despacho de la Secretaría lo revisa y valida el Encargado de Planificación (administrador), que además puede validar todo.</p>
    ${D.map(d => html`<div class="panel" style="background:#fbfcfc">
      <div class="encabezado"><div><h3>${d.sigla} · ${d.nombre} ${d.es_despacho_secretaria ? html`<span class="pill">Despacho de la Secretaría</span>` : ''} ${!d.activa ? html`<span class="etiqueta">Inactiva</span>` : ''}</h3><p>Titular: ${d.titular || '—'}</p></div>
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
        : html`<label>Titular<input value=${d.titular || ''} onInput=${set('titular')} /></label>
          <label class="ancho" style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" style="width:auto" checked=${!!d.es_despacho_secretaria} onChange=${set('es_despacho_secretaria')} />
            Es el Despacho de la Secretaría (su personal lo valida el Encargado de Planificación)</label>`}
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
// Respaldo mensual a la computadora (carpeta «Mes DD-MM-AAAA» en el Escritorio)
function RespaldoMensual({ ctx }) {
  const ultimo = ctx.cat.config.respaldo_mensual;
  const drive = ctx.cat.config.respaldo_drive;
  const [estado, setEstado] = useState(null);   // { texto, hechos, total } | { fin } | { err }
  async function correr() {
    setEstado({ texto: 'Iniciando…' });
    try {
      const r = await respaldoMensual(ctx, (texto, hechos, total) => setEstado({ texto, hechos, total }));
      setEstado({ fin: r }); ctx.recargar();
    } catch (e) {
      setEstado(e && e.name === 'AbortError' ? null : { err: mensajeError(e) });
    }
  }
  const enCurso = estado && estado.texto;
  return html`<div class="panel" style="background:#f3f8fa;border-color:#c9dde6">
    <h3 style="margin-top:0">☁️ Respaldo automático en Google Drive</h3>
    <p class="ayuda">Cada último día del mes (21:37, hora de La Paz) una tarea programada copia todo a la carpeta <b>SMCI</b> de Google Drive del administrador, en una carpeta «Mes DD-MM-AAAA» con la hoja «Resumen de proyectos SMCI» y un documento por código de proyecto, separados en «dentro» y «fuera» del plan de gobierno.</p>
    <p>Último respaldo en Drive: <b>${drive?.fecha ? fechaHora(drive.fecha) + ' · carpeta «' + drive.carpeta + '»' : 'todavía ninguno'}</b>
      ${drive?.url && html` · <a href=${drive.url} target="_blank" rel="noopener">Abrir en Drive</a>`}</p>
    <hr style="border:0;border-top:1px solid var(--borde);margin:1rem 0" />
    <h3 style="margin-top:0">💾 Respaldo a la computadora (manual)</h3>
    <p class="ayuda">Descarga todo en una carpeta <b>«${nombreCarpetaMes()}»</b>: el Excel con toda la información, el respaldo de la base
      y, por cada proyecto, <b>Dirección / Unidad / Código – Proyecto</b> con sus datos y sus evidencias.
      ${puedeEscribirCarpeta() ? 'Al pulsar el botón, elija el Escritorio: la carpeta se crea ahí.' : 'Este navegador descarga un archivo ZIP; para guardar directamente en el Escritorio use Chrome o Edge en la computadora.'}</p>
    <p>Último respaldo mensual: <b>${ultimo?.fecha ? fechaHora(ultimo.fecha) + ' · carpeta «' + ultimo.carpeta + '»' : 'nunca'}</b></p>
    <button class="prim" disabled=${!!enCurso} onClick=${correr}>${enCurso ? 'Descargando…' : '⬇ Descargar respaldo del mes'}</button>
    ${enCurso && html`<p class="ayuda" style="margin-top:.5rem">${estado.texto}${estado.total ? ` (${Math.round(100 * estado.hechos / estado.total)} %)` : ''}. No cierre esta pestaña.</p>`}
    ${estado?.fin && html`<${Aviso} tipo="ok">Respaldo listo${estado.fin.zip ? ' (archivo ZIP en Descargas)' : ''}: carpeta «${estado.fin.carpeta}» con ${estado.fin.proyectos} proyectos y ${estado.fin.archivos} archivos de evidencia${estado.fin.enlaces ? ` (más ${estado.fin.enlaces} evidencias que son enlaces, anotados en cada proyecto)` : ''}.${estado.fin.fallidos.length ? ` ${estado.fin.fallidos.length} archivos no se pudieron descargar; están listados en la carpeta.` : ''}<//>`}
    ${estado?.err && html`<${Aviso} tipo="error">${estado.err}<//>`}
  </div>`;
}

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
    <${RespaldoMensual} ctx=${ctx} />
    <h3 style="margin-top:1.25rem">Fecha de corte mensual</h3>
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
