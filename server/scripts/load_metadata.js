'use strict';

/**
 * load_metadata.js
 *
 * Bulk-loads Oracle table/column metadata from CSV files in ./metadata_csvs/
 * into the osca_metadata MySQL database using batch inserts for performance.
 *
 * Expected CSV headers: MODULE_TAG, TABLE_NAME, COLUMN_NAME, DATA_TYPE
 * (TABLE_DESCRIPTION and COLUMN_DESCRIPTION are optional)
 *
 * Usage:
 *   node scripts/load_metadata.js
 */

const path  = require('path');
const fs    = require('fs');
const csv   = require('csv-parser');
const sqlite3 = require('sqlite3');
const { open }  = require('sqlite');

const CSV_DIR   = path.join(__dirname, '..', 'metadata_csvs');
const BATCH_SIZE = 500;

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().toUpperCase().replace(/^\uFEFF/, '') }))
      .on('data', row => rows.push(row))
      .on('end',  ()  => resolve(rows))
      .on('error', reject);
  });
}

async function batchInsert(pool, table, columns, rows) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const values = chunk.flatMap(r => columns.map(c => r[c]));
    const [result] = await pool.query(
      `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      values
    );
    inserted += result.affectedRows;
  }
  return inserted;
}

async function main() {
  if (!fs.existsSync(CSV_DIR)) throw new Error(`metadata_csvs directory not found: ${CSV_DIR}`);
  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
  if (csvFiles.length === 0) throw new Error(`No CSV files found in: ${CSV_DIR}`);

  const db = await open({
    filename: './osca_metadata.db',
    driver: sqlite3.Database
  });

  const pool = {
    query: async (sql, params) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
         const rows = await db.all(sql, params);
         return [rows, []];
      } else {
         const result = await db.run(sql, params);
         return [{insertId: result.lastID, affectedRows: result.changes}, []];
      }
    },
    end: () => db.close()
  };

  let totalTableRows = 0;
  let totalColumnRows = 0;

  try {
    for (const file of csvFiles) {
      const filePath = path.join(CSV_DIR, file);
      console.log(`\nProcessing: ${file}`);
      const rows = await parseCsv(filePath);
      console.log(`  → ${rows.length} rows read.`);

      // Deduplicate tables in-memory before insert
      const tableMap = new Map();
      const columnRows = [];

      for (const row of rows) {
        const tableName  = (row['TABLE_NAME']        || '').trim().toUpperCase();
        const moduleTag  = (row['MODULE_TAG']         || '').trim().toUpperCase();
        const tableDesc  = (row['TABLE_DESCRIPTION']  || '').trim() || null;
        const colName    = (row['COLUMN_NAME']         || '').trim().toUpperCase();
        const dataType   = (row['DATA_TYPE']           || '').trim() || null;
        const colDesc    = (row['COLUMN_DESCRIPTION']  || '').trim() || null;

        if (!tableName) continue;
        if (!tableMap.has(tableName)) {
          tableMap.set(tableName, { module_tag: moduleTag || null, table_name: tableName, description: tableDesc });
        }
        if (colName) {
          columnRows.push({ table_name: tableName, column_name: colName, data_type: dataType, description: colDesc });
        }
      }

      const tableRows = Array.from(tableMap.values());
      const tIns = await batchInsert(pool, 'oracle_tables',  ['module_tag','table_name','description'], tableRows);
      const cIns = await batchInsert(pool, 'oracle_columns', ['table_name','column_name','data_type','description'], columnRows);

      console.log(`  ✓ Tables inserted: ${tIns} | Columns inserted: ${cIns}`);
      totalTableRows  += tIns;
      totalColumnRows += cIns;
    }

    // Final counts
    const [[{ total_tables }]]  = await pool.query('SELECT COUNT(*) AS total_tables FROM oracle_tables');
    const [[{ total_columns }]] = await pool.query('SELECT COUNT(*) AS total_columns FROM oracle_columns');

    console.log('\n─────────────────────────────────────────');
    console.log(`New tables inserted  : ${totalTableRows}`);
    console.log(`New columns inserted : ${totalColumnRows}`);
    console.log(`Total tables  in DB  : ${total_tables}`);
    console.log(`Total columns in DB  : ${total_columns}`);
    console.log('─────────────────────────────────────────');
    console.log('Metadata load complete.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
