import { html, render, useState, useEffect, sb, ROLES, mensajeError, atras, GESTION_BASE, GESTIONES, prefijoGestion } from './lib.js';
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
import { Continuidad } from './vistas/continuidad.js';

// Botón para instalar la aplicación en PC o Android (solo cuando el navegador lo permite)
function BotonInstalar({ claro }) {
  const [listo, setListo] = useState(!!window.__instalar);
  const [ayuda, setAyuda] = useState(false);
  useEffect(() => { const f = () => setListo(!!window.__instalar); addEventListener('instalable', f); return () => removeEventListener('instalable', f); }, []);
  if (matchMedia('(display-mode: standalone)').matches) return null;   // ya está instalada
  async function instalar() {
    const e = window.__instalar;
    if (!e) return setAyuda(!ayuda);   // el navegador no ofrece el aviso: se muestran los pasos
    e.prompt(); await e.userChoice; window.__instalar = null; setListo(false);
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return html`<div style="display:grid;gap:.4rem">
    <button type="button" onClick=${instalar} style=${claro ? '' : 'width:100%;justify-content:center'}>📱 Instalar la aplicación${listo ? '' : ' (celular o computadora)'}</button>
    ${ayuda && html`<div class="aviso info" style="margin:0;font-size:.85rem">${ios
      ? html`En iPhone, abra esta página en <b>Safari</b>, toque <b>Compartir</b> (□↑) y elija <b>«Agregar a inicio»</b>.`
      : html`En Android, abra esta página en <b>Chrome</b>, toque el menú <b>⋮</b> (arriba a la derecha) y elija <b>«Instalar aplicación»</b> o <b>«Agregar a la pantalla principal»</b>. En la computadora, use el ícono de instalar en la barra de direcciones de Chrome o Edge.`}
      <br/>Si tenía instalada la versión anterior (APK o la de GitHub), desinstálela primero.</div>`}
  </div>`;
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
  let r = (location.hash || '#/tablero').slice(2).split('?')[0].split('/');
  let gestion = GESTION_BASE;
  if (/^20\d\d$/.test(r[0])) { gestion = Number(r[0]); r = r.slice(1); }
  return { vista: r[0] || 'tablero', id: r[1] || null, gestion };
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

function Aplicacion({ sesion }) {
  const [perfil, setPerfil] = useState(null);
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [r, setR] = useState(ruta());
  const [menu, setMenu] = useState(false);

  async function cargarCatalogos() {
    const [p, d, u, pe, c, es, ve] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', sesion.user.id).single(),
      sb.from('direcciones').select('*').order('orden'),
      sb.from('unidades').select('*').order('orden'),
      sb.from('personas').select('id,nombre,cargo,unidad_id,direccion_id,activa').order('nombre'),
      sb.from('config').select('*'),
      sb.from('estrategicos').select('*').order('orden'),
      sb.rpc('unidades_que_veo'),
    ]);
    const e = p.error || d.error || u.error || pe.error || c.error || es.error;
    if (e) { setErr(mensajeError(e)); return; }
    if (p.data && p.data.estado_acceso && p.data.estado_acceso !== 'aprobado') { setPerfil(p.data); setCat('pendiente'); return; }
    if (!p.data.activo) { setErr('Su usuario está desactivado. Consulte con el administrador.'); return; }
    const config = Object.fromEntries(c.data.map(x => [x.clave, x.valor]));
    const ordenDir = Object.fromEntries(d.data.map(x => [x.id, x.orden]));
    u.data.sort((a, b) => (ordenDir[a.direccion_id] - ordenDir[b.direccion_id]) || (a.orden - b.orden));
    // Edición abierta temporal en su dirección (la activa el administrador; la base la vuelve a verificar)
    const miDir = d.data.find(x => x.id === p.data.direccion_id);
    setPerfil({ ...p.data, edicion_abierta: !!miDir?.edicion_abierta });
    setCat({
      direcciones: d.data, unidades: u.data, personas: pe.data, config, estrategicos: es.data,
      todasDirecciones: d.data, todasUnidades: u.data,
      // Unidades que la base permite ver (si falla, solo la propia)
      unidadesVisibles: new Set(ve.error ? [p.data.unidad_id] : (ve.data || []).map(x => x.unidades_que_veo || x)),
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
  // El titular del Despacho de la Secretaría (director de DESP-SMCI) ve todas las direcciones
  const esSecretaria = perfil.rol === 'director' && !!cat.direcciones.find(d => d.id === perfil.direccion_id)?.es_despacho_secretaria;
  const veTodo = esAdmin || esSecretaria;
  const esUnidad = perfil.rol === 'jefe' || perfil.rol === 'responsable';
  const dirVis = cat.direcciones.filter(x => x.activa && (veTodo || x.id === perfil.direccion_id));
  const uniVis = cat.unidades.filter(x => x.activa && (veTodo || (esUnidad ? (x.id === perfil.unidad_id || cat.unidadesVisibles?.has(x.id)) : x.direccion_id === perfil.direccion_id)));
  const perVis = veTodo ? cat.personas : cat.personas.filter(p => uniVis.some(u => u.id === p.unidad_id) || (!p.unidad_id && p.direccion_id === perfil.direccion_id));
  const catAct = { ...cat, direcciones: dirVis, unidades: uniVis, personas: perVis };
  const ctx = { perfil, cat: catAct, recargar: cargarCatalogos, sesion };
  const unidad = cat.unidades.find(u => u.id === perfil.unidad_id);
  // Menú: un bloque por gestión (mismas pantallas, filtradas por año) y, abajo, lo común
  const porGestion = g => [
    ['tablero', perfil.rol === 'admin' ? 'Consolidado SMCI' : 'Tablero'],
    ['estrategicos', 'Proyectos dentro del plan de gobierno'],
    ['proyectos', 'Proyectos fuera del plan de gobierno'],
    ...(perfil.unidad_id || perfil.rol === 'director' ? [['mi-unidad', perfil.rol === 'director' ? 'Mi dirección' : 'Mi unidad']] : []),
    ...(g !== GESTION_BASE ? [['continuidad', `Continuidad desde ${g - 1}`]] : []),
  ];
  const comunes = [
    ...(perfil.rol === 'admin' || perfil.rol === 'jefe' || perfil.rol === 'director' ? [['validaciones', 'Validaciones']] : []),
    ...(perfil.rol === 'admin' ? [['admin', 'Administración']] : []),
  ];
  let ultimaLista = 'proyectos';
  try {
    if (r.vista === 'estrategicos' || r.vista === 'proyectos') sessionStorage.setItem('smci_lista', r.gestion + '/' + r.vista);
    ultimaLista = sessionStorage.getItem('smci_lista') || GESTION_BASE + '/proyectos';
  } catch { /* sin almacenamiento */ }
  // En la ficha se marca la lista de la que se vino (con su gestión)
  const [gActiva, vActiva] = r.vista === 'proyecto' ? [Number(ultimaLista.split('/')[0]) || GESTION_BASE, ultimaLista.split('/')[1] || 'proyectos'] : [r.gestion, r.vista];
  const ctxG = { ...ctx, gestion: r.gestion };

  let vista;
  if (r.vista === 'estrategicos') vista = html`<${ListaProyectos} ctx=${ctxG} modo="estrategicos" key=${'est' + r.gestion} />`;
  else if (r.vista === 'proyectos') vista = html`<${ListaProyectos} ctx=${ctxG} modo="otros" key=${'otros' + r.gestion} />`;
  else if (r.vista === 'continuidad' && r.gestion !== GESTION_BASE) vista = html`<${Continuidad} ctx=${ctxG} key=${'cont' + r.gestion} />`;
  else if (r.vista === 'proyecto') vista = html`<${Ficha} ctx=${ctx} id=${r.id} key=${r.id} />`;
  else if (r.vista === 'mi-unidad') vista = html`<${MiUnidad} ctx=${ctxG} key=${'mu' + r.gestion} />`;
  else if (r.vista === 'admin' && perfil.rol === 'admin') vista = html`<${Admin} ctx=${ctx} />`;
  else if (r.vista === 'validaciones' && ['admin', 'jefe', 'director'].includes(perfil.rol)) vista = html`<${Validaciones} ctx=${ctx} />`;
  else vista = html`<${Tablero} ctx=${ctxG} key=${'tab' + r.gestion} />`;

  return html`
    <${AvisoSinRed} />
    <div class="barra-sup"><b>Proyectos SMCI</b><button aria-label="Menú" onClick=${() => setMenu(!menu)}>☰</button></div>
    <div class="marco">
      <aside class="lateral ${menu ? 'abierto' : ''}">
        <div class="marca"><div class="logo escudo"><img src="iconos/escudo-gamlp.png" alt="Escudo del Gobierno Autónomo Municipal de La Paz" /></div>
          <div><b>Proyectos SMCI</b><small>Ciudad Inteligente · GAMLP</small></div></div>
        <nav class="nav">${GESTIONES.map(g => html`<div class=${'nav-gestion' + (gActiva === g ? ' actual' : '')}>Gestión ${g}</div>
            ${porGestion(g).map(([k, t]) => html`<a href=${prefijoGestion(g) + k} class=${gActiva === g && vActiva === k ? 'activo' : ''}>${t}</a>`)}`)}
          ${comunes.length > 0 && html`<div class="nav-gestion">General</div>`}
          ${comunes.map(([k, t]) => html`<a href="#/${k}" class=${r.vista === k ? 'activo' : ''}>${t}</a>`)}</nav>
        <div class="pie">
          <b>${perfil.nombre || perfil.correo}</b>
          ${perfil.cargo || (esSecretaria ? 'Despacho de la Secretaría' : ROLES[perfil.rol])}${unidad ? ' · ' + unidad.sigla : ''}
          <div style="margin-top:.6rem;display:grid;gap:.4rem"><${BotonInstalar} />
            <${CambiarClave} />
            <button onClick=${() => sb.auth.signOut()}>Cerrar sesión</button></div>
        </div>
      </aside>
      <main class="contenido">${esAdmin && faltaRespaldoMes(cat.config) && html`<${Aviso} tipo="atencion">💾 Falta el respaldo de este mes (no hay respaldo en Drive ni en la computadora). <a href="#/admin?pestana=config">Descargarlo ahora</a><//>`}${(r.vista !== 'tablero' || location.hash.includes('?')) && html`<div class="barra-atras"><button type="button" class="btn-atras" onClick=${atras} title="Volver a la pantalla anterior">← Atrás</button></div>`}${!esAdmin && perfil.edicion_abierta && (perfil.rol === 'jefe' || perfil.rol === 'responsable') && html`<${Aviso} tipo="info">🔓 Edición abierta temporal en su dirección: puede ver y proponer cambios en los proyectos de todas sus unidades (por ejemplo, asignar nuevos responsables). Los cambios se siguen validando como siempre.<//>`}${esAdmin && cat.direcciones.some(x => x.edicion_abierta) && html`<${Aviso} tipo="atencion">🔓 Edición abierta en: ${cat.direcciones.filter(x => x.edicion_abierta).map(x => x.sigla).join(', ')}. Cuando termine la reorganización, ciérrela en <a href="#/admin?pestana=estructura">Administración → Estructura</a>.<//>`}${cat.config.bloqueo_cambios?.activo && html`<${Aviso} tipo=${esAdmin ? 'atencion' : 'error'}>
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
  // Sin sesión se vuelve a la pantalla pública de ingreso (acceso.js)
  if (!sesion) { location.reload(); return null; }
  return html`<${Aplicacion} sesion=${sesion} key=${sesion.user.id} />`;
}

// La pantalla de ingreso deja un «Cargando…» provisional: se quita antes de mostrar la aplicación
const raiz = document.getElementById('app');
raiz.textContent = '';
render(html`<${Raiz} />`, raiz);
