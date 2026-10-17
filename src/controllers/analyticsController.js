const db = require('../config/database');

exports.getKpis = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM visits WHERE visit_date = ?`).get(today).count;
    
    const activeQueue = db.prepare(`
      SELECT COUNT(*) as count FROM visits 
      WHERE visit_date = ? AND triage_status IN ('Checked In', 'With Doctor', 'Pharmacy')
    `).get(today).count;

    const completedVisits = db.prepare(`
      SELECT COUNT(*) as count FROM visits 
      WHERE visit_date = ? AND triage_status = 'Completed'
    `).get(today).count;

    // Medicines alerts
    const totalMedicines = db.prepare(`SELECT COUNT(*) as count FROM medicines`).get().count;
    
    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM medicines 
      WHERE quantity <= min_threshold
    `).get().count;

    // Expiring within 60 days
    const sixtyDaysLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiringSoonCount = db.prepare(`
      SELECT COUNT(*) as count FROM medicines 
      WHERE expiry_date <= ? AND quantity > 0
    `).get(sixtyDaysLater).count;

    // Staff on duty today
    const onDutyStaff = db.prepare(`
      SELECT COUNT(*) as count FROM duty_roster 
      WHERE shift_date = ? AND duty_status = 'On Duty'
    `).get(today).count;

    // High risk maternal cases
    const highRiskMaternal = db.prepare(`
      SELECT COUNT(*) as count FROM program_details 
      WHERE program_category = 'Maternal Care' AND metadata_json LIKE '%"high_risk":true%'
    `).get().count;

    // Communicable disease surveillance alerts
    const outbreakAlerts = db.prepare(`
      SELECT COUNT(*) as count FROM program_details 
      WHERE program_category = 'Disease Prevention' AND metadata_json LIKE '%"notifiable_disease":true%'
    `).get().count;

    res.json({
      success: true,
      data: {
        todayVisits,
        activeQueue,
        completedVisits,
        totalMedicines,
        lowStockCount,
        expiringSoonCount,
        onDutyStaff,
        highRiskMaternal,
        outbreakAlerts
      }
    });
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTrends = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Program Category Distribution
    const programDistribution = db.prepare(`
      SELECT program_category, COUNT(*) as count 
      FROM visits 
      GROUP BY program_category
    `).all();

    // Triage Status Breakdown for today
    const statusBreakdown = db.prepare(`
      SELECT triage_status, COUNT(*) as count 
      FROM visits 
      WHERE visit_date = ? 
      GROUP BY triage_status
    `).all(today);

    // Recent 7 Days visits (or mocked distribution for graph)
    const sevenDaysVisits = [
      { date: 'Day -6', visits: 18 },
      { date: 'Day -5', visits: 24 },
      { date: 'Day -4', visits: 21 },
      { date: 'Day -3', visits: 29 },
      { date: 'Day -2', visits: 26 },
      { date: 'Yesterday', visits: 31 },
      { date: 'Today', visits: programDistribution.reduce((acc, curr) => acc + curr.count, 0) }
    ];

    res.json({
      success: true,
      data: {
        programDistribution,
        statusBreakdown,
        sevenDaysVisits
      }
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
