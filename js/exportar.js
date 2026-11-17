// Exportación completa: Excel con todas las hojas y PDF con diagrama de Gantt.
// Respeta los permisos: cada usuario exporta solo lo que puede ver (el administrador, todo).
import { sb, fecha, fechaHora, pct, bs, hoyISO, nombreMes, diasEntre, codigoTexto } from './lib.js';
import { queFaltaTexto } from './componentes.js';

const COLOR = { verde: [46, 125, 79], amarillo: [201, 138, 0], rojo: [192, 57, 43], gris: [138, 151, 158], sin_fecha: [138, 151, 158] };
const ETAPA = { proyecto: 'Datos del proyecto', reprogramar_proyecto: 'Reprogramación del proyecto', crear_tarea: 'Nueva tarea',
  tarea: 'Cambio de tarea', reprogramar_tarea: 'Reprogramación de tarea', reporte: 'Reporte mensual', evidencia: 'Evidencia', crear_proyecto: 'Nuevo proyecto' };

async function todo(ids) {
  const enIds = q => ids.length ? q.in('proyecto_id', ids) : q;
  const [t, rp, rm, ev, pr, bi] = await Promise.all([
    enIds(sb.from('tareas').select('*')).order('orden'),
    enIds(sb.from('reprogramaciones').select('*')).order('creado_en'),
    enIds(sb.from('reportes_mensuales').select('*')).order('periodo'),
    enIds(sb.from('evidencias').select('*')).order('creado_en'),
    sb.from('propuestas').select('*').order('creado_en').limit(5000),
    enIds(sb.from('bitacora').select('*')).order('creado_en', { ascending: false }).limit(5000),
  ]);
  return { tareas: t.data || [], reprog: rp.data || [], reportes: rm.data || [], evid: ev.data || [], propuestas: pr.data || [], bitacora: bi.data || [] };
}

function mesesEntre(a, b) {
  const r = []; let [y, m] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  while (y < yb || (y === yb && m <= mb)) { r.push(`${y}-${String(m).padStart(2, '0')}-01`); m++; if (m > 12) { m = 1; y++; } }
  return r;
}
const iniDe = (x) => x.fecha_inicio || x.fecha_entrega_original || x.fecha_fin_original || x.fecha_entrega_vigente || x.fecha_fin_vigente;
const finDe = (x) => x.fecha_entrega_vigente || x.fecha_fin_vigente || x.fecha_entrega_original || x.fecha_fin_original;

// ---------------------------------------------------------------- Excel
export async function exportarTodoExcel(proyectos, ctx, sufijo = '') {
  const ids = proyectos.map(p => p.id);
  const d = await todo(ids);
  const cod = Object.fromEntries(proyectos.map(p => [p.id, codigoTexto(p)]));
  const per = id => (ctx.cat.personas.find(x => x.id === id) || {}).nombre || '';
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, filas) => { const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin datos': '' }]); XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31)); };

  hoja('Proyectos', proyectos.map(p => ({
    'Código estratégico': p.codigo_estrategico || '', 'Código SMCI': p.codigo_estrategico && p.codigo === p.codigo_estrategico ? '' : p.codigo, 'Cód. gobierno': p.codigo_gobierno || '', 'Proyecto': p.nombre, 'Dirección': p.direccion_sigla,
    'Unidad': p.unidad_sigla || 'Por validar', 'Responsable': p.responsable_nombre || '', 'Apoyo': p.apoyos_nombres || '',
    'Estado': p.estado, '% avance': Number(p.avance || 0), 'Inicio': fecha(p.fecha_inicio), 'Entrega original': fecha(p.fecha_entrega_original),
    'Entrega vigente': fecha(p.fecha_entrega_vigente), 'N.º reprogramaciones': p.n_reprogramaciones, 'Semáforo': p.semaforo,
    'Presupuesto programado (Bs)': p.presupuesto_programado ?? '', 'Presupuesto ejecutado (Bs)': p.presupuesto_ejecutado ?? '',
    'Situación actual': p.situacion_actual || '', 'Próximo paso': p.proximo_paso || '', 'Qué falta': queFaltaTexto(p),
    'Pendientes de validación': p.n_mod_pendientes || 0, 'Última actualización': fechaHora(p.ultima_actualizacion),
  })));
  hoja('Tareas', d.tareas.map(t => ({
    'Proyecto': cod[t.proyecto_id], 'Código': t.codigo || '', 'Tipo': t.tipo, 'Tarea': t.nombre, 'Responsable': per(t.responsable_id) || t.responsable_texto || '',
    'Inicio': fecha(t.fecha_inicio), 'Fin original': fecha(t.fecha_fin_original), 'Fin vigente': fecha(t.fecha_fin_vigente),
    'Peso': Number(t.peso), '% avance': Number(t.avance), 'Estado': t.estado, 'Evidencia': t.evidencia || '',
  })));
  // Gantt en celdas: una columna por mes, ■ en los meses que dura cada proyecto o tarea
  const filasG = [];
  for (const p of proyectos) {
    filasG.push({ nivel: 'Proyecto', codigo: codigoTexto(p), nombre: p.nombre, ini: iniDe(p), fin: finDe(p), avance: p.avance, estado: p.estado });
    for (const t of d.tareas.filter(x => x.proyecto_id === p.id))
      filasG.push({ nivel: '  Tarea', codigo: codigoTexto(p), nombre: t.nombre, ini: iniDe(t), fin: finDe(t), avance: t.avance, estado: t.estado });
  }
  const conF = filasG.filter(f => f.ini && f.fin);
  if (conF.length) {
    const meses = mesesEntre(conF.map(f => f.ini).sort()[0].slice(0, 7), conF.map(f => f.fin).sort().reverse()[0].slice(0, 7));
    const hoyM = hoyISO().slice(0, 7);
    const aoa = [['Nivel', 'Código', 'Nombre', 'Inicio', 'Fin vigente', '% avance', 'Estado', ...meses.map(m => nombreMes(m).slice(0, 3) + ' ' + m.slice(2, 4) + (m.slice(0, 7) === hoyM ? ' (hoy)' : ''))]];
    for (const f of filasG) aoa.push([f.nivel, f.codigo, f.nombre, fecha(f.ini), fecha(f.fin), Number(f.avance || 0), f.estado,
      ...meses.map(m => f.ini && f.fin && m.slice(0, 7) >= f.ini.slice(0, 7) && m.slice(0, 7) <= f.fin.slice(0, 7) ? '■' : '')]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 9 }, { wch: 9 }, { wch: 45 }, { wch: 11 }, { wch: 11 }, { wch: 8 }, { wch: 12 }, ...meses.map(() => ({ wch: 7 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'Gantt');
  }
  hoja('Reprogramaciones', d.reprog.map(r => ({ 'Proyecto': cod[r.proyecto_id], 'Qué': r.entidad === 'proyecto' ? 'Proyecto' : 'Tarea: ' + r.tarea_nombre,
    'Fecha anterior': fecha(r.fecha_anterior), 'Fecha nueva': fecha(r.fecha_nueva), 'Motivo': r.motivo, 'Quién': r.usuario_nombre, 'Cuándo': fechaHora(r.creado_en) })));
  hoja('Reportes mensuales', d.reportes.map(r => ({ 'Proyecto': cod[r.proyecto_id], 'Mes': nombreMes(r.periodo), 'Ficha': r.ficha, 'Estado': r.estado || '',
    '% avance': r.avance ?? '', 'Resultado / problema': r.problema_resultado || '', 'Resultado cuantitativo': r.resultado_cuantitativo || '',
    'Beneficiarios': r.beneficiarios || '', 'Próximo paso': r.proximo_paso || '', 'Evidencias': r.evidencia_texto || '' })));
  hoja('Evidencias', d.evid.map(e => ({ 'Proyecto': cod[e.proyecto_id], 'Evidencia': e.nombre, 'Tipo': e.tipo, 'Enlace': e.url || '', 'Registrada': fechaHora(e.creado_en) })));
  hoja('Validaciones', d.propuestas.filter(x => !x.proyecto_id || ids.includes(x.proyecto_id)).map(x => ({
    'Proyecto': cod[x.proyecto_id] || (x.datos?.codigo ? x.datos.codigo + ' (nuevo)' : ''), 'Tipo': ETAPA[x.tipo] || x.tipo,
    'Propuesto por': x.creado_por_nombre, 'Fecha': fechaHora(x.creado_en), 'Estado': x.estado,
    'Revisado por': x.revisado_por_nombre || '', 'Revisado el': fechaHora(x.revisado_en), 'Observación': x.observacion || '',
    'Cambios': (x.resumen || []).map(c => `${c.campo}: ${c.antes ?? '—'} → ${c.ahora ?? '—'}`).join(' | ') })));
  if (ctx.perfil.rol === 'admin') hoja('Bitácora', d.bitacora.map(b => ({ 'Proyecto': cod[b.proyecto_id] || '', 'Fecha': fechaHora(b.creado_en), 'Usuario': b.usuario_nombre,
    'Registro': b.tabla, 'Acción': b.accion, 'Campo': b.campo, 'Antes': (b.valor_anterior || '').slice(0, 500), 'Ahora': (b.valor_nuevo || '').slice(0, 500) })));
  XLSX.writeFile(wb, `informacion_completa_smci${sufijo}_${hoyISO().split('-').reverse().join('-')}.xlsx`);
}

// ---------------------------------------------------------------- PDF con Gantt
function dibujarGantt(doc, titulo, filas, y) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const x0 = 36, etiq = 230, x1 = W - 36, ancho = x1 - x0 - etiq, alto = 15;
  const conF = filas.filter(f => f.ini && f.fin);
  if (!conF.length) { doc.setFontSize(9); doc.text('Sin fechas para dibujar el diagrama.', x0, y + 12); return y + 24; }
  const hoy = hoyISO();
  let min = [...conF.map(f => f.ini), hoy].sort()[0].slice(0, 8) + '01';
  let max = [...conF.map(f => f.fin), ...conF.map(f => f.orig).filter(Boolean), hoy].sort().reverse()[0];
  const total = Math.max(1, diasEntre(min, max) + 10);
  const px = d => x0 + etiq + (diasEntre(min, d) / total) * ancho;
  const meses = mesesEntre(min.slice(0, 7), max.slice(0, 7));
  const cabecera = () => {
    doc.setFontSize(11); doc.setTextColor(20); doc.text(titulo, x0, y); y += 10;
    doc.setFontSize(6.5); doc.setTextColor(110);
    const paso = Math.ceil(meses.length / 24);
    meses.forEach((m, i) => { const x = px(m); doc.setDrawColor(225); doc.line(x, y, x, y + 6); if (i % paso === 0) doc.text(nombreMes(m).slice(0, 3) + ' ' + m.slice(2, 4), x + 1, y + 6); });
    y += 10;
  };
  cabecera();
  for (const f of filas) {
    if (y + alto > H - 40) { doc.addPage(); y = 40; cabecera(); }
    doc.setFontSize(f.nivel === 1 ? 7.5 : 7); doc.setTextColor(f.nivel === 1 ? 20 : 70);
    const txt = doc.splitTextToSize((f.nivel === 1 ? '' : '   · ') + f.etiqueta, etiq - 8)[0];
    doc.text(txt, x0, y + 10);
    doc.setDrawColor(238); doc.line(x0, y + alto, x1, y + alto);
    if (f.ini && f.fin) {
      const a = px(f.ini), b = Math.max(px(f.fin), a + 2);
      const c = COLOR[f.semaforo] || [35, 99, 127];
      doc.setFillColor(...c.map(v => Math.min(255, v + 120))); doc.rect(a, y + 3, b - a, alto - 7, 'F');
      doc.setFillColor(...c); doc.rect(a, y + 3, (b - a) * Math.min(1, (f.avance || 0) / 100), alto - 7, 'F');
      if (f.orig && f.orig !== f.fin) { doc.setDrawColor(90); doc.setLineDashPattern([2, 2], 0); doc.line(px(f.orig), y + 1, px(f.orig), y + alto - 1); doc.setLineDashPattern([], 0); }
      doc.setFontSize(6); doc.setTextColor(60); doc.text(pct(f.avance), Math.min(b + 3, x1 - 20), y + 10);
    }
    y += alto;
  }
  const xh = px(hoy); doc.setDrawColor(179, 38, 30); doc.setLineWidth(0.8);
  doc.setFontSize(6); doc.setTextColor(179, 38, 30); doc.text('Hoy ' + fecha(hoy), Math.min(xh + 2, x1 - 40), y + 9);
  doc.setLineWidth(0.2);
  return y + 18;
}

export async function exportarTodoPDF(proyectos, ctx, subtitulo) {
  const d = await todo(proyectos.map(p => p.id));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(24, 70, 92); doc.rect(0, 0, W, 90, 'F');
  doc.setTextColor(255); doc.setFontSize(10); doc.text('Gobierno Autónomo Municipal de La Paz · Secretaría Municipal de Ciudad Inteligente', 36, 34);
  doc.setFontSize(20); doc.text(ctx.perfil.rol === 'admin' ? 'Informe consolidado de proyectos SMCI' : 'Informe de proyectos', 36, 62);
  doc.setTextColor(60); doc.setFontSize(10);
  doc.text(`${subtitulo || 'Sin filtros'}   ·   ${proyectos.length} proyectos   ·   Generado el ${fechaHora(new Date())} (hora de La Paz)`, 36, 112);
  const prom = proyectos.length ? proyectos.reduce((a, p) => a + Number(p.avance || 0), 0) / proyectos.length : 0;
  const cuenta = e => proyectos.filter(p => p.estado === e).length;
  doc.text(`Avance promedio ${pct(+prom.toFixed(1))} · En ejecución ${cuenta('En ejecución')} · Concluidos ${cuenta('Concluida')} · No reportados ${cuenta('No reportada')} · Vencidos ${proyectos.filter(p => p.vencido).length} · Pendientes de validación ${proyectos.reduce((a, p) => a + (p.n_mod_pendientes || 0), 0)}`, 36, 128);
  doc.autoTable({
    startY: 142, head: [['Código', 'Proyecto', 'Unidad', 'Responsable', 'Estado', 'Avance', 'Entrega orig.', 'Entrega vig.', 'Reprog.', 'Por validar']],
    body: proyectos.map(p => [codigoTexto(p), p.nombre, p.unidad_sigla || 'Por validar', p.responsable_nombre || '', p.estado, pct(p.avance),
      fecha(p.fecha_entrega_original), fecha(p.fecha_entrega_vigente), String(p.n_reprogramaciones), String(p.n_mod_pendientes || 0)]),
    styles: { fontSize: 7, cellPadding: 2.5 }, headStyles: { fillColor: [24, 70, 92] }, columnStyles: { 1: { cellWidth: 230 } }, margin: { left: 36, right: 36 },
  });
  // Gantt consolidado
  doc.addPage();
  let y = dibujarGantt(doc, 'Diagrama de Gantt · proyectos (barra = inicio → entrega vigente; relleno = avance; línea punteada = entrega original)',
    proyectos.map(p => ({ nivel: 1, etiqueta: `${codigoTexto(p)} · ${p.nombre}`, ini: iniDe(p), fin: finDe(p), orig: p.fecha_entrega_original, avance: Number(p.avance || 0), semaforo: p.semaforo })), 40);
  // Ficha por proyecto con su Gantt de tareas
  for (const p of proyectos) {
    doc.addPage();
    doc.setFontSize(13); doc.setTextColor(20); doc.text(doc.splitTextToSize(`${codigoTexto(p)} · ${p.nombre}`, W - 72), 36, 40);
    doc.autoTable({
      startY: 58, theme: 'plain', styles: { fontSize: 7.5, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 } }, margin: { left: 36, right: 36 },
      body: [
        ['Dirección / unidad', `${p.direccion_sigla} / ${p.unidad_sigla || 'Por validar'}`],
        ['Responsable', `${p.responsable_nombre || '—'}${p.apoyos_nombres ? ' · Apoyo: ' + p.apoyos_nombres : ''}`],
        ['Estado / avance', `${p.estado} · ${pct(p.avance)} · semáforo ${p.semaforo}`],
        ['Entrega original / vigente', `${fecha(p.fecha_entrega_original)} / ${fecha(p.fecha_entrega_vigente)} · ${p.n_reprogramaciones} reprogramación(es)`],
        ['Presupuesto prog. / ejec.', `${bs(p.presupuesto_programado)} / ${bs(p.presupuesto_ejecutado)}`],
        ['Situación actual', p.situacion_actual || '—'], ['Próximo paso', p.proximo_paso || '—'], ['Qué falta', queFaltaTexto(p) || '—'],
      ],
    });
    const ts = d.tareas.filter(t => t.proyecto_id === p.id);
    y = doc.lastAutoTable.finalY + 14;
    if (ts.length) {
      y = dibujarGantt(doc, 'Tareas', [
        { nivel: 1, etiqueta: 'Proyecto completo', ini: iniDe(p), fin: finDe(p), orig: p.fecha_entrega_original, avance: Number(p.avance || 0), semaforo: p.semaforo },
        ...ts.map(t => ({ nivel: 2, etiqueta: `${t.nombre} (${t.estado})`, ini: iniDe(t), fin: finDe(t), orig: t.fecha_fin_original, avance: Number(t.avance || 0),
          semaforo: t.estado === 'Concluida' ? 'verde' : (t.fecha_fin_vigente && t.fecha_fin_vigente < hoyISO() ? 'rojo' : 'verde') })),
      ], y);
    }
    const rs = d.reportes.filter(r => r.proyecto_id === p.id).slice(-6);
    if (rs.length) doc.autoTable({ startY: y + 4, head: [['Mes', 'Ficha', 'Estado', 'Avance', 'Resultado']],
      body: rs.map(r => [nombreMes(r.periodo), r.ficha, r.estado || '', pct(r.avance), (r.resultado_cuantitativo || r.problema_resultado || '').slice(0, 260)]),
      styles: { fontSize: 6.5 }, headStyles: { fillColor: [24, 70, 92] }, margin: { left: 36, right: 36 } });
  }
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Página ${i} de ${n}`, W - 90, doc.internal.pageSize.getHeight() - 16); }
  doc.save(`informe_completo_gantt_${hoyISO().split('-').reverse().join('-')}.pdf`);
}
