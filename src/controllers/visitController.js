const db = require('../config/database');

exports.getAllVisits = (req, res) => {
  try {
    const { category, status, search, date } = req.query;

    let query = `
      SELECT 
        v.id,
        v.patient_id,
        v.token_number,
        v.visit_date,
        v.program_category,
        v.triage_status,
        v.symptoms,
        v.bp,
        v.pulse,
        v.temp,
        v.spo2,
        v.diagnosis,
        v.doctor_notes,
        v.created_at,
        p.uhid,
        p.full_name as patient_name,
        p.age as patient_age,
        p.gender as patient_gender,
        p.contact as patient_contact,
        p.address as patient_address,
        pd.metadata_json,
        (SELECT COUNT(*) FROM prescriptions rx WHERE rx.visit_id = v.id) as prescription_count,
        (SELECT COUNT(*) FROM prescriptions rx WHERE rx.visit_id = v.id AND rx.dispensed = 1) as dispensed_count
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN program_details pd ON pd.visit_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'All') {
      query += ` AND v.program_category = ?`;
      params.push(category);
    }

    if (status && status !== 'All') {
      query += ` AND v.triage_status = ?`;
      params.push(status);
    }

    if (date) {
      query += ` AND v.visit_date = ?`;
      params.push(date);
    }

    if (search) {
      query += ` AND (p.full_name LIKE ? OR p.uhid LIKE ? OR v.diagnosis LIKE ? OR v.symptoms LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY v.visit_date DESC, v.token_number ASC`;

    const visits = db.prepare(query).all(...params);

    const formatted = visits.map(v => {
      let meta = {};
      try {
        if (v.metadata_json) meta = JSON.parse(v.metadata_json);
      } catch (e) {}
      return {
        ...v,
        metadata: meta
      };
    });

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching visits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getVisitById = (req, res) => {
  try {
    const { id } = req.params;

    const visit = db.prepare(`
      SELECT 
        v.*,
        p.uhid,
        p.full_name as patient_name,
        p.age as patient_age,
        p.gender as patient_gender,
        p.contact as patient_contact,
        p.address as patient_address,
        pd.metadata_json
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN program_details pd ON pd.visit_id = v.id
      WHERE v.id = ?
    `).get(id);

    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    let meta = {};
    try {
      if (visit.metadata_json) meta = JSON.parse(visit.metadata_json);
    } catch (e) {}

    const prescriptions = db.prepare(`
      SELECT 
        pr.*,
        m.name as medicine_name,
        m.code as medicine_code,
        m.category as medicine_category,
        m.quantity as current_stock,
        m.unit
      FROM prescriptions pr
      JOIN medicines m ON pr.medicine_id = m.id
      WHERE pr.visit_id = ?
    `).all(id);

    res.json({
      success: true,
      data: {
        ...visit,
        metadata: meta,
        prescriptions
      }
    });
  } catch (error) {
    console.error('Error fetching visit details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createVisit = (req, res) => {
  const transaction = db.transaction(() => {
    const {
      patient_id,
      patient_name,
      patient_age,
      patient_gender,
      patient_contact,
      patient_address,
      program_category,
      symptoms,
      bp,
      pulse,
      temp,
      spo2,
      metadata
    } = req.body;

    let targetPatientId = patient_id;

    // Create new patient if patient_id is not provided
    if (!targetPatientId) {
      if (!patient_name || !patient_age || !patient_gender) {
        throw new Error('Patient name, age, and gender are required for registration.');
      }

      // Generate UHID
      const lastPatient = db.prepare(`SELECT id FROM patients ORDER BY id DESC LIMIT 1`).get();
      const nextId = (lastPatient ? lastPatient.id : 0) + 1;
      const uhid = `PHC-2026-${String(nextId).padStart(3, '0')}`;

      const insertPatient = db.prepare(`
        INSERT INTO patients (uhid, full_name, age, gender, contact, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const patientResult = insertPatient.run(
        uhid,
        patient_name.trim(),
        parseInt(patient_age, 10),
        patient_gender,
        patient_contact || 'N/A',
        patient_address || 'Local Village'
      );
      targetPatientId = patientResult.lastInsertRowid;
    }

    const today = new Date().toISOString().split('T')[0];

    // Compute next token for today
    const maxTokenRow = db.prepare(`SELECT MAX(token_number) as maxToken FROM visits WHERE visit_date = ?`).get(today);
    const nextToken = (maxTokenRow && maxTokenRow.maxToken ? maxTokenRow.maxToken : 0) + 1;

    const validCategories = ['Outpatient', 'Maternal Care', 'Immunization', 'Disease Prevention'];
    const selectedCategory = validCategories.includes(program_category) ? program_category : 'Outpatient';

    const insertVisit = db.prepare(`
      INSERT INTO visits (
        patient_id, token_number, visit_date, program_category, triage_status,
        symptoms, bp, pulse, temp, spo2, diagnosis, doctor_notes
      ) VALUES (?, ?, ?, ?, 'Checked In', ?, ?, ?, ?, ?, '', '')
    `);

    const visitRes = insertVisit.run(
      targetPatientId,
      nextToken,
      today,
      selectedCategory,
      symptoms || 'General Checkup',
      bp || '',
      pulse ? parseInt(pulse, 10) : null,
      temp ? parseFloat(temp) : null,
      spo2 ? parseInt(spo2, 10) : null
    );

    const visitId = visitRes.lastInsertRowid;

    // Insert program metadata
    const metaJson = metadata ? JSON.stringify(metadata) : '{}';
    db.prepare(`
      INSERT INTO program_details (visit_id, program_category, metadata_json)
      VALUES (?, ?, ?)
    `).run(visitId, selectedCategory, metaJson);

    return { visitId, tokenNumber: nextToken, patientId: targetPatientId };
  });

  try {
    const result = transaction();
    res.status(201).json({
      success: true,
      message: `Patient visit created successfully with Token #${result.tokenNumber}`,
      data: result
    });
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateTriageStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Checked In', 'With Doctor', 'Pharmacy', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid triage status' });
    }

    const update = db.prepare(`UPDATE visits SET triage_status = ? WHERE id = ?`).run(status, id);

    if (update.changes === 0) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    res.json({ success: true, message: `Triage status updated to "${status}"` });
  } catch (error) {
    console.error('Error updating triage status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.recordConsultation = (req, res) => {
  const transaction = db.transaction(() => {
    const { id } = req.params;
    const { diagnosis, doctor_notes, bp, pulse, temp, spo2, prescriptions, next_status } = req.body;

    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(id);
    if (!visit) {
      throw new Error('Visit not found');
    }

    // Determine target triage status
    let targetStatus = next_status;
    if (!targetStatus) {
      targetStatus = prescriptions && prescriptions.length > 0 ? 'Pharmacy' : 'Completed';
    }

    db.prepare(`
      UPDATE visits 
      SET 
        diagnosis = COALESCE(?, diagnosis),
        doctor_notes = COALESCE(?, doctor_notes),
        bp = COALESCE(?, bp),
        pulse = COALESCE(?, pulse),
        temp = COALESCE(?, temp),
        spo2 = COALESCE(?, spo2),
        triage_status = ?
      WHERE id = ?
    `).run(
      diagnosis,
      doctor_notes,
      bp || visit.bp,
      pulse || visit.pulse,
      temp || visit.temp,
      spo2 || visit.spo2,
      targetStatus,
      id
    );

    // Save prescriptions if provided
    if (prescriptions && Array.isArray(prescriptions)) {
      const insertRx = db.prepare(`
        INSERT INTO prescriptions (visit_id, medicine_id, dosage, duration_days, quantity_prescribed, dispensed)
        VALUES (?, ?, ?, ?, ?, 0)
      `);

      for (const rx of prescriptions) {
        if (rx.medicine_id && rx.quantity_prescribed) {
          insertRx.run(
            id,
            rx.medicine_id,
            rx.dosage || 'As directed',
            rx.duration_days || 3,
            rx.quantity_prescribed
          );
        }
      }
    }

    return { id, targetStatus };
  });

  try {
    const result = transaction();
    res.json({
      success: true,
      message: `Consultation saved. Visit transitioned to "${result.targetStatus}".`,
      data: result
    });
  } catch (error) {
    console.error('Error recording consultation:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};
