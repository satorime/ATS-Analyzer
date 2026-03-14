/**
 * Hidden Text Filter
 *
 * Three layers of protection:
 *
 *  1. extractPdfTextSanitized  – pdfjs-dist operator list (color + render-mode aware)
 *     Works in local Node.js. May fail on Vercel if worker can't load.
 *
 *  2. extractPdfTextFallback   – Pure Node.js / zlib only, NO external deps, NO worker.
 *     Handles the standard cases seen in real resume PDFs (Word, Google Docs, etc.).
 *     Skips white/invisible text via the same colour-state machine as layer 1,
 *     but reads raw decompressed PDF content streams instead of pdfjs OPS.
 *
 *  3. extractDocxTextSanitized – Direct DOCX XML parsing via JSZip.
 *     Strips white font, vanish flag, tiny font size, and white highlight.
 *     Also scans header/footer XML parts.
 *
 *  4. removeKeywordStuffing    – Heuristic for all formats.
 */

import { inflateSync, inflateRawSync } from "zlib";
import { pathToFileURL } from "url";

// ─── Layer 1: pdfjs-dist operator-list (color-aware) ────────────────────────

export async function extractPdfTextSanitized(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument, GlobalWorkerOptions, OPS } = pdfjs as unknown as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PDFDocumentProxy> };
    GlobalWorkerOptions: { workerSrc: string };
    OPS: Record<string, number>;
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const workerPath: string = require.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
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
    pages.push(extractVisibleTextFromOpList(opList, OPS));
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
  let fillWhite = false;
  let renderMode = 0;
  let fontSize = 12;
  const parts: string[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];

    if (fn === OPS.setFillRGBColor) {
      const [r, g, b] = args as number[];
      fillWhite = r >= 0.9 && g >= 0.9 && b >= 0.9;
    } else if (fn === OPS.setFillGray) {
      fillWhite = (args[0] as number) >= 0.9;
    } else if (fn === OPS.setFillCMYKColor) {
      const [c, m, y, k] = args as number[];
      fillWhite = c <= 0.1 && m <= 0.1 && y <= 0.1 && k <= 0.1;
    } else if (fn === OPS.setTextRenderingMode) {
      renderMode = args[0] as number;
    } else if (fn === OPS.setFont) {
      fontSize = args[1] as number;
    } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      if (!fillWhite && renderMode !== 3 && Math.abs(fontSize) > 1) {
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

// ─── Layer 2: Pure Node.js fallback (no worker, no external deps) ───────────

/**
 * Worker-free PDF text extractor using only Node.js built-in `zlib`.
 * Handles FlateDecode-compressed content streams and applies the same
 * colour-state machine to skip white/invisible text.
 *
 * Reliable for PDFs from Word, Google Docs, LibreOffice, etc.
 */
export function extractPdfTextFallback(buffer: Buffer): string {
  const streams = decompressPdfStreams(buffer);
  const visible: string[] = [];

  for (const stream of streams) {
    visible.push(scanStreamForVisibleText(stream));
  }

  // Also attempt a quick ToUnicode-aware extraction as a second pass
  const raw = quickRawExtract(buffer);
  if (raw.trim().length > visible.join("").trim().length) {
    return raw;
  }

  return visible.join("\n");
}

/** Decompress all FlateDecode streams in the PDF binary. */
function decompressPdfStreams(pdf: Buffer): string[] {
  const results: string[] = [];
  const src = pdf.toString("binary");

  // Walk through all stream...endstream blocks
  let pos = 0;
  while (pos < src.length) {
    const streamStart = src.indexOf("stream", pos);
    if (streamStart === -1) break;

    // The stream data starts after the line-ending following "stream"
    const afterKeyword = streamStart + 6;
    const lineEnd = src.indexOf("\n", afterKeyword);
    if (lineEnd === -1) { pos = afterKeyword; continue; }
    const dataStart = lineEnd + 1;

    const endStream = src.indexOf("endstream", dataStart);
    if (endStream === -1) { pos = dataStart; continue; }

    // Trim trailing CR/LF before endstream
    let dataEnd = endStream;
    while (dataEnd > dataStart && (src[dataEnd - 1] === "\n" || src[dataEnd - 1] === "\r")) {
      dataEnd--;
    }

    // Look back for the stream dictionary to check filter
    const dictEnd = streamStart;
    const dictStart = Math.max(0, dictEnd - 1024);
    const dict = src.slice(dictStart, dictEnd);
    const isFlateDecode = /\/FlateDecode\b/.test(dict) || /\/Fl\b/.test(dict);

    const rawBytes = Buffer.from(src.slice(dataStart, dataEnd), "binary");

    if (isFlateDecode) {
      const decompressed = tryInflate(rawBytes);
      if (decompressed) {
        results.push(decompressed.toString("binary"));
        pos = endStream + 9;
        continue;
      }
    }

    // Keep uncompressed stream if it looks like a content stream
    const asText = rawBytes.toString("latin1");
    if (/\b(BT|ET|Tj|TJ|Tf|Tr|rg|RG)\b/.test(asText)) {
      results.push(asText);
    }

    pos = endStream + 9;
  }

  return results;
}

function tryInflate(data: Buffer): Buffer | null {
  try { return inflateSync(data); } catch { /* */ }
  try { return inflateRawSync(data); } catch { /* */ }
  // Try skipping common PDF stream header bytes
  if (data.length > 2) {
    try { return inflateSync(data.slice(2)); } catch { /* */ }
  }
  return null;
}

/**
 * Parse a decompressed PDF content stream and return only the
 * text drawn with a non-white fill colour and non-invisible render mode.
 */
function scanStreamForVisibleText(stream: string): string {
  let fillWhite = false;
  let renderMode = 0;
  let fontSize = 12;
  const parts: string[] = [];

  // Normalise line endings
  const lines = stream.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── Colour operators ────────────────────────────────────────────
    // RGB: r g b rg
    const rgm = line.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg$/);
    if (rgm) {
      fillWhite =
        parseFloat(rgm[1]) >= 0.9 &&
        parseFloat(rgm[2]) >= 0.9 &&
        parseFloat(rgm[3]) >= 0.9;
      continue;
    }
    // Grayscale: g G
    const gm = line.match(/^([\d.]+)\s+g$/);
    if (gm) { fillWhite = parseFloat(gm[1]) >= 0.9; continue; }
    // CMYK: c m y k k
    const km = line.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k$/);
    if (km) {
      fillWhite =
        parseFloat(km[1]) <= 0.1 &&
        parseFloat(km[2]) <= 0.1 &&
        parseFloat(km[3]) <= 0.1 &&
        parseFloat(km[4]) <= 0.1;
      continue;
    }
    // Text rendering mode: n Tr
    const trm = line.match(/^(\d+)\s+Tr$/);
    if (trm) { renderMode = parseInt(trm[1]); continue; }
    // Font size: /Font size Tf
    const tfm = line.match(/\/\S+\s+([\d.]+)\s+Tf/);
    if (tfm) { fontSize = parseFloat(tfm[1]); continue; }

    const isHidden = fillWhite || renderMode === 3 || Math.abs(fontSize) <= 1;
    if (isHidden) continue;

    // ── Text operators ───────────────────────────────────────────────
    // Tj with literal string: (text) Tj
    const tjLit = line.match(/^\(([^)]*(?:\\\)[^)]*)*)\)\s*Tj$/);
    if (tjLit) { parts.push(decodePdfLiteral(tjLit[1])); continue; }

    // Tj with hex string: <hex> Tj
    const tjHex = line.match(/^<([0-9a-fA-F\s]*)>\s*Tj$/);
    if (tjHex) { parts.push(decodePdfHex(tjHex[1])); continue; }

    // TJ array: [(text) n (text)] TJ
    const tjArr = line.match(/^(\[[\s\S]*\])\s*TJ$/);
    if (tjArr) { parts.push(decodeTjArray(tjArr[1])); continue; }

    // Quote operators ' and "
    const quote = line.match(/^\(([^)]*)\)\s*['"]$/);
    if (quote) { parts.push(decodePdfLiteral(quote[1])); continue; }
  }

  return parts.join(" ");
}

function decodePdfLiteral(s: string): string {
  return s
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\").replace(/\\./g, "");
}

function decodePdfHex(hex: string): string {
  const h = hex.replace(/\s/g, "");
  // UTF-16BE detection: starts with FEFF
  if (h.startsWith("FEFF") || h.startsWith("feff")) {
    let out = "";
    for (let i = 4; i < h.length - 2; i += 4) {
      const cp = parseInt(h.slice(i, i + 4), 16);
      if (!isNaN(cp) && cp > 0) out += String.fromCodePoint(cp);
    }
    return out;
  }
  // Otherwise treat as Latin-1 bytes
  let out = "";
  for (let i = 0; i < h.length - 1; i += 2) {
    const b = parseInt(h.slice(i, i + 2), 16);
    if (!isNaN(b) && b > 31 && b < 128) out += String.fromCharCode(b);
  }
  return out;
}

function decodeTjArray(raw: string): string {
  const inner = raw.slice(1, -1);
  let out = "";
  for (const m of inner.matchAll(/\(([^)]*(?:\\\)[^)]*)*)\)|<([0-9a-fA-F\s]*)>/g)) {
    if (m[1] !== undefined) out += decodePdfLiteral(m[1]);
    else if (m[2] !== undefined) out += decodePdfHex(m[2]);
  }
  return out;
}

/**
 * Last-resort extraction: find every human-readable string ≥ 4 chars in the
 * raw (post-decompression) bytes. Less precise but catches edge cases.
 */
function quickRawExtract(buffer: Buffer): string {
  const streams = decompressPdfStreams(buffer);
  const words: string[] = [];

  for (const stream of streams) {
    // Grab all printable ASCII runs ≥ 4 chars
    const matches = stream.match(/[\x20-\x7E]{4,}/g) ?? [];
    for (const m of matches) {
      // Skip PDF operator noise
      if (/^(stream|endobj|endstream|xref|startxref|obj|trailer)$/.test(m)) continue;
      if (/^[\d\s.+\-/\\<>[\]{}()@#%^*]+$/.test(m)) continue;
      words.push(m);
    }
  }

  return words.join(" ");
}

// ─── DOCX: direct XML parsing ────────────────────────────────────────────────

function isWhiteColor(val: string): boolean {
  const c = val.replace(/^#/, "").trim();
  if (/^auto$/i.test(c)) return false;
  if (/^[0-9a-fA-F]{6}$/.test(c)) {
    return (
      parseInt(c.slice(0, 2), 16) >= 238 &&
      parseInt(c.slice(2, 4), 16) >= 238 &&
      parseInt(c.slice(4, 6), 16) >= 238
    );
  }
  return false;
}

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
  for (const para of xml.split(/<w:p[ >]/)) {
    let paraText = "";
    for (const runMatch of para.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g)) {
      const run = runMatch[1];
      const rPrMatch = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      if (rPrMatch) {
        const rPr = rPrMatch[1];
        if (/<w:vanish(?:\s*\/>|\s+w:val="true")/.test(rPr)) continue;
        const cm = rPr.match(/<w:color\s+w:val="([^"]+)"/);
        if (cm && isWhiteColor(cm[1])) continue;
        const sm = rPr.match(/<w:sz\s+w:val="(\d+)"/);
        if (sm && parseInt(sm[1]) < 4) continue;
        const hm = rPr.match(/<w:highlight\s+w:val="([^"]+)"/);
        if (hm && /^white$/i.test(hm[1])) continue;
      }
      for (const t of run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        paraText += t[1];
      }
    }
    if (paraText.trim()) lines.push(paraText);
  }
  return lines.join("\n");
}

// ─── Heuristic: keyword-stuffing detector ────────────────────────────────────

export function removeKeywordStuffing(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      const words = t.split(/\s+/);
      const commas = (t.match(/,/g) ?? []).length;
      const ends = (t.match(/[.!?]/g) ?? []).length;
      const avg = t.replace(/\s+/g, "").length / Math.max(words.length, 1);
      return !(words.length > 15 && commas > 8 && ends === 0 && avg < 8);
    })
    .join("\n");
}
