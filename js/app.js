import { html, render, useState, useEffect, sb, ROLES, mensajeError, atras } from './lib.js';
import { CONFIG } from './config.js';
import { Aviso, Modal, ClaveInput } from './componentes.js';

// Cada usuario cambia su propia contraseña (Supabase Auth, sin pasar por el administrador)
function CambiarClave() {
  const [abierto, setAbierto] = useState(false);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [msg, setMsg] = useState({});
  async function guardar() {
    if (a.length < 10) return setMsg({ err: 'La contraseña debe tener al menos 10 caracteres.' });
    if (a !== b) return setMsg({ err: 'Las dos contraseñas no coinciden.' });
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return setMsg({ err: mensajeError(error) });
    setMsg({ ok: 'Contraseña cambiada. Úsela la próxima vez que ingrese.' }); setA(''); setB('');
  }
  return html`<button type="button" onClick=${() => { setMsg({}); setAbierto(true); }}>🔑 Cambiar mi contraseña</button>
    ${abierto && html`<${Modal} titulo="Cambiar mi contraseña" onCerrar=${() => setAbierto(false)} acciones=${html`
        <button onClick=${() => setAbierto(false)}>Cerrar</button><button class="prim" onClick=${guardar}>Guardar</button>`}>
      <${Aviso} tipo="error">${msg.err}<//><${Aviso} tipo="ok">${msg.ok}<//>
      <div class="form">
        <label>Nueva contraseña<${ClaveInput} autocomplete="new-password" value=${a} onInput=${e => setA(e.target.value)} /></label>
        <label>Repita la contraseña<${ClaveInput} autocomplete="new-password" value=${b} onInput=${e => setB(e.target.value)} /></label>
      </div>
      <p class="ayuda">Mínimo 10 caracteres. Use una que no use en otros sistemas.</p>
    <//>`}`;
}
import { Tablero } from './vistas/tablero.js';
import { ListaProyectos } from './vistas/proyectos.js';
import { Ficha } from './vistas/ficha.js';
import { MiUnidad } from './vistas/miunidad.js';
import { Admin } from './vistas/admin.js';
import { Validaciones } from './vistas/validaciones.js';

// Botón para instalar la aplicación en PC o Android (solo cuando el navegador lo permite)
function BotonInstalar({ claro }) {
  const [listo, setListo] = useState(!!window.__instalar);
  useEffect(() => {
    const f = () => setListo(!!window.__instalar);
    addEventListener('instalable', f); return () => removeEventListener('instalable', f);
  }, []);
  if (!listo || matchMedia('(display-mode: standalone)').matches) return null;
  async function instalar() {
    const e = window.__instalar; if (!e) return;
    e.prompt(); await e.userChoice; window.__instalar = null; setListo(false);
  }
  return html`<button type="button" onClick=${instalar} style=${claro ? '' : 'width:100%;justify-content:center'}>⬇ Instalar aplicación</button>`;
}

// Aviso cuando no hay conexión (los datos siempre vienen de internet)
function AvisoSinRed() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true), off = () => setEnLinea(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  return enLinea ? null : html`<div class="aviso atencion" style="margin:0;border-radius:0;text-align:center">Sin conexión a internet: los cambios no se guardarán hasta que vuelva la conexión.</div>`;
}

// Recordatorio: desde el día de corte, si aún no se descargó el respaldo del mes
function faltaRespaldoMes(config) {
  const hoy = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);   // hora de La Paz
  const mesDe = r => r?.fecha ? new Date(Date.parse(r.fecha) - 4 * 3600000).toISOString().slice(0, 7) : '';
  const hecho = [config.respaldo_mensual, config.respaldo_drive].some(r => mesDe(r) === hoy.slice(0, 7));
  // Aviso desde el día de corte; si el respaldo automático de Drive ya corrió este mes, no avisa
  return !hecho && Number(hoy.slice(8)) >= Number(config.dia_corte ?? 25);
}

function ruta() {
  const r = (location.hash || '#/tablero').slice(2).split('?')[0].split('/');
  return { vista: r[0] || 'tablero', id: r[1] || null };
}

// Autorregistro: la persona crea su cuenta y queda pendiente de aprobación del administrador
function Registro({ onVolver }) {
  const [op, setOp] = useState(null);
  const [d, setD] = useState({ nombre: '', cargo: '', correo: '', direccion_id: '', unidad_id: '', clave: '', clave2: '' });
  const [err, setErr] = useState('');
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { sb.rpc('opciones_registro').then(({ data }) => setOp(data || { direcciones: [], unidades: [] })); }, []);
  const set = k => e => setD({ ...d, [k]: e.target.value, ...(k === 'direccion_id' ? { unidad_id: '' } : {}) });
  async function enviar(e) {
    e.preventDefault(); setErr('');
    if (!/^[^@\s]+@lapaz\.bo$/i.test(d.correo.trim())) return setErr('Use su correo institucional @lapaz.bo.');
    if (d.clave.length < 10) return setErr('La contraseña debe tener al menos 10 caracteres.');
    if (d.clave !== d.clave2) return setErr('Las dos contraseñas no coinciden.');
    if (!d.unidad_id) return setErr('Elija la unidad a la que pertenece.');
    setOcupado(true);
    const { data, error } = await sb.functions.invoke('registro', { body: {
      nombre: d.nombre, cargo: d.cargo, correo: d.correo.trim(), clave: d.clave,
      direccion_id: d.direccion_id, unidad_id: d.unidad_id } });
    setOcupado(false);
    let m = data?.error;
    if (error && !m) { try { m = (await error.context.json()).error; } catch { m = mensajeError(error); } }
    if (m) return setErr(m);
    setListo(true);
  }
  if (listo) return html`<div class="ingreso"><div class="caja">
    <h1>Solicitud enviada</h1>
    <p>Su cuenta fue creada y está <b>pendiente de aprobación</b>. El administrador de la SMCI revisará su solicitud y le asignará su dirección o unidad.</p>
    <p>Cuando esté aprobada, ingrese con su correo y la contraseña que acaba de definir.</p>
    <button class="prim" onClick=${onVolver}>Volver al ingreso</button></div></div>`;
  const unidades = (op?.unidades || []).filter(u => u.direccion_id === d.direccion_id);
  return html`<div class="ingreso"><div class="caja">
    <small style="color:#5b6b74">Seguimiento de Proyectos SMCI</small>
    <h1>Crear mi cuenta</h1>
    <p>Cada persona usa su propia cuenta. El administrador aprueba la solicitud antes de que pueda ver o registrar información.</p>
    <${Aviso} tipo="error">${err}<//>
    <form onSubmit=${enviar}>
      <label>Nombre completo<input required value=${d.nombre} onInput=${set('nombre')} /></label>
      <label>Cargo<input value=${d.cargo} onInput=${set('cargo')} placeholder="p. ej. Técnico de la UITD" /></label>
      <label>Correo institucional<input type="email" required autocomplete="username" value=${d.correo} onInput=${set('correo')} placeholder="nombre.apellido@lapaz.bo" /></label>
      <label>Dirección<select required value=${d.direccion_id} onChange=${set('direccion_id')}>
        <option value="">Elegir…</option>${(op?.direcciones || []).map(x => html`<option value=${x.id}>${x.sigla} · ${x.nombre}</option>`)}</select></label>
      <label>Unidad<select required value=${d.unidad_id} onChange=${set('unidad_id')} disabled=${!d.direccion_id}>
        <option value="">Elegir…</option>${unidades.map(x => html`<option value=${x.id}>${x.sigla} · ${x.nombre}</option>`)}</select></label>
      <label>Contraseña (mínimo 10 caracteres)<${ClaveInput} required autocomplete="new-password" value=${d.clave} onInput=${set('clave')} /></label>
      <label>Repita la contraseña<${ClaveInput} required autocomplete="new-password" value=${d.clave2} onInput=${set('clave2')} /></label>
      <button class="prim" disabled=${ocupado}>${ocupado ? 'Enviando…' : 'Crear mi cuenta'}</button>
      <button type="button" onClick=${onVolver}>Ya tengo cuenta: ingresar</button>
    </form>
  </div></div>`;
}

// Pantalla para cuentas que aún no fueron aprobadas o fueron rechazadas
function CuentaPendiente({ perfil }) {
  const rechazada = perfil.estado_acceso === 'rechazado';
  return html`<div class="ingreso"><div class="caja">
    <h1>${rechazada ? 'Solicitud no aprobada' : 'Cuenta pendiente de aprobación'}</h1>
    <p>${rechazada
      ? 'El administrador no aprobó esta cuenta. Si cree que es un error, comuníquese con la Secretaría Municipal de Ciudad Inteligente.'
      : html`Hola, <b>${perfil.nombre || perfil.correo}</b>. Su cuenta ya existe, pero el administrador todavía debe aprobarla y asignarle su dirección o unidad. Vuelva a ingresar más tarde.`}</p>
    <button onClick=${() => sb.auth.signOut()}>Cerrar sesión</button></div></div>`;
}

function Ingreso() {
  const [registro, setRegistro] = useState(false);
  if (registro) return html`<${Registro} onVolver=${() => setRegistro(false)} />`;
  return html`<${IngresoForm} onRegistro=${() => setRegistro(true)} />`;
}

function IngresoForm({ onRegistro }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function entrar(e) {
    e.preventDefault(); setErr(''); setOcupado(true);
    const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setOcupado(false);
    if (error) setErr(mensajeError(error));
  }
  async function institucional() {
    const { error } = await sb.auth.signInWithOAuth({ provider: CONFIG.PROVEEDOR_INSTITUCIONAL, options: { redirectTo: location.origin + location.pathname } });
    if (error) setErr(mensajeError(error));
  }
  return html`<div class="ingreso"><div class="caja">
    <small style="color:#5b6b74">Gobierno Autónomo Municipal de La Paz</small>
    <h1>Seguimiento de Proyectos SMCI</h1>
    <p>Secretaría Municipal de Ciudad Inteligente</p>
    <${Aviso} tipo="error">${err}<//>
    <form onSubmit=${entrar}>
      <label>Correo<input type="email" autocomplete="username" required value=${correo} onInput=${e => setCorreo(e.target.value)} /></label>
      <label>Contraseña<${ClaveInput} required autocomplete="current-password" value=${clave} onInput=${e => setClave(e.target.value)} /></label>
      <button class="prim" disabled=${ocupado}>${ocupado ? 'Ingresando…' : 'Ingresar'}</button>
      ${CONFIG.PROVEEDOR_INSTITUCIONAL && html`<button type="button" onClick=${institucional}>${CONFIG.ETIQUETA_INSTITUCIONAL}</button>`}
    </form>
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--borde)">
      <p class="ayuda" style="margin:0 0 .5rem">¿Primera vez? Cada persona crea su propia cuenta con su correo @lapaz.bo.</p>
      <button type="button" style="width:100%;justify-content:center" onClick=${onRegistro}>Crear mi cuenta</button>
    </div>
    <p class="ayuda" style="margin-top:1rem">¿Olvidó su contraseña? Pida al administrador que la restablezca.</p>
    <div style="margin-top:.5rem;display:grid;gap:.4rem"><${BotonInstalar} />
      <a class="btn" href="descargas/Proyectos-SMCI.apk" download style="justify-content:center">📱 Descargar para Android (APK)</a></div>
  </div></div>`;
}

function Aplicacion({ sesion }) {
  const [perfil, setPerfil] = useState(null);
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [r, setR] = useState(ruta());
  const [menu, setMenu] = useState(false);

  async function cargarCatalogos() {
    const [p, d, u, pe, c, es] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', sesion.user.id).single(),
      sb.from('direcciones').select('*').order('orden'),
      sb.from('unidades').select('*').order('orden'),
      sb.from('personas').select('id,nombre,cargo,unidad_id,direccion_id,activa').order('nombre'),
      sb.from('config').select('*'),
      sb.from('estrategicos').select('*').order('orden'),
    ]);
    const e = p.error || d.error || u.error || pe.error || c.error || es.error;
    if (e) { setErr(mensajeError(e)); return; }
    if (p.data && p.data.estado_acceso && p.data.estado_acceso !== 'aprobado') { setPerfil(p.data); setCat('pendiente'); return; }
    if (!p.data.activo) { setErr('Su usuario está desactivado. Consulte con el administrador.'); return; }
    const config = Object.fromEntries(c.data.map(x => [x.clave, x.valor]));
    const ordenDir = Object.fromEntries(d.data.map(x => [x.id, x.orden]));
    u.data.sort((a, b) => (ordenDir[a.direccion_id] - ordenDir[b.direccion_id]) || (a.orden - b.orden));
    setPerfil(p.data);
    setCat({
      direcciones: d.data, unidades: u.data, personas: pe.data, config, estrategicos: es.data,
      todasDirecciones: d.data, todasUnidades: u.data,
    });
  }
  useEffect(() => { cargarCatalogos(); }, []);
  useEffect(() => {
    // Cambiar de pestaña (solo cambia «?…») no sube la página; cambiar de pantalla sí
    let antes = location.hash.split('?')[0];
    const f = () => { const ahora = location.hash.split('?')[0]; setR(ruta()); setMenu(false); if (ahora !== antes) window.scrollTo(0, 0); antes = ahora; };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);

  if (err) return html`<div class="contenido"><${Aviso} tipo="error">${err}<//><button onClick=${() => sb.auth.signOut()}>Salir</button></div>`;
  if (!perfil || !cat) return html`<div class="cargando-pagina">Cargando…</div>`;
  if (cat === 'pendiente') return html`<${CuentaPendiente} perfil=${perfil} />`;

  // Selectores: solo direcciones/unidades activas y, salvo el administrador, solo las propias
  const esAdmin = perfil.rol === 'admin';
  const esUnidad = perfil.rol === 'jefe' || perfil.rol === 'responsable';
  const dirVis = cat.direcciones.filter(x => x.activa && (esAdmin || x.id === perfil.direccion_id));
  const uniVis = cat.unidades.filter(x => x.activa && (esAdmin || (esUnidad ? x.id === perfil.unidad_id : x.direccion_id === perfil.direccion_id)));
  const perVis = esAdmin ? cat.personas : cat.personas.filter(p => uniVis.some(u => u.id === p.unidad_id) || (!p.unidad_id && p.direccion_id === perfil.direccion_id));
  const catAct = { ...cat, direcciones: dirVis, unidades: uniVis, personas: perVis };
  const ctx = { perfil, cat: catAct, recargar: cargarCatalogos, sesion };
  const unidad = cat.unidades.find(u => u.id === perfil.unidad_id);
  const items = [
    ['tablero', perfil.rol === 'admin' ? 'Consolidado SMCI' : 'Tablero'],
    ['estrategicos', 'Proyectos dentro del plan de gobierno'],
    ['proyectos', 'Proyectos fuera del plan de gobierno'],
    ...(perfil.unidad_id || perfil.rol === 'director' ? [['mi-unidad', perfil.rol === 'director' ? 'Mi dirección' : 'Mi unidad']] : []),
    ...(perfil.rol === 'admin' || perfil.rol === 'jefe' || perfil.rol === 'director' ? [['validaciones', 'Validaciones']] : []),
    ...(perfil.rol === 'admin' ? [['admin', 'Administración']] : []),
  ];
  let ultimaLista = 'proyectos';
  try {
    if (r.vista === 'estrategicos' || r.vista === 'proyectos') sessionStorage.setItem('smci_lista', r.vista);
    ultimaLista = sessionStorage.getItem('smci_lista') || 'proyectos';
  } catch { /* sin almacenamiento: se marca «Proyectos» */ }
  const activo = r.vista === 'proyecto' ? ultimaLista : r.vista;

  let vista;
  if (r.vista === 'estrategicos') vista = html`<${ListaProyectos} ctx=${ctx} modo="estrategicos" key="est" />`;
  else if (r.vista === 'proyectos') vista = html`<${ListaProyectos} ctx=${ctx} modo="otros" key="otros" />`;
  else if (r.vista === 'proyecto') vista = html`<${Ficha} ctx=${ctx} id=${r.id} key=${r.id} />`;
  else if (r.vista === 'mi-unidad') vista = html`<${MiUnidad} ctx=${ctx} />`;
  else if (r.vista === 'admin' && perfil.rol === 'admin') vista = html`<${Admin} ctx=${ctx} />`;
  else if (r.vista === 'validaciones' && ['admin', 'jefe', 'director'].includes(perfil.rol)) vista = html`<${Validaciones} ctx=${ctx} />`;
  else vista = html`<${Tablero} ctx=${ctx} />`;

  return html`
    <${AvisoSinRed} />
    <div class="barra-sup"><b>Proyectos SMCI</b><button aria-label="Menú" onClick=${() => setMenu(!menu)}>☰</button></div>
    <div class="marco">
      <aside class="lateral ${menu ? 'abierto' : ''}">
        <div class="marca"><div class="logo"><svg width="20" height="20" viewBox="0 0 32 32"><path d="M8 24V14m6 10V8m6 16v-9m6 9V12" stroke="#f2c14e" stroke-width="3.2" stroke-linecap="round"/></svg></div>
          <div><b>Proyectos SMCI</b><small>Ciudad Inteligente · GAMLP</small></div></div>
        <nav class="nav">${items.map(([k, t]) => html`<a href="#/${k}" class=${activo === k ? 'activo' : ''}>${t}</a>`)}</nav>
        <div class="pie">
          <b>${perfil.nombre || perfil.correo}</b>
          ${ROLES[perfil.rol]}${unidad ? ' · ' + unidad.sigla : ''}
          <div style="margin-top:.6rem;display:grid;gap:.4rem"><${BotonInstalar} />
            <a class="btn" href="descargas/Proyectos-SMCI.apk" download style="justify-content:center">📱 App Android (APK)</a>
            <${CambiarClave} />
            <button onClick=${() => sb.auth.signOut()}>Cerrar sesión</button></div>
        </div>
      </aside>
      <main class="contenido">${esAdmin && faltaRespaldoMes(cat.config) && html`<${Aviso} tipo="atencion">💾 Falta el respaldo de este mes (no hay respaldo en Drive ni en la computadora). <a href="#/admin?pestana=config">Descargarlo ahora</a><//>`}${(r.vista !== 'tablero' || location.hash.includes('?')) && html`<div class="barra-atras"><button type="button" class="btn-atras" onClick=${atras} title="Volver a la pantalla anterior">← Atrás</button></div>`}${cat.config.bloqueo_cambios?.activo && html`<${Aviso} tipo=${esAdmin ? 'atencion' : 'error'}>
        🔒 ${esAdmin ? 'Usted bloqueó los cambios para todos los usuarios.' : 'El administrador bloqueó temporalmente los cambios. Puede consultar la información, pero no enviar ni validar cambios.'}
        ${cat.config.bloqueo_cambios.motivo ? ' Motivo: ' + cat.config.bloqueo_cambios.motivo + '.' : ''}
        ${esAdmin ? html` <a href="#/admin">Desbloquear</a>` : ''}<//>`}${vista}</main>
    </div>`;
}

function Raiz() {
  const [sesion, setSesion] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (sesion === undefined) return html`<div class="cargando-pagina">Cargando…</div>`;
  if (!sesion) return html`<${Ingreso} />`;
  return html`<${Aplicacion} sesion=${sesion} key=${sesion.user.id} />`;
}

render(html`<${Raiz} />`, document.getElementById('app'));
