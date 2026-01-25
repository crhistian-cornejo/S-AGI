# Guía: Tabla de Gastos Mensuales Profesional en Univer

## Descripción General

Se ha creado una tabla de gastos mensuales profesional en `/monthly-expenses-table.ts` que proporciona una solución completa para presupuestos y análisis de gastos usando Univer Spreadsheet.

## Características de la Tabla

### 1. Estructura de Columnas

| Columna | Descripción | Formato |
|---------|-------------|---------|
| A | Categorías de Gastos | Texto |
| B | Montos ($) | Moneda USD con 2 decimales |
| C | Porcentaje del Total (%) | Porcentaje con 1 decimal |

### 2. Categorías de Gastos Incluidas

- **Vivienda**: $1,200.00
- **Alimentación**: $450.00
- **Transporte**: $300.00
- **Servicios**: $150.00 (agua, luz, internet)
- **Entretenimiento**: $200.00
- **Salud**: $100.00
- **Otros**: $100.00

**Total Mensual**: $2,500.00

### 3. Características de Formato

#### Encabezados (Fila 0)
- ✓ Texto en negrita
- ✓ Fondo gris claro (#d3d3d3)
- ✓ Texto oscuro (#000000)
- ✓ Centrado
- ✓ Altura aumentada (32px)
- ✓ Bordes en todas las celdas

#### Filas de Datos (Filas 1-7)
- ✓ Filas alternadas con fondo gris muy claro (#f5f5f5) para mejor legibilidad
- ✓ Alineación: Categoría (izquierda), Montos (derecha), Porcentajes (centro)
- ✓ Bordes en todas las celdas

#### Fila de Total (Fila 8)
- ✓ Texto en negrita
- ✓ Fondo gris medio (#e0e0e0)
- ✓ Contiene fórmulas SUM automáticas
- ✓ Altura aumentada (30px)

### 4. Fórmulas Implementadas

#### Cálculo de Porcentajes
```
=(B{fila}/$B$8)*100
```
- Divide cada gasto entre el total (referencia absoluta a B8)
- Multiplica por 100 para obtener porcentaje
- Formatea con 1 decimal

#### Total de Gastos
```
=SUM(B1:B7)
```
- Suma automática de todos los gastos
- Formatea en moneda USD

#### Total de Porcentajes
```
=SUM(C1:C7)
```
- Suma de todos los porcentajes
- Debe resultar en 100.0%

### 5. Estilos y Colores

```
Colores:
- Encabezado: Gris claro (#d3d3d3) con texto oscuro
- Filas alternas: Gris muy claro (#f5f5f5)
- Total: Gris medio (#e0e0e0) con negrita
- Bordes: Línea fina (1px) en todas las celdas
```

## Cómo Usar

### Opción 1: Usar la Tabla de Ejemplo Predefinida

```typescript
import { getMonthlyExpensesTableData } from '@/path/to/monthly-expenses-table'
import { createWorkbook } from '@/path/to/univer-sheets-core'

// En tu componente React:
const expensesData = getMonthlyExpensesTableData()
const workbook = createWorkbook(univer, api, expensesData, 'monthly-expenses')
```

### Opción 2: Usar la Constante Exportada

```typescript
import { MONTHLY_EXPENSES_TABLE_DATA } from '@/path/to/monthly-expenses-table'
import { createWorkbook } from '@/path/to/univer-sheets-core'

const workbook = createWorkbook(
    univer,
    api,
    MONTHLY_EXPENSES_TABLE_DATA,
    'monthly-expenses'
)
```

### Opción 3: Crear Tabla Personalizada

```typescript
import { createCustomExpensesTable } from '@/path/to/monthly-expenses-table'
import { createWorkbook } from '@/path/to/univer-sheets-core'

// Definir gastos personalizados
const customExpenses = [
    { category: 'Renta', amount: 1500 },
    { category: 'Comida', amount: 600 },
    { category: 'Auto', amount: 400 },
    { category: 'Utilidades', amount: 200 },
]

const customData = createCustomExpensesTable(customExpenses)
const workbook = createWorkbook(univer, api, customData, 'custom-budget')
```

## Estructura de Datos Detallada

### Interfaz Principal

```typescript
interface ExpensesTableData {
    id: string                    // Identificador único
    name: string                  // Nombre del documento
    sheetOrder: string[]          // Orden de las hojas
    sheets: {
        [key: string]: {
            id: string            // ID de la hoja
            name: string          // Nombre de la hoja
            rowCount: number      // Número total de filas
            columnCount: number   // Número total de columnas
            cellData: {           // Datos de las celdas
                [key: string]: {
                    v?: any       // Valor de la celda
                    t?: string    // Tipo ('s' = string, 'n' = number)
                    f?: string    // Fórmula
                    nm?: string   // Formato de número
                    s?: string    // ID de estilo
                }
            }
            columnData?: {        // Ancho de columnas
                [key: number]: {
                    width?: number
                }
            }
            rowData?: {           // Alto de filas
                [key: number]: {
                    height?: number
                }
            }
            styles?: {            // Definiciones de estilos
                [key: string]: {
                    bf?: boolean       // negrita
                    fs?: number        // tamaño de fuente
                    fc?: { rgb: string } // color de texto
                    bg?: { rgb: string } // color de fondo
                    al?: string        // alineación
                    bl?: number        // borde izquierdo
                    br?: number        // borde derecho
                    bt?: number        // borde superior
                    bb?: number        // borde inferior
                }
            }
        }
    }
}
```

## Formatos Numéricos

### Moneda (Columna B)
```
$#,##0.00
```
- Símbolo de dólar al inicio
- Separador de miles
- 2 decimales

Ejemplos:
- 1200 → $1,200.00
- 450.50 → $450.50
- 100 → $100.00

### Porcentaje (Columna C)
```
0.0
```
- Sin símbolo de porcentaje (se calcula como número 0-100)
- 1 decimal
- Centrado

Ejemplos:
- 48.0 (para 48%)
- 18.0 (para 18%)
- 4.0 (para 4%)

## Ancho de Columnas

```
Columna A (Categoría):  240px
Columna B (Monto):      180px
Columna C (Porcentaje): 240px
```

## Alto de Filas

```
Fila 0 (Encabezado): 32px
Filas 1-7 (Datos):   28px (predeterminado)
Fila 8 (Total):      30px
```

## Ventajas de esta Implementación

1. ✓ Completamente profesional y lista para usar
2. ✓ Fórmulas automáticas - Los cálculos se actualizan en tiempo real
3. ✓ Formato de moneda - Claramente diferenciable
4. ✓ Porcentajes calculados - Muestra la distribución de gastos
5. ✓ Flexible - Fácil de personalizar con nuevas categorías
6. ✓ Reutilizable - Puede usarse para múltiples presupuestos
7. ✓ Estilizado profesionalmente - Listo para presentaciones
8. ✓ Compatible con Univer - Integración directa sin conversiones

## Ejemplo de Uso Completo

```typescript
// components/ExpensesReportPanel.tsx
import React from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getMonthlyExpensesTableData } from '@/monthly-expenses-table'

export function ExpensesReportPanel() {
    const expensesData = getMonthlyExpensesTableData()

    return (
        <div className="w-full h-full">
            <h2 className="text-2xl font-bold mb-4">Presupuesto Mensual</h2>
            <UniverSpreadsheet data={expensesData} />
        </div>
    )
}
```

## Personalización Avanzada

### Cambiar Colores

En `monthly-expenses-table.ts`, modifica estas constantes:

```typescript
const HEADER_BG = '#d3d3d3'        // Color fondo encabezado
const HEADER_TEXT = '#000000'      // Color texto encabezado
const ALTERNATE_ROW_BG = '#f5f5f5' // Color filas alternas
```

### Agregar Más Categorías

Modifica el array `expenses` en `generateMonthlyExpensesData()`:

```typescript
const expenses = [
    { category: 'Vivienda', amount: 1200 },
    { category: 'Alimentación', amount: 450 },
    // ... más categorías
    { category: 'Nuevos Gastos', amount: 250 },
]
```

**Importante**: Si cambias el número de categorías, actualiza también:
- El range en las fórmulas SUM (B1:B7 → B1:BN donde N es el nuevo total)
- El número de filas en `expenses.forEach((expense, rowIndex))`

## Errores Comunes y Soluciones

### Error: "Fórmulas no se calculan"
- Asegúrate de que `v` (valor) es `null` o `undefined` en celdas con fórmulas
- Univer calcula automáticamente al cargar

### Error: "Porcentajes no suman 100%"
- Verifica que las fórmulas usan referencia absoluta `$B$8`
- Comprueba que todas las categorías están incluidas

### Error: "Formato de moneda no aparece"
- Verifica que `nm: '$#,##0.00'` está presente
- Asegúrate de que `t: 'n'` (tipo número) está establecido

## Exportación y Conversión

Para exportar a CSV:

```typescript
import { convertToCSV } from '@/univer-advanced-examples'

const csvData = convertToCSV(getMonthlyExpensesTableData())
console.log(csvData)
```

## Integración con API

Para guardar datos personalizados desde una API:

```typescript
import { createCustomExpensesTable } from '@/monthly-expenses-table'

// Supón que tienes datos de una API
const apiExpenses = await fetchExpensesFromAPI()

const tableData = createCustomExpensesTable(apiExpenses)
// Guardar con createWorkbook()
```

## Notas Técnicas

- Las fórmulas usan referencias absolutas ($B$8) para el total
- Los estilos se aplican a nivel de celda individual
- El alternado de filas usa cálculo con módulo (rowIndex % 2)
- Los bordes se aplican a todas las celdas (BORDER_STYLE = 1)
- El número de formatos sigue el estándar Excel

## Archivos Relacionados

- `/univer-sales-table-example.ts` - Ejemplo de tabla de ventas (similar)
- `/univer-advanced-examples.ts` - Funciones auxiliares (CSV, estadísticas)
- `/apps/electron/renderer/features/univer/univer-sheets-core.ts` - Core de Univer
- `/apps/electron/renderer/features/univer/univer-spreadsheet.tsx` - Componente React

## Soporte y Mejoras Futuras

Esta implementación es completamente funcional y lista para producción. Posibles mejoras futuras:

1. Gráficos de pastel (pie chart) con distribución de gastos
2. Análisis comparativo mes a mes
3. Proyecciones de gastos
4. Alertas de presupuesto excedido
5. Exportación a PDF
6. Histórico de cambios
