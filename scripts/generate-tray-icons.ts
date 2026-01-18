/**
 * Generate PNG tray icons from SVG for macOS compatibility
 * 
 * macOS menu bar icons should be:
 * - trayTemplate.png: 18x18 pixels
 * - trayTemplate@2x.png: 36x36 pixels (Retina)
 * 
 * The "Template" suffix tells macOS to automatically adapt
 * the icon color based on the menu bar appearance (light/dark).
 * 
 * Run: bun scripts/generate-tray-icons.ts
 */

import sharp from 'sharp'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const srcDir = join(import.meta.dirname, '../src/main')
const svgPath = join(srcDir, 'trayTemplate.svg')

async function generateTrayIcons() {
    console.log('Reading SVG from:', svgPath)
    
    // Read the SVG
    const svgContent = readFileSync(svgPath, 'utf-8')
    
    // Generate 18x18 (1x)
    console.log('Generating trayTemplate.png (18x18)...')
    await sharp(Buffer.from(svgContent))
        .resize(18, 18)
        .png()
        .toFile(join(srcDir, 'trayTemplate.png'))
    
    // Generate 36x36 (2x for Retina)
    console.log('Generating trayTemplate@2x.png (36x36)...')
    await sharp(Buffer.from(svgContent))
        .resize(36, 36)
        .png()
        .toFile(join(srcDir, 'trayTemplate@2x.png'))
    
    console.log('Done! Tray icons generated in src/main/')
}

generateTrayIcons().catch(console.error)
