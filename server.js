const express = require('express');
const cors = require('cors');
const path = require('path');

// Ensure database schema is loaded
require('./src/config/database');

const analyticsRoutes = require('./src/routes/analyticsRoutes');
const visitRoutes = require('./src/routes/visitRoutes');
const programRoutes = require('./src/routes/programRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const staffRoutes = require('./src/routes/staffRoutes');

const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});

const DATA_FILE = path.join(__dirname, 'data.json');

// Restore state from data.json if SQLite database is empty on server startup
async function restoreDbFromJsonIfEmpty() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const db = require('./src/config/database');
    const patientCount = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
    if (patientCount === 0) {
      console.log('🔄 Fresh database detected. Restoring state from data.json...');
      const fileData = await fs.promises.readFile(DATA_FILE, 'utf8');
      const backup = JSON.parse(fileData);
      
      const insertPatient = db.prepare(`
        INSERT OR IGNORE INTO patients (id, uhid, full_name, age, gender, contact, address, created_at)
        VALUES (@id, @uhid, @full_name, @age, @gender, @contact, @address, @created_at)
      `);
      const insertVisit = db.prepare(`
        INSERT OR IGNORE INTO visits (id, patient_id, token_number, visit_date, program_category, triage_status, symptoms, bp, pulse, temp, spo2, diagnosis, doctor_notes, created_at)
        VALUES (@id, @patient_id, @token_number, @visit_date, @program_category, @triage_status, @symptoms, @bp, @pulse, @temp, @spo2, @diagnosis, @doctor_notes, @created_at)
      `);
      const insertMed = db.prepare(`
        INSERT OR IGNORE INTO medicines (id, code, name, category, batch_number, quantity, min_threshold, unit, expiry_date, rack_location, unit_price, supplier, created_at)
        VALUES (@id, @code, @name, @category, @batch_number, @quantity, @min_threshold, @unit, @expiry_date, @rack_location, @unit_price, @supplier, @created_at)
      `);
      const insertStaff = db.prepare(`
        INSERT OR IGNORE INTO staff (id, emp_id, full_name, role, designation, phone, email, is_active, created_at)
        VALUES (@id, @emp_id, @full_name, @role, @designation, @phone, @email, @is_active, @created_at)
      `);
      const insertRoster = db.prepare(`
        INSERT OR IGNORE INTO duty_roster (id, staff_id, shift_date, shift_type, duty_status, notes, created_at)
        VALUES (@id, @staff_id, @shift_date, @shift_type, @duty_status, @notes, @created_at)
      `);

      const tx = db.transaction(() => {
        if (backup.patients) backup.patients.forEach(p => insertPatient.run(p));
        if (backup.visits) backup.visits.forEach(v => insertVisit.run(v));
        if (backup.medicines) backup.medicines.forEach(m => insertMed.run(m));
        if (backup.staff) backup.staff.forEach(s => insertStaff.run(s));
        if (backup.duty_roster) backup.duty_roster.forEach(r => insertRoster.run(r));
      });
      tx();
      console.log('✅ State successfully restored from data.json');
    }
  } catch (err) {
    console.error('Failed to restore from data.json:', err);
  }
}

// Persist the entire db state to data.json using fs.promises
async function persistDbToJson() {
  try {
    const db = require('./src/config/database');
    const exportData = {
      facility: 'PHC Ramapuram Health Complex (PHC-TN-402)',
      last_persisted: new Date().toISOString(),
      patients: db.prepare('SELECT * FROM patients').all(),
      visits: db.prepare('SELECT * FROM visits').all(),
      program_details: db.prepare('SELECT * FROM program_details').all(),
      medicines: db.prepare('SELECT * FROM medicines').all(),
      prescriptions: db.prepare('SELECT * FROM prescriptions').all(),
      staff: db.prepare('SELECT * FROM staff').all(),
      duty_roster: db.prepare('SELECT * FROM duty_roster').all()
    };
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(exportData, null, 2), 'utf8');
    // Also mirror to data/data.json if data directory exists
    const nestedDataFile = path.join(__dirname, 'data', 'data.json');
    if (fs.existsSync(path.dirname(nestedDataFile))) {
      await fs.promises.writeFile(nestedDataFile, JSON.stringify(exportData, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Error persisting database to data.json:', err);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistence Middleware: Persist db object to data.json on every POST or PATCH request
app.use((req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await persistDbToJson();
      }
    });
  }
  next();
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Direct route to download or view data.json
app.get('/api/data.json', async (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      await persistDbToJson();
    }
    res.sendFile(DATA_FILE);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read data.json' });
  }
});

// API Routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/staff', staffRoutes);

// Direct REST Endpoints requested in Phase 2
// 1. GET /api/dashboard
app.get('/api/dashboard', (req, res) => {
  try {
    const db = require('./src/config/database');
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM visits WHERE visit_date = ?`).get(today).count;
    const activeQueue = db.prepare(`SELECT COUNT(*) as count FROM visits WHERE visit_date = ? AND triage_status IN ('Checked In', 'With Doctor', 'Pharmacy')`).get(today).count;
    const completedVisits = db.prepare(`SELECT COUNT(*) as count FROM visits WHERE visit_date = ? AND triage_status = 'Completed'`).get(today).count;
    const lowStockCount = db.prepare(`SELECT COUNT(*) as count FROM medicines WHERE quantity <= min_threshold`).get().count;
    const sixtyDaysLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiringSoonCount = db.prepare(`SELECT COUNT(*) as count FROM medicines WHERE expiry_date <= ? AND quantity > 0`).get(sixtyDaysLater).count;
    const onDutyStaff = db.prepare(`SELECT COUNT(*) as count FROM duty_roster WHERE shift_date = ? AND duty_status = 'On Duty'`).get(today).count;
    const highRiskMaternal = db.prepare(`SELECT COUNT(*) as count FROM program_details WHERE program_category = 'Maternal Care' AND metadata_json LIKE '%"high_risk":true%'`).get().count;
    const outbreakAlerts = db.prepare(`SELECT COUNT(*) as count FROM program_details WHERE program_category = 'Disease Prevention' AND metadata_json LIKE '%"notifiable_disease":true%'`).get().count;
    const programSummary = db.prepare(`SELECT program_category, COUNT(*) as count FROM visits GROUP BY program_category`).all();

    res.json({
      status: 'success',
      facility: 'PHC Ramapuram Health Complex (PHC-TN-402)',
      kpis: {
        todayVisits,
        activeQueue,
        completedVisits,
        lowStockCount,
        expiringSoonCount,
        onDutyStaff,
        highRiskMaternal,
        outbreakAlerts
      },
      programSummary
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. POST /api/patients
const visitController = require('./src/controllers/visitController');
app.post('/api/patients', visitController.createVisit);

// 3. PATCH /api/patients/:id
app.patch('/api/patients/:id', (req, res) => {
  try {
    const db = require('./src/config/database');
    const { id } = req.params;
    const { status, diagnosis, doctor_notes, bp, pulse, temp, spo2 } = req.body;

    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(id);
    if (!visit) {
      return res.status(404).json({ status: 'error', message: 'Patient visit not found' });
    }

    let normalizedStatus = status;
    if (status === 'Waiting') normalizedStatus = 'Checked In';
    if (status === 'In Consultation') normalizedStatus = 'With Doctor';

    db.prepare(`
      UPDATE visits
      SET 
        triage_status = COALESCE(?, triage_status),
        diagnosis = COALESCE(?, diagnosis),
        doctor_notes = COALESCE(?, doctor_notes),
        bp = COALESCE(?, bp),
        pulse = COALESCE(?, pulse),
        temp = COALESCE(?, temp),
        spo2 = COALESCE(?, spo2)
      WHERE id = ?
    `).run(normalizedStatus, diagnosis, doctor_notes, bp, pulse, temp, spo2, id);

    const updated = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(id);
    res.json({ status: 'success', message: `Patient #${id} updated successfully`, data: updated });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. PATCH /api/medicines/:id
const inventoryController = require('./src/controllers/inventoryController');
app.patch('/api/medicines/:id', inventoryController.updateStock);

// 5. PATCH /api/staff/:id
const staffController = require('./src/controllers/staffController');
app.patch('/api/staff/:id', staffController.updateDutyStatus);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Primary Health Centre (PHC) Monitoring and Management System',
    timestamp: new Date().toISOString()
  });
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server only if run directly
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🏥 PHC Monitoring & Management System Running`);
    console.log(`📡 Local Server: http://localhost:${PORT}`);
    console.log(`🩺 API Healthcheck: http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
    await restoreDbFromJsonIfEmpty();
    await persistDbToJson();
  });
}

module.exports = app;
