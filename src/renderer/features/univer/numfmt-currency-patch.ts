/**
 * Re-exports @univerjs/sheets-numfmt with an extended currencySymbols list.
 * Use via Vite alias: @univerjs/sheets-numfmt -> this file (renderer only).
 * We import from @univerjs/sheets-numfmt$real (alias to the real package) to avoid cycles.
 *
 * Added: PEN (S/), MXN (MX$), BRL (R$), COP (COL$), ARS (AR$), CLP (CL$),
 * DOP (RD$), GTQ (Q), HNL (L), NIO (C$), PAB (B/.), BOB (Bs.), UYU ($U),
 * TWD (NT$), CAD (CA$), AUD (A$), CHF (CHF).
 */

import * as _Numfmt from '@univerjs/sheets-numfmt$real'

const _base: string[] = _Numfmt.currencySymbols ?? []
const _extra: string[] = [
  'S/',   // PEN - Sol peruano
  'MX$',  // MXN - Peso mexicano
  'R$',   // BRL - Real brasileño
  'COL$', // COP - Peso colombiano
  'AR$',  // ARS - Peso argentino
  'CL$',  // CLP - Peso chileno
  'RD$',  // DOP - Peso dominicano
  'Q',    // GTQ - Quetzal guatemalteco
  'L',    // HNL - Lempira hondureño
  'C$',   // NIO - Córdoba nicaragüense
  'B/.',  // PAB - Balboa panameño
  'Bs.',  // BOB - Boliviano
  '$U',   // UYU - Peso uruguayo
  'NT$',  // TWD - Dólar taiwanés
  'CA$',  // CAD - Dólar canadiense
  'A$',   // AUD - Dólar australiano
  'CHF',  // CHF - Franco suizo
]

export const currencySymbols: string[] = [..._extra, ..._base]

export {
  getCurrencyFormat,
  getCurrencySymbolByLocale,
  getCurrencySymbolIconByLocale,
  localeCurrencySymbolMap,
} from '@univerjs/sheets-numfmt$real'
export { CURRENCYFORMAT, DATEFMTLISG, NUMBERFORMAT } from '@univerjs/sheets-numfmt$real'
export { AddDecimalCommand, SetCurrencyCommand, SetPercentCommand, SubtractDecimalCommand } from '@univerjs/sheets-numfmt$real'
export type { ISetNumfmtCommandParams } from '@univerjs/sheets-numfmt$real'
export { SetNumfmtCommand } from '@univerjs/sheets-numfmt$real'
export { SHEETS_NUMFMT_PLUGIN_CONFIG_KEY } from '@univerjs/sheets-numfmt$real'
export type { IUniverSheetsNumfmtConfig } from '@univerjs/sheets-numfmt$real'
export { SheetsNumfmtCellContentController, UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt$real'
export { getCurrencyType } from '@univerjs/sheets-numfmt$real'
export {
  getDecimalFromPattern,
  getDecimalString,
  isPatternHasDecimal,
  setPatternDecimal,
} from '@univerjs/sheets-numfmt$real'
export {
  getCurrencyFormatOptions,
  getCurrencyOptions,
  getDateFormatOptions,
  getNumberFormatOptions,
} from '@univerjs/sheets-numfmt$real'
export {
  getPatternPreview,
  getPatternPreviewIgnoreGeneral,
  getPatternType,
} from '@univerjs/sheets-numfmt$real'
