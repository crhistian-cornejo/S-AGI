import { useCallback } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import {
    activeTabAtom,
    pdfNavigationRequestAtom,
    selectedChatIdAtom,
    type PdfNavigationRequest
} from '@/lib/atoms'
import type { CitationData } from '@/components/inline-citation'

/**
 * Hook for navigating from inline citations to the PDF tab
 *
 * When a citation is clicked:
 * 1. Sets the navigation request atom with filename, page, and text
 * 2. Switches to the PDF tab
 * 3. PdfTabView handles finding and opening the correct PDF
 */
export function useCitationNavigation() {
    const setActiveTab = useSetAtom(activeTabAtom)
    const setNavigationRequest = useSetAtom(pdfNavigationRequestAtom)
    const currentChatId = useAtomValue(selectedChatIdAtom)

    /**
     * Navigate to a PDF from a citation
     */
    const navigateToCitation = useCallback((citation: CitationData) => {
        // Only navigate for PDF files
        const isPdf = citation.filename.toLowerCase().endsWith('.pdf')

        if (!isPdf) {
            // For non-PDF files, we could potentially open a different viewer
            // For now, just log and return
            console.log('[CitationNavigation] Non-PDF citation clicked:', citation.filename)
            return false
        }

        // Create navigation request
        const request: PdfNavigationRequest = {
            filename: citation.filename,
            pageNumber: citation.pageNumber,
            highlightText: citation.text,
            chatId: currentChatId || undefined
        }

        console.log('[CitationNavigation] Navigating to PDF:', request)

        // Set the navigation request
        setNavigationRequest(request)

        // Switch to PDF tab
        setActiveTab('pdf')

        return true
    }, [currentChatId, setActiveTab, setNavigationRequest])

    /**
     * Navigate to a specific page in a PDF by filename
     */
    const navigateToPage = useCallback((filename: string, pageNumber: number, highlightText?: string) => {
        const request: PdfNavigationRequest = {
            filename,
            pageNumber,
            highlightText,
            chatId: currentChatId || undefined
        }

        setNavigationRequest(request)
        setActiveTab('pdf')
    }, [currentChatId, setActiveTab, setNavigationRequest])

    /**
     * Check if a citation can be navigated to (i.e., is a PDF)
     */
    const canNavigate = useCallback((citation: CitationData) => {
        return citation.filename.toLowerCase().endsWith('.pdf')
    }, [])

    return {
        navigateToCitation,
        navigateToPage,
        canNavigate
    }
}
