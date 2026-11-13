// Datos tomados de «DEDH_2026_consolidado_v2.pptx» (situación al 12/11/2026),
// la fuente más reciente para la DEDH. Se aplican después del Excel.
export const FUENTE_DEDH = 'DEDH_2026_consolidado_v2.pptx (12/11/2026)';

// Personas y su unidad según el organigrama y las láminas 4 a 6.
// unidad: null = la presentación indica «unidad por validar».
export const PERSONAS_DEDH = [
  { nombre: 'Juvenal Aguilar Pacheco', cargo: 'Director de Educación y Desarrollo Humano', unidad: 'DESP-DEDH' },
  { nombre: 'Raúl Flores Uscamayta', cargo: 'Analista Técnico del Despacho (convenios y becas)', unidad: 'DESP-DEDH' },
  { nombre: 'Pablo Pacheco Montaño', cargo: 'Asistente Técnico (seguro escolar)', unidad: 'DESP-DEDH' },
  { nombre: 'Julio Espinoza Espinoza', cargo: 'Jefe de Unidad UIEE', unidad: 'UIEE' },
  { nombre: 'Alvaro Martin Duval Zubieta', cargo: 'Técnico UIEE (Escuelas Dignas; mantenimiento de equipos y cámaras)', unidad: 'UIEE' },
  { nombre: 'Danny Mabel Tola Mamani', cargo: 'Técnico UIEE (mochila escolar)', unidad: 'UIEE' },
  { nombre: 'Jorge Flores', cargo: 'Enlace de Maestranza', unidad: 'UIEE' },
  { nombre: 'Aurea Balderrama Almendras', cargo: 'Jefa de Unidad USED', unidad: 'USED' },
  { nombre: 'Jean Paul Humerez Vega', cargo: 'Nutricionista (ACE)', unidad: 'USED' },
  { nombre: 'José Antonio López Flores', cargo: 'Asistente Administrativo', unidad: 'USED' },
  { nombre: 'Sandra Victoria Arcani Mercado', cargo: 'Agronomía · consultora de línea (huertos pedagógicos)', unidad: 'USED' },
  { nombre: 'Tathiana Máxima García Chura', cargo: 'Agronomía · consultora de línea (huertos pedagógicos)', unidad: 'USED' },
  { nombre: 'Wendy Laura Mujica Mérida', cargo: 'Nutrición · consultora de línea (educación alimentaria)', unidad: 'USED' },
  { nombre: 'Liliana Arroyo Poma', cargo: 'Nutrición · consultora de línea (vigilancia nutricional)', unidad: 'USED' },
  { nombre: 'Laura Choque Salgueiro', cargo: 'Nutrición · consultora de línea (reciclaje de residuos ACE)', unidad: 'USED' },
  { nombre: 'Verónica Ruiz Cala', cargo: 'Nutrición · consultora de línea (recreo saludable)', unidad: 'USED' },
  { nombre: 'Oriana Nicole Aguirre Coronel', cargo: 'Nutrición · consultora de línea (estandarización de raciones)', unidad: 'USED' },
  { nombre: 'Eva Claudia Yampasi Espejo', cargo: 'Técnica «Aprender para la Vida» (unidad por validar)', unidad: null },
  { nombre: 'Lesly Coral Cornejo Orellana', cargo: 'Técnica «Aprender para la Vida» (unidad por validar)', unidad: null },
  { nombre: 'Jorge Antonio Mamani Marin', cargo: 'Técnico «Educación para la Vida» (unidad por validar)', unidad: null },
];

// Ajustes por proyecto con la información más reciente de la presentación.
// Cada clave se aplica sobre lo leído del Excel y queda en la lista de conversiones.
export const AJUSTES_DEDH = {
  'SMCI-04': {
    apoyos: ['Laura Choque Salgueiro'],
    situacion_actual: 'Reciclaje de residuos de la ACE: 25.069 estudiantes de 69 UE y CEE; 3,14 t recolectadas al 25/09 y convertidas en bolsas de basura; incentivos del 23/11 al 04/12.',
  },
  'SMCI-09': {
    situacion_actual: '129.342 mochilas escolares y morrales entregados (117.566 mochilas y 11.776 morrales en los 52 CEA); mochilas 2027 en proceso para 129.908 estudiantes (proyección), por Bs 20.909.070.',
  },
  'SMCI-17': {
    situacion_actual: 'ACE: 116.361 estudiantes con ración doble en 366 UE; 28.543.810 de 38.106.980 raciones entregadas al 02/10 (75 %); Bs 34.723.594,76 ejecutados de Bs 52.425.266,43 (66,23 %); fin del servicio 27/11/2026. ACE 2027: 10 procesos por Bs 69.999.939,46 (por confirmar).',
    presupuesto_programado: 52425266.43,
    presupuesto_ejecutado: 34723594.76,
  },
  'SMCI-20': {
    responsable: 'Alvaro Martin Duval Zubieta',
    apoyos: ['Guzman Villegas Acevedo'],
    situacion_actual: 'Al corte de octubre: mantenimiento de 180 computadoras, revisión y mantenimiento de 206 cámaras e instalación de 19 cámaras adicionales en 70 unidades educativas.',
  },
  'SMCI-30': {
    situacion_actual: 'Diagnóstico socioemocional a 16.790 estudiantes de 5.º y 6.º de secundaria de 176 UE; sistematización en curso; talleres en 2027.',
  },
  'SMCI-31': {
    apoyos: ['Lesly Coral Cornejo Orellana'],
    situacion_actual: 'Diagnóstico a familias, maestros y directores (08 al 14/09) para 487 estudiantes de 9 centros de educación especial; encuentro de 82 estudiantes con talento extraordinario (13/11).',
  },
  'SMCI-36': {
    responsable: 'Wendy Laura Mujica Mérida',
    unidad: 'USED',
    situacion_actual: 'Capacitación en alimentación saludable e higiene bucodental con 48.654 kits Colgate entregados en 202 UE y CEE; faltan 11 UE rurales.',
  },
  'SMCI-37': {
    responsable: 'Sandra Victoria Arcani Mercado',
    apoyos: ['Tathiana Máxima García Chura'],
    unidad: 'USED',
    situacion_actual: '65 UE con huertos pedagógicos y asistencia técnica al 02/10/2026 (19.844 estudiantes); 25 huertos sistematizados: 3 nuevos, 10 activos, 5 reactivados y 7 en descanso.',
  },
  'SMCI-38': {
    responsable: 'Liliana Arroyo Poma',
    unidad: 'USED',
    situacion_actual: '4.739 estudiantes evaluados en peso y talla (2.465 en 10 UE y 2.274 en 9 UE): 58 % normal, 12 % con déficit y 30 % con exceso; encuesta de aceptabilidad en 128 UE con 12.600 estudiantes.',
  },
};
