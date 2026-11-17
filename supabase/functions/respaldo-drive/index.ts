// Respaldo automático en Google Drive (lo llama un Google Apps Script del administrador, cada fin de mes).
// Protegida con una clave propia (secreto RESPALDO_TOKEN), no con la sesión de un usuario.
//   GET  → todos los datos: proyectos con su carpeta, resumen y evidencias (archivos con enlace firmado por 6 h), y las tablas.
//   POST {accion:'registrar', carpeta, url} → anota en la app la fecha del último respaldo en Drive.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json; charset=utf-8" } });

function iguales(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const limpio = (s: string) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "sin nombre";
const fecha = (d?: string | null) => d ? d.slice(0, 10).split("-").reverse().join("/") : "—";

Deno.serve(async (req) => {
  try {
    const token = req.headers.get("x-respaldo-token") ?? "";
    if (!iguales(token, Deno.env.get("RESPALDO_TOKEN") ?? "")) return json({ error: "Clave de respaldo no válida." }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    if (req.method === "POST") {
      const b = await req.json();
      if (b.accion !== "registrar") return json({ error: "Acción no reconocida." }, 400);
      const { error } = await sb.from("config").upsert({ clave: "respaldo_drive", valor: { fecha: new Date().toISOString(), carpeta: String(b.carpeta || ""), url: String(b.url || ""), archivos: Number(b.archivos || 0) } });
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }

    const lp = new Date(Date.now() - 4 * 3600_000);   // hora de La Paz (UTC-4)
    const carpeta = `${MESES[lp.getUTCMonth()]} ${String(lp.getUTCDate()).padStart(2, "0")}-${String(lp.getUTCMonth() + 1).padStart(2, "0")}-${lp.getUTCFullYear()}`;
    const leer = async (t: string, orden: string) => { const { data, error } = await sb.from(t).select("*").order(orden).limit(20000); if (error) throw error; return data ?? []; };
    const [proyectos, estrategicos, tareas, reportes, reprog, evid, propuestas, personas] = await Promise.all([
      leer("v_proyectos", "codigo"), leer("estrategicos", "orden"), leer("tareas", "orden"), leer("reportes_mensuales", "periodo"),
      leer("reprogramaciones", "creado_en"), leer("evidencias", "creado_en"), leer("propuestas", "creado_en"), leer("personas", "nombre"),
    ]);
    const num = (c: string) => (/^E3P(\d+)$/.exec(c || "") || [])[1] || c;
    const codigo = (p: any) => p.codigo_estrategico ? num(p.codigo_estrategico) + (p.codigo !== p.codigo_estrategico ? ` (${p.codigo})` : "") : p.codigo;
    const est = Object.fromEntries(estrategicos.map((e: any) => [e.codigo, e]));

    const lista = [];
    for (const p of proyectos as any[]) {
      const ev = (evid as any[]).filter((e) => e.proyecto_id === p.id);
      const evidencias = [];
      for (const e of ev) {
        if (e.storage_path) {
          const { data } = await sb.storage.from("evidencias").createSignedUrl(e.storage_path, 6 * 3600);
          evidencias.push({ nombre: e.nombre, archivo: limpio(e.storage_path.split("/").pop()), url_firmada: data?.signedUrl ?? null });
        } else evidencias.push({ nombre: e.nombre, url: e.url });
      }
      const resumen = [
        `${codigo(p)} · ${p.nombre}`, "",
        `Plan de gobierno: ${p.codigo_estrategico ? "Dentro (" + (est[p.codigo_estrategico]?.nombre ?? "") + ")" : "Fuera"}`,
        `Dirección: ${p.direccion_sigla ?? "—"}`, `Unidad: ${p.unidad_sigla ?? "Sin unidad"}`, `Responsable: ${p.responsable_nombre ?? "—"}`,
        `Estado: ${p.estado}`, `Avance: ${Number(p.avance ?? 0)} %`, `Entrega original: ${fecha(p.fecha_entrega_original)}`, `Entrega vigente: ${fecha(p.fecha_entrega_vigente)}`,
        `Situación actual: ${p.situacion_actual ?? "—"}`, `Próximo paso: ${p.proximo_paso ?? "—"}`, "",
        "Evidencias:", ...(ev.length ? ev.map((e) => `- ${e.nombre ?? "Sin nombre"}${e.url ? ": " + e.url : " (archivo)"}`) : ["- Ninguna"]),
      ].join("\r\n");
      lista.push({ id: p.id, carpeta: limpio(`${codigo(p)} - ${p.nombre}`), plan: !!p.codigo_estrategico, resumen, evidencias,
                   orden: p.codigo_estrategico ? (est[p.codigo_estrategico]?.orden ?? 9999) : 99999 });
    }
    lista.sort((a, b) => a.orden - b.orden || a.carpeta.localeCompare(b.carpeta));

    const per = Object.fromEntries((personas as any[]).map((x) => [x.id, x.nombre]));
    const cod = Object.fromEntries((proyectos as any[]).map((p) => [p.id, codigo(p)]));
    const hojas = {
      "Proyectos": (proyectos as any[]).map((p) => ({ "Código": codigo(p), "Plan de gobierno": p.codigo_estrategico ? "Dentro" : "Fuera", "Proyecto": p.nombre,
        "Dirección": p.direccion_sigla, "Unidad": p.unidad_sigla ?? "Sin unidad", "Responsable": p.responsable_nombre ?? "", "Estado": p.estado,
        "% avance": Number(p.avance ?? 0), "Inicio": fecha(p.fecha_inicio), "Entrega original": fecha(p.fecha_entrega_original), "Entrega vigente": fecha(p.fecha_entrega_vigente),
        "Situación actual": p.situacion_actual ?? "", "Próximo paso": p.proximo_paso ?? "", "Última actualización": p.ultima_actualizacion ?? "" })),
      "Tareas": (tareas as any[]).map((t) => ({ "Proyecto": cod[t.proyecto_id], "Tarea": t.nombre, "Responsable": per[t.responsable_id] ?? t.responsable_texto ?? "",
        "Inicio": fecha(t.fecha_inicio), "Fin vigente": fecha(t.fecha_fin_vigente), "Peso": t.peso, "% avance": Number(t.avance ?? 0), "Estado": t.estado })),
      "Reportes mensuales": (reportes as any[]).map((r) => ({ "Proyecto": cod[r.proyecto_id], "Mes": r.periodo, "Ficha": r.ficha, "Estado": r.estado ?? "",
        "% avance": r.avance ?? "", "Resultado": r.resultado_cuantitativo ?? "", "Próximo paso": r.proximo_paso ?? "" })),
      "Reprogramaciones": (reprog as any[]).map((r) => ({ "Proyecto": cod[r.proyecto_id], "Qué": r.entidad === "proyecto" ? "Proyecto" : "Tarea: " + r.tarea_nombre,
        "Fecha anterior": fecha(r.fecha_anterior), "Fecha nueva": fecha(r.fecha_nueva), "Motivo": r.motivo, "Usuario": r.usuario_nombre, "Fecha": r.creado_en })),
      "Evidencias": (evid as any[]).map((e) => ({ "Proyecto": cod[e.proyecto_id], "Evidencia": e.nombre, "Tipo": e.tipo, "Enlace": e.url ?? "(archivo)", "Registrada": e.creado_en })),
      "Validaciones": (propuestas as any[]).map((m) => ({ "Proyecto": cod[m.proyecto_id] ?? (m.datos?.codigo ?? ""), "Tipo": m.tipo, "Estado": m.estado,
        "Propuesto por": m.creado_por_nombre, "Fecha": m.creado_en, "Revisado por": m.revisado_por_nombre ?? "", "Revisado el": m.revisado_en ?? "", "Observación": m.observacion ?? "" })),
    };
    const respaldo = { generado: new Date().toISOString(), proyectos, estrategicos, tareas, reportes_mensuales: reportes, reprogramaciones: reprog, evidencias: evid, propuestas, personas };
    return json({ carpeta, proyectos: lista, hojas, respaldo });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
