// Utilidades comunes: cliente Supabase, Preact/htm, formatos y exportación.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { h, render } from 'https://esm.sh/preact@10.24.3';
import { useState, useEffect, useMemo, useRef, useCallback } from 'https://esm.sh/preact@10.24.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import { CONFIG } from './config.js';

export const html = htm.bind(h);
export { h, render, useState, useEffect, useMemo, useRef, useCallback };

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const ESTADOS = ['No reportada', 'No iniciada', 'En ejecución', 'Concluida', 'Cancelada'];
export const ESTADO_CLASE = {
  'No reportada': 'e-norep', 'No iniciada': 'e-noini', 'En ejecución': 'e-ejec',
  'Concluida': 'e-concl', 'Cancelada': 'e-canc',
};
export const ROLES = {
  admin: 'Administrador', director: 'Director/a', jefe: 'Jefe/a de unidad',
  responsable: 'Responsable de unidad', consulta: 'Consulta (solo lectura)',
};
export const TZ = 'America/La_Paz';

// ---------- Fechas (dd/mm/aaaa, zona America/La_Paz) ----------
export function fecha(d) {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
  }
  const f = new Date(d);
  if (isNaN(f)) return '—';
  return new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(f);
}
export function fechaHora(d) {
  if (!d) return '—';
  const f = new Date(d);
  const p = new Intl.DateTimeFormat('es-BO', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(f).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
// Hoy en La Paz como 'YYYY-MM-DD'
export function hoyISO() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA ya da YYYY-MM-DD
}
export function mesActualISO() { return hoyISO().slice(0, 7) + '-01'; }
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function nombreMes(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  return `${MESES[+m - 1]} ${y}`;
}
export function diasEntre(a, b) { // b - a en días (fechas ISO)
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
// dd/mm/aaaa → ISO
export function aISO(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((txt || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ---------- Números ----------
export function miles(n, dec = 0) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
  const neg = n < 0;
  const [ent, frac] = Math.abs(Number(n)).toFixed(dec).split('.');
  const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + conPuntos + (dec ? ',' + frac : '');
}
export function bs(n) { return (n === null || n === undefined || n === '') ? '—' : 'Bs ' + miles(n, 2); }
export function pct(n) { return (n === null || n === undefined) ? '—' : miles(n, Number(n) % 1 ? 1 : 0) + ' %'; }
// "1.234.567,89" → 1234567.89
export function leerMonto(txt) {
  if (txt === null || txt === undefined || String(txt).trim() === '') return null;
  const v = Number(String(txt).replace(/Bs/i, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

// ---------- Texto ----------
export function sinTildes(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function norm(s) { return sinTildes(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim(); }

// ---------- Navegación: pestañas en la dirección (#/vista/id?pestaña=x) para poder volver «Atrás» paso a paso ----------
export function parametros() {
  const q = (location.hash.split('?')[1] || '');
  return Object.fromEntries(new URLSearchParams(q));
}
export function irConParametro(clave, valor) {
  const [ruta] = location.hash.split('?');
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  if (valor === null || valor === undefined || valor === '') p.delete(clave); else p.set(clave, valor);
  const q = p.toString();
  location.hash = (ruta || '#/tablero') + (q ? '?' + q : '');
}
// Pestaña guardada en la dirección: cada cambio queda en el historial del navegador
export function usePestana(clave, inicial) {
  const v = parametros()[clave] || inicial;
  return [v, nuevo => { if (nuevo !== v) irConParametro(clave, nuevo === inicial ? null : nuevo); }];
}
let pasos = 0;
addEventListener('hashchange', () => { pasos++; });
export function atras() {
  if (pasos > 0 && history.length > 1) { pasos -= 2; history.back(); }
  else location.hash = '#/tablero';
}

// ---------- Código estratégico (Eje III) primero; el código SMCI debajo ----------
export function codigoPrincipal(p) { return p.codigo_estrategico || p.codigo; }
// En textos (PDF, Excel, títulos): «24.5» o «23.1 (SMCI-06)»
export function codigoTexto(p) {
  if (!p) return '';
  const s = codigoSecundario(p);
  return codigoPrincipal(p) + (s ? ' (' + s + ')' : '');
}
export function codigoSecundario(p) { return p.codigo_estrategico && p.codigo !== p.codigo_estrategico ? p.codigo : null; }

// ---------- Validación: jefe de unidad o, si la unidad no tiene jefe, el director ----------
export function puedeValidar(perfil, unidad) {
  if (!perfil || !perfil.activo) return false;
  if (perfil.rol === 'admin') return true;
  if (!unidad) return false;
  if (perfil.rol === 'jefe') return perfil.unidad_id === unidad.id;
  if (perfil.rol === 'director') return unidad.tiene_jefe === false && perfil.direccion_id === unidad.direccion_id;
  return false;
}
export function quienValida(unidad) {
  return unidad && unidad.tiene_jefe === false ? 'el director' : 'el jefe de unidad';
}
export function bloqueoCambios(cat, perfil) {
  const b = cat?.config?.bloqueo_cambios;
  return !!(b && b.activo) && perfil?.rol !== 'admin';
}

// ---------- Permisos en la interfaz (el servidor los vuelve a validar con RLS) ----------
export function puedeEditar(perfil, unidadId, direccionId) {
  if (!perfil || !perfil.activo) return false;
  if (perfil.rol === 'admin') return true;
  if ((perfil.rol === 'jefe' || perfil.rol === 'responsable') && unidadId && perfil.unidad_id === unidadId) return true;
  if (perfil.rol === 'director' && perfil.puede_editar && direccionId && perfil.direccion_id === direccionId) return true;
  return false;
}

// ---------- Errores legibles ----------
export function mensajeError(e) {
  if (!e) return '';
  const m = e.message || String(e);
  // Los mensajes propios del sistema (en español, p. ej. el bloqueo de cambios) se muestran tal cual.
  // Solo se traducen los mensajes técnicos de la base. PGRST116: la base no devolvió la fila (RLS la filtró).
  if (/row-level security|permission denied/i.test(m) || e.code === 'PGRST116')
    return 'No tiene permiso para modificar este registro. Solo la unidad dueña y el administrador pueden hacerlo.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (e.code === 'same_password' || /should be different from the old password/i.test(m))
    return 'La nueva contraseña debe ser distinta de la actual.';
  if (e.code === 'weak_password' || /password should|weak password/i.test(m))
    return 'La contraseña es demasiado débil. Use al menos 10 caracteres, combinando letras y números.';
  if (/rate limit|too many requests/i.test(m)) return 'Demasiados intentos. Espere unos minutos y vuelva a intentar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con el servidor. Revise su internet e intente de nuevo.';
  return m;
}

// ---------- Exportación ----------
function fechaArchivo() { return hoyISO().split('-').reverse().join('-'); }

export function exportarExcel(nombre, columnas, filas, hoja = 'Datos') {
  const aoa = [columnas.map(c => c.titulo), ...filas.map(f => columnas.map(c => {
    const v = c.excel ? c.excel(f) : (c.valor ? c.valor(f) : f[c.campo]);
    return v === undefined || v === null ? '' : v;
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columnas.map(c => ({ wch: c.ancho || 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  XLSX.writeFile(wb, `${nombre}_${fechaArchivo()}.xlsx`);
}

export function exportarPDF(titulo, subtitulo, columnas, filas, nombre) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Gobierno Autónomo Municipal de La Paz · Secretaría Municipal de Ciudad Inteligente', 36, 30);
  doc.setFontSize(14); doc.setTextColor(20);
  doc.text(titulo, 36, 50);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`${subtitulo || ''}   ·   Generado el ${fechaHora(new Date())} (hora de La Paz)`, 36, 66);
  doc.autoTable({
    startY: 78,
    head: [columnas.map(c => c.titulo)],
    body: filas.map(f => columnas.map(c => {
      const v = c.pdf ? c.pdf(f) : (c.valor ? c.valor(f) : f[c.campo]);
      return v === undefined || v === null ? '' : String(v);
    })),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 70, 92], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 247, 248] },
    margin: { left: 36, right: 36 },
  });
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8);
    doc.text(`Página ${i} de ${n}`, doc.internal.pageSize.getWidth() - 90, doc.internal.pageSize.getHeight() - 18);
  }
  doc.save(`${nombre}_${fechaArchivo()}.pdf`);
}
