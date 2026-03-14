# ATS Resume Analyzer

A production-ready **Resume ATS Analyzer** that scores your resume against any job description, surfaces matched and missing keywords, and provides actionable improvement suggestions — all in real time.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org) (App Router) | Full-stack React framework |
| [TypeScript](https://www.typescriptlang.org) | Type-safe JavaScript |
| [Tailwind CSS v4](https://tailwindcss.com) | Utility-first styling |
| Material You (MD3) | Design system — tonal surfaces, pill buttons, organic radii |
| [Lucide React](https://lucide.dev) | Icon library |

### Backend
| Technology | Purpose |
|---|---|
| Next.js API Routes | REST endpoints (`/api/analyze`, `/api/analyses`) |
| [pdf-parse v2](https://www.npmjs.com/package/pdf-parse) | PDF text extraction |
| [mammoth](https://www.npmjs.com/package/mammoth) | DOCX text extraction |
| [JSZip](https://stuk.github.io/jszip) | DOCX XML inspection for hidden-text detection |
| Node.js `zlib` | Decompress PDF FlateDecode streams |

### Database & ORM
| Technology | Purpose |
|---|---|
| [PostgreSQL](https://www.postgresql.org) | Relational database |
| [Prisma 7](https://www.prisma.io) | Type-safe ORM |
| [@prisma/adapter-pg](https://www.prisma.io/docs/orm/overview/databases/postgresql) | PostgreSQL adapter for Prisma 7 |

### Deployment
| Service | Purpose |
|---|---|
| [Vercel](https://vercel.com) | Frontend + API hosting |
| [Neon](https://neon.tech) / [Supabase](https://supabase.com) | Serverless PostgreSQL |

---

## Features

- **Resume Upload** — drag & drop or browse for PDF, DOCX, or TXT
- **ATS Keyword Scoring** — `score = (matched / total) * 100`
- **Hidden Text Detection** — strips white-on-white text, invisible rendering mode (PDF `3 Tr`), `w:vanish` flags, and keyword-stuffed lines so cheaters cannot inflate their score
- **Keyword Dashboard** — matched keywords (green), missing keywords (red), and numbered improvement suggestions
- **Persistent History** — every analysis is saved to PostgreSQL via Prisma

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the database

Create a free PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com), then update `.env`:

```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

### 3. Apply the database schema

```bash
npx prisma migrate dev --name init
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

