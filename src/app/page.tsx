"use client";
import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import ResultsPanel, { type AnalysisResult } from "@/components/ResultsPanel";
import {
  Loader2,
  Sparkles,
  FileSearch,
  BarChart3,
  Zap,
  RotateCcw,
} from "lucide-react";

const FEATURES = [
  { icon: "📄", label: "PDF · DOCX · TXT" },
  { icon: "⚡", label: "Instant Analysis" },
  { icon: "🎯", label: "Keyword Matching" },
  { icon: "💡", label: "Smart Suggestions" },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Upload Resume", desc: "PDF, DOCX, or TXT — drag & drop or browse" },
  { step: "2", title: "Paste Job Description", desc: "Copy the full job posting and paste it" },
  { step: "3", title: "Get Your Score", desc: "Instant ATS score with keyword breakdown" },
  { step: "4", title: "Improve & Resubmit", desc: "Follow suggestions and upload your revised resume" },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!file || !jobDescription.trim()) {
      setError("Please upload a resume and provide a job description.");
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("resume", file);
      form.append("jobDescription", jobDescription);

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data as AnalysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setJobDescription("");
    setResult(null);
    setError(null);
  }

  const canAnalyze = !!file && jobDescription.trim().length >= 50;

  return (
    <div className="min-h-screen bg-[#FFFBFE] relative overflow-hidden">
      {/* ── Atmospheric blur shapes ────────────────────────────── */}
      <div
        aria-hidden="true"
        className="fixed top-[-100px] right-[-100px] w-[480px] h-[480px] rounded-full bg-[#6750A4]/6 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="fixed bottom-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full bg-[#7D5260]/6 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-[200px] bg-[#E8DEF8]/15 blur-3xl pointer-events-none"
      />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#FFFBFE]/80 backdrop-blur-md border-b border-[#CAC4D0]/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#6750A4] flex items-center justify-center shadow-md">
              <FileSearch className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1C1B1F] leading-tight">
                ATS Resume Analyzer
              </h1>
              <p className="text-xs text-[#49454F] leading-none mt-0.5">
                Optimize for Applicant Tracking Systems
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E8DEF8] text-[#6750A4] rounded-full text-xs font-medium">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Free · No sign-up
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 pb-24">
        {/* ── Hero (only before first result) ──────────────────── */}
        {!result && (
          <section className="text-center mb-10 pt-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8DEF8] text-[#6750A4] rounded-full text-sm font-medium mb-6 shadow-sm">
              <Zap className="w-4 h-4" aria-hidden="true" />
              Instant ATS Score
            </div>

            <h2 className="text-4xl sm:text-5xl font-bold text-[#1C1B1F] mb-4 leading-[1.2] tracking-tight">
              Beat the ATS &{" "}
              <span className="text-[#6750A4]">Land More Interviews</span>
            </h2>
            <p className="text-lg text-[#49454F] max-w-xl mx-auto leading-relaxed">
              Upload your resume and paste a job description to get a detailed keyword
              analysis with actionable tips to improve your score.
            </p>

            <div className="flex flex-wrap justify-center gap-3 mt-8">
              {FEATURES.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 px-4 py-2 bg-[#F3EDF7] rounded-full text-sm text-[#49454F] shadow-sm"
                >
                  <span>{f.icon}</span>
                  {f.label}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Two-column layout after result ───────────────────── */}
        <div className={`grid gap-8 ${result ? "lg:grid-cols-2" : "max-w-2xl mx-auto"}`}>
          {/* LEFT: Input Panel */}
          <div className="space-y-5">
            {result && (
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1C1B1F]">Analyze Another</h2>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#6750A4] hover:bg-[#E8DEF8] rounded-full transition-all duration-200 active:scale-95 font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Start Over
                </button>
              </div>
            )}

            {/* Upload card */}
            <div className="bg-[#F3EDF7] rounded-[32px] p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
              <h3 className="font-bold text-[#1C1B1F] mb-0.5">Upload Resume</h3>
              <p className="text-xs text-[#49454F] mb-4">PDF, DOCX, or TXT format</p>
              <UploadZone
                onFileSelect={setFile}
                selectedFile={file}
                onClear={() => setFile(null)}
              />
            </div>

            {/* Job Description card */}
            <div className="bg-[#F3EDF7] rounded-[32px] p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
              <div className="flex items-center justify-between mb-0.5">
                <h3 className="font-bold text-[#1C1B1F]">Job Description</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors duration-200 ${
                    jobDescription.trim().length >= 50
                      ? "bg-[#CCEFCA] text-[#386A20]"
                      : "bg-[#E7E0EC] text-[#49454F]"
                  }`}
                >
                  {jobDescription.length} chars
                </span>
              </div>
              <p className="text-xs text-[#49454F] mb-4">Paste the full job posting</p>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={`Paste the job description here...\n\nExample: We are looking for a Software Engineer with 3+ years of experience in React, TypeScript, Node.js, and PostgreSQL. Experience with AWS, Docker, and CI/CD pipelines is required...`}
                className="w-full h-48 px-4 py-3 bg-[#E7E0EC] rounded-t-[12px] rounded-b-none border-b-2 border-[#79747E] focus:border-[#6750A4] outline-none resize-none text-sm text-[#1C1B1F] placeholder:text-[#79747E]/70 transition-colors duration-200 leading-relaxed"
                aria-label="Job description"
              />
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 bg-[#FFD8E4] text-[#31111D] rounded-[16px] text-sm shadow-sm"
              >
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <p>{error}</p>
              </div>
            )}

            {/* CTA button */}
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !canAnalyze}
              className="w-full h-14 bg-[#6750A4] hover:bg-[#5B4397] active:bg-[#4F3A88] text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-3 text-base"
              aria-label={isAnalyzing ? "Analyzing resume, please wait" : "Analyze ATS Score"}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  Analyzing Resume…
                </>
              ) : (
                <>
                  <BarChart3 className="w-5 h-5" aria-hidden="true" />
                  Analyze ATS Score
                </>
              )}
            </button>

            {!canAnalyze && !isAnalyzing && (
              <p className="text-center text-xs text-[#79747E]">
                {!file
                  ? "Upload a resume to get started"
                  : "Add more detail to the job description (min. 50 chars)"}
              </p>
            )}

            {/* How It Works (only before result) */}
            {!result && (
              <div className="bg-[#F3EDF7] rounded-[32px] p-6 shadow-sm">
                <h3 className="font-bold text-[#1C1B1F] mb-5">How It Works</h3>
                <ol className="space-y-4">
                  {HOW_IT_WORKS.map((item) => (
                    <li key={item.step} className="flex gap-4 group">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#E8DEF8] text-[#6750A4] font-bold text-sm flex items-center justify-center group-hover:bg-[#6750A4] group-hover:text-white transition-all duration-200 shadow-sm">
                        {item.step}
                      </div>
                      <div className="pt-1">
                        <p className="font-semibold text-[#1C1B1F] text-sm leading-tight">
                          {item.title}
                        </p>
                        <p className="text-xs text-[#49454F] mt-0.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* RIGHT: Results Panel */}
          {result && (
            <div>
              <h2 className="text-xl font-bold text-[#1C1B1F] mb-5">Analysis Results</h2>
              <ResultsPanel result={result} />
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#FFFBFE]/80 backdrop-blur-md border-t border-[#CAC4D0]/40 py-3 z-40">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#79747E]">
            © 2026 Brix Bitayo • All rights reserved
          </p>
          <p className="text-xs text-[#79747E]">
            Next.js · TypeScript · Prisma · PostgreSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
