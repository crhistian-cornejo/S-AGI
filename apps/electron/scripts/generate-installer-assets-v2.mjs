#!/usr/bin/env node

/**
 * Generate installer assets using the app's background image
 * Creates beautiful DMG and NSIS installer graphics
 */

import sharp from "sharp"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { readFileSync, writeFileSync } from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const buildDir = join(__dirname, "../build")

const sourceBackground = join(buildDir, "background.png")

/**
 * Create DMG background with drag-to-Applications overlay
 */
async function createDMGBackground() {
  console.log("Creating DMG background...")

  const width = 660
  const height = 400

  // Process background: resize, crop, slight blur
  const blurredBg = await sharp(sourceBackground)
    .resize(width, height, { fit: "cover", position: "center" })
    .blur(2) // Slight blur
    .modulate({ brightness: 0.85 }) // Slightly darker
    .toBuffer()

  // Create overlay SVG with drag-to-Applications design
  const overlaySvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e0e0e0;stop-opacity:1" />
        </linearGradient>
      </defs>

      <!-- Semi-transparent overlay for better text visibility -->
      <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.3)"/>

      <!-- App name at top -->
      <text x="${width/2}" y="50" font-family="SF Pro Display, -apple-system, system-ui, sans-serif"
            font-size="32" font-weight="700" fill="url(#textGrad)" text-anchor="middle" filter="url(#glow)">
        S-AGI
      </text>
      <text x="${width/2}" y="75" font-family="SF Pro Text, -apple-system, system-ui, sans-serif"
            font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle">
        AI Agent for Spreadsheets
      </text>

      <!-- Drop zone indicators with glassmorphism effect -->
      <g transform="translate(180, 175)">
        <rect x="-55" y="-55" width="110" height="110" rx="24"
              fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      </g>
      <g transform="translate(480, 175)">
        <rect x="-55" y="-55" width="110" height="110" rx="24"
              fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      </g>

      <!-- Arrow pointing from app to Applications -->
      <g transform="translate(${width/2}, 175)">
        <line x1="-80" y1="0" x2="80" y2="0" stroke="rgba(255,255,255,0.6)" stroke-width="3" stroke-dasharray="12,6"/>
        <polygon points="90,0 70,-14 70,14" fill="rgba(255,255,255,0.7)"/>
      </g>

      <!-- Labels -->
      <text x="180" y="270" font-family="SF Pro Text, -apple-system, system-ui, sans-serif"
            font-size="13" fill="rgba(255,255,255,0.9)" text-anchor="middle" font-weight="500">
        S-AGI.app
      </text>
      <text x="480" y="270" font-family="SF Pro Text, -apple-system, system-ui, sans-serif"
            font-size="13" fill="rgba(255,255,255,0.9)" text-anchor="middle" font-weight="500">
        Applications
      </text>

      <!-- Instructions -->
      <text x="${width/2}" y="330" font-family="SF Pro Text, -apple-system, system-ui, sans-serif"
            font-size="15" fill="rgba(255,255,255,0.85)" text-anchor="middle" font-weight="400">
        Drag S-AGI to Applications to install
      </text>

      <!-- Version badge -->
      <rect x="${width/2 - 40}" y="350" width="80" height="26" rx="13" fill="rgba(255,255,255,0.15)"/>
      <text x="${width/2}" y="368" font-family="SF Pro Text, -apple-system, system-ui, sans-serif"
            font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">
        v0.1.0
      </text>
    </svg>
  `

  // Composite the overlay on top of the blurred background
  const result = await sharp(blurredBg)
    .composite([{
      input: Buffer.from(overlaySvg),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(join(buildDir, "dmg-background.png"))

  console.log("✓ DMG background created")
  return result
}

/**
 * Create NSIS installer sidebar
 */
async function createNSISSidebar() {
  console.log("Creating NSIS sidebar...")

  const width = 164
  const height = 314

  // Process background for sidebar
  const blurredBg = await sharp(sourceBackground)
    .resize(width, height, { fit: "cover", position: "center" })
    .blur(3)
    .modulate({ brightness: 0.7 })
    .toBuffer()

  const overlaySvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Gradient overlay -->
      <defs>
        <linearGradient id="sidebarOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(0,0,0,0.4)" />
          <stop offset="100%" style="stop-color:rgba(0,0,0,0.6)" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#sidebarOverlay)"/>

      <!-- Logo circle -->
      <circle cx="${width/2}" cy="100" r="45" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="${width/2}" y="115" font-family="Segoe UI, Arial, sans-serif"
            font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">
        S
      </text>

      <!-- App name -->
      <text x="${width/2}" y="180" font-family="Segoe UI, Arial, sans-serif"
            font-size="22" font-weight="600" fill="#ffffff" text-anchor="middle">
        S-AGI
      </text>
      <text x="${width/2}" y="202" font-family="Segoe UI, Arial, sans-serif"
            font-size="11" fill="rgba(255,255,255,0.7)" text-anchor="middle">
        AI Agent for
      </text>
      <text x="${width/2}" y="218" font-family="Segoe UI, Arial, sans-serif"
            font-size="11" fill="rgba(255,255,255,0.7)" text-anchor="middle">
        Spreadsheets
      </text>

      <!-- Decorative line -->
      <line x1="30" y1="250" x2="134" y2="250" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

      <!-- Version -->
      <text x="${width/2}" y="290" font-family="Segoe UI, Arial, sans-serif"
            font-size="10" fill="rgba(255,255,255,0.5)" text-anchor="middle">
        Version 0.1.0
      </text>
    </svg>
  `

  await sharp(blurredBg)
    .composite([{
      input: Buffer.from(overlaySvg),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(join(buildDir, "installer-sidebar.png"))

  console.log("✓ NSIS sidebar created")
}

/**
 * Create NSIS installer header
 */
async function createNSISHeader() {
  console.log("Creating NSIS header...")

  const width = 150
  const height = 57

  // Process background for header
  const blurredBg = await sharp(sourceBackground)
    .resize(width, height, { fit: "cover", position: "top" })
    .blur(2)
    .modulate({ brightness: 0.75 })
    .toBuffer()

  const overlaySvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.3)"/>
      <text x="${width/2}" y="36" font-family="Segoe UI, Arial, sans-serif"
            font-size="20" font-weight="600" fill="#ffffff" text-anchor="middle">
        S-AGI
      </text>
    </svg>
  `

  await sharp(blurredBg)
    .composite([{
      input: Buffer.from(overlaySvg),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(join(buildDir, "installer-header.png"))

  console.log("✓ NSIS header created")
}

// Main execution
console.log("=".repeat(50))
console.log("S-AGI Installer Assets Generator v2")
console.log("Using app background image")
console.log("=".repeat(50))
console.log()

try {
  await createDMGBackground()
  await createNSISSidebar()
  await createNSISHeader()

  console.log()
  console.log("=".repeat(50))
  console.log("All assets generated successfully!")
  console.log("=".repeat(50))
} catch (error) {
  console.error("Error generating assets:", error)
  process.exit(1)
}
