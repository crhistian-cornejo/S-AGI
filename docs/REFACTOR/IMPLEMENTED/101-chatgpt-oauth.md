# Implementación de ChatGPT Plus/Pro como Provider (Flujo Codex)

Este documento detalla el flujo técnico necesario para integrar ChatGPT Plus/Pro en una aplicación utilizando la infraestructura de OpenAI para clientes de desarrollo (Codex), basándose en la implementación de **OpenCode**.

## 1. Configuración de Identidad y Endpoints
Para que OpenAI reconozca la aplicación como un cliente autorizado, es imperativo utilizar los siguientes identificadores:

- **Client ID**: `app_EMoamEEZ73f0CkXaXp7hrann`
- **Issuer (Auth)**: `https://auth.openai.com`
- **Endpoint de Inferencia**: `https://chatgpt.com/backend-api/codex/responses`
- **Scopes**: `openid profile email offline_access`
- **Puerto Local (Callback)**: `1455`

---

## 2. Flujo de Autenticación (OAuth + PKCE)

### A. Preparación Criptográfica (PKCE)
No se utiliza un Client Secret. Se debe generar un reto criptográfico:
1. **Verifier**: Un string aleatorio de 43 a 128 caracteres.
2. **Challenge**: El hash SHA-256 del `verifier`, codificado en Base64Url.

*Referencia en OpenCode:* `packages/opencode/src/plugin/codex.ts` -> función `generatePKCE()`

### B. Lanzamiento del Navegador
Construir la URL de autorización y abrirla en el navegador predeterminado:
```
https://auth.openai.com/oauth/authorize?
  response_type=code&
  client_id=app_EMoamEEZ73f0CkXaXp7hrann&
  redirect_uri=http://localhost:1455/auth/callback&
  scope=openid+profile+email+offline_access&
  code_challenge=<CHALLENGE>&
  code_challenge_method=S256&
  id_token_add_organizations=true&
  codex_cli_simplified_flow=true&
  state=<STATE>&
  originator=opencode
```
*Dato Vital:* El parámetro `codex_cli_simplified_flow=true` es lo que activa la UI simplificada en ChatGPT.

### C. Servidor de Callback y Token Exchange
1. Levantar un servidor HTTP en el puerto `1455`.
2. Capturar el parámetro `code` de la URL tras el redireccionamiento.
3. Realizar un POST a `https://auth.openai.com/oauth/token` con:
   - `grant_type`: `authorization_code`
   - `code`: El código recibido.
   - `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
   - `code_verifier`: El verifier original.

---

## 3. Implementación del Interceptor de Red

Para que la aplicación funcione con ChatGPT Plus como si fuera una API estándar, se debe implementar un interceptor de peticiones con las siguientes reglas:

1. **Extracción de Account ID**:
   Parsear el `id_token` o `access_token` (JWT) para extraer el `chatgpt_account_id`. Es fundamental para usuarios con múltiples espacios de trabajo.
   *Referencia:* `packages/opencode/src/plugin/codex.ts` -> función `extractAccountId`

2. **Reescritura de Peticiones**:
   - **Destino**: Cambiar cualquier llamada a OpenAI (ej. `api.openai.com`) por `https://chatgpt.com/backend-api/codex/responses`.
   - **Headers**:
     - `Authorization`: `Bearer <ACCESS_TOKEN>`
     - `ChatGPT-Account-Id`: `<ACCOUNT_ID_EXTRAIDO>`
     - Remover cualquier header de `api-key`.

3. **Manejo de Costos y Modelos**:
   - Setear costos de tokens a `0` (está incluido en la suscripción).
   - Nombres de modelos internos a usar: `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.2`, `gpt-5.2-codex`.

---

## 4. Gestión de Sesión y Refresco
Para evitar que el usuario tenga que loguearse constantemente:
1. Almacenar el `refresh_token` de forma segura.
2. Implementar una rutina de refresco automático cuando el `access_token` expire (generalmente cada 3600 segundos).
3. Usar el grant type `refresh_token` contra el endpoint de token de OpenAI.

---

## 5. Archivos de Referencia en el Proyecto
Para que la IA de desarrollo implemente este flujo, debe consultar:
- `packages/opencode/src/plugin/codex.ts`: Lógica completa del plugin.
- `packages/opencode/src/auth/index.ts`: Definición de claves OAuth dummy.
- `packages/opencode/src/provider/transform.ts`: Transformación de modelos para el provider.
