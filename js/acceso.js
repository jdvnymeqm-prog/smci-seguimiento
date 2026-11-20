// Entrada pública de la aplicación: solo ingreso, registro y aviso de cuenta pendiente.
// El resto de la aplicación (js/app.js y demás) se carga únicamente con una cuenta aprobada:
// en Vercel, el servidor (middleware.js) no entrega esos archivos sin una sesión válida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { h, render } from 'https://esm.sh/preact@10.24.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.24.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import { CONFIG } from './config.js';

const html = htm.bind(h);
// Un solo cliente para toda la aplicación (lib.js lo reutiliza): evita dos renovaciones de sesión en paralelo
const sb = window.__smciSb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const raiz = document.getElementById('app');

// La sesión viaja en una cookie para que el servidor autorice la descarga de la aplicación
function ponerCookie(s) {
  const seguro = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = s
    ? `smci_t=${s.access_token}; Path=/; Max-Age=${Math.max(60, (s.expires_at || 0) - Math.floor(Date.now() / 1000))}; SameSite=Strict${seguro}`
    : `smci_t=; Path=/; Max-Age=0; SameSite=Strict${seguro}`;
}

function error(e) {
  const m = e?.message || String(e || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/rate limit|too many requests/i.test(m)) return 'Demasiados intentos. Espere unos minutos y vuelva a intentar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con el servidor. Revise su internet e intente de nuevo.';
  return m;
}

const Aviso = ({ children }) => children ? html`<div class="aviso error" role="alert">${children}</div>` : null;

function ClaveInput({ value, onInput, autocomplete, required }) {
  const [ver, setVer] = useState(false);
  return html`<span class="clave-campo">
    <input type=${ver ? 'text' : 'password'} autocomplete=${autocomplete} required=${required} value=${value} onInput=${onInput} />
    <button type="button" class="ver-clave" onClick=${() => setVer(!ver)} aria-label=${ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      title=${ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>${ver ? '🙈' : '👁'}</button></span>`;
}

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

function Ingreso() {
  const [registro, setRegistro] = useState(false);
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (registro) return html`<${Registro} onVolver=${() => setRegistro(false)} />`;
  async function entrar(e) {
    e.preventDefault(); setErr(''); setOcupado(true);
    const { error: er } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setOcupado(false);
    if (er) setErr(error(er));
  }
  return html`<div class="ingreso"><div class="caja">
    <img class="escudo-ingreso" src="iconos/escudo-gamlp.png" alt="Escudo del Gobierno Autónomo Municipal de La Paz" />
    <h1 style="text-align:center">Seguimiento de Proyectos SMCI</h1>
    <p style="text-align:center">Secretaría Municipal de Ciudad Inteligente</p>
    <${Aviso}>${err}<//>
    <form onSubmit=${entrar}>
      <label>Correo<input type="email" autocomplete="username" required value=${correo} onInput=${e => setCorreo(e.target.value)} /></label>
      <label>Contraseña<${ClaveInput} required autocomplete="current-password" value=${clave} onInput=${e => setClave(e.target.value)} /></label>
      <button class="prim" disabled=${ocupado}>${ocupado ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--borde)">
      <p class="ayuda" style="margin:0 0 .5rem">¿Primera vez? Cada persona crea su propia cuenta con su correo @lapaz.bo.</p>
      <button type="button" style="width:100%;justify-content:center" onClick=${() => setRegistro(true)}>Crear mi cuenta</button>
    </div>
    <p class="ayuda" style="margin-top:1rem">¿Olvidó su contraseña? Pida al administrador que la restablezca.</p>
    <div style="margin-top:.5rem"><${BotonInstalar} /></div>
  </div></div>`;
}

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
    const { data, error: er } = await sb.functions.invoke('registro', { body: {
      nombre: d.nombre, cargo: d.cargo, correo: d.correo.trim(), clave: d.clave, direccion_id: d.direccion_id, unidad_id: d.unidad_id } });
    setOcupado(false);
    let m = data?.error;
    if (er && !m) { try { m = (await er.context.json()).error; } catch { m = error(er); } }
    if (m) return setErr(m);
    setListo(true);
  }
  if (listo) return html`<div class="ingreso"><div class="caja">
    <h1>Solicitud enviada</h1>
    <p>Su cuenta fue creada y está <b>pendiente de aprobación</b>. El administrador revisará su solicitud.</p>
    <p>Cuando esté aprobada, ingrese con su correo y la contraseña que acaba de definir.</p>
    <button class="prim" onClick=${onVolver}>Volver al ingreso</button></div></div>`;
  const unidades = (op?.unidades || []).filter(u => u.direccion_id === d.direccion_id);
  return html`<div class="ingreso"><div class="caja">
    <small style="color:#5b6b74">Seguimiento de Proyectos SMCI</small>
    <h1>Crear mi cuenta</h1>
    <p>Cada persona usa su propia cuenta. El administrador aprueba la solicitud antes de que pueda ver o registrar información.</p>
    <${Aviso}>${err}<//>
    <form onSubmit=${enviar}>
      <label>Nombre completo<input required value=${d.nombre} onInput=${set('nombre')} /></label>
      <label>Cargo<input value=${d.cargo} onInput=${set('cargo')} placeholder="p. ej. Técnico de la UITD" /></label>
      <label>Correo institucional<input type="email" required autocomplete="username" value=${d.correo} onInput=${set('correo')} placeholder="nombre.apellido@lapaz.bo" /></label>
      <label>Dirección<select required value=${d.direccion_id} onChange=${set('direccion_id')}>
        <option value="">Elegir…</option>${(op?.direcciones || []).map(x => html`<option value=${x.id}>${x.sigla} · ${x.nombre}</option>`)}</select></label>
      <label>Unidad o área<select required value=${d.unidad_id} onChange=${set('unidad_id')} disabled=${!d.direccion_id}>
        <option value="">Elegir…</option>${unidades.map(x => html`<option value=${x.id}>${x.sigla} · ${x.nombre}</option>`)}</select>
        <span class="ayuda">Si depende directamente de la Dirección o del Despacho de la Secretaría, elija «Personal de la Dirección» o «Personal del Despacho».</span></label>
      <label>Contraseña (mínimo 10 caracteres)<${ClaveInput} required autocomplete="new-password" value=${d.clave} onInput=${set('clave')} /></label>
      <label>Repita la contraseña<${ClaveInput} required autocomplete="new-password" value=${d.clave2} onInput=${set('clave2')} /></label>
      <button class="prim" disabled=${ocupado}>${ocupado ? 'Enviando…' : 'Crear mi cuenta'}</button>
      <button type="button" onClick=${onVolver}>Ya tengo cuenta: ingresar</button>
    </form>
  </div></div>`;
}

function Mensaje({ titulo, texto }) {
  return html`<div class="ingreso"><div class="caja"><h1>${titulo}</h1><p>${texto}</p>
    <button onClick=${() => sb.auth.signOut()}>Cerrar sesión</button></div></div>`;
}

let cargada = false, decidiendo = false;
async function decidir(s) {
  ponerCookie(s);
  if (!s) { if (cargada) location.reload(); else render(html`<${Ingreso} />`, raiz); return; }
  if (cargada || decidiendo) return;
  decidiendo = true;
  try { await verificar(s); } finally { decidiendo = false; }
}

async function verificar(s) {
  const { data: p, error: e } = await sb.from('perfiles').select('nombre,correo,estado_acceso,activo').eq('id', s.user.id).maybeSingle();
  if (e) return render(html`<${Mensaje} titulo="No se pudo verificar su cuenta" texto=${error(e)} />`, raiz);
  if (!p || p.estado_acceso === 'pendiente') return render(html`<${Mensaje} titulo="Cuenta pendiente de aprobación"
    texto=${`Hola, ${p?.nombre || p?.correo || ''}. Su cuenta ya existe, pero el administrador todavía debe aprobarla y asignarle su dirección o unidad. Vuelva a ingresar más tarde.`} />`, raiz);
  if (p.estado_acceso === 'rechazado') return render(html`<${Mensaje} titulo="Solicitud no aprobada"
    texto="El administrador no aprobó esta cuenta. Si cree que es un error, comuníquese con la Secretaría Municipal de Ciudad Inteligente." />`, raiz);
  if (!p.activo) return render(html`<${Mensaje} titulo="Usuario desactivado" texto="Su usuario está desactivado. Consulte con el administrador." />`, raiz);
  cargada = true;
  render(null, raiz);
  raiz.innerHTML = '<div class="cargando-pagina">Cargando…</div>';
  try {
    await import('./app.js');
  } catch {
    cargada = false;
    render(html`<${Mensaje} titulo="No se pudo cargar la aplicación" texto="Revise su conexión a internet y vuelva a ingresar." />`, raiz);
  }
}

sb.auth.getSession().then(({ data }) => decidir(data.session));
sb.auth.onAuthStateChange((evento, s) => {
  if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') return ponerCookie(s);
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') decidir(s);
});
