import { NextRequest, NextResponse } from "next/server";
import { analyzeResume } from "@/lib/ats-analyzer";
import { prisma } from "@/lib/prisma";

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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
        const parsed = await pdfParse(buffer);
        resumeText = parsed.text;
      } else if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        resumeText = result.value;
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

    if (resumeText.trim().length < 100) {
      return NextResponse.json(
        { error: "The resume appears to be empty or too short to analyze." },
        { status: 422 }
      );
    }

    const analysis = analyzeResume(resumeText, jobDescription);

    // Persist to DB (non-critical — continue even if DB is unavailable)
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
      console.warn("DB save skipped (no database configured):", (dbErr as Error).message);
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
