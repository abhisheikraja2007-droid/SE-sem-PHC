const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'phc.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uhid TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      contact TEXT NOT NULL,
      address TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      token_number INTEGER NOT NULL,
      visit_date DATE NOT NULL,
      program_category TEXT NOT NULL CHECK(program_category IN ('Outpatient', 'Maternal Care', 'Immunization', 'Disease Prevention')),
      triage_status TEXT NOT NULL DEFAULT 'Checked In' CHECK(triage_status IN ('Checked In', 'With Doctor', 'Pharmacy', 'Completed')),
      symptoms TEXT,
      bp TEXT,
      pulse INTEGER,
      temp REAL,
      spo2 INTEGER,
      diagnosis TEXT,
      doctor_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS program_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      program_category TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_threshold INTEGER NOT NULL DEFAULT 20,
      unit TEXT NOT NULL DEFAULT 'Tablets',
      expiry_date DATE NOT NULL,
      unit_price REAL DEFAULT 0,
      last_restocked DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      dosage TEXT NOT NULL,
      duration_days INTEGER DEFAULT 3,
      quantity_prescribed INTEGER NOT NULL,
      dispensed INTEGER NOT NULL DEFAULT 0,
      dispensed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT,
      qualifications TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS duty_roster (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      shift_date DATE NOT NULL,
      shift_type TEXT NOT NULL,
      duty_status TEXT NOT NULL DEFAULT 'On Duty',
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
    CREATE INDEX IF NOT EXISTS idx_visits_program ON visits(program_category);
    CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(triage_status);
    CREATE INDEX IF NOT EXISTS idx_medicines_exp ON medicines(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_duty_date ON duty_roster(shift_date);
  `);
}

initializeSchema();

module.exports = db;
