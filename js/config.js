// Configuración de conexión. La clave "publishable" es pública por diseño:
// la seguridad la dan las políticas RLS de la base de datos, no esta clave.
export const CONFIG = {
  SUPABASE_URL: 'https://awzuhwyrukxzzdbcocer.supabase.co',
  SUPABASE_KEY: 'sb_publishable_6eOTdoTgpWw4wOVTKy9nLg_O_WKcsu-',
  // Acceso con cuenta institucional (opcional). Valores posibles: null, 'azure', 'google'.
  // Antes de activarlo, configure el proveedor en Supabase → Authentication → Providers.
  PROVEEDOR_INSTITUCIONAL: null,
  ETIQUETA_INSTITUCIONAL: 'Ingresar con cuenta institucional',
};
