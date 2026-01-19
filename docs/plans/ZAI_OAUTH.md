# Plan de Implementación: Integración de Z.AI (GLM-4.7)

Este plan detalla la integración del proveedor **Z.AI** utilizando el **GLM Coding Plan** en S-AGI. La integración aprovechará el endpoint compatible con OpenAI e incorporará las capacidades avanzadas de razonamiento (interleaved logic) del modelo GLM-4.7.

## 1. Análisis de Z.AI GLM-4.7 (OpenAI Protocol)

Basado en la investigación, Z.AI ofrece las siguientes capacidades clave:
- **Base URL Dedicada**: `https://api.z.ai/api/coding/paas/v4` (específica para el Coding Plan).
- **Modelos**: `GLM-4.7` (flagship), `GLM-4.5-air` (rápido).
- **Interleaved Reasoning**: El modelo realiza razonamiento antes de responder o llamar herramientas.
- **Thinking Mode**: Soporta un "deep thinking mode" que puede ser controlado a nivel de turnos.
- **Compatibilidad**: 100% compatible con el SDK de OpenAI.

---

## 2. Cambios en el Backend (Main Process)

### A. Gestión de Credenciales
- Crear `src/main/lib/auth/zai-store.ts` para guardar la API Key de forma segura usando `safeStorage`.
- Crear `src/main/lib/auth/zai-manager.ts` para manejar la lógica de validación y obtención de la clave.

### B. Router de tRPC
- Actualizar `src/main/lib/trpc/routers/settings.ts` para incluir `hasZaiKey`.
- Añadir procedimientos en `src/main/lib/trpc/routers/auth.ts` para setear/limpiar la clave de Z.AI.

### C. Integración en el AI Agent Loop (`src/main/lib/trpc/routers/ai.ts`)
- Implementar el switch para el proveedor `zai`.
- Configurar el cliente OpenAI con la `baseURL` de Z.AI.
- Mapear el `Thinking Mode` de GLM al sistema de razonamiento de S-AGI.

---

## 3. Cambios en el Frontend (Renderer)

### A. Tipos y Definiciones
- Actualizar `src/shared/ai-types.ts`:
  - Añadir `zai` a `AIProvider`.
  - Definir modelos `GLM-4.7` y `GLM-4.5-air` con `supportsReasoning: true`.

### B. Estado Global (Atoms)
- Actualizar `src/renderer/lib/atoms/index.ts` para incluir `hasZaiKeyAtom`.
- Añadir `zai` al agrupamiento de modelos.

### C. UI de Configuración
- Modificar `src/renderer/features/settings/tabs/api-keys-tab.tsx`:
  - Añadir sección premium para **Z.AI Coding Plan**.
  - Visualizar el estado de conexión con un badge distintivo (Z.AI Brand Colors).

---

## 4. Cronograma de Tareas

1. [ ] **Fase 1: Shared & Types** - Definir constantes de modelos y proveedores.
2. [ ] **Fase 2: Secure Storage** - Implementar el almacenamiento de la API Key en el sistema.
3. [ ] **Fase 3: tRPC Integration** - Crear los endpoints para gestionar la clave desde el frontend.
4. [ ] **Fase 4: Core AI Logic** - Habilitar el router de AI para despachar peticiones a Z.AI.
5. [ ] **Fase 5: UI/UX** - Diseñar e implementar la pestaña de configuración y el selector de modelos.

---

## 5. Detalles Técnicos Adicionales

### Reasoning Mapping
GLM-4.7 usa un sistema de razonamiento que se integra bien con el `reasoning_summary` de las nuevas APIs de OpenAI. Configuraremos el software para capturar los bloques de "thinking" de GLM y mostrarlos en la UI de S-AGI de la misma forma que hacemos con GPT-5.

### Header de Identificación
Inyectaremos el header `X-ZAI-Source: S-AGI-Agent` para asegurar que las peticiones sean tratadas correctamente por el Coding Plan.
