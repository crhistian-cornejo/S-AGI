# Plan de Implementación: Caching + Virtualización + Workers

## Resumen

Implementar mejoras de rendimiento inspiradas en Midday: caching de datos en UI, virtualización de listas largas y workers para tareas pesadas (procesamiento de documentos, conversiones y exportaciones) sin bloquear la interfaz.

## Objetivos

- Reducir el tiempo de respuesta en chats largos y listas de artifacts.
- Evitar bloqueos de UI durante tareas pesadas.
- Mantener consistencia de datos y una UX fluida.

## Alcance

- **Frontend (renderer)**: caching de queries y virtualización de listas.
- **Backend (main process)**: mover tareas pesadas a workers.
- **Infra**: métricas básicas de latencia y errores.

## Criterios de éxito

- Scroll fluido en chats con >1,000 mensajes.
- Listas de artifacts y PDFs con render estable.
- Tareas pesadas no bloquean la UI ni congelan Electron.
- Tiempo de respuesta percibido mejorado (p95 < 200ms para interacciones comunes).

## Fase 1: Caching en UI

### 1.1 Inventario de queries críticas

- Chat list
- Message list
- Artifacts list
- PDF list

### 1.2 Ajustes de React Query (tRPC)

- Definir `staleTime`, `gcTime` y `refetchOnWindowFocus` por cada query crítica.
- Activar `keepPreviousData` en listas paginadas o con filtros.
- Prefetch al seleccionar chat o artifact.

### 1.3 Normalización de datos

- Consolidar estados derivados (sorted, filtered) con `useMemo`.
- Evitar recomputar en cada render.

## Fase 2: Virtualización de listas

### 2.1 Componentes candidatos

- Lista de mensajes en chat.
- Lista de artifacts y PDFs.
- Historial o sidebar con muchas entradas.

### 2.2 Estrategia técnica

- Usar virtualización con medición de altura variable.
- Mantener el comportamiento de scroll con anclaje al final (chat).
- Soportar cargas incrementales y rendering por ventana.

### 2.3 Entregables

- Nuevo componente virtualizado reutilizable.
- Reemplazo progresivo en las listas críticas.

## Fase 3: Workers para tareas pesadas

### 3.1 Tareas a mover

- Procesamiento de documentos (PDF, texto, extracción).
- Conversiones de archivos y exportaciones.
- Generación de thumbnails o preprocesamiento pesado.

### 3.2 Diseño de workers

- Worker por dominio (documents, exports).
- Cola simple en main process con retry y estado.
- Canal de eventos hacia renderer para progreso.

### 3.3 Integración

- Reemplazar llamadas directas por encolado.
- UI con estados: pending, processing, completed, failed.

## Fase 4: Observabilidad y regresión

- Logs estructurados de tiempos de procesamiento.
- Métricas básicas: duración por tarea, colas pendientes.
- Validación de regresiones de UX (scroll, click latency).

## Riesgos y mitigaciones

- **Virtualización y UX**: evitar saltos de scroll con medidas precalculadas.
- **Workers**: garantizar cancelación segura y limpieza de recursos.
- **Cachés inconsistentes**: invalidaciones por eventos de escritura.

## Roadmap sugerido

1. Ajustes de caching en queries críticas.
2. Virtualización de message list.
3. Virtualización de artifacts/PDF list.
4. Worker para procesamiento de documentos.
5. Worker para exportaciones/convert.
6. Observabilidad y ajustes finos.

## Dependencias

- React Query/tRPC ya integrado.
- Infra de IPC para progreso de tareas.

## Checklist de entrega

- Caching configurado y validado.
- Virtualización activa en listas críticas.
- Workers desplegados con progreso.
- Verificación de rendimiento y UX.
