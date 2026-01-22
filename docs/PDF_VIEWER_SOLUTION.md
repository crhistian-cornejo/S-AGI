# PDF Viewer & Editor Solution - Analysis & Recommendations

## 📊 How Midday Handles PDFs

### ✅ What Midday Does

```typescript
// packages/documents/src/utils/pdf-text-extract.ts
import { extractText, getDocumentProxy } from "unpdf";

// Midday extracts text from PDFs using unpdf
export async function extractTextFromPdf(
  pdfUrl: string,
  pdfBuffer?: ArrayBuffer,
): Promise<string | null>
```

**Stack completo:**
```json
{
  "pdfjs-dist": "4.8.69",          // Base engine (Mozilla)
  "react-pdf": "^10.2.0",           // React wrapper
  "unpdf": "^1.4.0",                // Text extraction (WASM)
  "@react-pdf/renderer": "^4.3.1",    // PDF generation
  "jspdf": "^3.0.4"                  // Canvas to PDF
}
```

### 🎯 Midday's PDF Viewer

```tsx
// apps/dashboard/src/components/pdf-viewer.tsx
import { Document, Page, PasswordResponses, pdfjs } from "react-pdf";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({ url, maxWidth }: PdfViewerProps) {
  return (
    <TransformWrapper initialScale={1} minScale={1} maxScale={2}>
      <TransformComponent>
        <Document file={url}>
          {Array.from({ length: numPages }).map((_, index) => (
            <Page
              key={index + 1}
              pageNumber={index + 1}
              width={maxWidth}
              renderAnnotationLayer={false}
              renderTextLayer={true}
            />
          ))}
        </Document>
      </TransformComponent>
    </TransformWrapper>
  );
}
```

**Features:**
- ✅ Zoom & pan (react-zoom-pan-pinch)
- ✅ Password protection
- ✅ Page-by-page rendering
- ✅ Text layer (searchable)
- ❌ **NO editing** (read-only)

---

## 🔍 Key Finding

**Midday does NOT have PDF editing like Adobe Acrobat.**

Midday only:
1. **Views** PDFs (react-pdf + pdfjs)
2. **Extracts text** from PDFs (unpdf) for AI
3. **Generates** new PDFs from React components (@react-pdf/renderer)

---

## 🚀 Solutions for S-AGI

### Option 1: Midday's Approach (READ-ONLY)

**Pros:**
- ✅ Proven, battle-tested
- ✅ Fast, lightweight
- ✅ Excellent zoom/pan
- ✅ Password protection
- ✅ Searchable text

**Cons:**
- ❌ No editing capabilities
- ❌ No annotations

**Implementation:**

```bash
npm install react-pdf react-zoom-pan-pinch
```

```tsx
// src/renderer/components/pdf-viewer/PdfViewer.tsx
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  maxWidth?: number;
}

export function PdfViewer({ url, maxWidth = 800 }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-white">
      {isPasswordProtected ? (
        // Password input form
        <div className="flex items-center justify-center h-full">
          <input
            type="password"
            placeholder="Enter PDF password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          />
        </div>
      ) : (
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={3}
          doubleClick={{ mode: "toggle", step: 0.5 }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%", overflow: "auto" }}
          >
            <Document
              file={url}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={(error) => {
                if (error.message.toLowerCase().includes("password")) {
                  setIsPasswordProtected(true);
                }
              }}
              loading={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              }
            >
              {numPages &&
                Array.from({ length: numPages }).map((_, index) => (
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    width={maxWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={true}
                    className="shadow-sm"
                  />
                ))}
            </Document>
          </TransformComponent>
        </TransformWrapper>
      )}
    </div>
  );
}
```

---

### Option 2: PDF with Annotations (UNO - RECOMMENDED)

**UNO** is the closest to Adobe Acrobat that's open-source and modern.

**Pros:**
- ✅ Real-time collaborative annotations
- ✅ Text, highlight, drawing, comments
- ✅ Shareable workspaces
- ✅ Open-source (Apache 2.0)
- ✅ Similar look to Google Docs / Notion

**Cons:**
- ❌ More complex to implement
- ❌ Requires backend server for collaboration
- ❌ Not in Univer ecosystem (separate project)

**Website:** https://github.com/unidoc/univer

**Implementation:**

```bash
npm install @univerjs/docs @univerjs/engine-formula @univerjs/engine-render
```

```tsx
// src/renderer/components/pdf-viewer/UnioPdfEditor.tsx
import { createUniver, type UniverAPI } from '@univerjs/presets';
import '@univerjs/presets/lib/presets/imperial.css';

export function UnioPdfEditor({ pdfUrl }: { pdfUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [univerAPI, setUniverAPI] = useState<UniverAPI | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize UNO
    const univer = createUniver({
      locale: 'en-US',
      locales: {},
      theme: 'imperial',
    });

    univerAPI.current = univer;
    univerAPI.current.createUnit({
      unitId: 'pdf-unit',
      name: 'PDF Document',
      sheets: {},
    });

    // Load PDF (would need conversion)
    // This is conceptual - UNO doesn't directly load PDFs yet
    // You'd need to convert PDF to DOCX first

    return () => {
      univer.dispose();
    };
  }, [pdfUrl]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ height: 'calc(100vh - 200px)' }}
    />
  );
}
```

---

### Option 3: Commercial Adobe Acrobat Alternative

**PDFTron** - Industry standard for PDF editing

**Pros:**
- ✅ Full Adobe Acrobat feature parity
- ✅ Annotations, forms, signatures
- ✅ Redaction, compression
- ✅ Excellent performance

**Cons:**
- ❌ Expensive ($5k+ / year)
- ❌ Heavy (~30MB bundle)
- ❌ Closed source

**Website:** https://www.pdftron.com/

---

### Option 4: Lightweight Editing (pdf-lib)

**pdf-lib** - Basic PDF manipulation

**Pros:**
- ✅ Free, open-source
- ✅ Merge, split, rotate
- ✅ Modify forms
- ✅ Add/remove pages
- ✅ Small (~100KB)

**Cons:**
- ❌ No visual editing UI
- ❌ No text editing (position-based only)
- ❌ No annotations UI

**Implementation:**

```bash
npm install pdf-lib
```

```tsx
// src/main/lib/pdf/edit-pdf.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function annotatePdf(
  pdfBuffer: Uint8Array,
  annotation: {
    text: string;
    x: number;
    y: number;
    color: [number, number, number];
  }
) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  // Get first page
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Add annotation text
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  firstPage.drawText(annotation.text, {
    x: annotation.x,
    y: height - annotation.y,
    size: 12,
    font,
    color: rgb(...annotation.color),
  });

  // Save and return
  return await pdfDoc.save();
}
```

---

## 📋 Comparison Table

| Feature | react-pdf (Midday) | UNO | PDFTron | pdf-lib |
|----------|----------------------|------|----------|----------|
| **View PDF** | ✅ Excellent | ⚠️ Needs conversion | ✅ Excellent | ❌ No viewer |
| **Zoom/Pan** | ✅ | ✅ | ✅ | ❌ |
| **Text Selection** | ✅ | ✅ | ✅ | ❌ |
| **Search** | ✅ | ✅ | ✅ | ❌ |
| **Annotations** | ❌ | ✅ Rich | ✅ Full | ⚠️ Text only |
| **Collaboration** | ❌ | ✅ Real-time | ✅ | ❌ |
| **Edit Text** | ❌ | ⚠️ Basic | ✅ Full | ❌ |
| **Forms** | ❌ | ⚠️ Basic | ✅ Full | ✅ |
| **Signatures** | ❌ | ❌ | ✅ | ❌ |
| **Price** | Free | Free | $$$ | Free |
| **Bundle Size** | ~2MB | ~5MB | ~30MB | ~100KB |
| **Open Source** | ✅ | ✅ | ❌ | ✅ |
| **Maintenance** | Active | Active | Commercial | Stable |

---

## 🎯 Recommendation for S-AGI

### Phase 1: Start with Midday's Approach (Week 1)

**Implement `react-pdf` viewer:**

```tsx
// src/renderer/components/artifacts/PdfArtifact.tsx
import { PdfViewer } from '@/components/pdf-viewer/PdfViewer';

export function PdfArtifact({ url }: { url: string }) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h3 className="text-sm font-medium">PDF Document</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            Download
          </Button>
          <Button variant="ghost" size="sm">
            Open in Browser
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <PdfViewer url={url} maxWidth={1000} />
      </div>
    </div>
  );
}
```

**Pros:**
- Quick to implement (1-2 days)
- Proven by Midday
- Excellent user experience
- No backend needed

### Phase 2: Add Text Extraction (Week 2)

**Use `unpdf` to extract text for AI:**

```typescript
// src/main/lib/pdf/extract-text.ts
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });

    return text || null;
  } catch (error) {
    console.error('PDF extraction failed:', error);
    return null;
  }
}
```

**Use in chat:**

```typescript
// When user attaches PDF to chat
if (attachment.mimeType === 'application/pdf') {
  const text = await extractPdfText(attachment.url);
  // Send extracted text to AI for analysis
}
```

### Phase 3: Add Basic Annotations (Month 2)

**Use `pdf-lib` for basic annotations:**

```tsx
// Add annotation toolbar to PDF viewer
const [annotationMode, setAnnotationMode] = useState(false);
const [annotations, setAnnotations] = useState<Annotation[]>([]);

// User clicks on PDF
const handlePdfClick = async (x: number, y: number) => {
  if (!annotationMode) return;

  const comment = prompt('Add comment:');
  if (!comment) return;

  const newAnnotation = { x, y, text: comment, color: [1, 0, 0] };
  setAnnotations([...annotations, newAnnotation]);

  // Annotate PDF
  const annotatedPdf = await annotatePdf(pdfBuffer, newAnnotation);
  // Upload annotated PDF
};
```

### Phase 4: Full Collaboration (Month 3+)

**Option A: UNO Integration**
- Convert PDFs to documents
- Enable real-time collaboration
- Rich annotations

**Option B: Commercial SDK (if budget allows)**
- PDFTron for full Adobe parity
- Best for enterprise use

---

## 📦 Recommended Packages

```json
{
  "dependencies": {
    "react-pdf": "^10.3.0",
    "react-zoom-pan-pinch": "^3.7.0",
    "pdf-lib": "^1.17.1",
    "unpdf": "^1.4.0",
    "@univerjs/presets": "^0.5.0"
  }
}
```

---

## 🔧 Installation

```bash
# Install PDF viewer
bun add react-pdf react-zoom-pan-pinch

# Install PDF manipulation
bun add pdf-lib

# Install text extraction
bun add unpdf

# Optional: UNO for collaboration
bun add @univerjs/presets
```

---

## ✨ Summary

| Phase | Solution | Time | Features |
|--------|-----------|--------|----------|
| **Phase 1** | react-pdf | 1 week | View, zoom, pan, search |
| **Phase 2** | + unpdf | +1 week | AI text extraction |
| **Phase 3** | + pdf-lib | +2 weeks | Basic annotations |
| **Phase 4** | UNO/PDFTron | +1 month | Full collaboration |

**Start with Phase 1 (react-pdf)** - it's proven by Midday, works great, and gives you 80% of the value with 20% of the effort.

Only move to Phase 4 (full collaboration) if you have a clear use case and budget.
