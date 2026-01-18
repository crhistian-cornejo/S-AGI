<p align="center">
  <img src="public/logo.svg" width="120" alt="S-AGI Logo" />
</p>

# S-AGI
### Spreadsheet Agent with Univer & AI SDK v6

S-AGI es un agente de IA diseñado para interactuar con hojas de cálculo de forma natural. No es solo un chat; es una interfaz que entiende el contexto de tus datos, genera fórmulas complejas y manipula celdas usando el motor de **Univer**.

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg?style=flat-square" alt="Bun" />
  <img src="https://img.shields.io/badge/electron-33.4.5-informational.svg?style=flat-square" alt="Electron" />
</p>

---

## 🚀 Key Differences
- **Native Spreadsheet Engine**: A diferencia de otros agentes que solo generan CSVs estáticos, S-AGI emplea **Univer** para renderizar hojas de cálculo reales con soporte completo de fórmulas y formato persistente.
- **Agent Loop (v6)**: Implementa el nuevo agent loop de AI SDK v6 para ejecución de tareas multi-paso y uso dinámico de herramientas.
- **Deep Desktop Integration**: Construido sobre Electron con persistencia en Supabase, manejo de sesiones seguras y soporte para deep linking (`s-agi://`).

## 🛠 Tech Internals
- **Runtime**: [Bun](https://bun.sh) (Obligatorio para el flujo de desarrollo).
- **Core**: React 19 + TypeScript + Tailwind CSS.
- **Communication**: tRPC integrado con Electron IPC para comunicación type-safe entre Main y Renderer.
- **AI Layers**: Integración nativa con OpenAI (con soporte de reasoning/GPT-5) y Anthropic.
- **Persistence**: Supabase (Auth, PostgreSQL, Storage y Vector Store para File Search).

## 📦 Setup Rápido

```bash
# Instalación (Recomendado usar Bun para consistencia)
bun install

# Variables de entorno
cp .env.example .env
# Configura tus credenciales de Supabase y API keys de IA
```

### Comandos Disponibles
```bash
bun run dev      # Iniciar entorno de desarrollo (HMR habilitado)
bun run build    # Compilar assets para producción
bun run package  # Generar binario ejecutable (.app, .exe, .deb)
```

## 🍎 macOS Signing & Notarization
Para distribuir en macOS con Gatekeeper habilitado, configura estas variables en tu `.env` antes de ejecutar `bun run dist`:

- `APPLE_IDENTITY`: El nombre de tu certificado "Developer ID Application".
- `APPLE_TEAM_ID`: Tu ID de equipo de Apple Developer.
- `APPLE_ID`: Tu correo de Apple Developer.
- `APPLE_ID_PASSWORD`: Tu contraseña específica de aplicación (App-specific password).

## 📜 Attribution & License
Este proyecto es una evolución técnica basada en [21st-dev/1code](https://github.com/21st-dev/1code).  
Distribuido bajo la **Apache-2.0 License**. Consulta [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES) para detalles sobre atribuciones de terceros.

