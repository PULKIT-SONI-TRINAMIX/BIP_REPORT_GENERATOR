const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Set up Multer for Memory Storage
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let pool;
async function initDB() {
  try {
    const db = await open({
      filename: './osca_metadata.db',
      driver: sqlite3.Database
    });

    pool = {
      query: async (sql, params) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
           const rows = await db.all(sql, params);
           return [rows, []];
        } else {
           const result = await db.run(sql, params);
           return [{insertId: result.lastID, affectedRows: result.changes}, []];
        }
      },
      exec: (sql) => db.exec(sql),
      end: () => db.close()
    };

    await pool.exec(`
      CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_requirement TEXT,
        generated_sql TEXT,
        confidence_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.exec(`
      CREATE TABLE IF NOT EXISTS oracle_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_tag TEXT,
        table_name TEXT UNIQUE,
        description TEXT
      )
    `);

    await pool.exec(`
      CREATE TABLE IF NOT EXISTS oracle_columns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT,
        column_name TEXT,
        data_type TEXT,
        description TEXT,
        UNIQUE (table_name, column_name)
      )
    `);

    console.log("SQLite initialized and osca_metadata.db connected.");
  } catch (err) {
    console.error("Database Connection failed. Assuming mock mode until SQLite is running.", err.message);
  }
}
initDB();

// Root route
app.get('/', (req, res) => {
  res.send('OSCA / Sentinel Backend API Running');
});

// Mock Endpoints (For UI Integration)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    let totalQueries = 0;
    let avgConfidence = 0;

    if (pool) {
      const [countRows] = await pool.query('SELECT COUNT(*) as total FROM query_history');
      totalQueries = countRows[0].total;

      const [avgRows] = await pool.query('SELECT AVG(confidence_score) as avgConf FROM query_history');
      avgConfidence = avgRows[0].avgConf ? Math.round(avgRows[0].avgConf) : 0;
    }

    res.json({
      totalQueries: totalQueries,
      requirementsAnalyzed: 643 + totalQueries, // Mock baseline
      documentsProcessed: 732, // Mock baseline
      apiCalls: 2447 + (totalQueries * 2), // Mock baseline
      avgConfidence: avgConfidence,
      status: pool ? 'Running' : 'DB Error'
    });
  } catch (error) {
    console.error("Stats error", error);
    res.json({
      totalQueries: 0,
      requirementsAnalyzed: 0,
      documentsProcessed: 0,
      apiCalls: 0,
      avgConfidence: 0,
      status: 'Error'
    });
  }
});

app.get('/api/metadata/tables', (req, res) => {
  res.json([
    { module: 'ERP', tables: ['PER_JOBS', 'PER_ALL_PEOPLE_F'] },
    { module: 'HCM', tables: ['PER_ABSENCES', 'PER_SALARY_PROPOSALS'] },
    { module: 'SCM', tables: ['PO_HEADERS_ALL', 'INV_ITEMS'] }
  ]);
});

// ── GET /api/metadata/search?q=keyword ─────────────────────────────────────
// Live search across oracle_tables — returns top 50 matching rows
app.get('/api/metadata/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);

  if (!pool) {
    return res.status(503).json({ error: 'Database not available.' });
  }

  try {
    const keyword = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT module_tag, table_name, description
       FROM oracle_tables
       WHERE table_name LIKE ? OR description LIKE ?
       ORDER BY
         CASE WHEN table_name LIKE ? THEN 0 ELSE 1 END,
         table_name
       LIMIT 50`,
      [keyword, keyword, `${q}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('[metadata/search] DB error:', err.message);
    res.status(500).json({ error: 'Search query failed.' });
  }
});

// ── GET /api/metadata/columns/:tableName ──────────────────────────────────
// Returns all columns for a given table from oracle_columns
app.get('/api/metadata/columns/:tableName', async (req, res) => {
  const { tableName } = req.params;

  if (!pool) {
    return res.status(503).json({ error: 'Database not available.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT column_name, data_type, description
       FROM oracle_columns
       WHERE table_name = ?
       ORDER BY column_name`,
      [tableName.toUpperCase()]
    );
    res.json(rows);
  } catch (err) {
    console.error('[metadata/columns] DB error:', err.message);
    res.status(500).json({ error: 'Column fetch failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  OSCA CONSTANTS  —  source-of-truth for the guardrail + prompt
// ─────────────────────────────────────────────────────────────────────────────
const BANNED_PREFIXES = ['OE_', 'MTL_', 'HR_', 'JTF_', 'RA_', 'WSH_', 'CST_', 'WMS_'];

// Module inference triggers — maps keywords in requirement to module_tag in local DB
const MODULE_TRIGGERS = {
  HCM: ['employee', 'manager', 'job', 'person', 'department', 'salary', 'assignment',
        'grade', 'position', 'worker', 'hire', 'absence', 'payroll', 'compensation',
        'headcount', 'workforce', 'people', 'staff', 'names', 'supervisor', 'benefit',
        'termination', 'rehire', 'performance', 'talent', 'workforce'],
  SCM: ['order', 'rma', 'item', 'inventory', 'shipment', 'receipt', 'warehouse',
        'fulfill', 'demand', 'supply', 'product', 'sku', 'delivery', 'ship',
        'transfer', 'organization', 'category', 'bom', 'work order'],
  FIN: ['invoice', 'payment', 'ledger', 'payable', 'receivable', 'journal',
        'accounting', 'finance', 'voucher', 'expense', 'budget', 'check',
        'disbursement', 'liability', 'asset', 'period', 'subledger', 'gl',
        'accounts payable', 'accounts receivable', 'general ledger'],
  TCA: ['customer', 'party', 'account', 'contact', 'relationship', 'address',
        'phone', 'email', 'site', 'location', 'cust', 'hz_', 'trading community'],
  FND: ['lookup', 'user', 'profile', 'flex', 'currency', 'language', 'application',
        'value set', 'message', 'lookup value', 'fnd', 'menu', 'responsibility'],
  PRC: ['purchase order', 'requisition', 'procurement', 'sourcing', 'negotiation',
        'blanket', 'contract', 'vendor', 'supplier', 'rfq', 'quote', 'bid',
        'approved supplier', 'purchase', 'po line', 'po header'],
};

const CLOUD_TABLE_REGISTRY = {
  ORDER_MGMT:   ['DOO_HEADERS_ALL', 'DOO_LINES_ALL', 'DOO_FULFILL_LINES_ALL', 'DOO_LINE_SETS_ALL'],
  ITEM_MASTER:  ['EGP_SYSTEM_ITEMS_B', 'EGP_SYSTEM_ITEMS_TL', 'EGP_ITEM_CATEGORIES_B', 'EGP_ITEM_CATEGORIES_TL'],
  BUSINESS_UNIT:['FUN_ALL_BUSINESS_UNITS_V', 'FUN_BUSINESS_UNIT_USAGES_VL'],
  CUSTOMER:     ['HZ_CUST_ACCOUNTS', 'HZ_PARTIES', 'HZ_PARTY_SITES', 'HZ_LOCATIONS', 'HZ_RELATIONSHIPS', 'HZ_CONTACT_POINTS', 'HZ_CUST_SITE_USES_ALL'],
  RECEIVING:    ['RCV_SHIPMENT_HEADERS', 'RCV_SHIPMENT_LINES', 'RCV_TRANSACTIONS', 'RCV_SERIAL_NUMBERS'],
  PURCHASING:   ['PO_HEADERS_ALL', 'PO_LINES_ALL', 'PO_LINE_LOCATIONS_ALL', 'PO_DISTRIBUTIONS_ALL'],
  INVENTORY:    ['INV_ORGANIZATION_DEFINITIONS_V', 'INV_ORG_INFO', 'INV_ITEM_REVISIONS_B'],
  PAYABLES:     ['AP_INVOICES_ALL', 'AP_INVOICE_LINES_ALL', 'AP_INVOICE_DISTRIBUTIONS_ALL', 'AP_SUPPLIERS', 'AP_SUPPLIER_SITES_ALL'],
  RECEIVABLES:  ['AR_CUSTOMERS', 'AR_PAYMENT_SCHEDULES_ALL', 'AR_RECEIVABLE_APPLICATIONS_ALL'],
  GL:           ['GL_JE_HEADERS', 'GL_JE_LINES', 'GL_CODE_COMBINATIONS', 'GL_LEDGERS'],
  HCM:          ['PER_ALL_PEOPLE_F', 'PER_ALL_ASSIGNMENTS_M', 'PER_JOBS_F', 'PER_GRADES_F', 'HR_ALL_ORGANIZATION_UNITS', 'PER_ALL_POSITIONS_F'],
  LOOKUP:       ['FND_LOOKUP_VALUES_VL'],
};

const KNOWN_COLUMN_CORRECTIONS = `
  DHA.CURRENCY_CODE              → DHA.TRANSACTIONAL_CURRENCY_CODE
  DHA.SOLD_TO_CUST_ACCOUNT_ID   → DHA.SOLD_TO_CUSTOMER_ID
  DHA.SOURCE_TYPE_CODE           → DHA.SOURCE_DOCUMENT_TYPE_CODE
  DHA.ORDER_DESCRIPTION          → DHA.COMMENTS
  DHA.ORDER_CATEGORY_CODE        → DHA.ORDER_TYPE_CODE
  DLA.NET_PRICE                  → DLA.UNIT_SELLING_PRICE
  DLA.ORDERED_QUANTITY           → DLA.ORDERED_QTY
  DLA.UOM_CODE                   → DLA.ORDERED_UOM
  DLA.FULFILLMENT_LINE_STATUS_CODE → use DFLA.STATUS_CODE via DOO_FULFILL_LINES_ALL
  ESIB.DESCRIPTION               → ESIT.DESCRIPTION from EGP_SYSTEM_ITEMS_TL (join: INVENTORY_ITEM_ID, ORGANIZATION_ID, LANGUAGE = USERENV('LANG'))
  DSO.* / DSOL.*                 → These views do NOT exist. Use DHA.* / DLA.*
  DHA.BOOKED_DATE                → DHA.ORDERED_DATE  (BOOKED_DATE does not exist in DOO_HEADERS_ALL)
  DHA.CUSTOMER_NAME              → join HZ_PARTIES via HZ_CUST_ACCOUNTS on SOLD_TO_CUSTOMER_ID for party name
  DHA.BILL_TO_SITE_USE_ID        → use DFLA.BILL_TO_SITE_USE_ID from DOO_FULFILL_LINES_ALL
  DHA.SHIP_TO_SITE_USE_ID        → use DFLA.SHIP_TO_SITE_USE_ID from DOO_FULFILL_LINES_ALL
  AR_REVENUE_ASSIGNMENTS_V       → use DOO_HEADERS_ALL + DOO_LINES_ALL for order revenue (NOT AR tables)
  AR_BILL_REVENUE_RECONCILIATION → use DOO_HEADERS_ALL for order header info (NOT AR tables)
  AIA.INVOICE_TYPE_CODE          → AIA.INVOICE_TYPE_LOOKUP_CODE  (NEVER use INVOICE_TYPE_CODE — it does not exist)
  AIDA.DIST_LINE_NUM             → AIDA.DISTRIBUTION_LINE_NUMBER  (NEVER abbreviate this column)
  AIDA.LINE_NUMBER               → AIDA.DISTRIBUTION_LINE_NUMBER
  PAPF.FULL_NAME                 → PPNF.FULL_NAME from PER_PERSON_NAMES_F  (PER_ALL_PEOPLE_F has NO FULL_NAME)
  PAPF.FIRST_NAME                → PPNF.FIRST_NAME from PER_PERSON_NAMES_F  (PER_ALL_PEOPLE_F has NO FIRST_NAME)
  PAPF.LAST_NAME                 → PPNF.LAST_NAME from PER_PERSON_NAMES_F  (PER_ALL_PEOPLE_F has NO LAST_NAME)
  PAA.MANAGER_ID                 → PASF.MANAGER_ID from PER_ASSIGNMENT_SUPERVISORS_F  (PER_ALL_ASSIGNMENTS_M has NO MANAGER_ID)
  PJF.NAME                       → PJFT.NAME from PER_JOBS_F_TL  (PER_JOBS_F has NO NAME column)
  CANCELLED_FLAG                 → CANCELED_FLAG  (Oracle Cloud uses single-L spelling — CANCELED_FLAG)
  CANCELLED_QTY                  → CANCELED_QTY   (Oracle Cloud uses single-L spelling — CANCELED_QTY)
`;

/**
 * Deterministic post-generation SQL column name corrections.
 * These fix AI hallucinations that persist despite prompt instructions.
 * Each entry: [wrongPattern (regex), correctReplacement]
 */
const SQL_COLUMN_FIXUPS = [
  // AP Invoices — type code
  [/\bINVOICE_TYPE_CODE\b/g,           'INVOICE_TYPE_LOOKUP_CODE'],
  // AP Invoice Distributions — line number abbreviations
  [/\bDIST_LINE_NUM\b/g,               'DISTRIBUTION_LINE_NUMBER'],
  [/\b(?<!\w)LINE_NUM\b(?!\w)/g,       'DISTRIBUTION_LINE_NUMBER'],
  // DOO Order headers — known column renames
  [/\bCURRENCY_CODE\b(?=.*DOO_)/g,     'TRANSACTIONAL_CURRENCY_CODE'],
  [/\bORDERED_QUANTITY\b/g,            'ORDERED_QTY'],
  [/\bUOM_CODE\b/g,                    'ORDERED_UOM'],
  // DOO_HEADERS_ALL — BOOKED_DATE does not exist
  [/\bBOOKED_DATE\b/g,                 'ORDERED_DATE'],
  // DOO tables — CANCELLED_FLAG (double-L) does not exist, correct spelling is CANCELED_FLAG
  [/\bCANCELLED_FLAG\b/g,              'CANCELED_FLAG'],
  [/\bCANCELLED_QTY\b/g,              'CANCELED_QTY'],
  [/\bCANCELLED_REASON\b/g,           'CANCEL_REASON_CODE'],
];

/**
 * Applies all SQL_COLUMN_FIXUPS to a SQL string and returns the corrected SQL.
 * Also logs each substitution made.
 */
function sanitizeSql(sql) {
  if (!sql) return sql;
  let fixed = sql;
  for (const [pattern, replacement] of SQL_COLUMN_FIXUPS) {
    const before = fixed;
    fixed = fixed.replace(pattern, replacement);
    if (fixed !== before) {
      console.warn(`[SQL-Sanitizer] Auto-corrected: ${pattern} → ${replacement}`);
    }
  }
  return fixed;
}

/**
 * Detects HCM-specific Golden Join Rule violations in generated SQL.
 * These are patterns the AI repeatedly ignores via prompt alone.
 * Returns a correction message string, or null if clean.
 */
function detectHCMViolations(sql) {
  if (!sql) return null;
  const upper = sql.toUpperCase();

  // Rule 1: FULL_NAME used but PER_PERSON_NAMES_F not joined
  if (upper.includes('FULL_NAME') && !upper.includes('PER_PERSON_NAMES_F')) {
    return 'VIOLATION of Golden Join Rule #1: FULL_NAME was used but PER_PERSON_NAMES_F is NOT joined. ' +
           'PER_ALL_PEOPLE_F has NO FULL_NAME column — it does not exist there. ' +
           'You MUST join PER_PERSON_NAMES_F on PERSON_ID with NAME_TYPE = \'GLOBAL\' and select FULL_NAME from that table.';
  }

  // Rule 3: MANAGER_ID used on PER_ALL_ASSIGNMENTS_M but PER_ASSIGNMENT_SUPERVISORS_F not joined
  if (upper.includes('MANAGER_ID') && upper.includes('PER_ALL_ASSIGNMENTS_M') && !upper.includes('PER_ASSIGNMENT_SUPERVISORS_F')) {
    return 'VIOLATION of Golden Join Rule #3: MANAGER_ID was referenced but PER_ASSIGNMENT_SUPERVISORS_F is NOT joined. ' +
           'PER_ALL_ASSIGNMENTS_M has NO MANAGER_ID column — it does not exist there. ' +
           'You MUST join PER_ASSIGNMENT_SUPERVISORS_F on ASSIGNMENT_ID to obtain MANAGER_ID.';
  }

  // Rule 2: PER_JOBS_F used with .NAME but PER_JOBS_F_TL not joined
  if (upper.includes('PER_JOBS_F') && !upper.includes('PER_JOBS_F_TL') && /\bPJF\s*\.\s*NAME\b|\bPJ\s*\.\s*NAME\b/.test(upper)) {
    return 'VIOLATION of Golden Join Rule #2: .NAME was selected from PER_JOBS_F but that table has NO NAME column. ' +
           'You MUST join PER_JOBS_F_TL on JOB_ID with LANGUAGE = USERENV(\'LANG\') and select NAME from that TL table.';
  }

  return null;
}

/**
 * Cross-checks AI-generated tableVerificationReport and columnVerificationReport
 * against the actual local oracle_tables / oracle_columns DB.
 * Returns corrected reports with real VERIFIED/UNVERIFIED and YES/NO statuses.
 */
async function verifyReportsAgainstDB(tableReport, columnReport) {
  if (!pool) return { tableReport: tableReport || [], columnReport: columnReport || [] };

  const verifiedTableReport = await Promise.all(
    (tableReport || []).map(async (t) => {
      try {
        const [rows] = await pool.query(
          'SELECT 1 FROM oracle_tables WHERE table_name = ? LIMIT 1', [t.tableName]
        );
        return { ...t, status: rows.length > 0 ? 'VERIFIED' : 'UNVERIFIED' };
      } catch { return { ...t, status: 'UNVERIFIED' }; }
    })
  );

  const verifiedColumnReport = await Promise.all(
    (columnReport || []).map(async (c) => {
      if (!c.table || !c.columnUsed) return { ...c, verifiedOnPage: 'NO' };
      try {
        const [rows] = await pool.query(
          'SELECT 1 FROM oracle_columns WHERE table_name = ? AND column_name = ? LIMIT 1',
          [c.table.toUpperCase(), c.columnUsed.toUpperCase()]
        );
        return { ...c, verifiedOnPage: rows.length > 0 ? 'YES' : 'NO' };
      } catch { return { ...c, verifiedOnPage: 'NO' }; }
    })
  );

  const unverifiedTables   = verifiedTableReport.filter(t => t.status === 'UNVERIFIED').map(t => t.tableName);
  const unverifiedColumns  = verifiedColumnReport.filter(c => c.verifiedOnPage === 'NO').map(c => `${c.table}.${c.columnUsed}`);
  if (unverifiedTables.length)  console.warn('[DB-Verify] Unverified tables:', unverifiedTables);
  if (unverifiedColumns.length) console.warn('[DB-Verify] Unverified columns:', unverifiedColumns);

  return { tableReport: verifiedTableReport, columnReport: verifiedColumnReport };
}

/**
 * Scans a SQL string and returns the first banned EBS prefix found, or null.
 */
function detectBannedTable(sql) {
  if (!sql) return null;
  const upperSql = sql.toUpperCase();
  for (const prefix of BANNED_PREFIXES) {
    // Match prefix at word boundary (preceded by space, comma, (, or newline)
    const regex = new RegExp(`(\\s|,|\\()${prefix}`, 'i');
    if (regex.test(upperSql)) return prefix;
  }
  return null;
}

/**
 * Scans a SQL string for table names NOT present in the local oracle_tables DB.
 * Returns the first hallucinated table name found, or null.
 * Queries the real DB so context-window size doesn't limit the allowed set.
 */
async function detectHallucinatedTable(sql) {
  if (!sql || !pool) return null;

  // Extract table names from FROM and JOIN clauses
  const tablePattern = /(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_]*)/gi;
  const upperSql = sql.toUpperCase();
  const usedTables = [];
  let match;
  while ((match = tablePattern.exec(upperSql)) !== null) {
    usedTables.push(match[1]);
  }
  if (usedTables.length === 0) return null;

  try {
    const placeholders = usedTables.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT table_name FROM oracle_tables WHERE table_name IN (${placeholders})`,
      usedTables
    );
    const existsInDB = new Set(rows.map(r => r.table_name.toUpperCase()));
    for (const t of usedTables) {
      if (!existsInDB.has(t)) return t; // first table not found in DB
    }
  } catch (e) {
    console.warn('[Hallucination-Check] DB query failed:', e.message);
  }
  return null;
}

/**
 * Builds the master OSCA system prompt.
 * @param {string} requirementText    - the user's natural language requirement
 * @param {string|null} repromptError - if set, prepend a correction directive
 * @param {string|null} localSchemaContext - JSON string of tables/columns from local DB
 */
function buildOscaPrompt(requirementText, repromptError = null, localSchemaContext = null) {
  const registryFlat = Object.entries(CLOUD_TABLE_REGISTRY)
    .map(([mod, tables]) => `  ${mod}: ${tables.join(', ')}`)
    .join('\n');

  const correctionDirective = repromptError
    ? `⛔ CORRECTION REQUIRED — YOUR PREVIOUS OUTPUT WAS REJECTED ⛔
       Reason: ${repromptError}
       You MUST rewrite the SQL from scratch using ONLY the approved Cloud Fusion tables listed below.
       ─────────────────────────────────────────────────────────────\n\n`
    : '';

  return `${correctionDirective}You are AI Powered Oracle SQL Generator, an Elite Oracle Cloud Fusion BIP SQL Architect.
Your ONLY job: produce a single, validated, ready-to-paste SQL for Oracle Cloud BIP Data Models.
Every rule below is non-negotiable. Violating any rule means the output is WRONG.

══════════════════════════════════════════════════════════════
PHASE 1 — PRE-GENERATION CHECKLIST (mandatory mental step)
══════════════════════════════════════════════════════════════
Before writing a single line of SQL, verify:
  1. Which Oracle Cloud module does this requirement touch? (HCM / FIN / SCM / TCA / FND / PRC)
  2. ${localSchemaContext
      ? 'Find EVERY table you need in the Local Schema Context JSON below. If a table is not there — DO NOT USE IT.'
      : 'What is the correct Cloud Fusion table for each entity? (See registry in Phase 2)'}
  3. For EVERY column you plan to use: confirm it exists in the "columns" array of that table in the schema.
  4. If a column is not listed → use the closest valid alternative or flag UNVERIFIED.
  5. Apply all Golden Join Rules (person names, TL tables, manager chain, date effectivity).

══════════════════════════════════════════════════════════════
PHASE 2 — ABSOLUTE PLATFORM RULES (NEVER VIOLATE)
══════════════════════════════════════════════════════════════
PLATFORM: Oracle Cloud Fusion (SaaS, 25D). NEVER EBS. NEVER R12.

BANNED TABLE PREFIXES — auto-rejected immediately:
  OE_   MTL_   HR_   JTF_   RA_   WSH_   CST_   WMS_

${localSchemaContext
  ? `⛔ LOCAL DATABASE MODE ACTIVE ⛔
  A verified local metadata database is attached below.
  The table registry is DISABLED. You must use ONLY the tables listed in the Local Schema Context.
  Do NOT use any table from memory, training data, or the registry — only from the attached JSON.`
  : `EBS → CLOUD REPLACEMENT MAP:
  OE_ORDER_HEADERS_ALL      → DOO_HEADERS_ALL
  OE_ORDER_LINES_ALL        → DOO_LINES_ALL
  MTL_SYSTEM_ITEMS_B        → EGP_SYSTEM_ITEMS_B  (+  EGP_SYSTEM_ITEMS_TL for text)
  HR_OPERATING_UNITS        → FUN_ALL_BUSINESS_UNITS_V
  RA_CUSTOMERS              → HZ_PARTIES + HZ_CUST_ACCOUNTS
  WSH_DELIVERY_DETAILS      → DOO_FULFILL_LINES_ALL

VERIFIED CLOUD FUSION TABLE REGISTRY (use ONLY these):
${registryFlat}`
}

KNOWN COLUMN CORRECTIONS (always apply, regardless of mode):
${KNOWN_COLUMN_CORRECTIONS}

══════════════════════════════════════════════════════════════
PHASE 3 — MANDATORY SYNTAX RULES
══════════════════════════════════════════════════════════════

SYNTAX RULE: Two-layer inline subquery — ALWAYS:
  SELECT outer_alias.COL_1, outer_alias.COL_2
  FROM (
    SELECT t.COL_1 AS COL_1, t.COL_2 AS COL_2
    FROM   TABLE_1 t
    JOIN   TABLE_2 t2 ON t2.KEY = t.KEY
    WHERE  t.ACTIVE_FLAG = 'Y'               -- hard-coded filters ONLY here
  ) outer_alias
  WHERE  (:P_PARAM IS NULL OR outer_alias.COL_1 = :P_PARAM)  -- bind vars ONLY here
  ORDER BY outer_alias.COL_1;

TL-TABLE RULE: FORBIDDEN to get DESCRIPTION/NAME from _B tables.
  ALWAYS join the _TL sibling: JOIN EGP_SYSTEM_ITEMS_TL ESIT ON ESIT.INVENTORY_ITEM_ID = ESIB.INVENTORY_ITEM_ID AND ESIT.ORGANIZATION_ID = ESIB.ORGANIZATION_ID AND ESIT.LANGUAGE = USERENV('LANG')

TIMESTAMP RULE: MUST use CAST(column AS DATE) before TRUNC() on any TIMESTAMP column:
  CORRECT:   TRUNC(CAST(DHA.CREATION_DATE AS DATE))
  WRONG:     TRUNC(DHA.CREATION_DATE)

DATE PARAMETER RULE: TO_DATE(:P_DATE_PARAM, 'YYYY-MM-DD') — never pass raw string.

NULL-SAFE PARAMETER RULE: (:P_X IS NULL OR outer_alias.COL = :P_X)

ALIAS RULE: Aliases MUST be UPPERCASE, alphanumeric + underscore ONLY. No spaces, no quotes, no special chars.

CTE RULE: NO WITH / CTE SYNTAX. Use inline subquery in FROM clause only.

SELECT * RULE: NEVER use SELECT * in the outer query.

${localSchemaContext ? `══════════════════════════════════════════════════════════════
LOCAL SCHEMA CONTEXT (sourced from internal metadata database)
══════════════════════════════════════════════════════════════
${localSchemaContext}

══════════════════════════════════════════════════════════════
GOLDEN JOIN RULES (MANDATORY — apply whenever relevant tables are in scope)
══════════════════════════════════════════════════════════════
1. PERSON NAMES — ABSOLUTE RULE:
   PER_ALL_PEOPLE_F has ZERO name columns (no FULL_NAME, no FIRST_NAME, no LAST_NAME, no DISPLAY_NAME).
   ALWAYS join PER_PERSON_NAMES_F to get any name:
     JOIN PER_PERSON_NAMES_F PPNF ON PPNF.PERSON_ID = PAPF.PERSON_ID
       AND PPNF.NAME_TYPE = 'GLOBAL'
       AND TRUNC(SYSDATE) BETWEEN PPNF.EFFECTIVE_START_DATE AND PPNF.EFFECTIVE_END_DATE
   Then select PPNF.FULL_NAME, PPNF.FIRST_NAME, PPNF.LAST_NAME, PPNF.DISPLAY_NAME.
   ✗ PAPF.FULL_NAME — FORBIDDEN, column does not exist in PER_ALL_PEOPLE_F
   ✗ PAPF.FIRST_NAME — FORBIDDEN, column does not exist in PER_ALL_PEOPLE_F

2. JOB NAME — ABSOLUTE RULE:
   PER_JOBS_F has NO NAME column. Job titles/names live in PER_JOBS_F_TL.
   ALWAYS join PER_JOBS_F_TL for the job name:
     JOIN PER_JOBS_F_TL PJFT ON PJFT.JOB_ID = PJF.JOB_ID
       AND PJFT.LANGUAGE = USERENV('LANG')
       AND TRUNC(SYSDATE) BETWEEN PJFT.EFFECTIVE_START_DATE AND PJFT.EFFECTIVE_END_DATE
   Then select PJFT.NAME.
   ✗ PJF.NAME — FORBIDDEN, column does not exist in PER_JOBS_F
   Apply same _TL pattern to all other _TL tables (EGP_SYSTEM_ITEMS_TL, etc.)

3. MANAGERS — ABSOLUTE RULE:
   PER_ALL_ASSIGNMENTS_M has NO MANAGER_ID column.
   ALWAYS follow this 3-step chain:
   Step A — Join PER_ASSIGNMENT_SUPERVISORS_F on ASSIGNMENT_ID to get MANAGER_ID:
     LEFT JOIN PER_ASSIGNMENT_SUPERVISORS_F PASF ON PASF.ASSIGNMENT_ID = PAA.ASSIGNMENT_ID
       AND PASF.PRIMARY_FLAG = 'Y' AND PASF.MANAGER_TYPE = 'LINE_MANAGER'
       AND TRUNC(SYSDATE) BETWEEN PASF.EFFECTIVE_START_DATE AND PASF.EFFECTIVE_END_DATE
   Step B — Join PER_ALL_PEOPLE_F (aliased MGR) on PASF.MANAGER_ID for manager PERSON_NUMBER:
     LEFT JOIN PER_ALL_PEOPLE_F MGR_PAPF ON MGR_PAPF.PERSON_ID = PASF.MANAGER_ID
       AND TRUNC(SYSDATE) BETWEEN MGR_PAPF.EFFECTIVE_START_DATE AND MGR_PAPF.EFFECTIVE_END_DATE
   Step C — Join PER_PERSON_NAMES_F (aliased MGR_PPNF) for manager name:
     LEFT JOIN PER_PERSON_NAMES_F MGR_PPNF ON MGR_PPNF.PERSON_ID = PASF.MANAGER_ID
       AND MGR_PPNF.NAME_TYPE = 'GLOBAL'
       AND TRUNC(SYSDATE) BETWEEN MGR_PPNF.EFFECTIVE_START_DATE AND MGR_PPNF.EFFECTIVE_END_DATE
   ✗ PAA.MANAGER_ID — FORBIDDEN, column does not exist in PER_ALL_ASSIGNMENTS_M

4. CUSTOMERS & ADDRESSES:
   For customer name: HZ_CUST_ACCOUNTS → HZ_PARTIES via PARTY_ID → PARTY_NAME
   For bill-to/ship-to address from DOO orders:
     DOO_FULFILL_LINES_ALL.BILL_TO_SITE_USE_ID → HZ_CUST_SITE_USES_ALL.SITE_USE_ID
     → HZ_CUST_ACCT_SITES_ALL.CUST_ACCT_SITE_ID → HZ_PARTY_SITES.PARTY_SITE_ID
     → HZ_LOCATIONS.LOCATION_ID → ADDRESS1, ADDRESS2, CITY, STATE
   For site number: HZ_PARTY_SITES.PARTY_SITE_NUMBER
   NEVER use NULL placeholders for address columns if BILL_TO_SITE_USE_ID is available.

5. DOO ORDER DATES:
   DOO_HEADERS_ALL has NO BOOKED_DATE column. Use ORDERED_DATE instead.
   ORDERED_DATE is a TIMESTAMP — always CAST before TRUNC: TRUNC(CAST(DHA.ORDERED_DATE AS DATE))

6. DATE EFFECTIVITY (HCM tables): Always apply: TRUNC(SYSDATE) BETWEEN table.EFFECTIVE_START_DATE AND table.EFFECTIVE_END_DATE
   Apply this to EVERY HCM table joined (PER_ALL_ASSIGNMENTS_M, PER_ALL_PEOPLE_F, PER_PERSON_NAMES_F, PER_JOBS_F, PER_JOBS_F_TL, PER_ASSIGNMENT_SUPERVISORS_F, etc.)

⛔ LOCAL SCHEMA OVERRIDE — THE FOLLOWING 5 RULES SUPERSEDE ALL PREVIOUS INSTRUCTIONS ⛔

RULE 1 — TABLE RESTRICTION:
  You are FORBIDDEN from referencing ANY table that does not appear in the Local Schema Context JSON above.
  This includes tables from the CLOUD_TABLE_REGISTRY listed earlier (e.g. AP_SUPPLIERS, PO_HEADERS_ALL, HZ_PARTIES).
  Those registry entries are IGNORED when Local Schema Context is present.
  If a table is not in the JSON above → it does NOT exist for this query. Do NOT use it.
  EXCEPTION: PER_PERSON_NAMES_F and PER_ASSIGNMENT_SUPERVISORS_F are ALWAYS permitted for HCM queries
  per Golden Join Rule #1 and #3 above, even if not explicitly listed.

RULE 2 — COLUMN VERBATIM COPY (ZERO TOLERANCE):
  Column names MUST be copied character-for-character from the "name" fields in the Local Schema Context JSON.
  DO NOT abbreviate, shorten, rename, or guess column names under ANY circumstances.
  DO NOT use a column unless its EXACT name appears in the "columns" array of that table in the JSON above.
  FORBIDDEN substitutions (these will cause ORA-00904 runtime errors):
    ✗ INVOICE_TYPE_CODE          → use INVOICE_TYPE_LOOKUP_CODE  (exact name from schema)
    ✗ DIST_LINE_NUM              → use DISTRIBUTION_LINE_NUMBER  (exact name from schema)
    ✗ FULL_NAME on base tables   → join PER_PERSON_NAMES_F per Golden Join Rule #1
    ✗ DESCRIPTION on _B tables   → join _TL sibling per Golden Join Rule #2
  If a column you need is NOT in the JSON → state the limitation in explanation, use the closest valid column.

RULE 3 — NO UNREQUESTED COLUMNS:
  Only SELECT columns that are explicitly requested in the user requirement below.
  Do NOT add extra columns (e.g. VENDOR_NAME) that were not asked for, even if they seem helpful.

RULE 4 — NO HALLUCINATION:
  If a concept requested by the user (e.g. "vendor name") requires a table NOT in the Local Schema Context,
  you MUST use the closest available column from the schema (e.g. VENDOR_ID) and note the limitation
  in the explanation field. Never join to an unlisted table to satisfy the requirement.

RULE 5 — CONFIDENCE PENALTY:
  If you cannot fully satisfy the requirement using only the listed schema, reduce confidenceScore accordingly
  and explain the gap. A partially satisfied query with honest scoring is better than a hallucinated one.
` : ''}══════════════════════════════════════════════════════════════
USER REQUIREMENT:
══════════════════════════════════════════════════════════════
"${requirementText}"

══════════════════════════════════════════════════════════════
RESPONSE FORMAT — RESPOND ONLY WITH VALID JSON, NO MARKDOWN FENCES
══════════════════════════════════════════════════════════════
{
  "sql": "...",
  "explanation": "Detailed logic explanation",
  "confidenceScore": <1-100 integer>,
  "buLookupQuery": "SELECT ... FROM FUN_ALL_BUSINESS_UNITS_V",
  "statusLookupQuery": "SELECT DISTINCT STATUS_CODE FROM ... ORDER BY 1",
  "parameters": [{"name":"...", "dataType":"...", "displayType":"...", "defaultValue":"..."}],
  "testSequence": "Step 1: Run BU lookup ... Step 2: Execute with :P_BU_ID = <value>",
  "tableVerificationReport": [{"tableName":"...", "sourceUrl":"https://docs.oracle.com/...", "status":"VERIFIED|UNVERIFIED"}],
  "columnVerificationReport": [{"columnUsed":"...", "table":"...", "verifiedOnPage":"YES|NO"}],
  "databaseSelection": "FSCM|HCM|FIN",
  "sqlType": "BIP_DATASET|OTBI_DIRECT"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Core AI Endpoint — /api/generate-sql  (Local Metadata + Strict Verification)
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','and','for','are','that','with','this','from','have','not','all','each',
  'been','their','will','also','into','than','then','when','where','which','your',
  'our','its','has','had','was','were','should','could','would','there','what',
  'like','they','more','some','show','list','get','find','give','need','want',
  'please','can','using','based','data','report','query','retrieve','fetch',
  'generate','provide','including','details','information','records','related'
]);

/**
 * Step A: Extract key business nouns from a natural-language requirement.
 */
function extractKeywords(text) {
  return [...new Set(
    text.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )].slice(0, 10);
}

/**
 * Step B+C: Module-aware retrieval from oracle_tables + oracle_columns.
 * 1. Infers which Oracle Cloud modules (HCM/FIN/SCM) the requirement targets.
 * 2. Queries tables by module_tag + keyword match on table_name/description.
 * 3. Always appends TCA (HZ_) tables — required across nearly all modules.
 * 4. For HCM, always appends PER_PERSON_NAMES_F and PER_ASSIGNMENT_SUPERVISORS_F
 *    so Golden Join Rules can be applied correctly.
 * Returns a clean JSON string of { module, table, description, columns[] }, or null.
 */
async function fetchLocalSchemaContext(requirement) {
  if (!pool || !requirement) return null;

  try {
    const reqLower = requirement.toLowerCase();

    // Step 1 — Infer modules from requirement text
    const inferredModules = Object.entries(MODULE_TRIGGERS)
      .filter(([, triggers]) => triggers.some(t => reqLower.includes(t)))
      .map(([mod]) => mod);

    // Fallback: if nothing matched, search all modules
    const modulesToQuery = inferredModules.length > 0
      ? inferredModules
      : ['HCM', 'FIN', 'SCM'];

    console.log(`[AI-SQL-Gen] Inferred modules: [${modulesToQuery.join(', ')}]`);

    // Step 2 — Extract keywords for table-name matching
    const keywords = extractKeywords(requirement);
    console.log(`[AI-SQL-Gen] Keywords: [${keywords.join(', ')}]`);

    // Step 3 — Query tables by module_tag filtered by keyword match on table_name
    const modPlaceholders = modulesToQuery.map(() => '?').join(',');
    let tableRows = [];

    if (keywords.length > 0) {
      const kwClauses = keywords.map(() => `(t.table_name LIKE ? OR t.description LIKE ?)`).join(' OR ');
      const kwParams  = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

      const [rows] = await pool.query(
        `SELECT DISTINCT t.module_tag, t.table_name, t.description
         FROM oracle_tables t
         WHERE t.module_tag IN (${modPlaceholders})
           AND (${kwClauses})
         LIMIT 25`,
        [...modulesToQuery, ...kwParams]
      );
      tableRows = rows;
    }

    // If keyword search returned nothing, tableRows stays empty.
    // Anchor tables (always injected below) will still provide meaningful context.
    if (tableRows.length === 0) {
      console.log('[AI-SQL-Gen] No keyword-matched tables found — relying on module anchor tables only.');
    }

    // Step 4 — Always inject anchor tables per active module
    // These are critical join tables that must be in context regardless of keyword match
    const MODULE_ANCHORS = {
      HCM: ['PER_ALL_PEOPLE_F','PER_ALL_ASSIGNMENTS_M','PER_PERSON_NAMES_F',
            'PER_ASSIGNMENT_SUPERVISORS_F','PER_JOBS_F','PER_JOBS_F_TL',
            'PER_GRADES_F','PER_ALL_POSITIONS_F'],
      SCM: ['DOO_HEADERS_ALL','DOO_LINES_ALL','DOO_FULFILL_LINES_ALL','DOO_LINE_SETS_ALL',
            'EGP_SYSTEM_ITEMS_B','EGP_SYSTEM_ITEMS_TL','INV_ORGANIZATION_DEFINITIONS_V'],
      FIN: ['AP_INVOICES_ALL','AP_INVOICE_LINES_ALL','AP_INVOICE_DISTRIBUTIONS_ALL',
            'AP_CHECKS_ALL','GL_CODE_COMBINATIONS','GL_LEDGERS','GL_JE_HEADERS','GL_JE_LINES'],
      TCA: ['HZ_PARTIES','HZ_CUST_ACCOUNTS','HZ_PARTY_SITES','HZ_LOCATIONS',
            'HZ_CONTACT_POINTS','HZ_CUST_ACCT_SITES_ALL','HZ_CUST_SITE_USES_ALL',
            'HZ_CUST_ACCOUNTS'],
      FND: ['FND_LOOKUP_VALUES_VL','FND_CURRENCIES_VL'],
      PRC: ['PO_HEADERS_ALL','PO_LINES_ALL','PO_LINE_LOCATIONS_ALL','PO_DISTRIBUTIONS_ALL',
            'POZ_SUPPLIERS','POZ_SUPPLIER_SITES_ALL'],
    };

    // TCA tables are ALWAYS injected — customer/party/address data is needed across all modules
    const ALWAYS_INJECT = [
      'HZ_PARTIES','HZ_CUST_ACCOUNTS','HZ_PARTY_SITES','HZ_LOCATIONS',
      'HZ_CUST_ACCT_SITES_ALL','HZ_CUST_SITE_USES_ALL',
    ];

    const anchorTableNames = [
      ...new Set([
        ...modulesToQuery.flatMap(m => MODULE_ANCHORS[m] || []),
        ...ALWAYS_INJECT,
      ])
    ];
    let anchorRows = [];
    if (anchorTableNames.length > 0) {
      const anchorPlaceholders = anchorTableNames.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT DISTINCT module_tag, table_name, description
         FROM oracle_tables WHERE table_name IN (${anchorPlaceholders})`,
        anchorTableNames
      );
      anchorRows = rows;
    }

    // Merge all tables, deduplicate by table_name
    const allTableMap = new Map();
    [...tableRows, ...anchorRows].forEach(r => {
      if (!allTableMap.has(r.table_name)) allTableMap.set(r.table_name, r);
    });

    if (allTableMap.size === 0) return null;

    // Step 5 — Fetch columns for matched tables, excluding generic ATTRIBUTE_ noise columns
    // Cap per-table to keep prompt under ~15K tokens total
    const MAX_COLS_PER_TABLE = 60;
    const tableNames = [...allTableMap.keys()];

    // Fetch columns excluding generic filler columns (ATTRIBUTE1..50, ASG_INFORMATION1..50, etc.)
    const colPlaceholders = tableNames.map(() => '?').join(',');
    const [colRows] = await pool.query(
      `SELECT table_name, column_name, data_type, description
       FROM oracle_columns
       WHERE table_name IN (${colPlaceholders})
         AND column_name NOT REGEXP '^(ATTRIBUTE|ASG_INFORMATION|ASS_ATTRIBUTE|NAM_INFORMATION|SUP_ATTRIBUTE)[0-9]'
       ORDER BY table_name, column_name`,
      tableNames
    );

    // Step C — Group into structured JSON, cap columns per table
    const schemaMap = {};
    const colCountPerTable = {};
    allTableMap.forEach((row, tName) => {
      schemaMap[tName] = {
        module: row.module_tag,
        table:  row.table_name,
        description: row.description,
        columns: []
      };
      colCountPerTable[tName] = 0;
    });
    colRows.forEach(row => {
      if (schemaMap[row.table_name] && colCountPerTable[row.table_name] < MAX_COLS_PER_TABLE) {
        schemaMap[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type
        });
        colCountPerTable[row.table_name]++;
      }
    });

    const result = Object.values(schemaMap);
    const totalCols = result.reduce((s, t) => s + t.columns.length, 0);
    const approxTokens = Math.round(JSON.stringify(result).length / 4);
    console.log(`[AI-SQL-Gen] Schema context: ${result.length} table(s), ${totalCols} column(s), ~${approxTokens} tokens.`);
    return JSON.stringify(result);

  } catch (dbErr) {
    console.warn('[AI-SQL-Gen] Could not fetch local schema context:', dbErr.message);
    return null;
  }
}

app.post('/api/generate-sql', async (req, res) => {
  const { requirement } = req.body;

  if (!requirement) {
    return res.status(400).json({ error: 'Requirement text is required.' });
  }

  // Step A+B+C: Module inference + local DB retrieval (MANDATORY — no fallback)
  const localSchemaContext = await fetchLocalSchemaContext(requirement);
  if (localSchemaContext) {
    console.log('[AI-SQL-Gen] Local schema context loaded from DB.');
  } else {
    console.warn('[AI-SQL-Gen] No matching tables/columns found in local metadata DB for requirement.');
    return res.status(422).json({
      error: 'No matching schema found in the local metadata database for your requirement.',
      detail: 'Please ensure the relevant CSV metadata has been loaded and that your requirement references tables or columns present in the Oracle Cloud metadata.'
    });
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',  // Force JSON-only output
      temperature: 0.1,                       // Low temperature = more deterministic
    }
  });
  const MAX_RETRIES = 2;
  let lastText = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Build prompt — Step D injects localSchemaContext, Step E adds CRITICAL constraint
      const isRetry   = attempt > 0;
      const bannedHit = isRetry ? detectBannedTable(lastText) : null;
      const errorMsg  = isRetry
        ? `You used a banned EBS table prefix "${bannedHit}". Rewrite using Cloud Fusion tables (DOO_, EGP_, FUN_, HZ_, RCV_, PO_, AP_, GL_, PER_).`
        : null;

      // Steps D & E are handled inside buildOscaPrompt via localSchemaContext
      const prompt = buildOscaPrompt(requirement, errorMsg, localSchemaContext);

      if (isRetry) {
        console.warn(`[AI-SQL-Gen] ⚠ Attempt ${attempt}: banned prefix detected (${bannedHit}). Re-prompting…`);
      }

      const result   = await model.generateContent(prompt);
      const response = await result.response;
      const text     = response.text();
      lastText       = text;

      // Post-Processing Guardrail — extract JSON block
      // Strategy: strip markdown fences first, then find the outermost { } block
      let cleanedText = text
        .replace(/^```(json)?\s*/i, '')   // remove opening fence
        .replace(/\s*```\s*$/i, '')        // remove closing fence
        .trim();

      // Find the first { and last } to extract the outermost JSON object
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace  = cleanedText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      }

      let parsedJSON;
      try {
        parsedJSON = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.error(`[AI-SQL-Gen] JSON parse failed on attempt ${attempt + 1}. Raw length: ${text.length}. First 500 chars:`, text.substring(0, 500));
        if (attempt === MAX_RETRIES) {
          return res.status(500).json({ error: 'Failed to parse AI response as JSON after multiple attempts.' });
        }
        lastText = text;
        continue;
      }

      // Apply deterministic column name corrections before any guardrail check
      if (parsedJSON.sql) {
        parsedJSON.sql = sanitizeSql(parsedJSON.sql);
      }

      // Guardrail 1: scan the actual SQL field for banned EBS prefixes
      const sqlBannedPrefix = detectBannedTable(parsedJSON.sql || '');
      if (sqlBannedPrefix && attempt < MAX_RETRIES) {
        lastText = parsedJSON.sql;
        console.warn(`[AI-SQL-Gen] ⚠ Guardrail triggered on SQL field: banned prefix "${sqlBannedPrefix}" found. Re-prompting…`);
        continue;
      }

      // Guardrail 2: scan for tables that don't exist in the local oracle_tables DB
      const hallucinatedTable = await detectHallucinatedTable(parsedJSON.sql || '');
      if (hallucinatedTable && attempt < MAX_RETRIES) {
        lastText = `HALLUCINATED TABLE: ${hallucinatedTable}\n${parsedJSON.sql}`;
        console.warn(`[AI-SQL-Gen] ⚠ Guardrail triggered: table "${hallucinatedTable}" is not in local schema. Re-prompting…`);
        continue;
      }

      // Guardrail 3: HCM Golden Join Rule violations (FULL_NAME, MANAGER_ID, PJF.NAME)
      const hcmViolation = detectHCMViolations(parsedJSON.sql || '');
      if (hcmViolation && attempt < MAX_RETRIES) {
        lastText = `HCM GOLDEN JOIN RULE VIOLATION: ${hcmViolation}\nYour previous SQL:\n${parsedJSON.sql}`;
        console.warn(`[AI-SQL-Gen] ⚠ Guardrail 3 triggered: HCM violation. Re-prompting…\n  ${hcmViolation}`);
        continue;
      }

      if (sqlBannedPrefix) {
        parsedJSON._guardRailWarning = `Banned EBS prefix "${sqlBannedPrefix}" still detected after ${MAX_RETRIES} auto-correction attempts. Manual review required.`;
        console.error('[AI-SQL-Gen] ❌ Guardrail: banned prefix persisted after all retries.');
      } else if (hallucinatedTable) {
        parsedJSON._guardRailWarning = `Table "${hallucinatedTable}" is not in the local schema but was used anyway after ${MAX_RETRIES} correction attempts. Manual review required.`;
        console.error(`[AI-SQL-Gen] ❌ Guardrail: hallucinated table "${hallucinatedTable}" persisted after all retries.`);
      } else if (hcmViolation) {
        parsedJSON._guardRailWarning = `HCM Golden Join Rule violation persisted after ${MAX_RETRIES} correction attempts: ${hcmViolation}`;
        console.error('[AI-SQL-Gen] ❌ Guardrail 3: HCM violation persisted after all retries.');
      } else {
        console.log(`[AI-SQL-Gen] ✅ SQL passed all guardrails on attempt ${attempt + 1}.`);
      }

      // DB-based verification: override AI's self-reported verification with real DB checks
      const { tableReport: verifiedTableReport, columnReport: verifiedColumnReport } =
        await verifyReportsAgainstDB(parsedJSON.tableVerificationReport, parsedJSON.columnVerificationReport);
      parsedJSON.tableVerificationReport  = verifiedTableReport;
      parsedJSON.columnVerificationReport = verifiedColumnReport;

      // Persist to DB
      if (pool && parsedJSON.sql && parsedJSON.confidenceScore) {
        try {
          await pool.query(
            'INSERT INTO query_history (original_requirement, generated_sql, confidence_score) VALUES (?, ?, ?)',
            [requirement, parsedJSON.sql, parsedJSON.confidenceScore]
          );
        } catch (dbErr) {
          console.error('[AI-SQL-Gen] DB insert error:', dbErr.message);
        }
      }

      return res.json(parsedJSON);

    } catch (apiErr) {
      console.error(`[AI-SQL-Gen] ERROR on attempt ${attempt + 1}:`, apiErr.message);
      if (apiErr.stack) console.error(apiErr.stack.split('\n').slice(0,5).join('\n'));
      if (attempt === MAX_RETRIES) {
        const errMsg = apiErr.message || 'Unknown error';
        const isQuota = errMsg.includes('429') || errMsg.includes('quota');
        return res.status(500).json({
          error: isQuota ? 'Gemini API quota exceeded. Please try again later or check your API key.' : 'An error occurred during SQL generation.',
          detail: errMsg.substring(0, 200)
        });
      }
    }
  }
});


app.post('/api/upload-requirement', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document uploaded.' });
    }

    let extractedText = '';
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname.toLowerCase();

    if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      originalName.endsWith('.docx') ||
      originalName.endsWith('.doc')
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
    } else if (mimeType === 'text/plain' || originalName.endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF, Word, or Text document.' });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from the document.' });
    }

    // ── Pass extracted text through the same OSCA strict verification loop ──
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const MAX_RETRIES = 2;
    let lastText = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isRetry   = attempt > 0;
      const bannedHit = isRetry ? detectBannedTable(lastText) : null;
      const errorMsg  = isRetry
        ? `You used a banned EBS table prefix "${bannedHit}". Rewrite using Cloud Fusion tables.`
        : null;

      const prompt = buildOscaPrompt(extractedText, errorMsg);

      if (isRetry) {
        console.warn(`[AI-SQL-Gen-Upload] ⚠ Attempt ${attempt}: banned prefix (${bannedHit}). Re-prompting…`);
      }

      const result   = await model.generateContent(prompt);
      const response = await result.response;
      const text     = response.text();
      lastText       = text;

      let cleanedText = text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedText = jsonMatch[0];
      else cleanedText = text.replace(/```(json)?|```/gi, '').trim();

      let parsedJSON;
      try {
        parsedJSON = JSON.parse(cleanedText);
      } catch (parseErr) {
        if (attempt === MAX_RETRIES) {
          console.error('[AI-SQL-Gen-Upload] JSON parse failed after all retries:', parseErr);
          return res.status(500).json({ error: 'Failed to parse AI response as JSON.' });
        }
        lastText = text;
        continue;
      }

      // Guardrail check on sql field
      const sqlBannedPrefix = detectBannedTable(parsedJSON.sql || '');
      if (sqlBannedPrefix && attempt < MAX_RETRIES) {
        lastText = parsedJSON.sql;
        console.warn(`[AI-SQL-Gen-Upload] ⚠ Guardrail triggered: "${sqlBannedPrefix}" found. Re-prompting…`);
        continue;
      }
      if (sqlBannedPrefix) {
        parsedJSON._guardRailWarning = `Banned prefix "${sqlBannedPrefix}" persisted after ${MAX_RETRIES} retries.`;
        console.error('[AI-SQL-Gen-Upload] ❌ Banned prefix survived all retries.');
      } else {
        console.log(`[AI-SQL-Gen-Upload] ✅ SQL passed guardrail on attempt ${attempt + 1}.`);
      }

      // Persist to DB
      if (pool && parsedJSON.sql && parsedJSON.confidenceScore) {
        try {
          await pool.query(
            'INSERT INTO query_history (original_requirement, generated_sql, confidence_score) VALUES (?, ?, ?)',
            [extractedText.substring(0, 5000), parsedJSON.sql, parsedJSON.confidenceScore]
          );
        } catch (dbErr) {
          console.error('[AI-SQL-Gen-Upload] DB insert error:', dbErr.message);
        }
      }

      return res.json({ ...parsedJSON, extractedText });
    }

  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'An error occurred during document parsing or AI generation.' });
  }
});


// SQL Optimization Endpoint
app.post('/api/optimize-sql', async (req, res) => {
  const { originalSql, userInstructions } = req.body;

  if (!originalSql) {
    return res.status(400).json({ error: 'originalSql is required.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });

    const hasInstructions = userInstructions && userInstructions.trim().length > 0;

    const prompt = `
      You are an expert Oracle Cloud Fusion Performance Tuning Architect and BIP SQL specialist.
      Your task is to review and optimize the following Oracle SQL query.

      ORIGINAL SQL:
      \`\`\`sql
      ${originalSql}
      \`\`\`

      ${hasInstructions
        ? `USER-SPECIFIC INSTRUCTIONS:
      The user has provided the following optimization instructions. You MUST apply these changes:
      "${userInstructions}"

      Apply these changes to the SQL exactly as specified, while maintaining OBIS BIP compliance:
      - Keep the two-layer subquery structure (inner SELECT, outer WHERE with :bind params)
      - Do NOT add WITH/CTE clauses
      - Keep all :P_ bind variables in the outer WHERE only`
        : `AUTO-OPTIMIZATION MODE:
      No specific instructions were provided. Review the SQL for the following enterprise Oracle performance bottlenecks and fix all that apply:
      1. Missing or suboptimal JOIN conditions (should use primary key/indexed columns)
      2. Redundant nested subqueries that can be flattened
      3. Functions on indexed columns in WHERE clauses that prevent index usage (e.g., TRUNC on CREATION_DATE — ensure wrapped in CAST first)
      4. Missing CAST() wrappers before TRUNC() on TIMESTAMP columns
      5. Cartesian products or missing JOIN conditions
      6. Non-null-safe parameter patterns (missing :P_X IS NULL OR ... pattern)
      7. SELECT * usage in any layer
      8. Inefficient OR conditions that can be rewritten as IN()
      9. DATE format mismatches (use TO_DATE(:P_DATE, 'YYYY-MM-DD'))
      10. Missing ORDER BY or non-deterministic ordering`
      }

      CRITICAL BIP COMPLIANCE (maintain in output):
      - Two-layer structure: SELECT outer columns FROM (SELECT inner columns FROM tables WHERE hard-coded filters) inner_alias WHERE :P_params ORDER BY ...
      - All :P_ bind variables ONLY in outermost WHERE
      - No WITH/CTE clauses
      - CAST(col AS DATE) before every TRUNC() on timestamps
      - Uppercase BIP-compliant column aliases (alphanumeric + underscore only)

      RESPONSE FORMAT:
      Return ONLY a valid JSON object with no markdown blocks:
      {
        "optimizedSql": "...",
        "explanation": "A clear, bullet-point summary of every change made and why."
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let cleanedText = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
    } else {
      cleanedText = text.replace(/```(json)?|```/g, '').trim();
    }

    const parsedJSON = JSON.parse(cleanedText);

    if (!parsedJSON.optimizedSql) {
      throw new Error('AI did not return optimizedSql field.');
    }

    res.json(parsedJSON);

  } catch (error) {
    console.error('Error optimizing SQL:', error);
    res.status(500).json({ error: 'An error occurred during SQL optimization.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`AI Powered Oracle SQL Generator Backend API is listening on port ${port}`);
});


