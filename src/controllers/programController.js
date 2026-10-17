const db = require('../config/database');

exports.getProgramData = (req, res) => {
  try {
    const { category } = req.params;

    // Normalizing category name
    const categoryMap = {
      'outpatient': 'Outpatient',
      'maternal-care': 'Maternal Care',
      'immunization': 'Immunization',
      'disease-prevention': 'Disease Prevention'
    };

    const targetCategory = categoryMap[category.toLowerCase()] || category;

    // Fetch visits under this program
    const visits = db.prepare(`
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
      WHERE v.program_category = ?
      ORDER BY v.id DESC
    `).all(targetCategory);

    const formattedVisits = visits.map(v => {
      let meta = {};
      try {
        if (v.metadata_json) meta = JSON.parse(v.metadata_json);
      } catch (e) {}
      return {
        ...v,
        metadata: meta
      };
    });

    // Compute category-specific telemetry
    let summaryMetrics = {};

    if (targetCategory === 'Outpatient') {
      const totalOpd = formattedVisits.length;
      const referrals = formattedVisits.filter(v => v.metadata.referral_needed).length;
      const chronicCases = formattedVisits.filter(v => v.metadata.chronic_disease).length;
      summaryMetrics = {
        totalPatients: totalOpd,
        referralsToDistrictHospital: referrals,
        chronicCareFollowups: chronicCases,
        triageCompleted: formattedVisits.filter(v => v.triage_status === 'Completed').length
      };
    } else if (targetCategory === 'Maternal Care') {
      const highRiskCases = formattedVisits.filter(v => v.metadata.high_risk);
      const firstTrimester = formattedVisits.filter(v => (v.metadata.trimester || '').includes('1st')).length;
      const secondTrimester = formattedVisits.filter(v => (v.metadata.trimester || '').includes('2nd')).length;
      const thirdTrimester = formattedVisits.filter(v => (v.metadata.trimester || '').includes('3rd')).length;

      summaryMetrics = {
        totalMaternalVisits: formattedVisits.length,
        highRiskPregnanciesCount: highRiskCases.length,
        trimesterBreakdown: {
          firstTrimester,
          secondTrimester,
          thirdTrimester
        },
        highRiskList: highRiskCases.map(c => ({
          patientName: c.patient_name,
          uhid: c.uhid,
          riskFactor: c.metadata.risk_factor,
          edd: c.metadata.edd
        }))
      };
    } else if (targetCategory === 'Immunization') {
      const scheduledToday = formattedVisits.length;
      const administered = formattedVisits.filter(v => v.triage_status === 'Completed').length;
      summaryMetrics = {
        totalImmunizationVisits: scheduledToday,
        dosesAdministered: administered,
        pendingAdministration: scheduledToday - administered,
        upcomingDuesCount: formattedVisits.filter(v => v.metadata.next_due_date).length
      };
    } else if (targetCategory === 'Disease Prevention') {
      const vectorBorne = formattedVisits.filter(v => (v.metadata.disease_group || '').includes('Vector')).length;
      const waterBorne = formattedVisits.filter(v => (v.metadata.disease_group || '').includes('Water')).length;
      const notifiableOutbreaks = formattedVisits.filter(v => v.metadata.notifiable_disease).length;
      summaryMetrics = {
        totalSurveillanceCases: formattedVisits.length,
        vectorBorneCount: vectorBorne,
        waterBorneCount: waterBorne,
        notifiableAlerts: notifiableOutbreaks,
        activeHotspots: [
          'North Village Ward 2 (Cluster: Fever & Joint Pains)',
          'Labor Settlement (Water sample surveillance)'
        ]
      };
    }

    res.json({
      success: true,
      category: targetCategory,
      summary: summaryMetrics,
      visits: formattedVisits
    });
  } catch (error) {
    console.error('Error fetching program details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
