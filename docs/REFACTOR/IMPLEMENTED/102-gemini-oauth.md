# Plan de Implementación: Gemini OAuth (Gemini CLI Flow)

Este plan detalla cómo replicar el flujo de autenticación de **Gemini CLI** en S-AGI para permitir el uso de la suscripción de **Google One AI Premium** sin costos por token.

## 1. Detalles Técnicos (Basado en opencode-gemini-auth)

- **Provider**: Google
- **OAuth Client ID**: Set via `MAIN_VITE_GEMINI_CLIENT_ID` environment variable
- **OAuth Client Secret**: Set via `MAIN_VITE_GEMINI_CLIENT_SECRET` environment variable
- **Redirect URI**: `http://localhost:8085/oauth2callback`
- **Scopes Necesarios**:
  - `https://www.googleapis.com/auth/cloud-platform`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
- **Endpoint de Inferencia (Cloud Code Assist)**:
  - Producción: `https://cloudcode-pa.googleapis.com/v1internal/responses`
- **Headers Requeridos**:
  - `User-Agent: google-api-nodejs-client/9.15.1`
  - `X-Goog-Api-Client: gl-node/22.17.0`
  - `Client-Metadata: ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI`
  - `Authorization: Bearer <TOKEN>`

---

## 2. Componentes Desarrollados

### A. Backend (Main Process)
- **`src/main/lib/auth/gemini-manager.ts`**:
  - [x] Implementar flujo OAuth 2.0 con PKCE
  - [x] Manejo de `access_token` y `refresh_token`
  - [x] Rutina de refresco automático (cada 50 min)
  - [x] Buffer de expiración de 60 segundos
  - [x] Método `getValidAccessToken()` para obtener token válido
- **`src/main/lib/auth/gemini-store.ts`**:
  - [x] Almacenamiento seguro de credenciales con `safeStorage`

### B. tRPC Router (`src/main/lib/trpc/routers/auth.ts`)
- [x] `getGeminiStatus`: Devuelve si está conectado y el email del usuario
- [x] `connectGemini`: Abre la ventana de login de Google
- [x] `disconnectGemini`: Limpia la sesión

### C. Integración en AI Loop (`src/main/lib/trpc/routers/ai.ts`)
- [x] Configurar el cliente para disparar hacia el endpoint de Cloud Code Assist
- [x] Inyectar los headers de Gemini CLI
- [x] Refresco automático de token antes de expiración

### D. Frontend (Renderer)
- [x] `gemini-advanced` como provider en shared types
- [x] Sección en Settings con botón de conexión de Google

---

## 3. Beneficios Esperados
- **Cero costo por token** para usuarios con suscripción activa
- **Acceso a modelos Gemini 3** (Pro, Flash, Deep Think)
- **Límites de tasa generosos** (los mismos que usa Gemini CLI oficial)

## 4. Estado de la Implementación
1. [x] Crear los archivos de manager y store
2. [x] Configurar el callback automático (localhost:8085 para interceptar el código)
3. [x] Probar el intercambio de tokens con el Client ID de Gemini CLI
4. [x] Integrar en la interfaz de usuario (ApiKeysTab)
5. [x] Implementar lógica de inferencia en `ai.ts` con headers de Gemini CLI
6. [x] Buffer de expiración de 60 segundos antes del refresh

---

## 5. Próximos Pasos (Pendientes)
1. [ ] Validar el refresco de tokens automático después de la expiración (1 hora)
2. [ ] Mejorar el manejo de errores si la suscripción de Google One no es detectada
3. [ ] Añadir soporte para `projectId` y `managedProjectId` (opcional, para proyectos específicos)
4. [ ] Añadir telemetría básica para monitorear el uso de Gemini Advanced

---

## 6. Referencia
- Repositorio base: https://github.com/jenslys/opencode-gemini-auth
- Documentación oficial: https://cloud.google.com/code-assist
