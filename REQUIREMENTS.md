# Primary Health Centre (PHC) Monitoring and Management System
## Functional Scope & Problem Statement Specification

### 1. Context & Objective
Primary Health Centres (PHCs) act as the vital frontline interface between rural and semi-urban communities and public healthcare infrastructure. They deliver essential services across four major healthcare pillars:
- **Outpatient Care (OPD):** General consultations, triage, diagnosis, prescription, and visit logs.
- **Maternal and Child Healthcare:** Antenatal checks (ANC), postnatal care (PNC), high-risk pregnancy flagging, and infant monitoring.
- **Immunization Programs:** Routine pediatric and adult vaccination schedules, batch tracking, and due/overdue alerts.
- **Disease Prevention & Awareness:** Vector-borne, water-borne, and non-communicable disease surveillance, outbreak tracing, and community health camps.

### 2. Core Operational Challenges Addressed
- **Fragmented Patient Visit Tracking:** Long queues, manual register bottlenecks, lost history, lack of centralized consultation history.
- **Medicine Stockouts & Expiry Wastage:** Inadequate inventory visibility leading to sudden depletion of essential drugs or expired medicine batches.
- **Staff Duty & Resource Monitoring:** Roster mismanagement, doctor/nurse absenteeism, unbalanced emergency coverage across shifts.
- **Program-Level Reporting Lag:** Time-consuming manual paper summaries delayed up to weeks, hindering prompt public health decision-making.

### 3. Functional Requirements

#### 3.1 Patient Visit & Registration Tracking
- Patient profile creation with demographic details (Govt ID/Aadhaar/ABHA ID, age, gender, contact, village/ward).
- Daily token/queue generation with visit triage status (`Checked In`, `With Doctor`, `Pharmacy`, `Completed`).
- Consultation records with symptoms, vital signs (BP, Pulse, Temperature, SpO2), diagnoses, and digital prescriptions.
- Patient visit history timeline and search filter by ID/name/date.

#### 3.2 Health Program Categorization & Specialized Workflows
- **Outpatient Care (OPD):** General complaints, vitals, doctor notes, and referral tracking to District Hospitals.
- **Maternal & Child Care:** Trimester logging, expected delivery date (EDD), maternal risk indicator, infant birth weight, and developmental milestones.
- **Immunization:** Vaccine scheduling (BCG, OPV, Pentavalent, Measles/MR, etc.), administered doses, due lists, and overdue follow-up lists.
- **Disease Prevention & Epidemic Surveillance:** Syndromic disease alerts (e.g., Dengue, Malaria, TB, Cholera, COVID-19/Flu clusters), geographical hot-spot mapping, and community outreach campaign tracking.

#### 3.3 Medicine Inventory & Real-Time Stock Alerts
- Drug inventory catalog: Brand/generic name, category (Antibiotics, Analgesics, Vaccines, IV Fluids, Essential Kits), unit, batch number, and expiry date.
- Real-time stock levels with reorder thresholds (Critical Low, Moderate, Normal, Excess).
- Automatic stock deduction when prescribed and dispensed at the pharmacy station.
- Visual alerts and notification badges for:
  - Low stock warning (`< threshold`).
  - Near-expiry warning (within 30/60/90 days).
  - Out of stock / depleted items.
- Medicine stock receipt/restock logging and dispensing audit logs.

#### 3.4 Staff Duty & Shift Monitoring
- Staff directory with roles (Medical Officer, Staff Nurse, Pharmacist, Lab Technician, ANM, ASHA worker).
- Weekly/monthly duty roster scheduler across shifts (Morning, Evening, Night, On-Call Emergency).
- Daily attendance check-in/check-out and duty status indicators (`On Duty`, `On Leave`, `Emergency Call`, `Off Duty`).
- Shift handover notes and on-duty coverage metrics for 24x7 readiness.

#### 3.5 Real-Time Operational Analytics & Dashboard
- Key performance indicators: Total today's visits, visits by program category, pending prescriptions, low stock count, staff on duty.
- Trend charts: Daily patient footfall over 14/30 days, top diagnosed ailments, vaccine coverage percentages.
- Exportable regulatory reporting (CSV / PDF ready summary formats).

### 4. Technical Architecture
- **Backend:** Node.js + Express.js modular REST API with Clean Architecture / layered routes, controllers, and services.
- **Data Persistence:** SQLite with lightweight ORM / query builder for zero-config, portable, file-based persistence or Prisma/better-sqlite3.
- **Frontend:** Responsive Tailwind CSS UI (modern aesthetic, clean hospital dashboard palette: slate, emerald/cyan accents, accessible typography, interactive micro-interactions, responsive mobile/tablet/desktop layouts).
- **Validation & Security:** Input sanitization, structured JSON schema validation, error handling middleware, and audit logs.
