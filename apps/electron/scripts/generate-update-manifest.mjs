#!/usr/bin/env node

/**
 * Generate update manifest files for electron-updater
 *
 * This script generates `latest-mac.yml` and `latest-win.yml` files
 * that electron-updater uses to check for and download updates.
 *
 * Usage:
 *   node apps/electron/scripts/generate-update-manifest.mjs
 *   node apps/electron/scripts/generate-update-manifest.mjs --channel=beta
 *
 * The script expects ZIP/exe files to exist in apps/electron/release/
 */

import { createHash } from "crypto"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse --channel argument (default: "latest")
const channelArgIndex = process.argv.indexOf("--channel")
const channel = channelArgIndex !== -1 && process.argv[channelArgIndex + 1]
  ? process.argv[channelArgIndex + 1]
  : "latest"

if (channel !== "latest" && channel !== "beta") {
  console.error(`Invalid channel: "${channel}". Must be "latest" or "beta".`)
  process.exit(1)
}

// Get version from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf-8")
)
const version = process.env.VERSION || rootPackageJson.version

const releaseDir = join(__dirname, "../release")

/**
 * Calculate SHA512 hash of a file and return base64 encoded string
 */
function calculateSha512(filePath) {
  const content = readFileSync(filePath)
  return createHash("sha512").update(content).digest("base64")
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  return statSync(filePath).size
}

/**
 * Find file matching pattern in release directory
 */
function findFile(pattern, extension) {
  if (!existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`)
    return null
  }

  const files = readdirSync(releaseDir)
  const match = files.find((f) => f.includes(pattern) && f.endsWith(extension))
  return match ? join(releaseDir, match) : null
}

/**
 * Generate macOS manifest for a specific architecture
 */
function generateMacManifest(arch) {
  // S-AGI naming: S-AGI-{version}-macOS-{arch}.zip
  const pattern = `macOS-${arch}`
  const zipPath = findFile(pattern, ".zip")

  if (!zipPath) {
    console.warn(`Warning: ZIP file not found for macOS ${arch}`)
    return null
  }

  const zipName = zipPath.split("/").pop()
  const sha512 = calculateSha512(zipPath)
  const size = getFileSize(zipPath)

  const manifest = {
    version,
    files: [{ url: zipName, sha512, size }],
    path: zipName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = arch === "arm64" ? `${prefix}-mac.yml` : `${prefix}-mac-x64.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${zipName}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  return manifestPath
}

/**
 * Generate Windows manifest
 */
function generateWinManifest() {
  // S-AGI naming: S-AGI-{version}-Windows-{arch}.exe
  const exePath = findFile("Windows", ".exe")

  if (!exePath) {
    console.warn(`Warning: Windows installer not found`)
    return null
  }

  const exeName = exePath.split("/").pop()
  const sha512 = calculateSha512(exePath)
  const size = getFileSize(exePath)

  const manifest = {
    version,
    files: [{ url: exeName, sha512, size }],
    path: exeName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = `${prefix}.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${exeName}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log()

  return manifestPath
}

/**
 * Convert object to YAML string
 */
function objectToYaml(obj, indent = 0) {
  const spaces = "  ".repeat(indent)
  let yaml = ""

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`
      for (const item of value) {
        if (typeof item === "object") {
          yaml += `${spaces}  - `
          const itemYaml = objectToYaml(item, 0)
            .split("\n")
            .filter(Boolean)
            .map((line, i) => (i === 0 ? line : `${spaces}    ${line}`))
            .join("\n")
          yaml += itemYaml + "\n"
        } else {
          yaml += `${spaces}  - ${item}\n`
        }
      }
    } else if (typeof value === "object" && value !== null) {
      yaml += `${spaces}${key}:\n`
      yaml += objectToYaml(value, indent + 1)
    } else {
      yaml += `${spaces}${key}: ${value}\n`
    }
  }

  return yaml
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

// Main execution
console.log("=".repeat(50))
console.log("S-AGI Update Manifest Generator")
console.log("=".repeat(50))
console.log(`Version: ${version}`)
console.log(`Channel: ${channel}`)
console.log(`Release dir: ${releaseDir}`)
console.log()

// Ensure release directory exists
if (!existsSync(releaseDir)) {
  console.error("Release directory does not exist. Run build first.")
  process.exit(1)
}

// Generate manifests
const arm64Manifest = generateMacManifest("arm64")
const x64Manifest = generateMacManifest("x64")
const winManifest = generateWinManifest()

const generated = [arm64Manifest, x64Manifest, winManifest].filter(Boolean)

if (generated.length === 0) {
  console.error("No manifest files were generated!")
  console.error("Make sure you have built the app first.")
  process.exit(1)
}

console.log("=".repeat(50))
console.log(`Generated ${generated.length} manifest file(s)`)
console.log("=".repeat(50))
