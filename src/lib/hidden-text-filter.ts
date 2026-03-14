/**
 * Hidden Text Filter
 *
 * Detects and removes "invisible" text that cheaters embed in resumes to
 * game ATS scanners. Common tactics:
 *  – White text on a white background  (PDF: color operator `1 1 1 rg` / `1 g`)
 *  – Invisible text rendering mode 3   (PDF: `3 Tr`)
 *  – Font size ≤ 1pt                   (PDF: tiny Tf size)
 *  – White font color in DOCX          (XML attribute w:color="FFFFFF" / "ffffff")
 *  – Keyword-stuffed lines             (heuristic, all formats)
 */

import { inflateSync, inflateRawSync } from "zlib";

// ─── PDF hidden-text scanner ────────────────────────────────────────────────

interface PdfTextOp {
  text: string;
  hidden: boolean;
}

/** Convert a PDF name-escaped string like `(Hello\\ World)` to a plain string. */
function decodePdfLiteralString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8))
    )
    .replace(/\\./g, "");
}

/** Decode a PDF hex string like `<48656c6c6f>` to plain text. */
function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  let result = "";
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (!isNaN(byte)) result += String.fromCharCode(byte);
  }
  return result;
}

/** Decode a TJ array like `[(Hello) 20 (World)]` to plain text. */
function decodeTjArray(raw: string): string {
  let out = "";
  const inner = raw.slice(1, -1); // strip [ ]
  const parts = inner.matchAll(/\(([^)]*)\)|<([0-9a-fA-F\s]*)>/g);
  for (const m of parts) {
    if (m[1] !== undefined) out += decodePdfLiteralString(m[1]);
    else if (m[2] !== undefined) out += decodePdfHexString(m[2]);
  }
  return out;
}

/**
 * Scan a decompressed PDF content stream for text operations,
 * tagging each chunk as hidden or visible.
 */
function scanContentStream(stream: string): PdfTextOp[] {
  const ops: PdfTextOp[] = [];

  // State
  let fillColorWhite = false;
  let renderMode = 0; // 0 = fill (visible), 3 = invisible
  let fontSize = 12;
  let inText = false;

  const lines = stream.split(/\r?\n|\r/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Begin / End text block
    if (line === "BT") { inText = true; continue; }
    if (line === "ET") { inText = false; continue; }

    // ── Color operators ───────────────────────────────────────────────────
    // RGB fill: r g b rg  (values 0–1)
    const rgMatch = line.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg$/);
    if (rgMatch) {
      const r = parseFloat(rgMatch[1]);
      const g = parseFloat(rgMatch[2]);
      const b = parseFloat(rgMatch[3]);
      // White is r≥0.9 AND g≥0.9 AND b≥0.9
      fillColorWhite = r >= 0.9 && g >= 0.9 && b >= 0.9;
      continue;
    }

    // Grayscale fill: g G  (1 = white)
    const gMatch = line.match(/^([\d.]+)\s+g$/);
    if (gMatch) {
      fillColorWhite = parseFloat(gMatch[1]) >= 0.9;
      continue;
    }

    // CMYK fill: c m y k k  (0 0 0 0 = white in CMYK)
    const kMatch = line.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k$/);
    if (kMatch) {
      const c = parseFloat(kMatch[1]);
      const m2 = parseFloat(kMatch[2]);
      const y = parseFloat(kMatch[3]);
      const k = parseFloat(kMatch[4]);
      fillColorWhite = c <= 0.05 && m2 <= 0.05 && y <= 0.05 && k <= 0.05;
      continue;
    }

    // ── Text state operators ──────────────────────────────────────────────
    // Text rendering mode: n Tr  (3 = invisible)
    const trMatch = line.match(/^(\d+)\s+Tr$/);
    if (trMatch) {
      renderMode = parseInt(trMatch[1]);
      continue;
    }

    // Font size: /Font size Tf  — extract size
    const tfMatch = line.match(/\/\S+\s+([\d.]+)\s+Tf/);
    if (tfMatch) {
      fontSize = parseFloat(tfMatch[1]);
      continue;
    }

    if (!inText) continue;

    // Determine hidden status BEFORE extracting text
    const isHidden =
      fillColorWhite ||
      renderMode === 3 ||  // invisible rendering mode
      fontSize <= 1;       // essentially invisible font size

    // ── Text drawing operators ────────────────────────────────────────────
    // Tj — show literal string
    const tjMatch = line.match(/\(([^)]*)\)\s*Tj$/);
    if (tjMatch) {
      ops.push({ text: decodePdfLiteralString(tjMatch[1]), hidden: isHidden });
      continue;
    }

    // Tj — show hex string
    const tjHexMatch = line.match(/<([0-9a-fA-F\s]*)>\s*Tj$/);
    if (tjHexMatch) {
      ops.push({ text: decodePdfHexString(tjHexMatch[1]), hidden: isHidden });
      continue;
    }

    // TJ — show array of strings/numbers
    const tjArrayMatch = line.match(/(\[[\s\S]*?\])\s*TJ$/);
    if (tjArrayMatch) {
      ops.push({ text: decodeTjArray(tjArrayMatch[1]), hidden: isHidden });
      continue;
    }

    // ' and " operators (move to next line and show text)
    const quoteMatch = line.match(/\(([^)]*)\)\s*['"]$/);
    if (quoteMatch) {
      ops.push({ text: decodePdfLiteralString(quoteMatch[1]), hidden: isHidden });
    }
  }

  return ops;
}

/** Attempt to decompress a raw bytes buffer as zlib-deflated data. */
function tryDecompress(data: Buffer): string | null {
  // Try zlib wrapper first (most common for PDF FlateDecode)
  try {
    return inflateSync(data).toString("latin1");
  } catch {
    // Fall back to raw deflate
    try {
      return inflateRawSync(data).toString("latin1");
    } catch {
      return null;
    }
  }
}

/**
 * Extract all content streams from a raw PDF buffer.
 * Returns each stream's decompressed text (best-effort).
 */
function extractPdfStreams(pdfBuffer: Buffer): string[] {
  const results: string[] = [];
  const pdf = pdfBuffer.toString("binary");

  // Find stream...endstream blocks
  const streamStartRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamStartRe.exec(pdf)) !== null) {
    const startIdx = match.index + match[0].length;

    // Find matching endstream
    const endIdx = pdf.indexOf("endstream", startIdx);
    if (endIdx === -1) continue;

    // Also try to detect if the stream dictionary says /Filter /FlateDecode
    const dictSearchStart = Math.max(0, match.index - 512);
    const dictChunk = pdf.slice(dictSearchStart, match.index);

    const isFlateDecode =
      /\/Filter\s*\/FlateDecode/.test(dictChunk) ||
      /\/Filter\s*\[\s*\/FlateDecode/.test(dictChunk) ||
      /\/FlateDecode/.test(dictChunk);

    const rawBytes = Buffer.from(pdf.slice(startIdx, endIdx), "binary");

    if (isFlateDecode) {
      const decompressed = tryDecompress(rawBytes);
      if (decompressed) {
        results.push(decompressed);
        continue;
      }
    }

    // Treat as uncompressed content stream if it looks like PDF operators
    const asText = rawBytes.toString("latin1");
    if (/\b(BT|ET|Tj|TJ|Tf|Tr|rg|RG)\b/.test(asText)) {
      results.push(asText);
    }
  }

  return results;
}

/**
 * Build a set of "hidden text" strings found in the PDF.
 * These will be subtracted from the final extracted text.
 */
export function buildPdfHiddenTextSet(pdfBuffer: Buffer): Set<string> {
  const hidden = new Set<string>();
  const streams = extractPdfStreams(pdfBuffer);

  for (const stream of streams) {
    const ops = scanContentStream(stream);
    for (const op of ops) {
      if (op.hidden && op.text.trim().length > 0) {
        hidden.add(op.text.trim().toLowerCase());
      }
    }
  }

  return hidden;
}

/**
 * Remove hidden text from an extracted text string.
 * Splits on whitespace tokens and drops any that appear in the hidden set.
 */
export function removePdfHiddenText(
  extractedText: string,
  hiddenSet: Set<string>
): string {
  if (hiddenSet.size === 0) return extractedText;

  const lines = extractedText.split(/\n/);
  const filtered = lines.map((line) => {
    // Check if the whole line is in the hidden set
    if (hiddenSet.has(line.trim().toLowerCase())) return "";

    // Check individual tokens — drop only if ALL words are hidden
    const tokens = line.split(/\s+/);
    const visibleTokens = tokens.filter(
      (t) => !hiddenSet.has(t.trim().toLowerCase())
    );

    // If we filtered out >80% of tokens on a line, drop the whole line
    if (tokens.length > 3 && visibleTokens.length / tokens.length < 0.2) {
      return "";
    }

    return visibleTokens.join(" ");
  });

  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── DOCX hidden-text filter ─────────────────────────────────────────────────

/** Hex colors that are "white enough" to be considered invisible on a white page. */
const WHITE_HEX_RE = /^(ffffff|fafafa|f5f5f5|f0f0f0|eeeeee|e8e8e8|fff|ff[ef]|auto)$/i;

/**
 * Returns true if a w:color value indicates near-white (invisible on white background).
 */
function isWhiteColor(val: string): boolean {
  const clean = val.replace(/^#/, "").trim();
  if (WHITE_HEX_RE.test(clean)) return true;
  // Also check per-channel: all channels ≥ 0xEE
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return r >= 238 && g >= 238 && b >= 238;
  }
  return false;
}

/**
 * Extract plain text from a DOCX buffer while removing:
 *  - Runs with white/near-white font color  (w:color val="FFFFFF" etc.)
 *  - Runs flagged as w:vanish (hidden text property)
 *  - Runs with font size < 2pt              (w:sz val < 4 in half-points)
 *
 * Returns the sanitized plain text.
 */
export async function extractDocxTextSanitized(buffer: Buffer): Promise<string> {
  // JSZip is a dependency of mammoth — safe to require
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require("jszip") as typeof import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  // Collect all document parts that may contain text:
  // - word/document.xml  (main body)
  // - word/header*.xml
  // - word/footer*.xml
  const partNames = Object.keys(zip.files).filter(
    (n) =>
      /^word\/document\.xml$/.test(n) ||
      /^word\/header\d*\.xml$/.test(n) ||
      /^word\/footer\d*\.xml$/.test(n)
  );

  let fullText = "";

  for (const partName of partNames) {
    const xml = await zip.files[partName].async("string");
    fullText += "\n" + extractVisibleTextFromXml(xml);
  }

  return fullText.trim();
}

/**
 * Walk the DOCX XML and return only the text from visible runs.
 */
function extractVisibleTextFromXml(xml: string): string {
  const lines: string[] = [];

  // Split on paragraph boundaries
  const paragraphs = xml.split(/<w:p[ >]/);

  for (const para of paragraphs) {
    let paraText = "";

    // Find all runs in this paragraph
    const runMatches = para.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g);

    for (const runMatch of runMatches) {
      const run = runMatch[1];

      // ── Check run properties (<w:rPr>) ─────────────────────────────────
      const rPrMatch = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      if (rPrMatch) {
        const rPr = rPrMatch[1];

        // w:vanish — hidden text flag
        if (/<w:vanish\s*\/>|<w:vanish\s+w:val="true"/.test(rPr)) continue;

        // w:color — check for white/near-white
        const colorMatch = rPr.match(/<w:color\s+w:val="([^"]+)"/);
        if (colorMatch && isWhiteColor(colorMatch[1])) continue;

        // w:sz — font size in half-points; < 4 = < 2pt
        const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/);
        if (szMatch && parseInt(szMatch[1]) < 4) continue;

        // w:highlight — "white" highlight (text blends into background)
        const hlMatch = rPr.match(/<w:highlight\s+w:val="([^"]+)"/);
        if (hlMatch && /white/i.test(hlMatch[1])) continue;
      }

      // ── Extract text from this visible run ─────────────────────────────
      const textMatches = run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
      for (const t of textMatches) {
        paraText += t[1];
      }
    }

    if (paraText.trim()) lines.push(paraText);
  }

  return lines.join("\n");
}

// ─── Heuristic keyword-stuffing detector ─────────────────────────────────────

/**
 * Detects and removes lines that are suspiciously dense with comma/space-separated
 * keywords that don't form natural sentences. This catches the pattern where cheaters
 * dump "React Node.js Docker Kubernetes AWS..." as a hidden wall of text.
 */
export function removeKeywordStuffing(text: string): string {
  const lines = text.split(/\n/);
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { cleaned.push(line); continue; }

    const wordCount = trimmed.split(/\s+/).length;
    const avgWordLength = trimmed.replace(/\s+/g, "").length / Math.max(wordCount, 1);
    const commaCount = (trimmed.match(/,/g) ?? []).length;
    const sentenceEnders = (trimmed.match(/[.!?]/g) ?? []).length;

    // Suspicious: many short words, many commas, no sentence structure
    const isKeywordDump =
      wordCount > 15 &&
      commaCount > 8 &&
      sentenceEnders === 0 &&
      avgWordLength < 8;

    if (!isKeywordDump) {
      cleaned.push(line);
    }
  }

  return cleaned.join("\n");
}
