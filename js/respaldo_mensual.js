// Respaldo mensual a la computadora: crea en la carpeta elegida (p. ej. el Escritorio) una carpeta
// «Mes DD-MM-AAAA» con todos los datos en Excel, el respaldo de la base en JSON y, por cada proyecto,
// Dirección / Unidad / Código – Proyecto con sus evidencias.
// Chrome y Edge escriben directamente en la carpeta; en otros navegadores se descarga un ZIP.
import { sb, hoyISO, MESES, codigoTexto, fecha, fechaHora, pct } from './lib.js';
import { exportarTodoExcel } from './exportar.js';

const limpio = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 90) || 'sin nombre';

export function nombreCarpetaMes(d = hoyISO()) {
  const [y, m, dd] = d.split('-');
  const mes = MESES[+m - 1];
  return `${mes[0].toUpperCase() + mes.slice(1)} ${dd}-${m}-${y}`;
}

export const puedeEscribirCarpeta = () => typeof window.showDirectoryPicker === 'function';

function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

function escritorCarpeta(raiz) {
  const cache = new Map();
  const dir = async ruta => {
    if (!ruta) return raiz;
    if (cache.has(ruta)) return cache.get(ruta);
    const i = ruta.lastIndexOf('/');
    const padre = await dir(i < 0 ? '' : ruta.slice(0, i));
    const h = await padre.getDirectoryHandle(ruta.slice(i + 1), { create: true });
    cache.set(ruta, h); return h;
  };
  return {
    async escribir(ruta, datos) {
      const i = ruta.lastIndexOf('/');
      const d = await dir(i < 0 ? '' : ruta.slice(0, i));
      const f = await d.getFileHandle(ruta.slice(i + 1), { create: true });
      const w = await f.createWritable(); await w.write(datos); await w.close();
    },
    async cerrar() {},
  };
}

async function escritorZip(nombre) {
  await cargarScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  const z = new window.JSZip();
  return {
    async escribir(ruta, datos) { z.file(nombre + '/' + ruta, datos); },
    async cerrar() {
      const b = await z.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nombre + '.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    },
  };
}

// progreso(texto, hechos, total)
export async function respaldoMensual(ctx, progreso = () => {}) {
  const carpeta = nombreCarpetaMes();
  let w;
  if (puedeEscribirCarpeta()) {
    const base = await window.showDirectoryPicker({ id: 'smci-respaldo', mode: 'readwrite', startIn: 'desktop' });
    w = escritorCarpeta(await base.getDirectoryHandle(carpeta, { create: true }));
  } else {
    w = await escritorZip(carpeta);
  }
  const res = { proyectos: 0, archivos: 0, enlaces: 0, fallidos: [] };

  progreso('Leyendo proyectos…');
  const { data: proyectos, error } = await sb.from('v_proyectos').select('*').order('codigo');
  if (error) throw error;

  progreso('Preparando el Excel con toda la información…');
  const xls = await exportarTodoExcel(proyectos, ctx, '', true);
  await w.escribir('Informacion completa SMCI.xlsx', new Uint8Array(xls));

  progreso('Creando el respaldo de la base de datos…');
  await sb.rpc('respaldo_ahora');
  const { data: resp } = await sb.from('respaldos').select('tabla,filas,datos,creado_en').order('creado_en', { ascending: false }).limit(30);
  const ultimo = (resp || []).filter(r => r.creado_en.slice(0, 16) === (resp?.[0]?.creado_en || '').slice(0, 16));
  await w.escribir('Respaldo base de datos.json', JSON.stringify({ creado: resp?.[0]?.creado_en, tablas: ultimo }, null, 1));

  const { data: evid } = await sb.from('evidencias').select('*').order('creado_en');
  const total = proyectos.length;
  for (const [i, p] of proyectos.entries()) {
    progreso(`Proyecto ${i + 1} de ${total}: ${codigoTexto(p)}`, i, total);
    const ruta = ['Proyectos', limpio(p.direccion_sigla), limpio(p.unidad_sigla || 'Sin unidad'), limpio(`${codigoTexto(p)} - ${p.nombre}`)].join('/');
    const ev = (evid || []).filter(e => e.proyecto_id === p.id);
    const resumen = [
      `${codigoTexto(p)} · ${p.nombre}`, '',
      `Plan de gobierno: ${p.codigo_estrategico ? 'Dentro (' + (p.estrategico_nombre || '') + ')' : 'Fuera'}`,
      `Dirección: ${p.direccion_sigla || '—'}`, `Unidad: ${p.unidad_sigla || 'Sin unidad'}`, `Responsable: ${p.responsable_nombre || '—'}`,
      `Estado: ${p.estado}`, `Avance: ${pct(p.avance)}`, `Entrega original: ${fecha(p.fecha_entrega_original)}`, `Entrega vigente: ${fecha(p.fecha_entrega_vigente)}`,
      `Situación actual: ${p.situacion_actual || '—'}`, `Próximo paso: ${p.proximo_paso || '—'}`,
      `Última actualización: ${fechaHora(p.ultima_actualizacion)}`, '',
      'Evidencias:', ...(ev.length ? ev.map(e => `- ${e.nombre || 'Sin nombre'} (${fechaHora(e.creado_en)})${e.url ? ': ' + e.url : ''}`) : ['- Ninguna']),
    ].join('\r\n');
    await w.escribir(`${ruta}/Datos del proyecto.txt`, resumen);
    for (const e of ev) {
      if (e.storage_path) {
        const { data: blob, error: e2 } = await sb.storage.from('evidencias').download(e.storage_path);
        if (e2 || !blob) { res.fallidos.push(`${codigoTexto(p)}: ${e.nombre || e.storage_path}`); continue; }
        await w.escribir(`${ruta}/Evidencias/${limpio(e.storage_path.split('/').pop())}`, blob);
        res.archivos++;
      } else if (e.url) res.enlaces++;
    }
    res.proyectos++;
  }
  if (res.fallidos.length) await w.escribir('Archivos que no se pudieron descargar.txt', res.fallidos.join('\r\n'));
  progreso('Terminando…', total, total);
  await w.cerrar();
  await sb.from('config').upsert({ clave: 'respaldo_mensual', valor: { fecha: new Date().toISOString(), carpeta } });
  return { ...res, carpeta, zip: !puedeEscribirCarpeta() };
}
