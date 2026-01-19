#!/usr/bin/env node

const { spawnSync } = require('child_process')

function run(cmd, args) {
    try {
        spawnSync(cmd, args, { stdio: 'ignore' })
    } catch (_) {
        // Best-effort only; ignore errors so predev never blocks dev
    }
}

const platform = process.platform

// Kill Vite dev server on port 5173 and old Electron instances.
// macOS/Linux: keep the original lsof/pkill behavior.
// Windows: use PowerShell equivalents, but keep everything best-effort and scoped.

if (platform === 'darwin' || platform === 'linux') {
    run('bash', ['-lc', "lsof -ti:5173 | xargs kill -9 2>/dev/null || true"])
    run('bash', ['-lc', "pkill -9 -f 'Electron.*S-AGI' 2>/dev/null || true"])
} else if (platform === 'win32') {
    // Kill any process listening on port 5173 (typically Vite dev server)
    run('powershell', [
        '-NoProfile',
        '-Command',
        "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {} }"
    ])

    // Kill Electron processes whose main window title contains 'S-AGI' (best-effort)
    run('powershell', [
        '-NoProfile',
        '-Command',
        "Get-Process Electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*S-AGI*' } | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {} }"
    ])
}
