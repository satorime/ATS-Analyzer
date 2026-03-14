import { NextRequest, NextResponse } from "next/server";
import { analyzeResume } from "@/lib/ats-analyzer";
import { prisma } from "@/lib/prisma";
import {
  buildPdfHiddenTextSet,
  removePdfHiddenText,
  extractDocxTextSanitized,
  removeKeywordStuffing,
} from "@/lib/hidden-text-filter";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("resume") as File | null;
    const jobDescription = formData.get("jobDescription") as string | null;

    if (!file || !jobDescription) {
      return NextResponse.json(
        { error: "Resume file and job description are required." },
        { status: 400 }
      );
    }

    if (jobDescription.trim().length < 50) {
      return NextResponse.json(
        { error: "Please provide a more detailed job description (at least 50 characters)." },
        { status: 400 }
      );
    }

    const ALLOWED_TYPES = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    const isAllowed =
      ALLOWED_TYPES.includes(file.type) ||
      /\.(pdf|docx|txt)$/i.test(file.name);

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Only PDF, DOCX, and TXT files are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let resumeText = "";

    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        // 1. Scan the raw PDF streams for white/invisible text operators
        const hiddenSet = buildPdfHiddenTextSet(buffer);

        // 2. Extract all text with pdf-parse v2
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();

        // 3. Strip out the hidden text chunks
        resumeText = removePdfHiddenText(result.text, hiddenSet);

      } else if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx")
      ) {
        // Directly parse the DOCX XML — strips white font, vanish flag, tiny font sizes
        resumeText = await extractDocxTextSanitized(buffer);

      } else {
        resumeText = buffer.toString("utf-8");
      }
    } catch (parseErr) {
      console.error("File parse error:", parseErr);
      return NextResponse.json(
        { error: "Could not parse the resume file. Try a different format." },
        { status: 422 }
      );
    }

    // Final pass: drop suspicious keyword-dump lines (all formats)
    resumeText = removeKeywordStuffing(resumeText);

    if (resumeText.trim().length < 100) {
      return NextResponse.json(
        { error: "The resume appears to be empty or too short to analyze." },
        { status: 422 }
      );
    }

    const analysis = analyzeResume(resumeText, jobDescription);

    // Persist to DB (non-critical — continues even if DB is unavailable)
    let savedId: string | null = null;
    try {
      const saved = await prisma.analysis.create({
        data: {
          resumeName: file.name,
          resumeText: resumeText.substring(0, 10000),
          jobDescription: jobDescription.substring(0, 5000),
          score: analysis.score,
          matchedKeywords: analysis.matchedKeywords,
          missingKeywords: analysis.missingKeywords,
          suggestions: analysis.suggestions,
        },
      });
      savedId = saved.id;
    } catch (dbErr) {
      console.warn("DB save skipped:", (dbErr as Error).message);
    }

    return NextResponse.json({
      id: savedId,
      resumeName: file.name,
      score: analysis.score,
      matchedKeywords: analysis.matchedKeywords,
      missingKeywords: analysis.missingKeywords,
      suggestions: analysis.suggestions,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
