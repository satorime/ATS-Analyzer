"use client";
import { useEffect, useState } from "react";

interface ScoreGaugeProps {
  score: number;
}

function getColor(s: number) {
  if (s >= 80) return "#386A20";
  if (s >= 60) return "#6750A4";
  if (s >= 40) return "#7D5260";
  return "#B3261E";
}

function getLabel(s: number) {
  if (s >= 80) return "Excellent";
  if (s >= 60) return "Good";
  if (s >= 40) return "Fair";
  return "Poor";
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    setAnimated(0);
    const t = setTimeout(() => {
      const interval = setInterval(() => {
        setAnimated((prev) => {
          if (prev >= score) { clearInterval(interval); return score; }
          return Math.min(prev + 2, score);
        });
      }, 16);
      return () => clearInterval(interval);
    }, 200);
    return () => clearTimeout(t);
  }, [score]);

  const color = getColor(score);
  const label = getLabel(score);
  const R = 70;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (animated / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-44 h-44" role="img" aria-label={`ATS Score: ${score} — ${label}`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
          {/* Track */}
          <circle cx="80" cy="80" r={R} fill="none" stroke="#E7E0EC" strokeWidth="12" />
          {/* Progress */}
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.016s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums" style={{ color }}>
            {animated}
          </span>
          <span className="text-xs text-[#49454F] font-medium tracking-wide mt-0.5">ATS Score</span>
        </div>
      </div>
      <span
        className="px-5 py-1.5 rounded-full text-sm font-medium text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </div>
  );
}
