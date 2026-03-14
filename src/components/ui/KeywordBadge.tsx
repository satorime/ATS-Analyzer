interface KeywordBadgeProps {
  keyword: string;
  type: "matched" | "missing";
}

export default function KeywordBadge({ keyword, type }: KeywordBadgeProps) {
  const isMatched = type === "matched";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium select-none transition-all duration-200 cursor-default active:scale-95 ${
        isMatched
          ? "bg-[#E8DEF8] text-[#1D192B] hover:bg-[#D0BCFF]"
          : "bg-[#FFD8E4] text-[#31111D] hover:bg-[#FFB4C8]"
      }`}
    >
      <span aria-hidden="true">{isMatched ? "✓" : "✕"}</span>
      {keyword}
    </span>
  );
}
