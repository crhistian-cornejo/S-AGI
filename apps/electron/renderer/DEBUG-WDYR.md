# Why Did You Render (WDYR) - React Re-render Debugging

Documentación para usar WDYR para debuggear loops infinitos de re-renders y re-renders innecesarios.

## ¿Cómo activar?

1. Abrir `apps/electron/renderer/wdyr.ts`
2. Cambiar `const WDYR_ENABLED = false` a `const WDYR_ENABLED = true`
3. Reiniciar `bun run dev`

## ¿Qué es WDYR?

[Why Did You Render](https://github.com/welldone-software/why-did-you-render) es una librería que parchea React para notificarte sobre re-renders evitables. Ayuda a identificar:

- Re-renders causados por nuevas referencias de objetos/arrays (en vez de cambios reales)
- Props que cambian innecesariamente
- Loops infinitos de re-renders

## Archivos involucrados

1. **`wdyr.ts`** - Inicialización de WDYR con detección de loops
2. **`main.tsx`** - Importa wdyr.ts PRIMERO (antes de React)
3. **`electron.vite.config.ts`** - Configura jsxImportSource para dev

## Configuración en Vite

En `electron.vite.config.ts`, configuramos WDYR como JSX import source en dev:

```typescript
react({
  jsxImportSource: isDev ? "@welldone-software/why-did-you-render" : undefined,
})
```

Esto es **crítico** - sin esto, WDYR solo trackea componentes con `React.memo` o `PureComponent`. Con el JSX import source, trackea TODOS los componentes.

## Output de ejemplo

Cuando WDYR detecta re-renders innecesarios:

```
[WDYR] ChatMessage render #3 { props: ['message'], state: false, hooks: false }
[WDYR] ChatMessage render #4 { props: ['message'], state: false, hooks: false }
...
🔴 INFINITE LOOP DETECTED: ChatMessage rendered 10+ times in 1000ms
```

## Cómo interpretar

1. **props: ['message']** → La prop `message` cambió de referencia (pero quizás no de valor)
2. **hooks: ['useState']** → Un hook causó el re-render
3. **state: ['count']** → El state 'count' cambió

## Soluciones comunes

### 1. Objetos/Arrays nuevos en cada render

```tsx
// ❌ MAL - Crea nuevo array cada render
<Component items={data.filter(x => x.active)} />

// ✅ BIEN - Memoizar
const activeItems = useMemo(() => data.filter(x => x.active), [data])
<Component items={activeItems} />
```

### 2. Callbacks recreados

```tsx
// ❌ MAL - Nueva función cada render
<Button onClick={() => handleClick(id)} />

// ✅ BIEN - useCallback
const handleButtonClick = useCallback(() => handleClick(id), [id])
<Button onClick={handleButtonClick} />
```

### 3. Context que cambia demasiado

```tsx
// ❌ MAL - Nuevo objeto cada render del provider
<Context.Provider value={{ user, setUser }}>

// ✅ BIEN - Memoizar el value
const contextValue = useMemo(() => ({ user, setUser }), [user])
<Context.Provider value={contextValue}>
```

## Desactivar para componentes específicos

Si un componente re-renderiza mucho pero es intencional:

```tsx
// Excluir del tracking
MyComponent.whyDidYouRender = false
```

## Notas importantes

- Solo funciona en modo desarrollo (`bun run dev`)
- Tiene overhead de performance - desactivar cuando no se esté debugging
- El debugger se activa automáticamente al detectar 10+ renders en 1 segundo
