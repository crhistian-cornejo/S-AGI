# Auditoría de Seguridad Electron

## Resumen

Este documento detalla la revisión de seguridad realizada según las [recomendaciones oficiales de Electron](https://www.electronjs.org/docs/latest/tutorial/security).

**Fecha de auditoría:** 2026-01-24  
**Versión de Electron:** 33.4.5

## Checklist de Seguridad

### ✅ Implementado Correctamente

1. **✅ Solo cargar contenido seguro (HTTPS)**
   - La aplicación solo carga contenido local (`file://`) o desde el servidor de desarrollo confiable
   - No se carga contenido remoto inseguro

2. **✅ No habilitar Node.js integration para contenido remoto**
   - `nodeIntegration: false` en todos los `BrowserWindow`
   - Implementado en: `mainWindow`, `trayPopover`, `quickPromptWindow`, ventanas OAuth

3. **✅ Habilitar Context Isolation**
   - `contextIsolation: true` en todos los `BrowserWindow`
   - Preload scripts usan `contextBridge` correctamente

4. **✅ Habilitar Process Sandboxing**
   - `sandbox: true` en todos los `BrowserWindow`
   - Sandboxing habilitado globalmente por defecto en Electron 20+

5. **✅ No deshabilitar webSecurity**
   - No se encuentra `webSecurity: false` en ninguna configuración

6. **✅ Definir Content Security Policy**
   - CSP implementado con `registerContentSecurityPolicy()`
   - Política restrictiva con `object-src 'none'` y `base-uri 'self'`

7. **✅ No habilitar allowRunningInsecureContent**
   - No se encuentra esta propiedad en ninguna configuración

8. **✅ No habilitar experimental features**
   - No se encuentra `experimentalFeatures` en ninguna configuración

9. **✅ No usar enableBlinkFeatures**
   - No se encuentra esta propiedad en ninguna configuración

10. **✅ No usar allowpopups para WebViews**
    - No se usan WebViews en la aplicación

11. **✅ Verificar opciones de WebView**
    - No aplicable (no se usan WebViews)

12. **✅ Deshabilitar o limitar navegación**
    - Implementado con `attachNavigationGuards()` y `will-navigate` handler
    - Solo permite navegación a orígenes confiables

13. **✅ Deshabilitar o limitar creación de nuevas ventanas**
    - Implementado con `setWindowOpenHandler()` en todas las ventanas
    - URLs externas se abren con `shell.openExternal()` después de validación

14. **✅ Usar versión actual de Electron**
    - Electron 33.4.5 (versión reciente y actualizada)

15. **✅ Evitar uso del protocolo file://**
    - Se usa `file://` solo para contenido local empaquetado
    - Consideración: Podría migrarse a protocolo personalizado en el futuro

16. **✅ No exponer APIs de Electron directamente**
    - Preload scripts usan `contextBridge.exposeInMainWorld()` correctamente
    - Los callbacks de IPC no exponen objetos `IpcRendererEvent` directamente

### ⚠️ Mejoras Implementadas

17. **✅ Validar el sender de todos los mensajes IPC** (IMPLEMENTADO)
    - ✅ Creado módulo `ipc-validation.ts` con función `validateIPCSender()`
    - ✅ Validación agregada a todos los handlers IPC en:
      - `src/main/index.ts` (window, theme, preferences, clipboard, haptic, tray, quick-prompt)
      - `src/main/lib/file-manager/ipc.ts` (todos los handlers de archivos)
      - `src/main/lib/security/ipc.ts` (todos los handlers de seguridad)
    - ✅ Valida que los mensajes vengan de archivos locales o orígenes confiables

18. **✅ Manejar solicitudes de permisos de sesión** (IMPLEMENTADO)
    - ✅ Implementado `registerPermissionRequestHandler()`
    - ✅ Solo permite permisos para contenido local o orígenes confiables
    - ✅ Permite notificaciones solo para contenido confiable

19. **⚠️ Configurar Electron Fuses** (PENDIENTE - Requiere configuración en build time)
    - ✅ Instalado `@electron/fuses`
    - ⚠️ **NOTA IMPORTANTE:** Los fuses deben configurarse en tiempo de BUILD, no en runtime
    - 📝 **Acción requerida:** Configurar fuses en el proceso de build (electron-builder o script de build)
    - Fuses recomendados para configurar:
      - `RunAsNode: false` - Deshabilita ejecución como Node.js
      - `EnableCookieEncryption: true` - Encripta cookies
      - `EnableNodeOptionsEnvironmentVariable: false` - Deshabilita NODE_OPTIONS
      - `EnableNodeCliInspectArguments: false` - Deshabilita --inspect
      - `EnableEmbeddedAsarIntegrityValidation: true` - Valida integridad ASAR
      - `OnlyLoadAppFromAsar: true` - Solo carga desde ASAR en producción

20. **✅ Mejorar validación de URLs en shell.openExternal** (IMPLEMENTADO)
    - ✅ Implementado `isSafeForExternalOpen()` que valida:
      - Solo permite protocolos `http://` y `https://`
      - Bloquea rangos de IP privados (excepto 127.0.0.1 para dev server)
      - Valida URLs usando el parser de Node.js

### 📝 Notas Adicionales

#### Content Security Policy

El CSP actual incluye `'unsafe-eval'` y `'unsafe-inline'` en desarrollo para compatibilidad con herramientas de desarrollo. En producción, estos están deshabilitados.

**Recomendación futura:** Evaluar si es posible eliminar `'unsafe-eval'` y `'unsafe-inline'` completamente usando nonces o hashes.

#### Protocolo file://

La aplicación usa `file://` para cargar contenido local empaquetado. Esto es aceptable según las recomendaciones de Electron, pero podría mejorarse usando un protocolo personalizado (`protocol.handle`) para mayor control.

**Recomendación futura:** Considerar migrar a protocolo personalizado para:
- Mayor control sobre qué archivos se pueden cargar
- Mejor alineación con comportamiento web estándar
- Prevención de problemas de XSS con acceso a archivos locales

#### Validación de IPC

Todos los handlers IPC ahora validan el sender antes de procesar solicitudes. Esto previene que iframes o ventanas hijas no confiables puedan enviar mensajes IPC.

## Archivos Modificados

- `src/main/index.ts` - Agregadas funciones de seguridad y validación IPC
- `src/main/lib/security/ipc-validation.ts` - Nuevo módulo para validación IPC
- `src/main/lib/file-manager/ipc.ts` - Agregada validación IPC a todos los handlers
- `src/main/lib/security/ipc.ts` - Agregada validación IPC a todos los handlers
- `package.json` - Agregado `@electron/fuses`

## Próximos Pasos

1. **CSP en producción:** Revisar si se puede eliminar `'unsafe-eval'` y `'unsafe-inline'` completamente
2. **Protocolo personalizado:** Considerar migrar de `file://` a protocolo personalizado
3. **Testing:** Probar todas las funcionalidades después de los cambios de seguridad
4. **Monitoreo:** Agregar logging adicional para detectar intentos de acceso no autorizados

## Referencias

- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Fuses Documentation](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
