import { html, useState, useEffect, ESTADOS, ESTADO_CLASE, fecha, pct, norm, mesActualISO, nombreMes, aISO, miles, leerMonto } from './lib.js';

// Código del proyecto: numeral estratégico arriba y código SMCI debajo
export const Codigo = ({ p }) => p.codigo_estrategico
  ? html`<span class="cod-est">${p.codigo_estrategico}</span>${p.codigo !== p.codigo_estrategico ? html`<span class="cod-smci">${p.codigo}</span>` : ''}`
  : html`<b>${p.codigo}</b>`;

// Campo de contraseña con botón para mostrarla u ocultarla
export function ClaveInput({ value, onInput, autocomplete, required }) {
  const [ver, setVer] = useState(false);
  return html`<span class="clave-campo">
    <input type=${ver ? 'text' : 'password'} autocomplete=${autocomplete} required=${required} value=${value} onInput=${onInput} />
    <button type="button" class="ver-clave" onClick=${() => setVer(!ver)}
      aria-label=${ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed=${ver}
      title=${ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>${ver ? '🙈' : '👁'}</button>
  </span>`;
}

// Campo de fecha con formato fijo dd/mm/aaaa (no depende del idioma del navegador)
export function FechaInput({ valor, onCambio, disabled, id }) {
  const [t, setT] = useState(valor ? fecha(valor) : '');
  const [mal, setMal] = useState(false);
  useEffect(() => { setT(valor ? fecha(valor) : ''); }, [valor]);
  function escribir(e) {
    let v = e.target.value.replace(/[^\d/]/g, '');
    if (/^\d{2}$/.test(v) || /^\d{2}\/\d{2}$/.test(v)) v += '/';
    setT(v.slice(0, 10)); setMal(false);
  }
  function salir() {
    if (!t.trim()) { setMal(false); onCambio(''); return; }
    const iso = aISO(t);
    const valida = iso && !isNaN(Date.parse(iso + 'T00:00:00Z')) && new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso;
    setMal(!valida); if (valida) onCambio(iso);
  }
  return html`<input id=${id} inputmode="numeric" placeholder="dd/mm/aaaa" value=${t} disabled=${disabled}
    onInput=${escribir} onBlur=${salir} style=${mal ? 'border-color:#b3261e' : ''} aria-invalid=${mal} />`;
}

// Campo de monto en bolivianos (1.234.567,89)
export function MontoInput({ valor, onCambio, disabled }) {
  const [t, setT] = useState(valor === null || valor === undefined ? '' : miles(valor, 2));
  useEffect(() => { setT(valor === null || valor === undefined ? '' : miles(valor, 2)); }, [valor]);
  return html`<input inputmode="decimal" placeholder="0,00" value=${t} disabled=${disabled}
    onInput=${e => setT(e.target.value)} onBlur=${() => { const v = leerMonto(t); onCambio(v); setT(v === null ? '' : miles(v, 2)); }} />`;
}

export const Estado = ({ e }) => html`<span class="estado ${ESTADO_CLASE[e] || ''}">${e || '—'}</span>`;

const SEM_TXT = { verde: 'A tiempo', amarillo: 'Vence en 15 días o menos', rojo: 'Vencido sin concluir', gris: 'Cancelado', sin_fecha: 'Sin fecha de entrega' };
export const Semaforo = ({ s, dias }) => html`
  <span title=${SEM_TXT[s] + (dias !== null && dias !== undefined && s !== 'gris' ? ` (${dias >= 0 ? 'faltan ' + dias : 'venció hace ' + (-dias)} días)` : '')}
        aria-label=${SEM_TXT[s]}><i class="sem ${s}"></i></span>`;

export const Barra = ({ v }) => html`
  <div class="barra-txt"><div class="barra" style="flex:1"><i style=${`width:${Math.max(0, Math.min(100, v || 0))}%`}></i></div><span>${pct(v)}</span></div>`;

export const Aviso = ({ tipo = 'info', children }) => children ? html`<div class="aviso ${tipo}" role=${tipo === 'error' ? 'alert' : 'status'}>${children}</div>` : null;

export function Modal({ titulo, onCerrar, children, acciones }) {
  return html`
    <div class="velo" onClick=${e => e.target === e.currentTarget && onCerrar()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label=${titulo}>
        <h2>${titulo}</h2>
        ${children}
        <div class="acciones">${acciones}</div>
      </div>
    </div>`;
}

export const QueFalta = ({ items, obs, max = 4 }) => {
  const lista = items || [];
  if (!lista.length && !obs) return html`<span class="pill">Nada pendiente</span>`;
  return html`<ul class="falta">
    ${lista.slice(0, max).map(t => html`<li>${t.nombre}${t.fin ? html` <span class="pill">${fecha(t.fin)}</span>` : ''}</li>`)}
    ${lista.length > max ? html`<li>y ${lista.length - max} más…</li>` : ''}
    ${obs ? html`<li><i>${obs.length > 140 ? obs.slice(0, 140) + '…' : obs}</i></li>` : ''}
  </ul>`;
};

// Texto plano de "qué falta" para exportaciones
export function queFaltaTexto(p) {
  const t = (p.que_falta || []).map(x => '• ' + x.nombre + (x.fin ? ` (${fecha(x.fin)})` : '')).join('\n');
  return [t, p.observaciones_falta ? 'Obs.: ' + p.observaciones_falta : ''].filter(Boolean).join('\n');
}

// ---------- Filtros comunes ----------
export function filtrosVacios() {
  return { direccion: '', unidad: '', responsable: '', estado: '', mes: '', texto: '' };
}

export function Filtros({ f, setF, cat, conMes = true, conTexto = false, meses = [] }) {
  const unidades = cat.unidades.filter(u => !f.direccion || u.direccion_id === f.direccion);
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'direccion' ? { unidad: '' } : {}) });
  return html`<div class="filtros panel">
    ${conTexto && html`<label>Buscar<input type="search" value=${f.texto} onInput=${upd('texto')} placeholder="Código o nombre" /></label>`}
    <label>Dirección<select value=${f.direccion} onChange=${upd('direccion')}>
      <option value="">Todas</option>
      ${cat.direcciones.map(d => html`<option value=${d.id}>${d.sigla}</option>`)}
    </select></label>
    <label>Unidad<select value=${f.unidad} onChange=${upd('unidad')}>
      <option value="">Todas</option>
      ${unidades.map(u => html`<option value=${u.id}>${u.sigla}</option>`)}
      ${cat.unidades.length > 1 && html`<option value="__sin">Por validar (sin unidad)</option>`}
    </select></label>
    <label>Responsable<select value=${f.responsable} onChange=${upd('responsable')}>
      <option value="">Todos</option>
      ${cat.personas.map(p => html`<option value=${p.id}>${p.nombre}</option>`)}
    </select></label>
    <label>Estado<select value=${f.estado} onChange=${upd('estado')}>
      <option value="">Todos</option>
      ${ESTADOS.map(e => html`<option>${e}</option>`)}
    </select></label>
    ${conMes && html`<label>Mes<select value=${f.mes} onChange=${upd('mes')}>
      <option value="">Situación actual</option>
      ${meses.map(m => html`<option value=${m}>${nombreMes(m)}${m === mesActualISO() ? ' (en curso)' : ''}</option>`)}
    </select></label>`}
    <button onClick=${() => setF(filtrosVacios())}>Limpiar</button>
  </div>`;
}

// Aplica filtros a la lista de proyectos (v_proyectos). Si hay mes histórico,
// sustituye estado/avance con lo reportado ese mes (o "No reportada").
export function aplicarFiltros(lista, f, reportesMes) {
  let r = lista;
  if (f.mes && f.mes !== mesActualISO() && reportesMes) {
    r = r.map(p => {
      const rep = reportesMes[p.id];
      return { ...p, estado: rep ? (rep.estado || p.estado) : 'No reportada', avance: rep && rep.avance !== null ? rep.avance : p.avance, _mes: true };
    });
  }
  return r.filter(p =>
    (!f.direccion || p.direccion_id === f.direccion) &&
    (!f.unidad || (f.unidad === '__sin' ? !p.unidad_id : p.unidad_id === f.unidad)) &&
    (!f.responsable || p.responsable_id === f.responsable) &&
    (!f.estado || p.estado === f.estado) &&
    (!f.texto || norm(p.codigo + ' ' + (p.codigo_estrategico || '') + ' ' + (p.codigo_gobierno || '') + ' ' + p.nombre).includes(norm(f.texto))));
}

export function describirFiltros(f, cat) {
  const partes = [];
  const d = cat.direcciones.find(x => x.id === f.direccion); if (d) partes.push('Dirección: ' + d.sigla);
  const u = cat.unidades.find(x => x.id === f.unidad); if (u) partes.push('Unidad: ' + u.sigla);
  if (f.unidad === '__sin') partes.push('Unidad: por validar');
  const p = cat.personas.find(x => x.id === f.responsable); if (p) partes.push('Responsable: ' + p.nombre);
  if (f.estado) partes.push('Estado: ' + f.estado);
  if (f.mes) partes.push('Mes: ' + nombreMes(f.mes));
  if (f.texto) partes.push('Texto: ' + f.texto);
  return partes.length ? partes.join(' · ') : 'Sin filtros';
}

export function resumen(lista) {
  const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]));
  let suma = 0;
  for (const p of lista) { porEstado[p.estado] = (porEstado[p.estado] || 0) + 1; suma += Number(p.avance || 0); }
  return {
    total: lista.length,
    porEstado,
    avancePromedio: lista.length ? suma / lista.length : 0,
    vencidos: lista.filter(p => p.vencido).length,
    reprogramados: lista.filter(p => p.n_reprogramaciones > 0 || p.n_reprog_tareas > 0).length,
    noReportados: porEstado['No reportada'] || 0,
    porValidar: lista.filter(p => p.por_validar).length,
  };
}

// Columnas de exportación de proyectos (comunes a tablero y lista)
export const COLUMNAS_PROYECTO = [
  { titulo: 'Código estratégico', valor: p => p.codigo_estrategico || '', ancho: 13 },
  { titulo: 'Código SMCI', valor: p => p.codigo_estrategico && p.codigo === p.codigo_estrategico ? '' : p.codigo, ancho: 10 },
  { titulo: 'Cód. gobierno', campo: 'codigo_gobierno', ancho: 10 },
  { titulo: 'Proyecto', campo: 'nombre', ancho: 40 },
  { titulo: 'Dirección', campo: 'direccion_sigla', ancho: 8 },
  { titulo: 'Unidad', valor: p => p.unidad_sigla || 'Por validar', ancho: 10 },
  { titulo: 'Responsable', valor: p => p.responsable_nombre || '', ancho: 26 },
  { titulo: 'Estado', campo: 'estado', ancho: 13 },
  { titulo: '% avance', excel: p => Number(p.avance || 0), pdf: p => pct(p.avance), ancho: 9 },
  { titulo: 'Fecha original', valor: p => fecha(p.fecha_entrega_original), ancho: 12 },
  { titulo: 'Fecha vigente', valor: p => fecha(p.fecha_entrega_vigente), ancho: 12 },
  { titulo: 'N.º reprog.', excel: p => p.n_reprogramaciones, pdf: p => String(p.n_reprogramaciones), ancho: 8 },
  { titulo: 'Semáforo', valor: p => ({ verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', gris: 'Cancelado', sin_fecha: 'Sin fecha' })[p.semaforo], ancho: 10 },
  { titulo: 'Qué falta', valor: queFaltaTexto, ancho: 60 },
  { titulo: 'Pendientes de validación', excel: p => p.n_mod_pendientes || 0, pdf: p => p.n_mod_pendientes ? String(p.n_mod_pendientes) : 'Al día', ancho: 12 },
];
