# Mejores prácticas: apps de bandeja (Electron)

## Integración con APIs nativas del sistema operativo

- **Tray + menú contextual**: usa `Tray` y `Menu.buildFromTemplate()` para un menú consistente (abrir app, acciones rápidas, salir). Mantén el menú pequeño y accionable.
- **Ventana tipo popover**: crea un `BrowserWindow` “frameless” con `alwaysOnTop` y `skipTaskbar` para simular un panel contextual. Muestra/oculta según clicks en `tray` y eventos de foco.
- **Diálogos nativos de archivos**: usa `dialog.showOpenDialog()` para selección explícita del usuario y evita leer rutas del sistema sin consentimiento.
- **Acciones del SO**: usa `shell.openPath()` para abrir archivos con la app predeterminada y `shell.showItemInFolder()` para revelar en el explorador.
- **Biometría**:
  - **macOS**: `systemPreferences.promptTouchID()` es la opción más directa para gating local.
  - **Windows/Linux**: si se quiere Windows Hello vía WebAuthn (passkeys), hay que considerar las restricciones de origen seguro/HTTPS/localhost.

## Rendimiento en aplicaciones de bandeja

- **Throttle por visibilidad**: Electron recomienda pausar operaciones costosas cuando la ventana no está visible; la visibilidad cambia cuando el `BrowserWindow` está oculto/minimizado (ver “Page visibility” en docs de `BrowserWindow`).  
  Fuente: https://www.electronjs.org/docs/latest/api/browser-window
- **No renderizar de más**: evita polling; refresca en `popover.on('show')` o mediante eventos. Mantén listas cortas y virtualiza sólo si hace falta.
- **Caché de imágenes**:
  - Genera miniaturas (p.ej. 256–320px) al importar, guarda en disco en `userData/cache/...` y sirve esas miniaturas en vez de cargar el original en listas/grids.
  - Mantén la miniatura en un formato eficiente (p.ej. WebP) y con `withoutEnlargement` para evitar trabajo innecesario.
- **I/O fuera del renderer**: copia/importa/exporta en el main process y expón un API estrecho por IPC/tRPC; el renderer sólo pide datos.
- **Evita memoria “pegajosa”**: libera selecciones, detén listeners pesados y evita decodificar imágenes grandes si no están en pantalla.

## Patrones de diseño para interfaces compactas pero funcionales

- **Pestañas pequeñas**: “Quick” (acciones + recientes) y “Files” (gestión) reduce fricción y mantiene la UI limpia.
- **Acciones primarias arriba**: búsqueda (Ctrl/⌘+F), importar (Ctrl/⌘+U), cambiar vista (Ctrl/⌘+1/2).
- **Listas con acciones inline**: en una UI compacta, las acciones por fila (descargar, borrar, seleccionar) evitan navegación extra.
- **Visor de imágenes como overlay**: modal interno con navegación por teclado y zoom (doble click + zoom con Ctrl/⌘+wheel) evita abrir ventanas nuevas.

## Notas de seguridad (orígenes, WebAuthn)

- **WebAuthn requiere orígenes seguros**: en navegadores, `navigator.credentials.create/get` está limitado a HTTPS o `http://localhost` (según la especificación y compatibilidad de la API).  
  Fuentes:
  - https://developer.mozilla.org/en-US/docs/Web/API/CredentialsContainer/create
  - https://github.com/electron/electron/issues/24573
- **Modelo recomendado**: para apps offline, considera biometría nativa (macOS Touch ID) o PIN local cifrado (safeStorage) como fallback multiplataforma.

