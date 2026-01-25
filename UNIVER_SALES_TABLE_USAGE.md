# Tabla de Ventas Profesional con Univer - Guía de Uso

## Descripción General

Se ha creado una tabla de ejemplo profesional de "Ventas de Productos" usando Univer Spreadsheet. La tabla incluye todos los elementos solicitados:

- ✅ Encabezado con títulos en **NEGRITA**
- ✅ 10 filas de datos mock realistas
- ✅ Estilos visuales profesionales completos
- ✅ Fórmulas de cálculo (Total y SUM)

## Características de la Tabla

### 1. **Estructura de Columnas**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| ID | Texto | Identificador único del producto |
| Producto | Texto | Nombre del producto |
| Categoría | Texto | Categoría del producto |
| Cantidad | Número | Cantidad vendida |
| Precio Unitario | Moneda | Precio por unidad ($) |
| Total | Moneda | Cantidad × Precio Unitario (Fórmula) |
| Fecha | Fecha | Fecha de venta |

### 2. **Estilos Visuales**

#### Encabezado (Fila 0)
- **Fondo**: Azul oscuro (#1e3a8a)
- **Texto**: Blanco (#ffffff)
- **Tipografía**: Negrita (bf: true)
- **Alineación**: Centrada
- **Bordes**: Definidos en todos los lados

#### Filas de Datos (Filas 1-10)
- **Filas alternadas**: Alternan entre blanco y azul claro (#f0f9ff)
- **Bordes**: Definidos en todas las celdas
- **Alineación**:
  - Texto: Izquierda
  - Números/Moneda: Derecha
- **Formato de moneda**: $#,##0.00

#### Fila de Totales (Fila 11)
- **Fondo**: Azul claro (#dbeafe)
- **Tipografía**: Negrita
- **Contiene fórmulas SUM** para cantidad y total

### 3. **Datos Realistas**

La tabla incluye 10 productos reales con información detallada:

1. **Laptop HP ProBook 15** - 5 unidades - $1,299.99 c/u
2. **Monitor LG 27" 4K** - 8 unidades - $399.50 c/u
3. **Teclado Mecánico RGB** - 12 unidades - $149.99 c/u
4. **Mouse Inalámbrico Pro** - 15 unidades - $79.99 c/u
5. **Webcam Full HD 1080p** - 10 unidades - $89.50 c/u
6. **Micrófono USB Profesional** - 6 unidades - $159.99 c/u
7. **Dock Thunderbolt 3** - 4 unidades - $299.99 c/u
8. **Adaptador HDMI 2.1** - 20 unidades - $24.99 c/u
9. **Monitor Luz LED Ajustable** - 7 unidades - $129.99 c/u
10. **Soporte Doble Monitor** - 9 unidades - $199.50 c/u

### 4. **Ancho de Columnas**

```
ID:              80px
Producto:        200px
Categoría:       130px
Cantidad:        100px
Precio Unitario: 130px
Total:           130px
Fecha:           110px
```

### 5. **Altura de Filas**

```
Encabezado (Fila 0):  32px
Filas de datos:       28px (por defecto)
Fila de totales:      30px
```

## Fórmulas Incluidas

### Columna Total (F)
```
=D{row}*E{row}
```
Ejemplo: `=D1*E1` → Multiplica cantidad por precio unitario

### Fila de Totales

**Cantidad Total (D11)**:
```
=SUM(D1:D10)
```

**Gran Total (F11)**:
```
=SUM(F1:F10)
```

## Cómo Usar en el Código

### Opción 1: Usando la función exportada

```typescript
import { getSalesTableData } from './univer-sales-table-example'
import { createWorkbook } from './univer-sheets-core'

const salesData = getSalesTableData()
const workbook = createWorkbook(univer, api, salesData, 'sales-report')
```

### Opción 2: Usando la constante directa

```typescript
import { SALES_TABLE_DATA } from './univer-sales-table-example'

const workbook = createWorkbook(univer, api, SALES_TABLE_DATA)
```

### Opción 3: En el componente React

```typescript
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from './univer-sales-table-example'

export function SalesReportComponent() {
    const salesData = getSalesTableData()

    return <UniverSpreadsheet data={salesData} artifactId="sales-report" />
}
```

## Estructura de Datos Univer

El archivo incluye la interfaz TypeScript `SalesTableData` que define la estructura completa:

```typescript
interface SalesTableData {
    id: string                          // ID único del workbook
    name: string                        // Nombre del workbook
    sheetOrder: string[]               // Orden de las sheets
    sheets: {
        [key: string]: {
            id: string                 // ID de la sheet
            name: string              // Nombre de la sheet
            rowCount: number          // Número total de filas
            columnCount: number       // Número total de columnas
            cellData: {}              // Datos de las celdas
            columnData: {}            // Ancho de columnas
            rowData: {}               // Altura de filas
            defaultColumnWidth: number
            defaultRowHeight: number
            styles: {}                // Definiciones de estilos
        }
    }
}
```

## Personalización

### Cambiar Colores

En el archivo `univer-sales-table-example.ts`, modifica estas constantes:

```typescript
const HEADER_BG = '#1e3a8a'           // Color fondo encabezado
const HEADER_TEXT = '#ffffff'          // Color texto encabezado
const ALTERNATE_ROW_BG = '#f0f9ff'    // Color filas alternas
```

### Agregar Más Productos

Simplemente agrega objetos al array `products`:

```typescript
const products = [
    // ... productos existentes ...
    {
        id: 'P011',
        name: 'Nuevo Producto',
        category: 'Categoría',
        quantity: 5,
        unitPrice: 99.99,
        date: '2024-01-25',
    }
]
```

### Cambiar Ancho de Columnas

Modifica el objeto `columnData`:

```typescript
columnData: {
    0: { width: 100 },  // ID
    1: { width: 250 },  // Producto (más ancho)
    // ... resto de columnas
}
```

## Características de Univer Utilizadas

✅ **Formato de celdas**:
- Bold (bf)
- Font size (fs)
- Font color (fc)
- Background color (bg)
- Alignment (al)
- Borders (bl, br, bt, bb)
- Number formatting (nm)

✅ **Fórmulas**:
- Multiplicación simple (D*E)
- Función SUM()

✅ **Estructura**:
- Multiple sheets support
- Cell references
- Column/row dimension control

## Resultado Visual

La tabla se verá así en Univer:

```
┌─────┬──────────────────────┬──────────────┬────────┬─────────────┬──────────────┬──────────┐
│ ID  │ Producto             │ Categoría    │Cantidad│ Precio Unit.│ Total        │ Fecha    │
├─────┼──────────────────────┼──────────────┼────────┼─────────────┼──────────────┼──────────┤
│P001 │ Laptop HP ProBook 15 │ Electrónica  │   5    │  $1,299.99  │  $6,499.95   │2024-01-15│
├─────┼──────────────────────┼──────────────┼────────┼─────────────┼──────────────┼──────────┤
│P002 │ Monitor LG 27" 4K    │ Periféricos  │   8    │   $399.50   │  $3,196.00   │2024-01-16│
├─────┼──────────────────────┼──────────────┼────────┼─────────────┼──────────────┼──────────┤
│ ... │ ...                  │ ...          │  ...   │    ...      │    ...       │   ...    │
├─────┼──────────────────────┼──────────────┼────────┼─────────────┼──────────────┼──────────┤
│     │                      │              │ SUM:96 │  TOTAL:     │  $13,289.89  │          │
└─────┴──────────────────────┴──────────────┴────────┴─────────────┴──────────────┴──────────┘
```

Con filas alternadas en color azul claro (#f0f9ff) y encabezado en azul oscuro con texto blanco.

## Notas Importantes

1. Las fórmulas se calculan automáticamente por el motor de Univer
2. El formato de moneda ($) se aplica automáticamente a las columnas de precios
3. Los bordes se definen con el código `1` (thin border)
4. La estructura soporta cualquier número de filas adicionales
5. Los datos están optimizados para renderizado rápido

## Archivos Relacionados

- **Componente**: `/apps/electron/renderer/features/univer/univer-spreadsheet.tsx`
- **Core**: `/apps/electron/renderer/features/univer/univer-sheets-core.ts`
- **Ejemplo**: `/univer-sales-table-example.ts` (este archivo)
