/**
 * Chart Export Utilities
 * Export charts as PDF or PNG using html2canvas and jsPDF
 * Inspired by Midday's export patterns
 */

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

// ============================================================================
// EXPORT TO PNG
// ============================================================================

export interface ExportPngOptions {
    filename?: string
    scale?: number
    backgroundColor?: string
}

/**
 * Export a DOM element as PNG
 */
export async function exportToPng(
    element: HTMLElement,
    options: ExportPngOptions = {}
): Promise<void> {
    const {
        filename = 'chart',
        scale = 2,
        backgroundColor = '#ffffff'
    } = options

    try {
        const canvas = await html2canvas(element, {
            scale,
            backgroundColor,
            useCORS: true,
            logging: false,
            allowTaint: true
        })

        // Create download link
        const link = document.createElement('a')
        link.download = `${filename}.png`
        link.href = canvas.toDataURL('image/png', 1.0)
        link.click()

        console.log('[ChartExport] PNG exported:', filename)
    } catch (error) {
        console.error('[ChartExport] Failed to export PNG:', error)
        throw error
    }
}

// ============================================================================
// EXPORT TO PDF
// ============================================================================

export interface ExportPdfOptions {
    filename?: string
    title?: string
    subtitle?: string
    orientation?: 'portrait' | 'landscape'
    pageSize?: 'a4' | 'letter'
    scale?: number
    margin?: number
    backgroundColor?: string
}

/**
 * Export a DOM element as PDF
 */
export async function exportToPdf(
    element: HTMLElement,
    options: ExportPdfOptions = {}
): Promise<void> {
    const {
        filename = 'chart',
        title,
        subtitle,
        orientation = 'landscape',
        pageSize = 'a4',
        scale = 2,
        margin = 20,
        backgroundColor = '#ffffff'
    } = options

    try {
        // Capture the element as canvas
        const canvas = await html2canvas(element, {
            scale,
            backgroundColor,
            useCORS: true,
            logging: false,
            allowTaint: true
        })

        // Create PDF
        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: pageSize
        })

        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const contentWidth = pageWidth - (margin * 2)

        let yPosition = margin

        // Add title if provided
        if (title) {
            pdf.setFontSize(18)
            pdf.setTextColor(30, 30, 30)
            pdf.text(title, margin, yPosition + 6)
            yPosition += 12
        }

        // Add subtitle if provided
        if (subtitle) {
            pdf.setFontSize(10)
            pdf.setTextColor(100, 100, 100)
            pdf.text(subtitle, margin, yPosition + 4)
            yPosition += 10
        }

        // Calculate image dimensions to fit within content area
        const imgWidth = canvas.width / scale
        const imgHeight = canvas.height / scale
        const availableHeight = pageHeight - yPosition - margin

        // Scale to fit
        const widthRatio = contentWidth / imgWidth
        const heightRatio = availableHeight / imgHeight
        const ratio = Math.min(widthRatio, heightRatio, 1) // Don't scale up

        const finalWidth = imgWidth * ratio
        const finalHeight = imgHeight * ratio

        // Center horizontally
        const xPosition = margin + (contentWidth - finalWidth) / 2

        // Add the chart image
        const imgData = canvas.toDataURL('image/png', 1.0)
        pdf.addImage(imgData, 'PNG', xPosition, yPosition, finalWidth, finalHeight)

        // Add footer with timestamp
        const now = new Date()
        const timestamp = now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })

        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text(
            `Generated on ${timestamp}`,
            pageWidth - margin,
            pageHeight - 5,
            { align: 'right' }
        )

        // Download
        pdf.save(`${filename}.pdf`)

        console.log('[ChartExport] PDF exported:', filename)
    } catch (error) {
        console.error('[ChartExport] Failed to export PDF:', error)
        throw error
    }
}

// ============================================================================
// COPY TO CLIPBOARD
// ============================================================================

export interface CopyToClipboardOptions {
    scale?: number
    backgroundColor?: string
}

/**
 * Copy a DOM element as image to clipboard
 */
export async function copyChartToClipboard(
    element: HTMLElement,
    options: CopyToClipboardOptions = {}
): Promise<boolean> {
    const {
        scale = 2,
        backgroundColor = '#ffffff'
    } = options

    try {
        const canvas = await html2canvas(element, {
            scale,
            backgroundColor,
            useCORS: true,
            logging: false,
            allowTaint: true
        })

        // Convert to blob
        return new Promise((resolve) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    console.error('[ChartExport] Failed to create blob')
                    resolve(false)
                    return
                }

                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'image/png': blob
                        })
                    ])
                    console.log('[ChartExport] Chart copied to clipboard')
                    resolve(true)
                } catch (err) {
                    console.error('[ChartExport] Failed to copy to clipboard:', err)
                    resolve(false)
                }
            }, 'image/png', 1.0)
        })
    } catch (error) {
        console.error('[ChartExport] Failed to capture chart:', error)
        return false
    }
}

// ============================================================================
// GET CHART AS DATA URL
// ============================================================================

export async function getChartAsDataUrl(
    element: HTMLElement,
    scale = 2
): Promise<string> {
    const canvas = await html2canvas(element, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true
    })

    return canvas.toDataURL('image/png', 1.0)
}
