"use client";
import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

export default function UploadZone({ onFileSelect, selectedFile, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFileSelect(f);
    },
    [onFileSelect]
  );

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 p-4 bg-[#E8DEF8] rounded-[16px] border border-[#6750A4]/20 shadow-sm">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6750A4] flex items-center justify-center shadow-sm">
          <FileText className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#1C1B1F] truncate text-sm">{selectedFile.name}</p>
          <p className="text-xs text-[#49454F] mt-0.5">
            {(selectedFile.size / 1024).toFixed(1)} KB · Ready to analyze
          </p>
        </div>
        <button
          onClick={onClear}
          aria-label="Remove file"
          className="flex-shrink-0 w-8 h-8 rounded-full bg-white/60 hover:bg-white transition-all duration-200 active:scale-95 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-[#49454F]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <label
      className="block cursor-pointer"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
    >
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.docx,.txt"
        aria-label="Upload resume"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
      />
      <div
        className={`flex flex-col items-center justify-center gap-4 p-10 rounded-[24px] border-2 border-dashed transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          isDragging
            ? "border-[#6750A4] bg-[#E8DEF8] scale-[1.01]"
            : "border-[#CAC4D0] bg-[#F3EDF7] hover:border-[#6750A4] hover:bg-[#EDE7F6]"
        }`}
      >
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isDragging ? "bg-[#6750A4] scale-110 shadow-lg" : "bg-[#E8DEF8]"
          }`}
        >
          <Upload
            className={`w-7 h-7 transition-colors duration-300 ${
              isDragging ? "text-white" : "text-[#6750A4]"
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <p className="font-semibold text-[#1C1B1F]">
            {isDragging ? "Drop your resume here" : "Drag & drop your resume"}
          </p>
          <p className="text-sm text-[#49454F] mt-1">
            or{" "}
            <span className="text-[#6750A4] font-medium underline underline-offset-2">
              browse files
            </span>
          </p>
        </div>
        <p className="text-xs text-[#79747E] bg-white/60 px-3 py-1 rounded-full">
          PDF · DOCX · TXT
        </p>
      </div>
    </label>
  );
}
