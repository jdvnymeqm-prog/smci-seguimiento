import { html, useState, useEffect, sb, fecha, hoyISO, diasEntre, nombreMes, mesActualISO, mensajeError } from '../lib.js';
import { Estado, Semaforo, Barra, Aviso } from '../componentes.js';

export function MiUnidad({ ctx }) {
  const { perfil, cat } = ctx;
  const [ps, setPs] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [err, setErr] = useState('');
  const esDirector = perfil.rol === 'director';
  const unidad = cat.unidades.find(u => u.id === perfil.unidad_id);
  const direccion = cat.direcciones.find(d => d.id === perfil.direccion_id);

  useEffect(() => {
    let q = sb.from('v_proyectos').select('*').order('fecha_entrega_vigente', { nullsFirst: false });
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
  const cod = id => (ps.find(p => p.id === id) || {}).codigo;

  const Lista = ({ items, vacio, extra }) => items.length ? html`<div class="tabla-env"><table>
      <thead><tr><th>Código</th><th>Proyecto</th><th>Estado</th><th>Avance</th><th>Vigente</th><th></th>${extra && html`<th>${extra.titulo}</th>`}</tr></thead>
      <tbody>${items.map(p => html`<tr class="clic" onClick=${() => location.hash = '#/proyecto/' + p.id}>
        <td class="nowrap"><b>${p.codigo}</b></td><td>${p.nombre}</td><td><${Estado} e=${p.estado} /></td>
        <td style="min-width:110px"><${Barra} v=${p.avance} /></td><td class="nowrap">${fecha(p.fecha_entrega_vigente)}</td>
        <td><${Semaforo} s=${p.semaforo} dias=${p.dias_restantes} /></td>${extra && html`<td>${extra.valor(p)}</td>`}</tr>`)}</tbody></table></div>`
    : html`<div class="vacio">${vacio}</div>`;

  return html`
    <div class="encabezado"><div>
      <h1>${esDirector ? 'Mi dirección' : 'Mi unidad'}: ${esDirector ? direccion?.sigla : unidad?.sigla}</h1>
      <p>${esDirector ? direccion?.nombre : unidad?.nombre} · ${ps.length} proyectos</p></div></div>
    ${esDirector && !perfil.puede_editar && html`<${Aviso} tipo="info">Puede ver todos los proyectos de su dirección. Para editar, el administrador debe habilitarlo.<//>`}
    <div class="rejilla kpis" style="margin-bottom:1rem">
      <div class="kpi ${porActualizar.length ? (dCorte < 0 ? 'alerta' : 'aviso') : ''}"><div class="v">${porActualizar.length}</div><div class="t">Por actualizar en ${nombreMes(mesActualISO())}</div></div>
      <div class="kpi"><div class="v">${dCorte >= 0 ? dCorte : 0}</div><div class="t">Días para el corte (${fecha(fechaCorte)})</div></div>
      <div class="kpi ${vencen.length ? 'aviso' : ''}"><div class="v">${vencen.length}</div><div class="t">Vencen en 15 días</div></div>
      <div class="kpi ${vencidos.length ? 'alerta' : ''}"><div class="v">${vencidos.length}</div><div class="t">Vencidos</div></div>
      <div class="kpi ${tareas.length ? 'aviso' : ''}"><div class="v">${tareas.length}</div><div class="t">Tareas que vencen pronto o vencidas</div></div>
      <div class="kpi ${ps.some(p => p.n_mod_pendientes) ? 'aviso' : ''}" style=${['jefe', 'director'].includes(perfil.rol) ? 'cursor:pointer' : ''} onClick=${() => ['jefe', 'director'].includes(perfil.rol) && (location.hash = '#/validaciones')}>
        <div class="v">${ps.reduce((a, p) => a + (p.n_mod_pendientes || 0), 0)}</div><div class="t">Modificaciones por validar${['jefe', 'director'].includes(perfil.rol) ? ' (clic para ver)' : ''}</div></div>
    </div>
    <div class="panel"><h2>Lo que debo actualizar este mes</h2>
      <p class="ayuda">Actualice cada proyecto (datos, tareas o reporte mensual) antes del ${fecha(fechaCorte)}. Si no, el sistema lo marcará «No reportada».</p>
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
    ${porValidar.length > 0 && html`<div class="panel"><h2>Por validar</h2><${Lista} items=${porValidar} vacio="" extra=${{ titulo: 'Motivo', valor: p => p.por_validar_motivo }} /></div>`}`;
}
