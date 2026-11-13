import { html, render, useState, useEffect, sb, ROLES, mensajeError } from './lib.js';
import { CONFIG } from './config.js';
import { Aviso } from './componentes.js';
import { Tablero } from './vistas/tablero.js';
import { ListaProyectos } from './vistas/proyectos.js';
import { Ficha } from './vistas/ficha.js';
import { MiUnidad } from './vistas/miunidad.js';
import { Admin } from './vistas/admin.js';

function ruta() {
  const r = (location.hash || '#/tablero').slice(2).split('/');
  return { vista: r[0] || 'tablero', id: r[1] || null };
}

function Ingreso() {
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
      <label>Contraseña<input type="password" autocomplete="current-password" required value=${clave} onInput=${e => setClave(e.target.value)} /></label>
      <button class="prim" disabled=${ocupado}>${ocupado ? 'Ingresando…' : 'Ingresar'}</button>
      ${CONFIG.PROVEEDOR_INSTITUCIONAL && html`<button type="button" onClick=${institucional}>${CONFIG.ETIQUETA_INSTITUCIONAL}</button>`}
    </form>
    <p class="ayuda" style="margin-top:1rem">¿Olvidó su contraseña? Pida al administrador que la restablezca.</p>
  </div></div>`;
}

function Aplicacion({ sesion }) {
  const [perfil, setPerfil] = useState(null);
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [r, setR] = useState(ruta());
  const [menu, setMenu] = useState(false);

  async function cargarCatalogos() {
    const [p, d, u, pe, c] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', sesion.user.id).single(),
      sb.from('direcciones').select('*').order('orden'),
      sb.from('unidades').select('*').order('orden'),
      sb.from('personas').select('id,nombre,cargo,unidad_id,direccion_id,activa').order('nombre'),
      sb.from('config').select('*'),
    ]);
    const e = p.error || d.error || u.error || pe.error || c.error;
    if (e) { setErr(mensajeError(e)); return; }
    if (!p.data.activo) { setErr('Su usuario está desactivado. Consulte con el administrador.'); return; }
    const config = Object.fromEntries(c.data.map(x => [x.clave, x.valor]));
    const ordenDir = Object.fromEntries(d.data.map(x => [x.id, x.orden]));
    u.data.sort((a, b) => (ordenDir[a.direccion_id] - ordenDir[b.direccion_id]) || (a.orden - b.orden));
    setPerfil(p.data);
    setCat({
      direcciones: d.data, unidades: u.data, personas: pe.data, config,
      todasDirecciones: d.data, todasUnidades: u.data,
    });
  }
  useEffect(() => { cargarCatalogos(); }, []);
  useEffect(() => {
    const f = () => { setR(ruta()); setMenu(false); window.scrollTo(0, 0); };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);

  if (err) return html`<div class="contenido"><${Aviso} tipo="error">${err}<//><button onClick=${() => sb.auth.signOut()}>Salir</button></div>`;
  if (!perfil || !cat) return html`<div class="cargando-pagina">Cargando…</div>`;

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
    ['proyectos', 'Proyectos'],
    ...(perfil.unidad_id || perfil.rol === 'director' ? [['mi-unidad', perfil.rol === 'director' ? 'Mi dirección' : 'Mi unidad']] : []),
    ...(perfil.rol === 'admin' ? [['admin', 'Administración']] : []),
  ];
  const activo = r.vista === 'proyecto' ? 'proyectos' : r.vista;

  let vista;
  if (r.vista === 'proyectos') vista = html`<${ListaProyectos} ctx=${ctx} />`;
  else if (r.vista === 'proyecto') vista = html`<${Ficha} ctx=${ctx} id=${r.id} key=${r.id} />`;
  else if (r.vista === 'mi-unidad') vista = html`<${MiUnidad} ctx=${ctx} />`;
  else if (r.vista === 'admin' && perfil.rol === 'admin') vista = html`<${Admin} ctx=${ctx} />`;
  else vista = html`<${Tablero} ctx=${ctx} />`;

  return html`
    <div class="barra-sup"><b>Proyectos SMCI</b><button aria-label="Menú" onClick=${() => setMenu(!menu)}>☰</button></div>
    <div class="marco">
      <aside class="lateral ${menu ? 'abierto' : ''}">
        <div class="marca"><div class="logo"><svg width="20" height="20" viewBox="0 0 32 32"><path d="M8 24V14m6 10V8m6 16v-9m6 9V12" stroke="#f2c14e" stroke-width="3.2" stroke-linecap="round"/></svg></div>
          <div><b>Proyectos SMCI</b><small>Ciudad Inteligente · GAMLP</small></div></div>
        <nav class="nav">${items.map(([k, t]) => html`<a href="#/${k}" class=${activo === k ? 'activo' : ''}>${t}</a>`)}</nav>
        <div class="pie">
          <b>${perfil.nombre || perfil.correo}</b>
          ${ROLES[perfil.rol]}${unidad ? ' · ' + unidad.sigla : ''}
          <div style="margin-top:.6rem"><button onClick=${() => sb.auth.signOut()}>Cerrar sesión</button></div>
        </div>
      </aside>
      <main class="contenido">${vista}</main>
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
