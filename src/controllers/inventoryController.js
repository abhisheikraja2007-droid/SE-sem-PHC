const db = require('../config/database');

function computeMedicineStatus(med) {
  const now = new Date();
  const exp = new Date(med.expiry_date);
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

  if (med.quantity <= 0) {
    return {
      status: 'Out of Stock',
      level: 'danger',
      daysUntilExpiry: diffDays,
      message: 'Zero stock available! Immediate replenishment required.'
    };
  }
  if (med.quantity <= med.min_threshold) {
    return {
      status: 'Low Stock',
      level: 'warning',
      daysUntilExpiry: diffDays,
      message: `Stock level (${med.quantity} ${med.unit}) is below reorder threshold (${med.min_threshold} ${med.unit}).`
    };
  }
  if (diffDays <= 60) {
    return {
      status: 'Expiring Soon',
      level: 'alert',
      daysUntilExpiry: diffDays,
      message: `Batch expires in ${diffDays} day${diffDays === 1 ? '' : 's'}. Expedite utilization or replace.`
    };
  }
  return {
    status: 'Normal',
    level: 'healthy',
    daysUntilExpiry: diffDays,
    message: 'Stock levels healthy and within safe shelf life.'
  };
}

exports.getAllMedicines = (req, res) => {
  try {
    const { status, category, search } = req.query;

    let query = `SELECT * FROM medicines WHERE 1=1`;
    const params = [];

    if (category && category !== 'All') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (name LIKE ? OR code LIKE ? OR batch_number LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY name ASC`;

    const rawMedicines = db.prepare(query).all(...params);

    const medicines = rawMedicines.map(m => {
      const alertInfo = computeMedicineStatus(m);
      return {
        ...m,
        alertStatus: alertInfo.status,
        alertLevel: alertInfo.level,
        daysUntilExpiry: alertInfo.daysUntilExpiry,
        alertMessage: alertInfo.message
      };
    });

    // Filter by computed status if requested
    let filtered = medicines;
    if (status && status !== 'All') {
      filtered = medicines.filter(m => m.alertStatus.toLowerCase() === status.toLowerCase());
    }

    res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAlerts = (req, res) => {
  try {
    const all = db.prepare(`SELECT * FROM medicines`).all();
    const alerts = [];

    for (const med of all) {
      const info = computeMedicineStatus(med);
      if (info.status !== 'Normal') {
        alerts.push({
          id: med.id,
          code: med.code,
          name: med.name,
          category: med.category,
          batch_number: med.batch_number,
          quantity: med.quantity,
          min_threshold: med.min_threshold,
          unit: med.unit,
          expiry_date: med.expiry_date,
          status: info.status,
          level: info.level,
          daysUntilExpiry: info.daysUntilExpiry,
          message: info.message
        });
      }
    }

    // Sort: Out of Stock first, then Low Stock, then Expiring Soon
    const priority = { 'Out of Stock': 1, 'Low Stock': 2, 'Expiring Soon': 3 };
    alerts.sort((a, b) => (priority[a.status] || 4) - (priority[b.status] || 4));

    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (error) {
    console.error('Error fetching inventory alerts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addOrRestockMedicine = (req, res) => {
  try {
    const { name, category, batch_number, quantity, min_threshold, unit, expiry_date, unit_price } = req.body;

    if (!name || !batch_number || quantity === undefined || !expiry_date) {
      return res.status(400).json({ success: false, message: 'Name, batch number, quantity, and expiry date are required.' });
    }

    // Generate medicine code if not provided
    const lastMed = db.prepare(`SELECT id FROM medicines ORDER BY id DESC LIMIT 1`).get();
    const nextCode = `MED-${100 + ((lastMed ? lastMed.id : 0) + 1)}`;

    const insert = db.prepare(`
      INSERT INTO medicines (code, name, category, batch_number, quantity, min_threshold, unit, expiry_date, unit_price, last_restocked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = insert.run(
      nextCode,
      name.trim(),
      category || 'General',
      batch_number.trim(),
      parseInt(quantity, 10),
      parseInt(min_threshold || 20, 10),
      unit || 'Tablets',
      expiry_date,
      parseFloat(unit_price || 0)
    );

    res.status(201).json({
      success: true,
      message: `Medicine batch "${name}" [${batch_number}] added to inventory.`,
      medicineId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error adding medicine:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dispensePrescription = (req, res) => {
  const transaction = db.transaction(() => {
    const { prescription_id, medicine_id, quantity } = req.body;

    let targetPrescription = null;
    let targetMedicineId = medicine_id;
    let qtyToDispense = parseInt(quantity, 10) || 1;

    if (prescription_id) {
      targetPrescription = db.prepare(`SELECT * FROM prescriptions WHERE id = ?`).get(prescription_id);
      if (!targetPrescription) {
        throw new Error('Prescription record not found.');
      }
      if (targetPrescription.dispensed === 1) {
        throw new Error('This prescription item has already been dispensed.');
      }
      targetMedicineId = targetPrescription.medicine_id;
      qtyToDispense = targetPrescription.quantity_prescribed;
    }

    const medicine = db.prepare(`SELECT * FROM medicines WHERE id = ?`).get(targetMedicineId);
    if (!medicine) {
      throw new Error('Medicine not found in inventory.');
    }

    if (medicine.quantity < qtyToDispense) {
      throw new Error(`Insufficient stock for ${medicine.name}. Available: ${medicine.quantity} ${medicine.unit}, Requested: ${qtyToDispense} ${medicine.unit}`);
    }

    // Deduct stock
    const newQuantity = medicine.quantity - qtyToDispense;
    db.prepare(`UPDATE medicines SET quantity = ? WHERE id = ?`).run(newQuantity, targetMedicineId);

    // Update prescription if applicable
    if (targetPrescription) {
      db.prepare(`
        UPDATE prescriptions 
        SET dispensed = 1, dispensed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(targetPrescription.id);

      // Check if all prescriptions for this visit are now dispensed
      const remainingUnfulfilled = db.prepare(`
        SELECT COUNT(*) as count FROM prescriptions 
        WHERE visit_id = ? AND dispensed = 0
      `).get(targetPrescription.visit_id).count;

      if (remainingUnfulfilled === 0) {
        db.prepare(`UPDATE visits SET triage_status = 'Completed' WHERE id = ?`).run(targetPrescription.visit_id);
      }
    }

    return {
      medicineName: medicine.name,
      dispensedQuantity: qtyToDispense,
      remainingQuantity: newQuantity,
      unit: medicine.unit
    };
  });

  try {
    const result = transaction();
    res.json({
      success: true,
      message: `Successfully dispensed ${result.dispensedQuantity} ${result.unit} of ${result.medicineName}. Remaining stock: ${result.remainingQuantity} ${result.unit}.`,
      data: result
    });
  } catch (error) {
    console.error('Error dispensing medicine:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateStock = (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, delta, min_threshold } = req.body;

    const med = db.prepare(`SELECT * FROM medicines WHERE id = ?`).get(id);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    let updatedQty = med.quantity;
    if (delta !== undefined) {
      updatedQty = Math.max(0, med.quantity + parseInt(delta, 10));
    } else if (quantity !== undefined) {
      updatedQty = Math.max(0, parseInt(quantity, 10));
    }

    const updatedThreshold = min_threshold !== undefined ? parseInt(min_threshold, 10) : med.min_threshold;

    db.prepare(`
      UPDATE medicines 
      SET quantity = ?, min_threshold = ?, last_restocked = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(updatedQty, updatedThreshold, id);

    res.json({
      success: true,
      message: `Stock for ${med.name} updated to ${updatedQty} ${med.unit}.`,
      data: {
        id: med.id,
        name: med.name,
        quantity: updatedQty,
        min_threshold: updatedThreshold,
        unit: med.unit
      }
    });
  } catch (error) {
    console.error('Error updating medicine stock:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
