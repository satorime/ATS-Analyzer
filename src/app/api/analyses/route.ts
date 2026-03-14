import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const analyses = await prisma.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        resumeName: true,
        score: true,
        matchedKeywords: true,
        missingKeywords: true,
        createdAt: true,
      },
    });
    return NextResponse.json(analyses);
  } catch (err) {
    console.error("Fetch analyses error:", err);
    return NextResponse.json({ error: "Failed to fetch analyses." }, { status: 500 });
  }
}
