const db = require('../config/database');

function seedDatabase() {
  console.log('Seeding Primary Health Centre database...');

  // Clear existing data in correct foreign key order
  db.exec(`
    DELETE FROM prescriptions;
    DELETE FROM program_details;
    DELETE FROM visits;
    DELETE FROM patients;
    DELETE FROM medicines;
    DELETE FROM duty_roster;
    DELETE FROM staff;
    DELETE FROM sqlite_sequence;
  `);

  // 1. Staff Members
  const insertStaff = db.prepare(`
    INSERT INTO staff (staff_code, name, role, contact, email, qualifications, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const staffMembers = [
    ['STF-001', 'Dr. Rajesh Sharma, MBBS, MD', 'Medical Officer', '+91 98765 43210', 'dr.rajesh@phc.gov.in', 'MBBS, MD (Community Medicine)', 1],
    ['STF-002', 'Dr. Meenakshi Sundaram, MBBS', 'Assistant Medical Officer', '+91 98765 43211', 'dr.meenakshi@phc.gov.in', 'MBBS, DGO', 1],
    ['STF-003', 'Priya Nair, B.Sc Nursing', 'Senior Staff Nurse', '+91 98765 43212', 'priya.n@phc.gov.in', 'B.Sc Nursing, Critical Care Cert', 1],
    ['STF-004', 'K. Venkatesh, D.Pharm', 'Head Pharmacist', '+91 98765 43213', 'venkatesh.k@phc.gov.in', 'D.Pharm, 12 yrs exp', 1],
    ['STF-005', 'Ananya Roy, DMLT', 'Laboratory Technician', '+91 98765 43214', 'ananya.roy@phc.gov.in', 'B.Sc MLT', 1],
    ['STF-006', 'Sunita Devi', 'Auxiliary Nurse Midwife (ANM)', '+91 98765 43215', 'sunita.anm@phc.gov.in', 'Diploma in Nursing Midwifery', 1],
    ['STF-007', 'Mohan Kumar', 'Health Inspector / Epidemiologist', '+91 98765 43216', 'mohan.hi@phc.gov.in', 'Diploma in Sanitary Health', 1],
    ['STF-008', 'Lakshmi Bai', 'Senior ASHA Coordinator', '+91 98765 43217', 'lakshmi.asha@phc.gov.in', 'Certified Community Health Facilitator', 1]
  ];

  for (const s of staffMembers) {
    insertStaff.run(...s);
  }

  // 2. Duty Roster (Today & Tomorrow)
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const insertRoster = db.prepare(`
    INSERT INTO duty_roster (staff_id, shift_date, shift_type, duty_status, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const rosterEntries = [
    [1, today, 'Morning (08:00 - 14:00)', 'On Duty', 'OPD Consultations & In-Charge'],
    [2, today, 'Evening (14:00 - 20:00)', 'On Duty', 'Maternal Clinic & General OPD'],
    [3, today, 'Morning (08:00 - 14:00)', 'On Duty', 'Triage & Immunization Room'],
    [4, today, 'Morning (08:00 - 14:00)', 'On Duty', 'Pharmacy Counter & Inventory Check'],
    [5, today, 'Morning (08:00 - 14:00)', 'On Duty', 'Pathology Lab: Blood & Urine Tests'],
    [6, today, 'Morning (08:00 - 14:00)', 'On Duty', 'Field Visit & Home Postnatal Checks'],
    [7, today, 'Morning (08:00 - 14:00)', 'On Duty', 'Vector-Borne Disease Fogging Review'],
    [1, today, 'Night (20:00 - 08:00)', 'Emergency On-Call', 'Emergency Response Contact'],
    [3, today, 'Night (20:00 - 08:00)', 'Off Duty', 'Rest cycle after morning shift'],
    [2, tomorrow, 'Morning (08:00 - 14:00)', 'On Duty', 'Scheduled Morning Shift'],
    [4, tomorrow, 'Morning (08:00 - 14:00)', 'On Duty', 'Scheduled Pharmacy Shift']
  ];

  for (const r of rosterEntries) {
    insertRoster.run(...r);
  }

  // 3. Medicine Inventory (including normal stock, critical low stock, expiring soon, and out of stock)
  const insertMed = db.prepare(`
    INSERT INTO medicines (code, name, category, batch_number, quantity, min_threshold, unit, expiry_date, unit_price, last_restocked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Expiry dates calculation
  const getFutureDate = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const medicinesList = [
    // Normal stock
    ['MED-101', 'Paracetamol 500mg', 'Antipyretic', 'BATCH-PCM-991', 1200, 200, 'Tablets', getFutureDate(360), 0.50, today],
    ['MED-102', 'Amoxicillin 500mg', 'Antibiotic', 'BATCH-AMX-442', 450, 100, 'Capsules', getFutureDate(280), 3.20, today],
    ['MED-103', 'ORS (Oral Rehydration Salts)', 'Essential Fluids', 'BATCH-ORS-118', 600, 150, 'Sachets', getFutureDate(400), 4.50, today],
    ['MED-104', 'Iron & Folic Acid (IFA)', 'Maternal Nutrition', 'BATCH-IFA-882', 1500, 300, 'Tablets', getFutureDate(320), 0.80, today],
    ['MED-105', 'Metformin 500mg', 'Chronic / NCD', 'BATCH-MET-331', 800, 150, 'Tablets', getFutureDate(450), 1.20, today],
    ['MED-106', 'Amlodipine 5mg', 'Chronic / NCD', 'BATCH-AML-772', 650, 120, 'Tablets', getFutureDate(500), 1.10, today],
    
    // Critical Low Stock Alerts (< min_threshold)
    ['MED-107', 'Ciprofloxacin 500mg', 'Antibiotic', 'BATCH-CIP-201', 18, 50, 'Tablets', getFutureDate(180), 4.00, today],
    ['MED-108', 'Dextrose Normal Saline (DNS 500ml)', 'IV Fluid', 'BATCH-DNS-009', 6, 25, 'Bottles', getFutureDate(190), 32.00, today],
    ['MED-109', 'Cetirizine 10mg', 'Antihistamine', 'BATCH-CET-551', 14, 60, 'Tablets', getFutureDate(240), 1.50, today],
    
    // Near Expiry Alert (< 60 days)
    ['MED-110', 'Anti-Rabies Vaccine (ARV 0.5ml)', 'Vaccine', 'BATCH-ARV-901', 35, 10, 'Vials', getFutureDate(22), 350.00, today],
    ['MED-111', 'Tetanus Toxoid (TT 0.5ml)', 'Vaccine', 'BATCH-TT-312', 40, 15, 'Ampoules', getFutureDate(38), 18.00, today],
    ['MED-112', 'Artemether + Lumefantrine', 'Antimalarial', 'BATCH-ACT-702', 12, 20, 'Strips', getFutureDate(45), 65.00, today],

    // Out of Stock
    ['MED-113', 'Azithromycin 500mg', 'Antibiotic', 'BATCH-AZI-600', 0, 40, 'Tablets', getFutureDate(200), 12.00, today],
    
    // Standard Routine Vaccines
    ['MED-114', 'Pentavalent Vaccine (DPT+HepB+Hib)', 'Vaccine', 'BATCH-PNT-881', 85, 20, 'Vials', getFutureDate(300), 120.00, today],
    ['MED-115', 'Oral Polio Vaccine (bOPV)', 'Vaccine', 'BATCH-OPV-411', 120, 30, 'Vials', getFutureDate(240), 45.00, today],
    ['MED-116', 'Measles-Rubella (MR) Vaccine', 'Vaccine', 'BATCH-MR-229', 70, 20, 'Vials', getFutureDate(210), 95.00, today]
  ];

  for (const m of medicinesList) {
    insertMed.run(...m);
  }

  // 4. Patients
  const insertPatient = db.prepare(`
    INSERT INTO patients (uhid, full_name, age, gender, contact, address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const patientsList = [
    ['PHC-2026-001', 'Ramesh Chandra Verma', 48, 'Male', '+91 94123 45678', 'House 42, North Village, Sector 3'],
    ['PHC-2026-002', 'Kavitha Murugan', 26, 'Female', '+91 94123 45679', 'Plot 12, Lakshmi Nagar, Ward 4'],
    ['PHC-2026-003', 'Baby Aarav (c/o Deepa)', 1, 'Male', '+91 94123 45680', 'Ganga Colony, Rural Block A'],
    ['PHC-2026-004', 'Suresh Babu', 35, 'Male', '+91 94123 45681', 'Near Old Panchayat Office, Ward 2'],
    ['PHC-2026-005', 'Meera Rajput', 23, 'Female', '+91 94123 45682', 'Riverbank Tola, Sector 1'],
    ['PHC-2026-006', 'Harish Patel', 62, 'Male', '+91 94123 45683', 'Farmstead 8B, West Outskirts'],
    ['PHC-2026-007', 'Baby Ananya (c/o Pooja)', 0, 'Female', '+91 94123 45684', 'Main Street, Gram Panchayat Ward 5'],
    ['PHC-2026-008', 'Dinesh Gowda', 29, 'Male', '+91 94123 45685', 'Camp Road, Labor Settlement'],
    ['PHC-2026-009', 'Savithri Bai', 55, 'Female', '+91 94123 45686', 'House 19, Weaver Colony'],
    ['PHC-2026-010', 'Sunil Yadav', 31, 'Male', '+91 94123 45687', 'Bazaar Street, Shop 4B']
  ];

  for (const p of patientsList) {
    insertPatient.run(...p);
  }

  // 5. Visits and Program Details
  const insertVisit = db.prepare(`
    INSERT INTO visits (patient_id, token_number, visit_date, program_category, triage_status, symptoms, bp, pulse, temp, spo2, diagnosis, doctor_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProgramDetail = db.prepare(`
    INSERT INTO program_details (visit_id, program_category, metadata_json)
    VALUES (?, ?, ?)
  `);

  const visitsData = [
    // 1: Outpatient - Completed
    {
      patient_id: 1,
      token: 1,
      category: 'Outpatient',
      status: 'Completed',
      symptoms: 'High fever, body ache, dry cough for 3 days',
      bp: '124/82',
      pulse: 88,
      temp: 101.4,
      spo2: 98,
      diagnosis: 'Acute Upper Respiratory Tract Viral Infection',
      notes: 'Prescribed antipyretic and oral hydration. Rest advised for 3 days.',
      metadata: {
        referral_needed: false,
        follow_up_days: 3,
        chief_complaint: 'Fever and myalgia'
      }
    },
    // 2: Maternal Care - In Consultation
    {
      patient_id: 2,
      token: 2,
      category: 'Maternal Care',
      status: 'With Doctor',
      symptoms: 'Routine 2nd Trimester Antenatal Checkup, mild pedal edema',
      bp: '142/92',
      pulse: 84,
      temp: 98.6,
      spo2: 99,
      diagnosis: 'ANC Gestational Week 26 - Mild Gestational Hypertension Risk',
      notes: 'Monitored BP elevation. Scheduled weekly review. Advised salt restriction and IFA tablets.',
      metadata: {
        trimester: '2nd Trimester (26 Weeks)',
        gravida_para: 'G2 P1 L1',
        edd: getFutureDate(98),
        high_risk: true,
        risk_factor: 'Elevated systolic/diastolic BP (142/92 mmHg), mild pedal swelling',
        hb_level: '10.8 g/dL'
      }
    },
    // 3: Immunization - Pharmacy / Awaiting Vaccine
    {
      patient_id: 3,
      token: 3,
      category: 'Immunization',
      status: 'Pharmacy',
      symptoms: 'Scheduled 10-week infant immunization visit',
      bp: 'N/A',
      pulse: 110,
      temp: 98.4,
      spo2: 99,
      diagnosis: 'Routine National Immunization Schedule - Dose 2',
      notes: 'Infant healthy, weight 5.4 kg. Clear for Pentavalent-2 & bOPV-2 administration.',
      metadata: {
        vaccine_name: 'Pentavalent-2 + bOPV-2',
        dose_number: '2nd Dose',
        child_weight_kg: 5.4,
        next_due_date: getFutureDate(28),
        adverse_events_prior: 'None reported'
      }
    },
    // 4: Disease Prevention - Checked In / Queue
    {
      patient_id: 4,
      token: 4,
      category: 'Disease Prevention',
      status: 'Checked In',
      symptoms: 'Chills, joint pain, retro-orbital pain, vomiting for 2 days',
      bp: '110/70',
      pulse: 94,
      temp: 102.8,
      spo2: 97,
      diagnosis: 'Pending Triage - Suspected Vector-Borne Arboviral Illness (Dengue/Chikungunya)',
      notes: 'Triage nurse ordered immediate NS1 rapid antigen & platelet count.',
      metadata: {
        disease_group: 'Vector-Borne Disease Surveillance',
        suspected_condition: 'Dengue Fever / Arbovirus',
        hotspot_cluster: 'North Village Ward 2 (Cluster of 4 fevers reported)',
        lab_ordered: 'NS1 Rapid Antigen & Dengue IgM',
        notifiable_disease: true
      }
    },
    // 5: Maternal Care - Pharmacy
    {
      patient_id: 5,
      token: 5,
      category: 'Maternal Care',
      status: 'Pharmacy',
      symptoms: '1st Trimester Registration, severe morning nausea, fatigue',
      bp: '118/74',
      pulse: 80,
      temp: 98.2,
      spo2: 99,
      diagnosis: 'ANC Registration Week 10 - Mild Hyperemesis Gravidarum',
      notes: 'Ultrasound confirmed intrauterine pregnancy. Prescribed Doxylamine + Pyridoxine and Folic Acid.',
      metadata: {
        trimester: '1st Trimester (10 Weeks)',
        gravida_para: 'G1 P0',
        edd: getFutureDate(210),
        high_risk: false,
        hb_level: '11.5 g/dL'
      }
    },
    // 6: Outpatient - With Doctor
    {
      patient_id: 6,
      token: 6,
      category: 'Outpatient',
      status: 'With Doctor',
      symptoms: 'Chronic knee joint pain, morning stiffness, elevated fasting sugars',
      bp: '138/86',
      pulse: 76,
      temp: 98.4,
      spo2: 97,
      diagnosis: 'Type 2 Diabetes Mellitus & Osteoarthritis Bilateral Knees',
      notes: 'Adjusted Metformin dosage. Advised physiotherapy exercises and low glycemic diet.',
      metadata: {
        chronic_disease: true,
        hba1c: '7.8%',
        referral_needed: false
      }
    },
    // 7: Immunization - Completed
    {
      patient_id: 7,
      token: 7,
      category: 'Immunization',
      status: 'Completed',
      symptoms: 'Birth dose vaccination completed (BCG, OPV-0, Hepatitis B birth dose)',
      bp: 'N/A',
      pulse: 124,
      temp: 98.6,
      spo2: 99,
      diagnosis: 'Birth Immunization Administered Successfully',
      notes: 'Mother given MCP card and scheduled for 6-week immunization visit.',
      metadata: {
        vaccine_name: 'BCG + bOPV-0 + HepB Birth Dose',
        dose_number: 'Birth Dose',
        child_weight_kg: 3.1,
        next_due_date: getFutureDate(42),
        batch_logged: 'BATCH-OPV-411'
      }
    },
    // 8: Disease Prevention - Completed
    {
      patient_id: 8,
      token: 8,
      category: 'Disease Prevention',
      status: 'Completed',
      symptoms: 'Acute watery diarrhea and dehydration after consuming local borewell water',
      bp: '102/68',
      pulse: 102,
      temp: 99.2,
      spo2: 98,
      diagnosis: 'Acute Water-Borne Gastroenteritis with Moderate Dehydration',
      notes: 'Administered 1L IV DNS and ORS. Sanitary inspector notified for water chlorine test in labor settlement.',
      metadata: {
        disease_group: 'Water-Borne Disease Surveillance',
        suspected_condition: 'Acute Secretory Diarrheal Outbreak',
        water_sample_collected: true,
        notifiable_disease: true
      }
    }
  ];

  for (const v of visitsData) {
    const res = insertVisit.run(
      v.patient_id,
      v.token,
      today,
      v.category,
      v.status,
      v.symptoms,
      v.bp,
      v.pulse,
      v.temp,
      v.spo2,
      v.diagnosis,
      v.notes
    );
    const visitId = res.lastInsertRowid;
    insertProgramDetail.run(visitId, v.category, JSON.stringify(v.metadata));
  }

  // 6. Prescriptions & Dispensations
  const insertRx = db.prepare(`
    INSERT INTO prescriptions (visit_id, medicine_id, dosage, duration_days, quantity_prescribed, dispensed, dispensed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const prescriptionsData = [
    // For Visit 1 (Completed)
    [1, 1, '1 tablet thrice daily after food', 3, 9, 1, new Date().toISOString()],
    [1, 3, '1 sachet dissolved in 1L water', 2, 2, 1, new Date().toISOString()],

    // For Visit 3 (Immunization at Pharmacy)
    [3, 14, '0.5ml IM single dose', 1, 1, 0, null],
    [3, 15, '2 drops oral', 1, 1, 0, null],

    // For Visit 5 (Maternal Care at Pharmacy)
    [5, 4, '1 tablet daily after lunch', 30, 30, 0, null],

    // For Visit 8 (Completed Gastroenteritis)
    [8, 3, '2 sachets daily with water', 3, 6, 1, new Date().toISOString()]
  ];

  for (const rx of prescriptionsData) {
    insertRx.run(...rx);
  }

  console.log('Database successfully seeded with realistic PHC operational data!');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
