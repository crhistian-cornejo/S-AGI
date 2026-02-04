# Variables de Entorno en Build y Producción

## Cómo Funciona

Este proyecto usa `electron-vite` que inyecta las variables de entorno durante el **build time**, no en runtime.

### Desarrollo

- El archivo `.env` se lee automáticamente por Vite
- Las variables están disponibles vía `import.meta.env.VITE_*` y `import.meta.env.MAIN_VITE_*`

### Build/Producción

- Las variables se **inyectan en el código compilado** durante `bun run build`
- El archivo `.env` NO se incluye en el empaquetado (está en `.gitignore`)
- Las variables quedan "hardcodeadas" en el bundle

## Configuración para Build

### Opción 1: Variables de Entorno del Sistema (Recomendado para CI/CD)

```bash
# Establecer variables antes del build
export MAIN_VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
export MAIN_VITE_SUPABASE_ANON_KEY="tu-key"
export VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
export VITE_SUPABASE_ANON_KEY="tu-key"

# Luego ejecutar el build
bun run build
```

### Opción 2: Archivo .env Local (Recomendado para builds locales)

1. Asegúrate de tener el archivo `.env` en la raíz del proyecto
2. Ejecuta el build normalmente:
   ```bash
   bun run build
   ```

### Opción 3: Archivo .env.production (Para diferentes entornos)

Puedes crear archivos específicos:

- `.env.development` - Para desarrollo
- `.env.production` - Para producción
- `.env.local` - Para overrides locales (tiene prioridad)

Vite automáticamente carga el archivo correcto según `NODE_ENV`.

## Variables Requeridas

Las siguientes variables son **obligatorias** para que la app funcione:

```bash
# Main process
MAIN_VITE_SUPABASE_URL=
MAIN_VITE_SUPABASE_ANON_KEY=

# Renderer process
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Verificación

Para verificar que las variables están correctamente inyectadas:

1. Ejecuta el build: `bun run build`
2. Busca en `out/main/index.cjs` o `out/renderer/index.html` las referencias a las variables
3. Deberías ver los valores reales inyectados (no `import.meta.env.VITE_*`)

## Notas Importantes

⚠️ **Seguridad**: Las variables con prefijo `VITE_` son **públicas** y se incluyen en el bundle del renderer.

- ✅ Usa `VITE_` solo para valores públicos (como URLs de Supabase)
- ❌ NO uses `VITE_` para API keys secretas (usa `MAIN_VITE_` para el main process)

🔒 **API Keys Secretas**: Si necesitas API keys secretas, deben estar en el main process con prefijo `MAIN_VITE_` y nunca exponerse al renderer.
