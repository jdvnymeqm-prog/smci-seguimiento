// Vercel Routing Middleware: el código de la aplicación (carpeta /js) solo se entrega a usuarios con
// sesión iniciada y cuenta aprobada. Sin sesión válida responde 401 y no envía el archivo.
// Públicos: la pantalla de ingreso (acceso.js) y la configuración de conexión (config.js).
export const config = { matcher: ['/js/:path*'] };

const SUPABASE_URL = 'https://awzuhwyrukxzzdbcocer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6eOTdoTgpWw4wOVTKy9nLg_O_WKcsu-';
const PUBLICOS = new Set(['/js/acceso.js', '/js/config.js']);
const cache = new Map();   // token → { ok, hasta } (memoria de la instancia, unos minutos)

function negar(texto) {
  return new Response(texto, { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

function leerCookie(req, nombre) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function datosToken(token) {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4)));
  } catch { return null; }
}

async function aprobado(token) {
  const ahora = Date.now();
  const c = cache.get(token);
  if (c && c.hasta > ahora) return c.ok;
  const t = datosToken(token);
  if (!t || !t.sub || !t.exp || t.exp * 1000 < ahora) return false;
  // La base verifica la firma del token; si es falso o vencido, responde 401 y no devuelve el perfil
  const r = await fetch(`${SUPABASE_URL}/rest/v1/perfiles?select=activo,estado_acceso&id=eq.${encodeURIComponent(t.sub)}`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  let ok = false;
  if (r.ok) { const filas = await r.json(); ok = filas.length === 1 && filas[0].activo === true && filas[0].estado_acceso === 'aprobado'; }
  cache.set(token, { ok, hasta: Math.min(t.exp * 1000, ahora + (ok ? 5 : 1) * 60_000) });
  if (cache.size > 500) cache.clear();
  return ok;
}

export default async function middleware(req) {
  const { pathname } = new URL(req.url);
  if (PUBLICOS.has(pathname)) return;               // continúa: archivo público
  const token = leerCookie(req, 'smci_t');
  if (!token) return negar('Inicie sesión para usar la aplicación.');
  try {
    if (await aprobado(token)) return;              // continúa: entrega el archivo
  } catch {
    return negar('No se pudo verificar la sesión. Intente de nuevo.');
  }
  return negar('Su cuenta no está aprobada o la sesión venció. Vuelva a ingresar.');
}
