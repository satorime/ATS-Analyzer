"use client";
import ScoreGauge from "@/components/ui/ScoreGauge";
import KeywordBadge from "@/components/ui/KeywordBadge";
import { CheckCircle2, XCircle, Lightbulb, TrendingUp } from "lucide-react";

export interface AnalysisResult {
  id: string | null;
  resumeName: string;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
}

export default function ResultsPanel({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-5">
      {/* Score Card */}
      <div className="relative overflow-hidden bg-[#F3EDF7] rounded-[32px] p-8 flex flex-col items-center gap-6 shadow-md">
        {/* Decorative blurs */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#6750A4]/10 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full bg-[#7D5260]/10 blur-3xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 text-center">
          <h2 className="text-xl font-bold text-[#1C1B1F]">ATS Compatibility Score</h2>
          <p className="text-sm text-[#49454F] mt-1 truncate max-w-[240px]">
            {result.resumeName}
          </p>
        </div>

        <div className="relative z-10">
          <ScoreGauge score={result.score} />
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-3 w-full">
          <div className="text-center bg-white/70 rounded-[16px] p-3 shadow-sm">
            <div className="text-2xl font-bold text-[#386A20]">{result.matchedKeywords.length}</div>
            <div className="text-xs text-[#49454F] mt-0.5">Matched</div>
          </div>
          <div className="text-center bg-white/70 rounded-[16px] p-3 shadow-sm">
            <div className="text-2xl font-bold text-[#B3261E]">{result.missingKeywords.length}</div>
            <div className="text-xs text-[#49454F] mt-0.5">Missing</div>
          </div>
        </div>
      </div>

      {/* Matched Keywords */}
      {result.matchedKeywords.length > 0 && (
        <section className="bg-[#F3EDF7] rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-[#386A20] flex-shrink-0" aria-hidden="true" />
            <h3 className="font-bold text-[#1C1B1F]">Matched Keywords</h3>
            <span className="ml-auto bg-[#CCEFCA] text-[#386A20] text-xs font-bold px-2.5 py-0.5 rounded-full">
              {result.matchedKeywords.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.matchedKeywords.map((kw) => (
              <KeywordBadge key={kw} keyword={kw} type="matched" />
            ))}
          </div>
        </section>
      )}

      {/* Missing Keywords */}
      {result.missingKeywords.length > 0 && (
        <section className="bg-[#F3EDF7] rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-[#B3261E] flex-shrink-0" aria-hidden="true" />
            <h3 className="font-bold text-[#1C1B1F]">Missing Keywords</h3>
            <span className="ml-auto bg-[#FFD8E4] text-[#B3261E] text-xs font-bold px-2.5 py-0.5 rounded-full">
              {result.missingKeywords.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.missingKeywords.map((kw) => (
              <KeywordBadge key={kw} keyword={kw} type="missing" />
            ))}
          </div>
        </section>
      )}

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <section className="bg-[#F3EDF7] rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-[#6750A4] flex-shrink-0" aria-hidden="true" />
            <h3 className="font-bold text-[#1C1B1F]">Improvement Suggestions</h3>
            <TrendingUp className="w-4 h-4 text-[#6750A4] ml-auto" aria-hidden="true" />
          </div>
          <ul className="space-y-3">
            {result.suggestions.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 p-3 bg-white/60 rounded-[16px] hover:bg-[#E8DEF8] transition-colors duration-200 group"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#E8DEF8] group-hover:bg-[#6750A4] text-[#6750A4] group-hover:text-white text-xs font-bold flex items-center justify-center transition-all duration-200">
                  {i + 1}
                </span>
                <p className="text-sm text-[#1C1B1F] leading-relaxed">{s}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
