const db = require('../config/database');

exports.getAllStaff = (req, res) => {
  try {
    const staff = db.prepare(`SELECT * FROM staff WHERE is_active = 1 ORDER BY id ASC`).all();
    res.json({ success: true, count: staff.length, data: staff });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDutyRoster = (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const roster = db.prepare(`
      SELECT 
        dr.id,
        dr.staff_id,
        dr.shift_date,
        dr.shift_type,
        dr.duty_status,
        dr.notes,
        s.staff_code,
        s.name as staff_name,
        s.role as staff_role,
        s.contact as staff_contact,
        s.email as staff_email,
        s.qualifications
      FROM duty_roster dr
      JOIN staff s ON dr.staff_id = s.id
      WHERE dr.shift_date = ?
      ORDER BY 
        CASE 
          WHEN dr.shift_type LIKE 'Morning%' THEN 1
          WHEN dr.shift_type LIKE 'Evening%' THEN 2
          WHEN dr.shift_type LIKE 'Night%' THEN 3
          ELSE 4
        END,
        dr.id ASC
    `).all(targetDate);

    // Summary counts
    const onDutyCount = roster.filter(r => r.duty_status === 'On Duty').length;
    const emergencyOnCallCount = roster.filter(r => r.duty_status === 'Emergency Call' || r.shift_type.includes('Emergency')).length;
    const onLeaveCount = roster.filter(r => r.duty_status === 'On Leave').length;

    res.json({
      success: true,
      date: targetDate,
      summary: {
        totalRostered: roster.length,
        onDutyCount,
        emergencyOnCallCount,
        onLeaveCount
      },
      data: roster
    });
  } catch (error) {
    console.error('Error fetching duty roster:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignShift = (req, res) => {
  try {
    const { staff_id, shift_date, shift_type, duty_status, notes } = req.body;

    if (!staff_id || !shift_date || !shift_type) {
      return res.status(400).json({ success: false, message: 'Staff, shift date, and shift type are required.' });
    }

    const insert = db.prepare(`
      INSERT INTO duty_roster (staff_id, shift_date, shift_type, duty_status, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      staff_id,
      shift_date,
      shift_type,
      duty_status || 'On Duty',
      notes || ''
    );

    res.status(201).json({
      success: true,
      message: 'Staff shift assigned successfully',
      rosterId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error assigning shift:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDutyStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { duty_status, notes } = req.body;

    const validStatuses = ['On Duty', 'Off Duty', 'On Leave', 'Emergency Call'];
    if (duty_status && !validStatuses.includes(duty_status)) {
      return res.status(400).json({ success: false, message: 'Invalid duty status.' });
    }

    const current = db.prepare(`SELECT * FROM duty_roster WHERE id = ?`).get(id);
    if (!current) {
      return res.status(404).json({ success: false, message: 'Duty roster record not found.' });
    }

    db.prepare(`
      UPDATE duty_roster 
      SET duty_status = COALESCE(?, duty_status), notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(duty_status, notes, id);

    res.json({
      success: true,
      message: `Staff duty status updated to "${duty_status || current.duty_status}".`
    });
  } catch (error) {
    console.error('Error updating duty status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
