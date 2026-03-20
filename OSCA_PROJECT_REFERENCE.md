# OSCA / Sentinel — AI-Powered Oracle SQL Generator
## Master Project Reference Document
### Generated: 2026-03-17 | All prompts, files created, and their purpose

---

## PROJECT OVERVIEW

**Full Name:** OSCA (Oracle Static Code Analyzer) / Sentinel  
**Goal:** An AI-powered tool that accepts natural language business requirements and generates correct,
ready-to-paste SQL for Oracle Cloud Fusion BIP (Business Intelligence Publisher) Data Models.  
**Stack:** Next.js 14 (Frontend, Port 3001) + Node.js / Express (Backend API, Port 3000) + MySQL (osca_metadata DB) + Google Gemini AI

---

---

## PART 1 — USER PROMPTS (IN ORDER) & WHAT WAS BUILT

---

### PROMPT 1 — Backend Initialization (Phase 3)

**Prompt Summary:**
> "We are now officially starting Phase 3: Backend Node.js Development for OSCA / Sentinel.
> Create the backend API layer using Node.js + Express.js.
> Port: 3000. CORS enabled for http://localhost:3001.
> Install: express, cors, dotenv, @google/generative-ai.
> Create .env with GEMINI_API_KEY.
> Create mock endpoints: GET /api/dashboard/stats, GET /api/metadata/tables, POST /api/generate-sql."

**Files Created / Modified:**

| File | Purpose |
|------|---------|
| `server/index.js` | Main Express backend server. Configures middleware, CORS, routes, and starts on port 3000. |
| `server/.env` | Stores the Gemini API key securely using dotenv. |
| `server/package.json` | Node.js manifest for the backend — lists dependencies (express, cors, dotenv, @google/generative-ai). |

---

### PROMPT 2 — Frontend–Backend Integration

**Prompt Summary:**
> "Update the Next.js frontend components to consume the new Express backend.
> Create a central API utility file (lib/api.ts) with Base URL http://localhost:3000.
> Dashboard: fetch KPI data from GET /api/dashboard/stats on mount.
> Knowledge Base: fetch module tree from GET /api/metadata/tables.
> Query Generator: wire up Generate button to POST /api/generate-sql.
> Implement loading states."

**Files Created / Modified:**

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Central API utility. All fetch calls to the backend go through this file. Exports: `fetchDashboardStats`, `fetchMetadataTables`, `generateSql`. |
| `src/app/page.tsx` | **Main Sentinel Dashboard.** Displays KPI cards (Total Queries, API Calls, Avg Confidence). Fetches live data from backend on mount. |
| `src/app/studio/page.tsx` | **Query Generator Studio.** Has a Requirement text area, Generate button, SQL code viewer, and confidence score display. Calls POST /api/generate-sql. |
| `src/app/knowledge/page.tsx` | **Metadata Knowledge Base.** Displays the Oracle table/module tree fetched from GET /api/metadata/tables. |

---

### PROMPT 3 — Example Query Test

**Prompt Summary (Example Input):**
> "Requirement: provide the list of employees along with their managers where manager is in Inactive status.
> Layout: MANAGER_EMP_NUMBER, MANAGER_NAME, EMPLOYEE_NUMBER, EMPLOYEE_NAME, Manager_Status, Manager_End_Date"

**What happened:**
This was a live test of the AI system. The Gemini model generated Oracle SQL based on the requirement.
No new files were created — this validated the end-to-end flow.

---

### PROMPT 4 — Real Database Integration (Phase 4)

**Prompt Summary:**
> "Fix the dashboard so it stops showing dummy data. Use real MySQL DB.
> DB name: osca_metadata. Install mysql2.
> Create table: query_history (id, original_requirement, generated_sql, Fix Non-Functional UI: Wire up the existing "Request Optimization" button.

The "Request Optimization" button already exists in the SQL generator UI, but it is currently non-functional (no onClick handler or backend connection). Please make it fully operational with the following steps:

# 1. Frontend Wiring (Next.js)
- Locate the existing "Request Optimization" button in the active component.
- Add an `onClick` handler to toggle a new boolean state (e.g., `isOptimizeModalOpen`).
- Create a Modal/Dialog component that renders when this state is true.
- Inside the Modal:
  - Add a `<textarea>` for user instructions (e.g., "remove the subquery", "use a different table").
  - Add a "Submit" button and a "Cancel" button.
- On Submit, capture the text area input and the `currentSql` from the editor, show a loading state, and send a `POST` request to `/api/optimize-sql`.

# 2. Backend Creation (Node.js)
- Create the missing API route: `POST /api/optimize-sql`
- Accept a JSON body: `{ originalSql, userInstructions }`.
- Construct the Gemini API call with this logic:
  - Role: You are an expert Oracle Cloud Fusion Performance Tuning Architect.
  - Condition 1: If `userInstructions` has text, apply those specific changes to the `originalSql`.
  - Condition 2: If `userInstructions` is empty, automatically review the `originalSql` for performance bottlenecks and optimize it based on standard enterprise best practices.
  - Output: Return `{ optimizedSql, explanation }`.

# 3. State Update
- When the frontend receives the response, automatically replace the SQL in the code editor with the `optimizedSql`.
- Display the `explanation` in a toast notification or a small text block, and close the modal.confidence_score, created_at).
> Every time Gemini generates a query → INSERT into query_history.
> Update GET /api/dashboard/stats to run real COUNT() and AVG() queries."

**Files Modified:**

| File | Change Made |
|------|------------|
| `server/index.js` | Added MySQL connection pool. Updated `/api/dashboard/stats` to run real SQL queries against `query_history`. Modified `/api/generate-sql` to INSERT each generated query into the DB. |

---

### PROMPT 5 — MySQL Root Password Fix

**Prompt Summary:**
> "Added SQL root password"

**What happened:**
The MySQL connection string in `server/index.js` was updated to include the user's root password. No new files created.

---

### PROMPT 6 — Oracle Fusion Schema Enforcement

**Prompt Summary:**
> "The AI is generating generic SQL tables like 'EMPLOYEES' instead of real Oracle tables.
> Update systemInstruction for Gemini to:
> - Target Oracle Fusion HCM, SCM, ERP schemas.
> - NEVER use generic tables like EMPLOYEES or USERS.
> - Always map to correct Oracle tables: PER_ALL_PEOPLE_F, PER_ALL_ASSIGNMENTS_M, PO_HEADERS_ALL.
> - Reference docs from Oracle Help Center."

**Files Modified:**

| File | Change Made |
|------|------------|
| `server/index.js` | Updated Gemini system instructions in `/api/generate-sql` to enforce Oracle Fusion-specific table naming rules. |

---

### PROMPT 7 — Document Intake Portal (PDF / Word Upload)

**Prompt Summary:**
> "Add Document Parsing feature.
> Backend: Install multer, pdf-parse, mammoth.
> Create POST /api/upload-requirement route.
> Accept PDF or Word → extract text → pass to Gemini → return { sql, explanation, confidenceScore, extractedText }.
> Frontend: Create Intake Portal page with drag-and-drop upload zone.
> Show parsing progress bars and link to Query Studio."

**Files Created / Modified:**

| File | Purpose |
|------|---------|
| `server/index.js` | Added `multer` upload middleware, `pdf-parse` PDF handler, `mammoth` Word handler. New route: POST /api/upload-requirement. |
| `src/app/intake/page.tsx` | **Intake Portal page.** Drag-and-drop file upload zone accepting PDF, Word, and TXT. Shows two progress bars (Document Parsing, AI Analysis). Stores results to localStorage and redirects to Studio. |

---

### PROMPT 8 — BI Publisher Column Alias Rules

**Prompt Summary:**
> "Add strict rules for Oracle BI Publisher column alias naming.
> NEVER use sample data values as aliases.
> Aliases must be UPPERCASE with only A-Z, 0-9, underscores.
> NEVER use double quotes.
> PROHIBITED: spaces, ~, !, #, $, %, ^, &, *, +, |, :, \", <, >, ?, , / ."

**Files Modified:**

| File | Change Made |
|------|------------|
| `server/index.js` | Added BIP aliasing rules to both `/api/generate-sql` and `/api/upload-requirement` system prompts. |

---

### PROMPT 9 — Full Structural BIP / OBIS Rules (First Pass)

**Prompt Summary (Key points):**
> - Platform Identity: ALWAYS Oracle Cloud Fusion. Never EBS or R12.
> - Banned prefixes: OE_, MTL_, HR_, JTF_, RA_, CST_, WMS_, WSH_
> - Allowed schemas: DOO, EGP, FUN, HZ, INV, RCV, PO, AP, AR, GL, FA
> - Mandatory two-layer inline subquery structure (OBIS compatibility).
> - No WITH / CTE syntax.
> - Bind params only in outermost WHERE.
> - CAST before TRUNC on TIMESTAMP columns.
> - JSON response must include: mainSql, buLookupQuery, statusLookupQuery, parameters, testSequence, tableVerificationReport, columnVerificationReport, databaseSelection, sqlType."

**Files Modified:**

| File | Change Made |
|------|------------|
| `server/index.js` | Completely overhauled both prompt templates with BIP/OBIS structural rules, banned table list, two-layer query structure, and expanded JSON output schema. |

---

### PROMPT 10 — OSCA Master System Prompt (Final / Production Grade)

**Prompt Summary (10 detailed rules):**
> RULE 1: Platform Identity — Never EBS/R12. Banned tables listed with correct Cloud Fusion replacements.
> RULE 2: Mandatory Runtime Table Verification via docs.oracle.com with specific URL patterns.
> RULE 3: Known wrong-vs-correct column corrections (DHA.CURRENCY_CODE, DLA.NET_PRICE, etc.).
> RULE 4: _B / _TL sibling table rule — always JOIN _TL for DESCRIPTION, LANGUAGE = USERENV('LANG').
> RULE 5: Mandatory two-layer inline subquery structure.
> RULE 6: OBIS Hard Restrictions (R6.1–R6.8).
> RULE 7: Verified Cloud Fusion Table Registry (DOO_, EGP_, FUN_, HZ_, RCV_, FND_ schemas).
> RULE 8: Mandatory 5-Section response format.
> RULE 9: Validation checklist (V1–V12).
> RULE 10: What to do when unsure — never guess, always mark UNVERIFIED.

**Files Modified:**

| File | Change Made |
|------|------------|
| `server/index.js` | Replaced both prompt templates with the full 10-Rule OSCA Master System Prompt. Added `## END OF SYSTEM PROMPT` delimiter. Fixed syntax fragment error that occurred during replacement. |
| `src/app/studio/page.tsx` | Upgraded the Studio UI with 3 new tabs: SQL Output, Verification Reports, BIP Parameters. Displays tableVerificationReport, columnVerificationReport, companion lookup queries, test sequence, DB selection badge, and SQL type badge. |
| `src/app/intake/page.tsx` | Updated `processFile` to pass full AI response to localStorage (including all new verification fields) so Studio can display them when navigating from Intake. |

---

---

## PART 2 — COMPLETE FILE REGISTRY

Below is every project file and its purpose.

### BACKEND (`/server`)

| File | Purpose |
|------|---------|
| `server/index.js` | **MAIN BACKEND.** Express server on port 3000. Contains all API routes, Gemini AI integration, MySQL connection pool, file upload handling, and the OSCA Master System Prompt. |
| `server/.env` | **SECRET STORE.** Holds GEMINI_API_KEY. Never committed to source control. |
| `server/package.json` | Backend dependency manifest. Key deps: express, cors, dotenv, @google/generative-ai, mysql2, multer, pdf-parse, mammoth. |
| `server/server.log` | Runtime stdout log of the backend server process. |
| `server/testFetch.js` | Scratch test script used during development to test Gemini API connectivity. |
| `server/testModels.js` | Scratch test script used to validate available Gemini model names. |

### FRONTEND (`/src`)

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | **ROOT LAYOUT.** Renders the TopNavbar and SidebarNavigation shell around all pages. Sets the dark background theme. |
| `src/app/page.tsx` | **MAIN DASHBOARD (Sentinel HQ).** Shows live KPI cards: Total Queries Generated, API Calls Made, Average Confidence Score. Data fetched from `/api/dashboard/stats`. |
| `src/app/studio/page.tsx` | **QUERY GENERATOR STUDIO.** The core generation UI. Has 3 tabs: (1) SQL Output with syntax highlighting, (2) Verification Reports showing table and column verification, (3) BIP Parameters table. Companion lookup queries and test sequence shown in sidebar. |
| `src/app/intake/page.tsx` | **INTAKE PORTAL.** Drag-and-drop document upload (PDF, Word, TXT). Extracts requirement text, calls `/api/upload-requirement`, and hands off the full AI response to Query Studio via localStorage. |
| `src/app/knowledge/page.tsx` | **METADATA KNOWLEDGE BASE.** Displays the Oracle Cloud module-to-table registry. Fetched from `/api/metadata/tables`. Allows browsing of known Oracle Fusion table structures. |
| `src/components/layout/TopNavbar.tsx` | Top navigation bar. Displays the Trinamix logo, app title "Sentinel AI", and user profile area. |
| `src/components/layout/SidebarNavigation.tsx` | Left sidebar with navigation links: Dashboard, Query Studio, Intake Portal, Knowledge Base. Uses Next.js router for active state highlighting. |
| `src/lib/api.ts` | **CENTRAL API CLIENT.** All backend fetch calls go through here. Exports: `fetchDashboardStats`, `fetchMetadataTables`, `generateSql`. Base URL: http://localhost:3000. |
| `src/app/globals.css` | Global CSS. Dark theme tokens, custom scrollbar styles, utility classes. |

### CONFIG FILES

| File | Purpose |
|------|---------|
| `package.json` | Frontend dependency manifest. Key deps: next, react, lucide-react, recharts, tailwindcss. |
| `tailwind.config.ts` | Tailwind CSS configuration. Sets dark mode and custom colour tokens for the Sentinel design system. |
| `next.config.mjs` | Next.js config. Sets up allowed image domains and other framework options. |
| `tsconfig.json` | TypeScript compiler options. Sets `@/` path alias to `src/`. |

---

---

## PART 3 — API ROUTE REFERENCE

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/stats` | Returns live query metrics from `query_history` MySQL table (total queries, API call count, avg confidence). |
| GET | `/api/metadata/tables` | Returns the Oracle Cloud module-to-table registry tree (static data for the Knowledge Base viewer). |
| POST | `/api/generate-sql` | **Core generation route.** Accepts `{ requirement: string }`. Sends requirement through OSCA 10-Rule System Prompt to Gemini 2.5 Flash. Returns full JSON with sql, explanation, confidenceScore, tableVerificationReport, columnVerificationReport, parameters, buLookupQuery, statusLookupQuery, testSequence, databaseSelection, sqlType. Also INSERTs into MySQL. |
| POST | `/api/upload-requirement` | Accepts a multipart file upload (PDF/Word/TXT). Extracts text using pdf-parse or mammoth. Passes extracted text through the same OSCA prompt. Returns same JSON fields as above plus `extractedText`. |

---

---

## PART 4 — DATABASE SCHEMA

**Database:** `osca_metadata`  
**Table:** `query_history`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT PRIMARY KEY | Unique row ID |
| `original_requirement` | TEXT | The user's natural language requirement |
| `generated_sql` | LONGTEXT | The Oracle BIP SQL generated by Gemini |
| `confidence_score` | INT | AI confidence score (1–100) |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | When the query was generated |

---

---

## PART 5 — THE OSCA MASTER SYSTEM PROMPT (SUMMARY OF 10 RULES)

These rules are embedded inside `server/index.js` and sent to Gemini on every generation request.

| Rule | Title | What It Does |
|------|-------|-------------|
| RULE 1 | Platform Identity | Bans all EBS/R12 tables. Maps them to Oracle Cloud Fusion equivalents (e.g., OE_ORDER_HEADERS_ALL → DOO_HEADERS_ALL). |
| RULE 2 | Mandatory Runtime Table Verification | Forces AI to fact-check every table at docs.oracle.com before using it. Marks unverified tables with a SQL comment. |
| RULE 3 | Known Wrong vs Correct Columns | A correction table of real production errors (e.g., DHA.CURRENCY_CODE → DHA.TRANSACTIONAL_CURRENCY_CODE). |
| RULE 4 | _B / _TL Sibling Table Rule | Enforces joining the _TL translation table for any descriptive text. Never pull DESCRIPTION from an _B table. |
| RULE 5 | Mandatory Query Structure | Enforces the two-layer inline subquery pattern for OBIS compatibility. |
| RULE 6 | OBIS Hard Restrictions | 8 specific bans: No CTEs, bind vars in inner queries, TRUNC on raw timestamps, SELECT *, computed alias filtering at own level, etc. |
| RULE 7 | Verified Table Registry | A curated whitelist of Oracle Cloud Fusion 25D tables across DOO, EGP, FUN, HZ, RCV, FND schemas. |
| RULE 8 | Mandatory Response Format | Forces 5 output sections: Table Verification Report, Column Verification, Main SQL, Parameter Definitions, Companion Lookup Queries. |
| RULE 9 | Validation Checklist (V1–V12) | Self-review checklist the AI runs before returning output. If any check fails, it must fix before responding. |
| RULE 10 | What To Do When Unsure | If table/column unknown: fetch docs.oracle.com, if not found → mark UNVERIFIED, add companion query so user can verify in their instance. |

---

*This document was auto-generated from all conversation sessions for the AI-Powered Oracle SQL Generator / OSCA project.*  
*Last Updated: 2026-03-17*
