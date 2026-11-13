// Carga inicial: lee «Base de datos de proyectos SMCI 2026» (.xlsx), aplica las reglas
// de conversión, incorpora lo más reciente de la DEDH (pptx del 12/11/2026) y llama
// a la función importar_base del servidor en una sola transacción.
import { html, useState, sb, norm, sinTildes, fecha, mensajeError, hoyISO, MESES } from '../lib.js';
import { Aviso } from '../componentes.js';
import { PERSONAS_DEDH, AJUSTES_DEDH, FUENTE_DEDH } from '../datos/dedh_2026.js';

const FUENTE_XLSX = 'Base de datos de proyectos SMCI 2026.xlsx';

// ---------- Lectura de celdas ----------
function hoja(wb, nombre) {
  const k = wb.SheetNames.find(n => norm(n) === norm(nombre));
  if (!k) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[k], { defval: null, raw: true });
}
function col(fila, ...claves) {
  const ks = Object.keys(fila);
  for (const c of claves) {
    const k = ks.find(x => norm(x) === norm(c)) || ks.find(x => norm(x).includes(norm(c)));
    if (k !== undefined) return fila[k];
  }
  return null;
}
function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/^'/, '').trim();
  return s === '' ? null : s;
}
function iso(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function pctv(v) {
  if (v === null || v === undefined || v === '') return null;
  let n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(',', '.').trim());
  if (isNaN(n)) return null;
  if (typeof v === 'number' && n <= 1) n = n * 100;
  return Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
}
function periodoDe(v) { // '2026-07' | 'Julio 2026' → '2026-07-01'
  const s = txt(v); if (!s) return null;
  let m = /^(\d{4})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-01`;
  m = /^([a-záéíóú]+)\s+(\d{4})$/i.exec(s);
  if (m) { const i = MESES.indexOf(norm(m[1])); if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}-01`; }
  return null;
}
function finDeMes(periodo) { // '2026-10-01' → '2026-10-31T23:59:00-04:00'
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${d}T23:59:00-04:00`;
}
function sigMes(p) { const [y, m] = p.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; }

// ---------- Estados: conversión a los 5 nuevos ----------
export function convertirEstado(t) {
  const n = norm(t);
  if (!n) return null;
  if (/cancel|inviable/.test(n)) return 'Cancelada';
  if (/no reportad/.test(n)) return 'No reportada';
  if (/no iniciad|^programad/.test(n)) return 'No iniciada';
  if (/^a\b|^a –|^a -|concluid|resuelto|^ejecutado/.test(n)) return 'Concluida';
  return 'En ejecución'; // B, C, E, en proceso, persiste, requiere decisión, seguimiento, reprogramado, avance parcial…
}

// ---------- Personas: normalización de nombres ----------
const TITULOS = /\b(lic|ing|arq|abog|ph\.?\s?d|dr|dra|msc|mgr|prof)\.?(?=\s|,|$)/gi;
function claveNombre(n) {
  return sinTildes(String(n || '').replace(/\(.*?\)/g, ' ').replace(TITULOS, ' ').replace(/[.,]/g, ' '))
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
const ALIAS = { 'beto saavedra': 'alberto saavedra choque' };
function tituloCaso(s) { return s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function limpiarNombre(n) {
  let s = String(n).replace(/\(.*?\)/g, ' ').replace(TITULOS, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase()) s = tituloCaso(s);
  return s;
}

class Registro {
  constructor() { this.lista = []; }
  agregar(nombre, datos = {}) {
    if (!nombre || /acéfalo|acefalo|por definir|por cubrir/i.test(nombre)) return null;
    const ex = this.buscar(nombre, false);
    if (ex) {
      for (const k of ['cargo', 'unidad', 'direccion']) if (datos[k] && !ex[k]) ex[k] = datos[k];
      if (datos.prioridad && limpiarNombre(nombre).length > ex.nombre.length) ex.nombre = limpiarNombre(nombre);
      return ex;
    }
    const p = { nombre: limpiarNombre(nombre), clave: claveNombre(nombre), ...datos };
    this.lista.push(p); return p;
  }
  buscar(nombre, crear = true) {
    if (!nombre) return null;
    let k = claveNombre(nombre); k = ALIAS[k] || k;
    const tk = k.split(' ').filter(x => x.length > 1);
    for (const p of this.lista) {
      const pk = p.clave.split(' ');
      if (p.clave === k) return p;
      const comunes = tk.filter(x => pk.includes(x)).length;
      // mismo nombre si todas las palabras de uno están en el otro y comparten al menos 2
      if (comunes >= 2 && (comunes === tk.length || comunes === pk.length)) return p;
    }
    return crear ? this.agregar(nombre) : null;
  }
}

// ---------- Construcción de la carga ----------
export function construirCarga(wb) {
  const avisos = [];
  const conv = [];
  const log = (codigo, campo, orig, nuevo, regla, fuente = FUENTE_XLSX) =>
    conv.push({ codigo_proyecto: codigo, campo, valor_original: orig === null || orig === undefined ? null : String(orig), valor_nuevo: nuevo === null || nuevo === undefined ? null : String(nuevo), regla, fuente });

  const H = {
    proyectos: hoja(wb, 'Proyectos'), historial: hoja(wb, 'Historial de fichas'), tareas: hoja(wb, 'Productos y tareas'),
    gobierno: hoja(wb, 'Proyectos de gobierno'), plan: hoja(wb, 'Plan 30-60-100'), alcalde: hoja(wb, 'Tareas del Alcalde'),
    seguimiento: hoja(wb, 'Seguimiento mensual'), personal: hoja(wb, 'Personal DICI'),
  };
  if (!H.proyectos) throw new Error('El archivo no tiene la pestaña «Proyectos».');
  for (const [k, n] of [['historial', 'Historial de fichas'], ['tareas', 'Productos y tareas'], ['gobierno', 'Proyectos de gobierno'], ['plan', 'Plan 30-60-100'], ['alcalde', 'Tareas del Alcalde']])
    if (!H[k]) avisos.push(`No se encontró la pestaña «${n}»; se omite.`);

  // Reglas generales (una sola vez)
  log(null, 'fecha_entrega_original', 'Sin dato de fecha original en la fuente', '= fecha vigente', 'La base solo trae «Fin vigente»; se toma como fecha original y vigente. Las reprogramaciones se registran desde ahora.');
  log(null, 'peso (tareas)', 'Sin peso en la fuente', '1 (igual para todas)', 'Todas las tareas importadas pesan igual. Ajuste los pesos en cada proyecto.');
  log(null, 'estado (tareas)', 'SEGUIMIENTO', 'En ejecución si tiene avance; No iniciada si no', 'Conversión de estados de tareas de la planilla.');
  log(null, 'avance', '% avance (sistema 29/09)', 'Avance manual justificado', 'Las tareas importadas no traen avance; para no perder el % reportado se deja como avance manual con justificación. Al cargar avances de tareas, el administrador puede desactivarlo.');

  // ---- Personas ----
  const reg = new Registro();
  const UNI_DICI = d => /ucilu/i.test(d) ? 'UCILU' : /uitd|uita/i.test(d) ? 'UITD' : null;
  for (const f of H.personal || []) {
    const dep = txt(col(f, 'Dependencia')) || '';
    const u = UNI_DICI(dep);
    reg.agregar(txt(col(f, 'Nombre')), { cargo: txt(col(f, 'Puesto')), unidad: u, direccion: u || /dici/i.test(dep) ? 'DICI' : null, prioridad: true });
  }
  for (const p of PERSONAS_DEDH) reg.agregar(p.nombre, { cargo: p.cargo, unidad: p.unidad, direccion: 'DEDH', prioridad: true, porValidar: p.unidad === null, fuenteDEDH: true });

  // ---- Historial de fichas, indexado por proyecto ----
  const fichas = {};
  for (const f of H.historial || []) {
    const id = txt(col(f, 'ID')); const per = periodoDe(col(f, 'Periodo'));
    if (!id || !per) continue;
    (fichas[id] = fichas[id] || []).push({ f, per, ficha: /2/.test(txt(col(f, 'Matriz')) || '') ? 'F-2' : 'F-1' });
  }
  const ultima = (id, ficha) => (fichas[id] || []).filter(x => x.ficha === ficha).sort((a, b) => b.per.localeCompare(a.per))[0];

  // ---- Proyectos de gobierno: códigos vinculados ----
  const pgDe = {};
  for (const f of H.gobierno || []) {
    const cod = txt(col(f, 'Código')); const v = txt(col(f, 'Proyectos SMCI vinculados'));
    if (!cod || !v) continue;
    v.split(',').map(s => s.trim()).forEach(s => { const n = (/(\d+)/.exec(s) || [])[1]; if (n) { const c = 'SMCI-' + n.padStart(2, '0'); (pgDe[c] = pgDe[c] || []).includes(cod) || pgDe[c].push(cod); } });
  }

  // ---- Tareas (primero, para fechas de inicio) ----
  const tareas = [];
  const hoy = hoyISO();
  for (const f of H.tareas || []) {
    const proyecto = txt(col(f, 'ID proyecto')); const nombre = txt(col(f, 'Descripción'));
    if (!proyecto || !nombre) continue;
    const resp = txt(col(f, 'Responsable'));
    const esEquipo = !resp || /por definir|^equipo|^(ucilu|uitd|uita|uiee|used|dici|dedh|smci)$/i.test(resp.trim());
    const persona = esEquipo ? null : reg.buscar(resp);
    const plan = iso(col(f, 'Fin plan')), nueva = iso(col(f, 'Nueva fecha fin')), real = iso(col(f, 'Fecha real'));
    const eo = txt(col(f, 'Estado')) || '';
    let av = pctv(col(f, '% avance'));
    let estado = /conclu/i.test(eo) ? 'Concluida' : (av > 0 ? 'En ejecución' : 'No iniciada');
    if (/cancel|inviable/i.test(eo)) estado = 'Cancelada';
    if (estado === 'Concluida') { if (av !== 100) log(proyecto, 'avance tarea ' + (txt(col(f, 'ID ítem')) || ''), av, 100, 'Tarea concluida: avance 100 %.'); av = 100; }
    if (/completar/i.test(eo)) log(proyecto, 'estado tarea ' + (txt(col(f, 'ID ítem')) || ''), eo, estado, '«CONCLUIDO - COMPLETAR» se toma como Concluida; verifique la evidencia.');
    const t = {
      proyecto, codigo: txt(col(f, 'ID ítem')), tipo: ['Tarea', 'Hito', 'Producto'].includes(txt(col(f, 'Tipo'))) ? txt(col(f, 'Tipo')) : 'Tarea',
      nombre, responsable: persona ? persona.nombre : null, responsable_texto: persona ? null : resp,
      fecha_inicio: iso(col(f, 'Inicio')), fecha_fin_original: plan || nueva, fecha_fin_vigente: nueva || plan,
      avance: av || 0, estado, evidencia: real ? `Cumplida el ${fecha(real)}` : null,
      observaciones: [txt(col(f, 'Observaciones')), txt(col(f, 'Estado de plazo')) ? 'Plazo en origen: ' + txt(col(f, 'Estado de plazo')) : null].filter(Boolean).join(' · ') || null,
      orden: tareas.filter(x => x.proyecto === proyecto).length,
    };
    if (plan && nueva && plan !== nueva) t.reprogramacion = { fecha_anterior: plan, fecha_nueva: nueva, motivo: `Reprogramación registrada en la base SMCI 2026 (estado en origen: ${eo || 's/d'}).` };
    else if (!plan && nueva && /reprogram/i.test(eo)) log(proyecto, 'tarea ' + (t.codigo || nombre), 'REPROGRAMADO sin fecha original', fecha(nueva), 'Se registra la nueva fecha como original y vigente; la fecha anterior no consta en la fuente.');
    tareas.push(t);
  }

  // ---- Seguimiento mensual ----
  const reportes = [];
  for (const f of H.seguimiento || []) {
    const id = txt(col(f, 'ID')); const per = periodoDe(col(f, 'Periodo'));
    if (!id || !per) continue;
    const er = txt(col(f, 'Estado de reporte')) || '', e = txt(col(f, 'Estado')) || '';
    const estado = /no reportad/i.test(er) ? 'No reportada' : convertirEstado(e || er);
    reportes.push({ proyecto: id, periodo: per, ficha: 'Seguimiento', avance: pctv(col(f, '% avance real')), estado, estado_origen: [e, er].filter(Boolean).join(' / '),
      problema_resultado: txt(col(f, 'Avance o resultado')), proximo_paso: txt(col(f, 'Próximo paso')),
      fuente: ['Seguimiento mensual', txt(col(f, 'Responsable del reporte')), txt(col(f, 'Observaciones'))].filter(Boolean).join(' · ') });
  }
  // Fichas F-1/F-2
  for (const [id, xs] of Object.entries(fichas)) for (const { f, per, ficha } of xs) {
    const eo = txt(col(f, 'Estado'));
    reportes.push({ proyecto: id, periodo: per, ficha, estado: convertirEstado(eo), estado_origen: eo,
      problema_resultado: txt(col(f, 'Problema o resultado')), linea_base: txt(col(f, 'Línea base')), medida: txt(col(f, 'Medida o acción')),
      resultado_cuantitativo: txt(col(f, 'Resultado cuantitativo')), beneficiarios: txt(col(f, 'Beneficiarios')),
      proximo_paso: txt(col(f, 'Próximo paso')), evidencia_texto: txt(col(f, 'Evidencia')),
      fuente: [txt(col(f, 'Código')), txt(col(f, 'Fuente'))].filter(Boolean).join(' · ') });
  }

  // ---- Proyectos ----
  const proyectos = [], evidencias = [];
  const mesActual = hoy.slice(0, 7) + '-01';
  for (const f of H.proyectos) {
    const codigo = txt(col(f, 'ID')); const nombre = txt(col(f, 'Proyecto'));
    if (!codigo || !nombre) continue;
    const dirTxt = txt(col(f, 'Dirección')) || '', uniTxt = txt(col(f, 'Unidad')) || '';
    const ajuste = AJUSTES_DEDH[codigo] || {};
    let respNom = txt(col(f, 'Responsable'));
    let persona = respNom ? reg.buscar(respNom) : null;
    if (ajuste.responsable) {
      const nuevo = reg.buscar(ajuste.responsable);
      log(codigo, 'responsable', persona ? persona.nombre : respNom, nuevo.nombre, 'Dato más reciente de la DEDH.', FUENTE_DEDH);
      persona = nuevo;
    }

    // Unidad
    let unidad = null, porValidar = false, motivo = [];
    const exp = /ucilu/i.test(uniTxt) ? 'UCILU' : /uita|uitd/i.test(uniTxt) ? 'UITD' : /uiee/i.test(uniTxt) ? 'UIEE' : /used/i.test(uniTxt) ? 'USED' : /maestranza/i.test(uniTxt) ? 'UIEE' : null;
    if (exp) {
      unidad = exp;
      if (/uita/i.test(uniTxt)) log(codigo, 'unidad', uniTxt, 'UITD', 'La UITA pasó a llamarse UITD.');
      if (/maestranza/i.test(uniTxt)) log(codigo, 'unidad', uniTxt, 'UIEE', 'La Maestranza depende de la UIEE (organigrama DEDH).');
    }
    if (ajuste.unidad && ajuste.unidad !== unidad) { log(codigo, 'unidad', uniTxt, ajuste.unidad, 'Unidad del responsable según la DEDH.', FUENTE_DEDH); unidad = ajuste.unidad; }
    if (!unidad && persona && persona.unidad) {
      unidad = persona.unidad; porValidar = true;
      motivo.push(`Unidad inferida (${unidad}) por el responsable; en la fuente figura «${uniTxt || '—'}»`);
      log(codigo, 'unidad', uniTxt, unidad, 'Unidad inferida por la unidad del responsable. Queda «Por validar».', persona.fuenteDEDH ? FUENTE_DEDH : 'Personal DICI');
    }
    if (!unidad) {
      porValidar = true;
      motivo.push(persona && persona.porValidar ? `La DEDH indica «unidad por validar» para ${persona.nombre}` : `Sin unidad en la fuente («${uniTxt || '—'}»)`);
      log(codigo, 'unidad', uniTxt, 'Por validar', 'Proyecto sin unidad: queda «Por validar».');
    }
    if (!persona) { porValidar = true; motivo.push('Sin responsable'); log(codigo, 'responsable', respNom, 'Por validar', 'Proyecto sin responsable: queda «Por validar».'); }
    let direccion = /dedh/i.test(dirTxt) ? 'DEDH' : /dici/i.test(dirTxt) ? 'DICI' : null;
    if (unidad) direccion = ['UIEE', 'USED', 'DESP-DEDH'].includes(unidad) ? 'DEDH' : 'DICI';
    if (!direccion) { direccion = (persona && persona.direccion) || 'DICI'; log(codigo, 'dirección', dirTxt, direccion, 'Dirección tomada del responsable.'); }

    // Avance
    const segs = reportes.filter(r => r.proyecto === codigo && r.ficha === 'Seguimiento' && r.avance !== null).sort((a, b) => b.periodo.localeCompare(a.periodo));
    let avance = pctv(col(f, '% avance'));
    let fuenteAv = '% avance (sistema 29/09)';
    if (avance === null && segs[0]) { avance = segs[0].avance; fuenteAv = 'Seguimiento mensual ' + segs[0].periodo.slice(0, 7); }

    // Estado
    const eF2 = txt(col(f, 'Estado del resultado')), eF1 = txt(col(f, 'Estado del problema'));
    const eOrig = eF2 || eF1;
    let estado = convertirEstado(eOrig);
    let reglaE = eF2 ? 'Estado de la última ficha F-2.' : 'Sin F-2: estado de la última ficha F-1.';
    if (!estado) { estado = avance > 0 ? 'En ejecución' : 'No iniciada'; reglaE = 'Sin estado en la fuente: se asigna según el avance.'; }

    // Evidencias de las fichas
    const evs = [...new Set((fichas[codigo] || []).flatMap(x => (txt(col(x.f, 'Evidencia')) || '').split(/;|\n/).map(s => s.trim()).filter(s => s.length > 3)))];
    evs.forEach(e => evidencias.push({ proyecto: codigo, tipo: 'referencia', nombre: e }));

    if (estado === 'Concluida') {
      if (avance === null) { log(codigo, 'avance', null, 100, 'Concluido en origen sin % de avance: se asume 100 %.'); avance = 100; }
      else if (avance < 100) { log(codigo, 'estado', eOrig, 'En ejecución', `Concluido en origen pero con ${avance} %: «Concluida» exige 100 %.`); estado = 'En ejecución'; reglaE = null; }
      if (estado === 'Concluida' && !evs.length) { log(codigo, 'estado', eOrig, 'En ejecución', '«Concluida» exige al menos una evidencia y la fuente no registra ninguna.'); estado = 'En ejecución'; reglaE = null; }
    }
    if (reglaE) log(codigo, 'estado', eOrig, estado, reglaE);

    const ultimoRep = periodoDe(col(f, 'Último reporte'));
    const pgTxt = txt(col(f, 'Proyecto de gobierno'));
    let codGob = pgTxt ? ((/^(\d+(?:\.\d+)?)/.exec(pgTxt) || [])[1] || null) : null;
    if (!codGob && pgDe[codigo]) { codGob = pgDe[codigo].join(', '); log(codigo, 'codigo_gobierno', null, codGob, 'Tomado de «Proyectos de gobierno» (proyectos SMCI vinculados).'); }

    const f1 = ultima(codigo, 'F-1'), f2 = ultima(codigo, 'F-2');
    const ini = tareas.filter(t => t.proyecto === codigo && t.fecha_inicio).map(t => t.fecha_inicio).sort()[0] || null;
    const vig = iso(col(f, 'Fin vigente'));
    const p = {
      codigo, nombre, direccion, unidad, responsable: persona ? persona.nombre : null, apoyos: [],
      codigo_gobierno: codGob,
      descripcion: f1 ? txt(col(f1.f, 'Problema o resultado')) : null,
      objetivo: txt(col(f, 'Último resultado reportado')),
      fecha_inicio: ini, fecha_entrega_original: vig, fecha_entrega_vigente: vig,
      estado, avance: avance ?? 0,
      avance_manual: (avance ?? 0) > 0,
      avance_manual_justificacion: (avance ?? 0) > 0 ? `Avance importado de la base SMCI 2026 (${fuenteAv}). Las tareas importadas no traen avance ponderado.` : null,
      observaciones_falta: txt(col(f, 'Observaciones')),
      situacion_actual: txt(col(f, 'Situación a noviembre')) || txt(col(f, 'Situación')),
      proximo_paso: txt(col(f, 'Próximo paso declarado')),
      beneficiarios: f2 ? txt(col(f2.f, 'Beneficiarios')) : (f1 ? txt(col(f1.f, 'Beneficiarios')) : null),
      por_validar: porValidar, por_validar_motivo: motivo.join('; ') || null,
      ultima_actualizacion: ultimoRep ? finDeMes(ultimoRep) : null,
    };
    // Ajustes de la DEDH (más recientes)
    for (const k of ['situacion_actual', 'presupuesto_programado', 'presupuesto_ejecutado']) {
      if (ajuste[k] !== undefined && ajuste[k] !== p[k]) { log(codigo, k, p[k], ajuste[k], 'Dato más reciente de la DEDH.', FUENTE_DEDH); p[k] = ajuste[k]; }
    }
    if (ajuste.apoyos) { p.apoyos = ajuste.apoyos.map(n => reg.buscar(n).nombre); log(codigo, 'apoyos', null, p.apoyos.join(', '), 'Responsables de apoyo según la DEDH.', FUENTE_DEDH); }
    if (persona && !persona.unidad && unidad) persona.unidad = unidad;
    proyectos.push(p);

    // Meses sin ficha → «No reportada» en el historial (desde el primer reporte hasta el mes anterior)
    const meses = reportes.filter(r => r.proyecto === codigo).map(r => r.periodo).sort();
    if (meses.length && estado !== 'Concluida') {
      for (let m = meses[0]; m < mesActual; m = sigMes(m)) {
        if (!reportes.some(r => r.proyecto === codigo && r.periodo === m)) {
          reportes.push({ proyecto: codigo, periodo: m, ficha: 'Seguimiento', estado: 'No reportada', estado_origen: 'Sin ficha',
            fuente: 'Derivado en la carga: sin ficha al cierre del mes' });
          log(codigo, 'historial ' + m.slice(0, 7), 'Sin ficha ese mes', 'No reportada', 'Mes sin ficha después del primer reporte: se registra «No reportada» en el historial.');
        }
      }
    }
  }

  // ---- Catálogos ----
  const gobierno = (H.gobierno || []).filter(f => txt(col(f, 'Proyecto de gobierno'))).map(f => ({
    codigo: txt(col(f, 'Código')), nombre: txt(col(f, 'Proyecto de gobierno')), direccion: txt(col(f, 'Dirección')),
    responsable: txt(col(f, 'Responsable')), estado_origen: txt(col(f, 'Estado')), situacion: txt(col(f, 'Situación')),
    pendiente: txt(col(f, 'Pendiente principal')), proyectos_vinculados: txt(col(f, 'Proyectos SMCI vinculados')),
    seguimiento_sistema: txt(col(f, 'Seguimiento en sistema')),
  }));
  const compromisos = [];
  for (const f of H.plan || []) {
    const act = txt(col(f, 'Actividad')); if (!act) continue;
    const eo = txt(col(f, 'Estado')), e = convertirEstado(eo);
    const n = txt(col(f, 'N.º'));
    compromisos.push({ origen: 'Plan 30-60-100', numero: n ? String(parseInt(n, 10) || n) : null, actividad: act, direccion: txt(col(f, 'Dirección')),
      responsable: txt(col(f, 'Responsable')), plazo: txt(col(f, 'Plazo')), estado_origen: eo, estado: e, situacion: txt(col(f, 'Avance documentado')) });
    log('Plan 30-60-100 N.º ' + (n ? parseInt(n, 10) : ''), 'estado', eo, e, 'Conversión de estado del Plan 30-60-100.');
  }
  for (const f of H.alcalde || []) {
    const t = txt(col(f, 'Tarea')); if (!t) continue;
    const eo = txt(col(f, 'Estado')), e = convertirEstado(eo);
    compromisos.push({ origen: 'Tareas del Alcalde', numero: txt(col(f, 'Registro')), actividad: t, direccion: txt(col(f, 'Dirección')),
      origen_detalle: txt(col(f, 'Origen')), plazo: txt(col(f, 'Plazo')), estado_origen: eo, estado: e, situacion: txt(col(f, 'Situación actual')) });
    log('Tarea del Alcalde ' + txt(col(f, 'Registro')), 'estado', eo, e, 'Conversión de estado de Tareas del Alcalde.');
  }

  const personas = reg.lista.map(p => ({ nombre: p.nombre, cargo: p.cargo || null, unidad: p.unidad || null, direccion: p.direccion || null }));
  const codigos = new Set(proyectos.map(p => p.codigo));
  const huerfanas = tareas.filter(t => !codigos.has(t.proyecto)).length;
  if (huerfanas) avisos.push(`${huerfanas} tareas apuntan a proyectos que no están en la pestaña «Proyectos»; se omiten.`);

  return {
    carga: { reemplazar: true, personas, proyectos, tareas, reportes, evidencias, conversiones: conv, gobierno, compromisos },
    avisos,
  };
}

// ---------- Interfaz ----------
export function Importador({ ctx }) {
  const [carga, setCarga] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function leer(e) {
    setErr(''); setRes(null); setCarga(null);
    const f = e.target.files[0]; if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      const r = construirCarga(wb);
      setCarga(r.carga); setAvisos(r.avisos);
    } catch (x) { setErr('No se pudo leer el archivo: ' + x.message); }
  }
  async function importar() {
    if (!confirm('La carga REEMPLAZA todos los proyectos, tareas, reportes y evidencias actuales. ¿Continuar?')) return;
    setOcupado(true);
    const { data, error } = await sb.rpc('importar_base', { p: carga });
    setOcupado(false);
    if (error) return setErr(mensajeError(error));
    setRes(data); ctx.recargar();
  }
  const c = carga;
  return html`<div class="panel">
    <h3>Importar «Base de datos de proyectos SMCI 2026»</h3>
    <p class="ayuda">Descargue la hoja como .xlsx y súbala aquí. Se leen las pestañas Proyectos, Historial de fichas, Productos y tareas, Proyectos de gobierno, Plan 30-60-100, Tareas del Alcalde, Seguimiento mensual y Personal DICI. Después se aplican los datos de la DEDH del ${FUENTE_DEDH.match(/\((.*)\)/)[1]} (la fuente más reciente).</p>
    <${Aviso} tipo="error">${err}<//>
    <div class="filtros"><label>Archivo .xlsx<input type="file" accept=".xlsx,.xlsm,.xls" onChange=${leer} /></label></div>
    ${avisos.map(a => html`<${Aviso} tipo="atencion">${a}<//>`)}
    ${c && html`<div style="margin-top:1rem">
      <div class="rejilla kpis">
        ${[['Proyectos', c.proyectos.length], ['Tareas', c.tareas.length], ['Reportes mensuales', c.reportes.length], ['Evidencias', c.evidencias.length],
           ['Personas', c.personas.length], ['Conversiones', c.conversiones.length], ['Por validar', c.proyectos.filter(p => p.por_validar).length],
           ['Proyectos de gobierno', c.gobierno.length], ['Compromisos', c.compromisos.length]].map(([t, v]) => html`<div class="kpi"><div class="v">${v}</div><div class="t">${t}</div></div>`)}
      </div>
      <div class="acciones" style="margin-top:1rem"><button class="prim" disabled=${ocupado} onClick=${importar}>${ocupado ? 'Importando…' : 'Importar (reemplaza los datos actuales)'}</button>
        <button onClick=${() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' })); a.download = 'carga_inicial.json'; a.click(); }}>Descargar la carga en JSON</button></div>
    </div>`}
    ${res && html`<${Aviso} tipo="ok">Carga terminada: ${Object.entries(res).map(([k, v]) => `${v} ${k}`).join(' · ')}. Revise la lista de conversiones más abajo.<//>`}
  </div>`;
}
