# Respaldo automático en Google Drive

Cada **último día del mes a las 22:00 (hora de La Paz)** se copia toda la información de la app a Google Drive:

```
(carpeta de Drive del administrador)
└── SMCI/
    └── Noviembre 30-11-2026/
        ├── Información completa SMCI        ← hoja de cálculo con todas las pestañas
        ├── Respaldo base de datos.json      ← copia completa de los datos
        ├── 23.1 (SMCI-06) - Diagnóstico de infraestructura educativa/
        │   ├── Datos del proyecto.txt
        │   └── Evidencias/                  ← archivos subidos a la app
        ├── 24.1 - «Educación Ciudadana 360°» …/
        └── SMCI-02 - Canales digitales oficiales …/
```

Lo hace un script de **Google Apps Script** en la cuenta dueña de la carpeta. La app le entrega los datos a través de la función
del servidor `respaldo-drive`, que solo responde a quien tenga la **clave de respaldo**.

## Instalación (una sola vez, la hace el administrador)

1. **Clave de respaldo en Supabase.** En el panel de Supabase → *Edge Functions → Secrets*, cree el secreto
   `RESPALDO_TOKEN` con una clave larga inventada por usted (mínimo 30 caracteres, letras y números).
2. **Script en Google.** Abra <https://script.google.com> con la cuenta dueña de la carpeta de Drive → *Nuevo proyecto*.
   Pegue todo el contenido de [`Codigo.gs`](Codigo.gs) y guárdelo con el nombre «Respaldo SMCI».
3. En la línea `const CLAVE = '…'` escriba **la misma clave** del paso 1.
4. Arriba, elija la función **`instalar`** y pulse **Ejecutar**. Google pedirá permisos (Drive y conexiones externas): acéptelos.
   Esto programa el respaldo de fin de mes y hace un **primer respaldo de prueba** en ese momento.
5. En la app, *Administración → Respaldos y fecha de corte* mostrará la fecha del último respaldo en Drive y un enlace a la carpeta.

## Uso

- Automático: no hay que hacer nada. Si hay muchos archivos, el script continúa solo en ejecuciones de un minuto después.
- Respaldo inmediato: en script.google.com ejecute **`respaldarAhora`**.
- Para descargar a la computadora, instale **Google Drive para escritorio**: la carpeta SMCI aparecerá en su PC y se actualizará sola.

## Seguridad

- La clave da acceso de lectura a **todos** los datos: no la comparta ni la escriba en el chat. Si se filtra, cámbiela en
  Supabase y en el script (mismo valor en los dos lugares).
- La carpeta de Drive es privada mientras no se comparta. Si la comparte, quien tenga acceso verá todas las direcciones y unidades.
