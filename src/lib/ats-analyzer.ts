export interface AnalysisResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","up","about","into","through","during","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","must","shall","can","need","ought","able","i","you",
  "he","she","it","we","they","them","their","this","that","these","those",
  "what","which","who","when","where","why","how","all","each","every","both",
  "few","more","most","other","some","such","no","not","only","same","so",
  "than","too","very","just","also","as","if","while","although","because",
  "experience","years","year","work","working","strong","excellent","ability",
  "skills","skill","knowledge","understanding","proficiency","familiarity",
]);

const TECH_PHRASES = [
  "machine learning","deep learning","natural language processing","computer vision",
  "data science","software engineering","web development","mobile development",
  "cloud computing","devops","ci/cd","rest api","graphql","microservices",
  "agile methodology","scrum","test driven development","continuous integration",
  "continuous deployment","object oriented programming","functional programming",
  "system design","database design","problem solving","full stack","front end",
  "back end","version control","code review","unit testing","integration testing",
];

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const phrases: string[] = [];

  for (const phrase of TECH_PHRASES) {
    if (lower.includes(phrase)) phrases.push(phrase);
  }

  const words = lower
    .replace(/[^\w\s+#.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  const TECH_TERMS = new Set([
    "react","angular","vue","svelte","nextjs","next.js","nuxt","gatsby",
    "nodejs","node.js","express","fastapi","django","flask","rails","laravel",
    "typescript","javascript","python","java","kotlin","swift","go","rust",
    "c++","c#","ruby","php","scala","dart","elixir","haskell",
    "sql","nosql","mongodb","postgresql","mysql","sqlite","redis","cassandra",
    "elasticsearch","neo4j","dynamodb","firebase","supabase",
    "aws","azure","gcp","docker","kubernetes","terraform","ansible","helm",
    "git","github","gitlab","jenkins","github","bitbucket","circleci","travis",
    "html","css","tailwind","sass","scss","webpack","vite","parcel","rollup",
    "graphql","rest","grpc","websocket","oauth","jwt","openapi",
    "redux","zustand","mobx","jotai","recoil","pinia","vuex",
    "jest","vitest","cypress","playwright","selenium","testing","mocha",
    "linux","bash","shell","powershell","nginx","apache","caddy",
    "figma","sketch","adobe","photoshop","illustrator","invision",
    "tensorflow","pytorch","scikit-learn","pandas","numpy","opencv","keras",
    "leadership","management","communication","collaboration","mentoring",
    "analytical","strategic","innovative","agile","scrum","kanban",
  ]);

  const singles = Array.from(freq.entries())
    .filter(([w, c]) => c > 1 || TECH_TERMS.has(w))
    .map(([w]) => w);

  return [...new Set([...phrases, ...singles])];
}

function generateSuggestions(
  matched: string[],
  missing: string[],
  score: number
): string[] {
  const suggestions: string[] = [];

  if (score < 50) {
    suggestions.push("Your resume significantly lacks keywords from this job description. A targeted revision is recommended.");
  } else if (score < 70) {
    suggestions.push("Your resume partially matches the requirements. Adding more relevant keywords will improve your chances.");
  } else if (score < 85) {
    suggestions.push("Good keyword match! A few targeted additions could push your score above 85%.");
  } else {
    suggestions.push("Excellent keyword match! Your resume is well-optimized for this role.");
  }

  if (missing.length > 0) {
    const top = missing.slice(0, 5).join(", ");
    suggestions.push(`Add these missing keywords naturally in your experience bullets: ${top}.`);
  }

  suggestions.push(
    "Quantify achievements — e.g., \"Reduced load time by 40%\" instead of \"Improved performance\"."
  );
  suggestions.push(
    "Open bullet points with strong action verbs: Led, Built, Designed, Implemented, Optimized, Delivered."
  );
  suggestions.push(
    "Keep your resume in a single-column, ATS-friendly format — avoid tables, text boxes, and graphics."
  );

  if (matched.length < 10) {
    suggestions.push("Expand your skills section to include more relevant tools and technologies from the job posting.");
  }

  return suggestions;
}

export function analyzeResume(resumeText: string, jobDescription: string): AnalysisResult {
  const jobKeywords = extractKeywords(jobDescription);
  const resumeKeywords = new Set(extractKeywords(resumeText));
  const resumeLower = resumeText.toLowerCase();

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of jobKeywords) {
    if (resumeKeywords.has(kw) || resumeLower.includes(kw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const score =
    jobKeywords.length > 0
      ? Math.min(100, Math.round((matchedKeywords.length / jobKeywords.length) * 100))
      : 0;

  return {
    score,
    matchedKeywords,
    missingKeywords,
    suggestions: generateSuggestions(matchedKeywords, missingKeywords, score),
  };
}
