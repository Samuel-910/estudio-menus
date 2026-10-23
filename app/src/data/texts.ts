/**
 * Textos del estudio. EDITAR antes de publicar:
 *  - Los datos entre corchetes [ ] del consentimiento.
 *  - El SUS: reemplazar por la versión en español validada que elija el equipo.
 */

export const STUDY_TITLE = 'Estudio sobre la navegación en un sistema de gestión empresarial';

export const CONSENT_PARAGRAPHS: string[] = [
  'Te invitamos a participar en un estudio de la Escuela Profesional de Ingeniería de Sistemas de la Universidad Peruana Unión. El objetivo es evaluar cómo las personas encuentran funciones en el menú de un sistema de gestión empresarial (ERP) y comparar dos versiones de ese menú.',
  'Qué harás: el estudio tiene dos sesiones en línea, separadas por algunos días. En cada sesión realizarás tareas sencillas en un sistema de prueba (por ejemplo, abrir la función "Registrar venta") y responderás algunas preguntas. Cada sesión dura entre 30 y 45 minutos. Debes usar una computadora con mouse o touchpad.',
  'Qué datos se registran: los clics que haces en el menú, el tiempo que tardas en cada tarea, las funciones que abres y tus respuestas a los cuestionarios. No registramos tu nombre, correo, ubicación ni nada de lo que haya en tu computadora. Te identificamos solo con un código.',
  'Uso y almacenamiento: los datos se guardan en servidores del proveedor Supabase, que pueden estar fuera del Perú, y se usarán solo con fines de investigación. Los resultados se publicarán de forma agregada y anónima. Los datos sin identificadores podrán compartirse en un repositorio abierto para que otros investigadores verifiquen los resultados.',
  'Participación voluntaria: puedes retirarte en cualquier momento sin dar explicaciones y sin ninguna consecuencia. Si te retiras, puedes pedir que eliminemos tus datos escribiendo a [correo del investigador] e indicando tu código.',
  'Riesgos y beneficios: no hay riesgos previstos más allá del cansancio normal de usar una computadora. No recibirás un pago; tu participación ayuda a diseñar sistemas más fáciles de usar.',
  'Este estudio fue aprobado por [Comité de Ética de la Universidad Peruana Unión], código [código del protocolo]. Investigadores responsables: [nombres]. Consultas: [correo de contacto].',
];

export const CONSENT_CHECK = 'He leído la información, tengo 18 años o más y acepto participar voluntariamente.';

// ---- Cuestionario inicial ------------------------------------------------

export const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65 o más'];
export const GENDERS = ['Mujer', 'Hombre', 'Otro', 'Prefiero no decirlo'];
export const EDUCATION = ['Secundaria', 'Técnica', 'Universitaria en curso', 'Universitaria completa', 'Posgrado'];
export const OCCUPATIONS = ['Estudiante', 'Trabajo en administración, ventas, compras, almacén o caja', 'Trabajo en otra área', 'Negocio propio', 'Otra'];
export const COMPUTER_FREQ = ['Todos los días', 'Varias veces por semana', 'Una vez por semana', 'Menos de una vez por semana'];
export const MGMT_EXPERIENCE: { value: string; label: string }[] = [
  { value: 'ninguna', label: 'Ninguna: nunca usé un sistema de ventas, inventario o similar' },
  { value: 'basica', label: 'Básica: lo usé alguna vez o lo uso poco' },
  { value: 'frecuente', label: 'Frecuente: lo uso o lo usé regularmente en el trabajo' },
];

// ---- Cuestionarios de la sesión 2 ------------------------------------------

/** SUS (Brooke, 1996). Traducción de trabajo: sustituir por una versión validada. */
export const SUS_ITEMS: string[] = [
  'Creo que me gustaría usar este sistema con frecuencia.',
  'Encontré el sistema innecesariamente complejo.',
  'Pensé que el sistema era fácil de usar.',
  'Creo que necesitaría el apoyo de una persona experta para poder usar este sistema.',
  'Encontré que las diversas funciones del sistema estaban bien integradas.',
  'Pensé que había demasiada inconsistencia en este sistema.',
  'Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.',
  'Encontré el sistema muy difícil de usar.',
  'Me sentí muy seguro(a) usando el sistema.',
  'Necesité aprender muchas cosas antes de poder usar este sistema.',
];

export const SATISFACTION_ITEMS: string[] = [
  'El menú mostraba las funciones que más necesitaba.',
  'Encontré las funciones rápidamente.',
  'El orden del menú tenía sentido para mi trabajo.',
];

export const LIKERT_5 = ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'];
