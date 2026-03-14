/**
 * Hidden Text Filter
 *
 * Detects and removes "invisible" text that cheaters embed in resumes to game
 * ATS scanners. Covered tactics:
 *
 *  PDF
 *  ─── White-coloured text     (fill color r/g/b ≥ 0.9, grayscale ≥ 0.9,
 *                                or CMYK with all components ≤ 0.1)
 *      Invisible rendering     (text rendering mode 3 via pdfjs-dist OPS)
 *      Micro-font (≤ 1 pt)     tracked through setFont operator
 *
 *  DOCX
 *  ──── w:color near-white     (any hex ≥ #EEEEEE per channel)
 *       w:vanish               (Word "hidden text" property)
 *       w:sz < 4               (font size < 2 pt in half-points)
 *       w:highlight white      (white highlight on text)
 *       Headers & footers      (word/header*.xml, word/footer*.xml)
 *
 *  All formats
 *  ─────────── Keyword-stuffed lines (dense, comma-heavy, no sentence structure)
 */

import { resolve } from "path";
import { pathToFileURL } from "url";

// ─── PDF: pdfjs-dist operator-list approach ──────────────────────────────────

/**
 * Extract ONLY visible text from a PDF buffer using pdfjs-dist's operator list.
 *
 * For each page the operator list is walked to track:
 *  - current fill colour (white = hidden)
 *  - text rendering mode (3 = invisible)
 *  - font size (≤ 1 pt = invisible)
 *
 * Text drawn while any of those conditions are true is silently dropped.
 */
export async function extractPdfTextSanitized(buffer: Buffer): Promise<string> {
  // Dynamic import — legacy build handles Node.js (no DOMMatrix requirement)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument, GlobalWorkerOptions, OPS } = pdfjs as unknown as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PDFDocumentProxy> };
    GlobalWorkerOptions: { workerSrc: string };
    OPS: Record<string, number>;
  };

  // Point to the worker file so pdfjs can spawn it (required in v5)
  const workerPath = resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const opList = await page.getOperatorList();
    const pageText = extractVisibleTextFromOpList(opList, OPS);
    pages.push(pageText);
    page.cleanup();
  }

  await pdf.destroy();
  return pages.join("\n");
}

interface PDFDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

interface PDFPageProxy {
  getOperatorList(): Promise<OpList>;
  cleanup(): void;
}

interface OpList {
  fnArray: number[];
  argsArray: unknown[][];
}

function extractVisibleTextFromOpList(opList: OpList, OPS: Record<string, number>): string {
  const { fnArray, argsArray } = opList;

  // Rendering state
  let fillWhite = false;   // true when fill colour is near-white
  let renderMode = 0;      // 3 = invisible
  let fontSize = 12;       // current font size in pt
  const parts: string[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];

    // ── Colour tracking ─────────────────────────────────────────────────
    if (fn === OPS.setFillRGBColor) {
      const [r, g, b] = args as number[];
      fillWhite = r >= 0.9 && g >= 0.9 && b >= 0.9;

    } else if (fn === OPS.setFillGray) {
      fillWhite = (args[0] as number) >= 0.9;

    } else if (fn === OPS.setFillCMYKColor) {
      const [c, m, y, k] = args as number[];
      // White in CMYK = all inks near zero
      fillWhite = c <= 0.1 && m <= 0.1 && y <= 0.1 && k <= 0.1;

    // ── Text state ───────────────────────────────────────────────────────
    } else if (fn === OPS.setTextRenderingMode) {
      renderMode = args[0] as number;

    } else if (fn === OPS.setFont) {
      // args: [fontName, fontSize]
      fontSize = args[1] as number;

    // ── Text drawing ─────────────────────────────────────────────────────
    } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      const isHidden = fillWhite || renderMode === 3 || Math.abs(fontSize) <= 1;
      if (!isHidden) {
        const glyphs = args[0] as Array<{ unicode?: string } | number | null>;
        let chunk = "";
        for (const g of glyphs) {
          if (g && typeof g === "object" && "unicode" in g && g.unicode) {
            chunk += g.unicode;
          }
        }
        if (chunk) parts.push(chunk);
      }
    }
  }

  return parts.join("");
}

// ─── DOCX: direct XML parsing ────────────────────────────────────────────────

/** Hex colours that are near-white (invisible on a white page). */
function isWhiteColor(val: string): boolean {
  const clean = val.replace(/^#/, "").trim();
  // Named "auto" in Word = inherits background — treat as potentially visible
  if (/^auto$/i.test(clean)) return false;
  // 6-char hex: all channels ≥ 0xEE = near-white
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return r >= 238 && g >= 238 && b >= 238;
  }
  return false;
}

/**
 * Extract visible plain text from a DOCX buffer.
 * Scans word/document.xml, word/header*.xml, and word/footer*.xml.
 * Drops runs that are white-coloured, vanished, tiny, or highlighted white.
 */
export async function extractDocxTextSanitized(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require("jszip") as typeof import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  const partNames = Object.keys(zip.files).filter(
    (n) =>
      /^word\/document\.xml$/.test(n) ||
      /^word\/header\d*\.xml$/.test(n) ||
      /^word\/footer\d*\.xml$/.test(n)
  );

  const chunks: string[] = [];
  for (const name of partNames) {
    const xml = await zip.files[name].async("string");
    chunks.push(extractVisibleTextFromXml(xml));
  }

  return chunks.join("\n").trim();
}

function extractVisibleTextFromXml(xml: string): string {
  const lines: string[] = [];
  // Split on paragraph elements
  const paragraphs = xml.split(/<w:p[ >]/);

  for (const para of paragraphs) {
    let paraText = "";
    const runMatches = para.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g);

    for (const runMatch of runMatches) {
      const run = runMatch[1];
      const rPrMatch = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);

      if (rPrMatch) {
        const rPr = rPrMatch[1];

        // w:vanish → hidden text
        if (/<w:vanish(?:\s*\/>|\s+w:val="true")/.test(rPr)) continue;

        // w:color → near-white font colour
        const colorMatch = rPr.match(/<w:color\s+w:val="([^"]+)"/);
        if (colorMatch && isWhiteColor(colorMatch[1])) continue;

        // w:sz → font size in half-points; < 4 = less than 2 pt
        const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/);
        if (szMatch && parseInt(szMatch[1]) < 4) continue;

        // w:highlight → white highlight
        const hlMatch = rPr.match(/<w:highlight\s+w:val="([^"]+)"/);
        if (hlMatch && /^white$/i.test(hlMatch[1])) continue;
      }

      // Collect visible text from this run
      for (const t of run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        paraText += t[1];
      }
    }

    if (paraText.trim()) lines.push(paraText);
  }

  return lines.join("\n");
}

// ─── Heuristic: keyword-stuffing detector (all formats) ──────────────────────

/**
 * Removes lines that look like keyword dumps:
 *  - Very long (15+ words)
 *  - Many commas (8+) with no sentence-ending punctuation
 *  - Short average word length (typical of tech term lists)
 */
export function removeKeywordStuffing(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      const words = trimmed.split(/\s+/);
      const commas = (trimmed.match(/,/g) ?? []).length;
      const sentenceEnds = (trimmed.match(/[.!?]/g) ?? []).length;
      const avgLen = trimmed.replace(/\s+/g, "").length / Math.max(words.length, 1);
      return !(words.length > 15 && commas > 8 && sentenceEnds === 0 && avgLen < 8);
    })
    .join("\n");
}
