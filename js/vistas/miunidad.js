import { html, useState, useEffect, sb, fecha, hoyISO, diasEntre, nombreMes, mesActualISO, mensajeError, codigoTexto, colorDir } from '../lib.js';
import { Estado, EstadoProyecto, Semaforo, Barra, Aviso, Codigo } from '../componentes.js';

export function MiUnidad({ ctx }) {
  const { perfil, cat } = ctx;
  const [ps, setPs] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [err, setErr] = useState('');
  const [sinUnidad, setSinUnidad] = useState([]);
  const esDirector = perfil.rol === 'director';
  const unidad = cat.unidades.find(u => u.id === perfil.unidad_id);
  const direccion = cat.direcciones.find(d => d.id === perfil.direccion_id);

  useEffect(() => {
    if (perfil.direccion_id) sb.from('v_proyectos').select('*').eq('gestion', ctx.gestion || 2026).is('unidad_id', null).eq('direccion_id', perfil.direccion_id).order('codigo')
      .then(({ data }) => setSinUnidad(data || []));
    let q = sb.from('v_proyectos').select('*').eq('gestion', ctx.gestion || 2026).order('fecha_entrega_vigente', { nullsFirst: false });
    q = esDirector ? q.eq('direccion_id', perfil.direccion_id) : q.eq('unidad_id', perfil.unidad_id);
    q.then(async ({ data, error }) => {
      if (error) return setErr(mensajeError(error));
      setPs(data);
      if (data.length) {
        const lim = new Date(Date.parse(hoyISO() + 'T00:00:00Z') + 15 * 86400000).toISOString().slice(0, 10);
        const t = await sb.from('tareas').select('id,nombre,proyecto_id,fecha_fin_vigente,avance,estado')
          .in('proyecto_id', data.map(p => p.id)).not('estado', 'in', '("Concluida","Cancelada")')
          .lte('fecha_fin_vigente', lim).order('fecha_fin_vigente');
        setTareas(t.data || []);
      }
    });
  }, []);

  if (err) return html`<${Aviso} tipo="error">${err}<//>`;
  if (!ps) return html`<div class="vacio">Cargando…</div>`;
  const hoy = hoyISO();
  const corte = Number(cat.config.dia_corte ?? 25);
  const fechaCorte = mesActualISO().slice(0, 8) + String(corte).padStart(2, '0');
  const dCorte = diasEntre(hoy, fechaCorte);
  const activos = ps.filter(p => !['Concluida', 'Cancelada'].includes(p.estado));
  const porActualizar = activos.filter(p => !p.actualizado_mes);
  const vencen = activos.filter(p => p.dias_restantes !== null && p.dias_restantes >= 0 && p.dias_restantes <= 15);
  const vencidos = activos.filter(p => p.vencido);
  const porValidar = ps.filter(p => p.por_validar);
  const cod = id => codigoTexto(ps.find(p => p.id === id));

  const Lista = ({ items, vacio, extra }) => items.length ? html`<div class="tabla-env"><table>
      <thead><tr><th>Código</th><th>Proyecto</th><th>Estado</th><th>Avance</th><th>Vigente</th><th></th>${extra && html`<th>${extra.titulo}</th>`}</tr></thead>
      <tbody>${items.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
        <td class="nowrap"><${Codigo} p=${p} /></td><td>${p.nombre}</td><td><${EstadoProyecto} p=${p} /></td>
        <td style="min-width:110px"><${Barra} v=${p.avance} /></td><td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
        <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>${extra && html`<td>${extra.valor(p)}</td>`}</tr>`)}</tbody></table></div>`
    : html`<div class="vacio">${vacio}</div>`;

  return html`
    <div class="encabezado"><div>
      <h1 style=${'border-left:6px solid ' + colorDir(direccion?.sigla).fuerte + ';padding-left:.6rem'}>${esDirector ? 'Mi dirección' : 'Mi unidad'}: ${esDirector ? direccion?.sigla : unidad?.sigla}</h1>
      <p>${esDirector ? direccion?.nombre : unidad?.nombre} · ${ps.length} proyectos</p></div></div>

    <div class="rejilla kpis" style="margin-bottom:1rem">
      <div class="kpi ${porActualizar.length ? (dCorte < 0 ? 'alerta' : 'aviso') : ''}"><div class="v">${porActualizar.length}</div><div class="t">Por actualizar en ${nombreMes(mesActualISO())}</div></div>
      <div class="kpi"><div class="v">${dCorte >= 0 ? dCorte : 0}</div><div class="t">Días para el corte (${fecha(fechaCorte)})</div></div>
      <div class="kpi ${vencen.length ? 'aviso' : ''}"><div class="v">${vencen.length}</div><div class="t">Vencen en 15 días</div></div>
      <div class="kpi ${vencidos.length ? 'alerta' : ''}"><div class="v">${vencidos.length}</div><div class="t">Vencidos</div></div>
      <div class="kpi ${tareas.length ? 'aviso' : ''}"><div class="v">${tareas.length}</div><div class="t">Tareas que vencen pronto o vencidas</div></div>
      <div class="kpi ${ps.some(p => p.n_mod_pendientes) ? 'aviso' : ''}" style=${['jefe', 'director'].includes(perfil.rol) ? 'cursor:pointer' : ''} onClick=${() => ['jefe', 'director'].includes(perfil.rol) && (location.hash = '#/validaciones')}>
        <div class="v">${ps.reduce((a, p) => a + (p.n_mod_pendientes || 0), 0)}</div><div class="t">Modificaciones por validar${['jefe', 'director'].includes(perfil.rol) ? ' (clic para ver)' : ''}</div></div>
    </div>
    <div class="panel"><h2>${esDirector ? 'Todos los proyectos de mi dirección' : 'Todos los proyectos de mi unidad'} (${ps.length})</h2>
      <p class="ayuda">Incluye los proyectos dentro y fuera del plan de gobierno. Use «Cargar tareas» para registrar nuevas tareas o entregas del proyecto.</p>
      ${ps.length ? html`<div class="tabla-env"><table>
        <thead><tr><th>Código</th><th>Proyecto</th>${esDirector && html`<th>Unidad</th>`}<th>Estado</th><th>Avance</th><th>Vigente</th><th></th></tr></thead>
        <tbody>${ps.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
          <td class="nowrap"><${Codigo} p=${p} /></td><td>${p.nombre}</td>${esDirector && html`<td class="nowrap">${cat.unidades.find(u => u.id === p.unidad_id)?.sigla || 'Sin unidad'}</td>`}
          <td><${EstadoProyecto} p=${p} /></td><td style="min-width:110px"><${Barra} v=${p.avance} /></td><td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
          <td class="nowrap"><a class="btn prim" href=${'#/proyecto/' + p.id + '?pestana=tareas'} onClick=${e => e.stopPropagation()}>Cargar tareas</a></td></tr>`)}</tbody></table></div>`
        : html`<div class="vacio">${esDirector ? 'Su dirección' : 'Su unidad'} aún no tiene proyectos en esta gestión.</div>`}</div>
    ${sinUnidad.length > 0 && !esDirector && html`<div class="panel" style="background:#fff8e6;border-color:#f0dc9c"><h2>Proyectos de ${direccion?.sigla || 'su dirección'} sin unidad ni responsable (${sinUnidad.length})</h2>
      <p class="ayuda">Si su unidad está a cargo de alguno, ábralo y use «Completar datos del proyecto».</p>
      <${Lista} items=${sinUnidad} vacio="" /></div>`}
    ${sinUnidad.length > 0 && esDirector && html`<div class="panel" style="background:#fff8e6;border-color:#f0dc9c"><h2>Proyectos sin unidad ni responsable (${sinUnidad.length})</h2>
      <p class="ayuda">Ábralos y use «Completar datos del proyecto» para asignar la unidad y el responsable.</p>
      <${Lista} items=${sinUnidad} vacio="" /></div>`}
    <div class="panel"><h2>Lo que debo actualizar este mes</h2>
      <p class="ayuda">Actualice cada proyecto (datos, tareas o reporte mensual) antes del ${fecha(fechaCorte)}. Si no, ese mes figurará como «sin reporte» junto a su estado.</p>
      <${Lista} items=${porActualizar} vacio="Todo al día este mes." extra=${{ titulo: 'Última actualización', valor: p => fecha(p.ultima_actualizacion) }} /></div>
    <div class="panel"><h2>Vence pronto (15 días o menos)</h2>
      <${Lista} items=${vencen} vacio="Ningún proyecto vence en los próximos 15 días." extra=${{ titulo: 'Días', valor: p => p.dias_restantes }} /></div>
    <div class="panel"><h2>Tareas que vencen pronto o están vencidas</h2>
      ${tareas.length ? html`<div class="tabla-env"><table><thead><tr><th>Proyecto</th><th>Tarea</th><th>Fin vigente</th><th>Avance</th><th>Estado</th></tr></thead>
        <tbody>${tareas.map(t => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + t.proyecto_id}>
          <td class="nowrap"><b>${cod(t.proyecto_id)}</b></td><td>${t.nombre}</td>
          <td class="nowrap" style=${t.fecha_fin_vigente < hoy ? 'color:#c0392b;font-weight:700' : ''}>${fecha(t.fecha_fin_vigente)}</td>
          <td><${Barra} v=${t.avance} /></td><td><${Estado} e=${t.estado} /></td></tr>`)}</tbody></table></div>`
        : html`<div class="vacio">Sin tareas por vencer.</div>`}</div>
    <div class="panel"><h2>Vencidos sin concluir</h2><${Lista} items=${vencidos} vacio="Ninguno." /></div>
    ${porValidar.length > 0 && html`<div class="panel"><h2>Datos por revisar (carga inicial)</h2><${Lista} items=${porValidar} vacio="" extra=${{ titulo: 'Motivo', valor: p => p.por_validar_motivo }} /></div>`}`;
}
