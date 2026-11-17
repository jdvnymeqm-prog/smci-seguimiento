/**
 * Respaldo automático de «Seguimiento de Proyectos SMCI» en Google Drive.
 *
 * Cada último día del mes (22:00, hora de La Paz) crea, dentro de la carpeta de Drive indicada:
 *   SMCI / «Mes DD-MM-AAAA» /
 *      Información completa SMCI      (hoja de cálculo: proyectos, tareas, reportes, reprogramaciones, evidencias, validaciones)
 *      Respaldo base de datos.json    (copia completa de los datos)
 *      «Código - Proyecto» /          (una carpeta por proyecto: Datos del proyecto.txt y sus evidencias)
 *
 * INSTALACIÓN (una sola vez):
 *   1. Abra https://script.google.com con la cuenta dueña de la carpeta de Drive → «Nuevo proyecto».
 *   2. Borre el contenido y pegue todo este archivo. Guarde (Ctrl+S) con el nombre «Respaldo SMCI».
 *   3. En CLAVE escriba la misma clave que guardó en Supabase (secreto RESPALDO_TOKEN).
 *   4. Arriba elija la función «instalar» y pulse «Ejecutar». Acepte los permisos que pide Google.
 *      Eso programa el respaldo de fin de mes y hace un primer respaldo de prueba.
 *
 * Para hacer un respaldo en cualquier momento: ejecute «respaldarAhora».
 */

const CLAVE = 'PEGUE_AQUI_LA_CLAVE_DE_RESPALDO';
const CARPETA_DRIVE_ID = '1eT6la4hcEKt-JMzC2MhlRZhlkiAaiY02';
const URL_FUNCION = 'https://awzuhwyrukxzzdbcocer.supabase.co/functions/v1/respaldo-drive';
const ZONA = 'America/La_Paz';
const LIMITE_MS = 5 * 60 * 1000;   // Google corta a los 6 minutos: se sigue en una segunda ejecución

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('respaldoFinDeMes').timeBased().everyDays(1).atHour(22).inTimezone(ZONA).create();
  respaldarAhora();
}

// Se ejecuta todos los días a las 22:00; solo trabaja el último día del mes
function respaldoFinDeMes() {
  const manana = new Date(Date.now() + 24 * 3600 * 1000);
  if (Utilities.formatDate(manana, ZONA, 'd') !== '1') return;
  respaldarAhora();
}

function respaldarAhora() {
  PropertiesService.getScriptProperties().deleteProperty('pendiente');
  const datos = pedirDatos_();
  const raiz = DriveApp.getFolderById(CARPETA_DRIVE_ID);
  const smci = carpeta_(raiz, 'SMCI');
  const mes = carpeta_(smci, datos.carpeta);

  crearHojaDeCalculo_(mes, datos.hojas);
  reemplazarArchivo_(mes, 'Respaldo base de datos.json', JSON.stringify(datos.respaldo, null, 1), 'application/json');
  guardarEstado_({ mesId: mes.getId(), carpeta: datos.carpeta, indice: 0, archivos: 0 });
  continuar();
}

// Copia los proyectos; si se acerca el límite de tiempo, deja programada la continuación
function continuar() {
  const inicio = Date.now();
  const estado = leerEstado_();
  if (!estado) return;
  borrarDisparadoresDe_('continuar');
  const datos = pedirDatos_();
  const mes = DriveApp.getFolderById(estado.mesId);
  for (let i = estado.indice; i < datos.proyectos.length; i++) {
    if (Date.now() - inicio > LIMITE_MS) {
      guardarEstado_({ ...estado, indice: i });
      ScriptApp.newTrigger('continuar').timeBased().after(60 * 1000).create();
      return;
    }
    const p = datos.proyectos[i];
    const dir = carpeta_(mes, p.carpeta);
    reemplazarArchivo_(dir, 'Datos del proyecto.txt', p.resumen, 'text/plain');
    const archivos = p.evidencias.filter(e => e.url_firmada);
    if (archivos.length) {
      const ev = carpeta_(dir, 'Evidencias');
      archivos.forEach(e => {
        if (ev.getFilesByName(e.archivo).hasNext()) return;
        const r = UrlFetchApp.fetch(e.url_firmada, { muteHttpExceptions: true });
        if (r.getResponseCode() === 200) { ev.createFile(r.getBlob().setName(e.archivo)); estado.archivos++; }
      });
    }
  }
  PropertiesService.getScriptProperties().deleteProperty('pendiente');
  UrlFetchApp.fetch(URL_FUNCION, {
    method: 'post', contentType: 'application/json', headers: { 'x-respaldo-token': CLAVE }, muteHttpExceptions: true,
    payload: JSON.stringify({ accion: 'registrar', carpeta: estado.carpeta, url: mes.getUrl(), archivos: estado.archivos }),
  });
  Logger.log('Respaldo terminado: ' + mes.getUrl());
}

// ---------------------------------------------------------------- utilidades
function pedirDatos_() {
  const r = UrlFetchApp.fetch(URL_FUNCION, { headers: { 'x-respaldo-token': CLAVE }, muteHttpExceptions: true });
  const cuerpo = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() !== 200) throw new Error('La app respondió ' + r.getResponseCode() + ': ' + (cuerpo.error || r.getContentText()));
  return cuerpo;
}

function carpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function reemplazarArchivo_(carpeta, nombre, contenido, tipo) {
  const it = carpeta.getFilesByName(nombre);
  while (it.hasNext()) it.next().setTrashed(true);
  carpeta.createFile(nombre, contenido, tipo);
}

function crearHojaDeCalculo_(carpeta, hojas) {
  const nombre = 'Información completa SMCI';
  const it = carpeta.getFilesByName(nombre);
  while (it.hasNext()) it.next().setTrashed(true);
  const ss = SpreadsheetApp.create(nombre);
  const nombres = Object.keys(hojas);
  nombres.forEach((n, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n);
    const filas = hojas[n];
    if (!filas.length) { sh.getRange(1, 1).setValue('Sin datos'); return; }
    const cols = Object.keys(filas[0]);
    const valores = [cols].concat(filas.map(f => cols.map(c => f[c] === null || f[c] === undefined ? '' : (typeof f[c] === 'object' ? JSON.stringify(f[c]) : f[c]))));
    sh.getRange(1, 1, valores.length, cols.length).setValues(valores);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#18465c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
}

function guardarEstado_(e) { PropertiesService.getScriptProperties().setProperty('pendiente', JSON.stringify(e)); }
function leerEstado_() { const s = PropertiesService.getScriptProperties().getProperty('pendiente'); return s ? JSON.parse(s) : null; }
function borrarDisparadoresDe_(fn) { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === fn).forEach(t => ScriptApp.deleteTrigger(t)); }
