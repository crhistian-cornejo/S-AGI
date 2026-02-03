# Electron Best Practices for S-AGI

## Performance & Resource Optimization

### 1. Memory Management

```typescript
// ❌ Bad: Loading everything at startup
import { HeavyComponent } from './heavy-component';

// ✅ Good: Lazy load heavy components
const HeavyComponent = lazy(() => import('./heavy-component'));
```

**Recommendations:**
- Use `React.lazy()` and `Suspense` for code splitting
- Unload unused windows/webContents when not visible
- Clear intervals/timeouts on component unmount
- Use `WeakMap` and `WeakSet` for caching that can be garbage collected

### 2. Renderer Process Optimization

```typescript
// ❌ Bad: Heavy computation in renderer
const result = heavyCalculation(data);

// ✅ Good: Use Web Workers for heavy tasks
const worker = new Worker('./worker.js');
worker.postMessage(data);
worker.onmessage = (e) => setResult(e.data);
```

**Recommendations:**
- Move CPU-intensive tasks to Web Workers
- Use `requestIdleCallback()` for non-urgent tasks
- Debounce/throttle frequent operations (scroll, resize, input)
- Virtualize long lists with `react-window` or `@tanstack/virtual`

### 3. IPC Communication

```typescript
// ❌ Bad: Sending large objects frequently
ipcRenderer.send('update', entireAppState);

// ✅ Good: Send only changed data
ipcRenderer.send('update-field', { id, field, value });
```

**Recommendations:**
- Minimize IPC payload size
- Batch multiple IPC calls when possible
- Use `ipcRenderer.invoke()` for request-response patterns
- Avoid synchronous IPC (`sendSync`) - it blocks the renderer

### 4. Window Management

```typescript
// ❌ Bad: Creating new windows for everything
const popup = new BrowserWindow({ show: true });

// ✅ Good: Reuse windows, hide instead of destroy
if (existingWindow) {
  existingWindow.show();
} else {
  createWindow();
}
```

**Recommendations:**
- Pool and reuse BrowserWindow instances
- Use `show: false` and show only when ready
- Set appropriate `backgroundThrottling` for hidden windows
- Use `webPreferences.v8CacheOptions: 'bypassHeatCheck'` for faster startup

---

## App Size Optimization

### 1. Dependencies

```bash
# Check bundle size impact
npx bundle-phobia <package-name>

# Analyze your bundle
npx electron-builder --dir
npx source-map-explorer out/**/*.js
```

**Recommendations:**
- Audit dependencies regularly with `depcheck`
- Replace heavy libs with lighter alternatives:
  - `moment` → `date-fns` or `dayjs`
  - `lodash` → native ES6 or `lodash-es` (tree-shakeable)
  - `uuid` → `crypto.randomUUID()`
- Use `peerDependencies` for shared packages

### 2. Asset Optimization

```yaml
# electron-builder.yml
files:
  - "out/**/*"
  - "!**/*.map"           # Exclude source maps
  - "!**/*.d.ts"          # Exclude type definitions
  - "!**/test/**"         # Exclude tests
  - "!**/docs/**"         # Exclude documentation
```

**Recommendations:**
- Compress images with `sharp` or `imagemin`
- Use WebP/AVIF formats for images
- Inline small assets as base64 (< 4KB)
- Remove unused fonts and icons

### 3. Native Modules

```yaml
# electron-builder.yml
asarUnpack:
  - "**/node_modules/better-sqlite3/**/*"  # Only unpack what's needed
```

**Recommendations:**
- Prefer pure JS alternatives when performance allows
- Use `prebuild` for native modules to avoid rebuild
- Set `npmRebuild: false` if using pre-built binaries

### 4. ASAR Packaging

```yaml
asar: true
asarUnpack:
  - "**/*.node"           # Native modules
  - "**/sharp/**/*"       # Modules that need file access
```

---

## Startup Performance

### 1. Preload Scripts

```typescript
// preload.ts - Keep minimal
contextBridge.exposeInMainWorld('api', {
  // Only expose what's needed
  send: (channel: string, data: unknown) => {
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  }
});
```

### 2. Deferred Loading

```typescript
// main.ts
app.whenReady().then(() => {
  // Show window immediately with splash
  createWindow();

  // Load heavy modules after window is visible
  setImmediate(() => {
    require('./heavy-module');
  });
});
```

### 3. V8 Snapshots

```yaml
# electron-builder.yml
electronDist: electron  # Use custom electron with snapshots
```

---

## Energy Efficiency

### 1. Background Throttling

```typescript
const win = new BrowserWindow({
  webPreferences: {
    backgroundThrottling: true,  // Throttle when hidden
  }
});

// Pause animations when hidden
win.on('hide', () => win.webContents.send('pause-animations'));
win.on('show', () => win.webContents.send('resume-animations'));
```

### 2. Power Monitor

```typescript
import { powerMonitor } from 'electron';

powerMonitor.on('on-battery', () => {
  // Reduce update frequency
  setUpdateInterval(60000); // 1 minute
});

powerMonitor.on('on-ac', () => {
  // Normal update frequency
  setUpdateInterval(5000); // 5 seconds
});
```

### 3. Idle Detection

```typescript
powerMonitor.on('suspend', () => {
  // Pause background tasks
  pauseSync();
  pausePolling();
});

powerMonitor.on('resume', () => {
  // Resume with fresh data
  refreshData();
});
```

---

## Security Best Practices

### 1. Context Isolation

```typescript
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // Always enable
    nodeIntegration: false,      // Always disable
    sandbox: true,               // Enable sandbox
    webSecurity: true,           // Keep enabled
  }
});
```

### 2. CSP Headers

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'"
      ].join('; ')
    }
  });
});
```

---

## Monitoring & Debugging

### 1. Performance Metrics

```typescript
// Renderer
const metrics = await window.performance.getEntriesByType('navigation');
console.log('Page load time:', metrics[0].loadEventEnd);

// Main process
const memUsage = process.memoryUsage();
console.log('Heap used:', memUsage.heapUsed / 1024 / 1024, 'MB');
```

### 2. Crash Reporting

```typescript
import { crashReporter } from 'electron';

crashReporter.start({
  productName: 'S-AGI',
  submitURL: 'https://your-crash-server.com/submit',
  uploadToServer: true
});
```

---

## S-AGI Specific Optimizations

### Current Implementations

| Feature | Optimization Applied |
|---------|---------------------|
| Univer Spreadsheet | Lazy loaded with `React.lazy()` |
| PDF Viewer | Web Worker for parsing |
| Agent Panel | Streaming responses |
| Notes Editor | BlockNote with virtual scrolling |
| File Versions | Cached in Jotai atoms |

### Recommended Improvements

1. **Split main bundle** - Current `index.js` is 19MB, should be < 5MB
2. **Image optimization** - Convert PNGs to WebP in build step
3. **Font subsetting** - Only include used glyphs
4. **Tree shaking** - Verify Vite config excludes dead code
5. **Preload critical CSS** - Inline above-fold styles

---

## Useful Commands

```bash
# Analyze bundle size
bun run build && npx source-map-explorer out/renderer/assets/*.js

# Check for unused dependencies
npx depcheck

# Profile startup time
electron --trace-startup . --trace-startup-file=startup.json

# Memory profiling
electron --js-flags="--expose-gc" .
```

---

## Resources

- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [V8 Blog](https://v8.dev/blog)
- [Chrome DevTools Memory](https://developer.chrome.com/docs/devtools/memory-problems/)
- [electron-builder optimization](https://www.electron.build/configuration/configuration#optimization)
