#!/usr/bin/env node

/**
 * Generate installer assets for macOS DMG and Windows NSIS
 *
 * Creates:
 * - DMG background with "drag to Applications" design
 * - NSIS installer header and sidebar images
 */

import { execSync } from "child_process"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const buildDir = join(__dirname, "../build")

// Ensure build directory exists
if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true })
}

/**
 * Generate DMG background image using ImageMagick or sharp
 * Size: 660x400 pixels
 */
async function generateDMGBackground() {
  const outputPath = join(buildDir, "dmg-background.png")

  // Create SVG template
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="660" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="660" height="400" fill="url(#bg)"/>

  <!-- Subtle grid pattern -->
  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  </pattern>
  <rect width="660" height="400" fill="url(#grid)"/>

  <!-- App name at top -->
  <text x="330" y="55" font-family="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="28" font-weight="600" fill="#ffffff" text-anchor="middle">
    S-AGI
  </text>
  <text x="330" y="80" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="13" fill="rgba(255,255,255,0.6)" text-anchor="middle">
    AI Agent for Spreadsheets
  </text>

  <!-- Arrow pointing from app to Applications -->
  <g transform="translate(330, 170)">
    <!-- Arrow line -->
    <line x1="-70" y1="0" x2="70" y2="0" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="8,4"/>
    <!-- Arrow head -->
    <polygon points="80,0 60,-12 60,12" fill="rgba(255,255,255,0.5)"/>
  </g>

  <!-- Drop zones indicators -->
  <g transform="translate(180, 170)" filter="url(#shadow)">
    <rect x="-50" y="-50" width="100" height="100" rx="20" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  </g>
  <g transform="translate(480, 170)" filter="url(#shadow)">
    <rect x="-50" y="-50" width="100" height="100" rx="20" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  </g>

  <!-- Labels -->
  <text x="180" y="260" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">
    S-AGI.app
  </text>
  <text x="480" y="260" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">
    Applications
  </text>

  <!-- Instructions -->
  <text x="330" y="340" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="14" fill="rgba(255,255,255,0.5)" text-anchor="middle">
    Drag S-AGI to your Applications folder to install
  </text>

  <!-- Version badge -->
  <rect x="280" y="360" width="100" height="24" rx="12" fill="rgba(255,255,255,0.1)"/>
  <text x="330" y="377" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="11" fill="rgba(255,255,255,0.5)" text-anchor="middle">
    v0.1.0
  </text>
</svg>`

  const svgPath = join(buildDir, "dmg-background.svg")
  writeFileSync(svgPath, svg)

  // Try to convert SVG to PNG using available tools
  try {
    // Try using sharp via Node
    const sharp = await import("sharp")
    await sharp.default(Buffer.from(svg))
      .png()
      .toFile(outputPath)
    console.log(`✓ Generated DMG background: ${outputPath}`)
    return true
  } catch (e) {
    // Try ImageMagick
    try {
      execSync(`convert ${svgPath} ${outputPath}`, { stdio: "pipe" })
      console.log(`✓ Generated DMG background (ImageMagick): ${outputPath}`)
      return true
    } catch (e2) {
      // Try rsvg-convert
      try {
        execSync(`rsvg-convert ${svgPath} -o ${outputPath}`, { stdio: "pipe" })
        console.log(`✓ Generated DMG background (rsvg): ${outputPath}`)
        return true
      } catch (e3) {
        console.log(`⚠ Could not convert SVG to PNG. SVG saved at: ${svgPath}`)
        console.log("  Install sharp, ImageMagick, or librsvg to auto-convert")
        return false
      }
    }
  }
}

/**
 * Generate NSIS installer header image
 * Size: 150x57 pixels (BMP format)
 */
async function generateNSISHeader() {
  const outputPath = join(buildDir, "installer-header.bmp")

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerBg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f3460;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#headerBg)"/>
  <text x="75" y="35" font-family="Segoe UI, Arial, sans-serif"
        font-size="18" font-weight="600" fill="#ffffff" text-anchor="middle">
    S-AGI
  </text>
</svg>`

  const svgPath = join(buildDir, "installer-header.svg")
  writeFileSync(svgPath, svg)

  try {
    const sharp = await import("sharp")
    // BMP requires raw pixel data, convert via PNG first
    const pngBuffer = await sharp.default(Buffer.from(svg))
      .resize(150, 57)
      .png()
      .toBuffer()

    // For BMP, we'll create a simple 24-bit BMP
    await sharp.default(pngBuffer)
      .toFormat('png')
      .toFile(outputPath.replace('.bmp', '.png'))

    // electron-builder can also use PNG for these
    console.log(`✓ Generated NSIS header: ${outputPath.replace('.bmp', '.png')}`)
    return true
  } catch (e) {
    console.log(`⚠ Could not generate NSIS header. SVG saved at: ${svgPath}`)
    return false
  }
}

/**
 * Generate NSIS installer sidebar image
 * Size: 164x314 pixels (BMP format)
 */
async function generateNSISSidebar() {
  const outputPath = join(buildDir, "installer-sidebar.bmp")

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sidebarBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#16213e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f3460;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="164" height="314" fill="url(#sidebarBg)"/>

  <!-- Logo circle -->
  <circle cx="82" cy="100" r="45" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
  <text x="82" y="110" font-family="Segoe UI, Arial, sans-serif"
        font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">
    S
  </text>

  <!-- App name -->
  <text x="82" y="175" font-family="Segoe UI, Arial, sans-serif"
        font-size="20" font-weight="600" fill="#ffffff" text-anchor="middle">
    S-AGI
  </text>
  <text x="82" y="195" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">
    AI Agent for
  </text>
  <text x="82" y="210" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">
    Spreadsheets
  </text>

  <!-- Decorative lines -->
  <line x1="30" y1="250" x2="134" y2="250" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

  <!-- Version -->
  <text x="82" y="290" font-family="Segoe UI, Arial, sans-serif"
        font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">
    Version 0.1.0
  </text>
</svg>`

  const svgPath = join(buildDir, "installer-sidebar.svg")
  writeFileSync(svgPath, svg)

  try {
    const sharp = await import("sharp")
    await sharp.default(Buffer.from(svg))
      .resize(164, 314)
      .png()
      .toFile(outputPath.replace('.bmp', '.png'))

    console.log(`✓ Generated NSIS sidebar: ${outputPath.replace('.bmp', '.png')}`)
    return true
  } catch (e) {
    console.log(`⚠ Could not generate NSIS sidebar. SVG saved at: ${svgPath}`)
    return false
  }
}

// Main execution
console.log("=".repeat(50))
console.log("S-AGI Installer Assets Generator")
console.log("=".repeat(50))
console.log()

await generateDMGBackground()
await generateNSISHeader()
await generateNSISSidebar()

console.log()
console.log("=".repeat(50))
console.log("Done!")
console.log("=".repeat(50))
