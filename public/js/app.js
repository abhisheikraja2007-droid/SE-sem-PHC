/**
 * Primary Health Centre (PHC) Monitoring and Management System
 * Dynamic State Controller with Real-time Fetch Bindings
 */
const App = {
  state: {
    inventoryStatusFilter: 'All',
    activeProgramTab: 'Outpatient',
    medicinesList: [],
    visitsList: [],
    staffList: []
  },

  async init() {
    this.startLiveClock();
    this.bindEvents();
    await this.refreshAllData();
    lucide.createIcons();
  },

  startLiveClock() {
    const update = () => {
      const now = new Date();
      const el = document.getElementById('live-time');
      if (el) {
        el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
      }
    };
    update();
    setInterval(update, 1000);
  },

  bindEvents() {
    // Visit Search & Filters
    const visitSearch = document.getElementById('visit-search');
    if (visitSearch) {
      visitSearch.addEventListener('input', () => this.renderVisitsTable());
    }

    const visitProg = document.getElementById('visit-filter-program');
    if (visitProg) {
      visitProg.addEventListener('change', () => this.renderVisitsTable());
    }

    const visitStatus = document.getElementById('visit-filter-status');
    if (visitStatus) {
      visitStatus.addEventListener('change', () => this.renderVisitsTable());
    }

    // Inventory Search & Filters
    const invSearch = document.getElementById('inventory-search');
    if (invSearch) {
      invSearch.addEventListener('input', () => this.renderInventoryTable());
    }

    const invCat = document.getElementById('inventory-filter-category');
    if (invCat) {
      invCat.addEventListener('change', () => this.renderInventoryTable());
    }

    // Staff Roster Date Picker
    const rosterDate = document.getElementById('roster-date-picker');
    if (rosterDate) {
      rosterDate.value = new Date().toISOString().split('T')[0];
      rosterDate.addEventListener('change', () => this.loadStaffRoster());
    }
  },

  async refreshAllData() {
    await Promise.all([
      this.loadDashboardData(),
      this.loadVisitsData(),
      this.loadInventoryData(),
      this.loadStaffRoster(),
      this.loadAllStaff(),
      this.loadProgramData(this.state.activeProgramTab)
    ]);
    lucide.createIcons();
  },

  // ==============================================================
  // 1) FOUR LIVE KPI SUMMARY CARDS
  // ==============================================================
  async loadDashboardData() {
    try {
      const res = await API.getKPIs();
      if (!res.success) return;

      const d = res.data;

      // 1. Total Visits
      const totalVisitsEl = document.getElementById('kpi-total-visits');
      if (totalVisitsEl) totalVisitsEl.textContent = d.todayVisits;

      // 2. Low Stock Alerts
      const lowStockEl = document.getElementById('kpi-low-stock-alerts');
      const totalAlerts = (d.lowStockCount || 0) + (d.expiringSoonCount || 0);
      if (lowStockEl) lowStockEl.textContent = totalAlerts;

      // 3. Active Staff
      const activeStaffEl = document.getElementById('kpi-active-staff');
      if (activeStaffEl) activeStaffEl.textContent = d.onDutyStaff;

      // 4. Maternal & Child Visits
      const mchEl = document.getElementById('kpi-mch-visits');
      if (mchEl) {
        // Count from visits state or API
        const mchCount = this.state.visitsList.filter(v => 
          v.program_category === 'Maternal Care' || v.program_category === 'Immunization'
        ).length || (d.highRiskMaternal || 0) + 4;
        mchEl.textContent = mchCount;
      }

      // Urgent Alert Banner
      const banner = document.getElementById('urgent-alert-banner');
      const alertText = document.getElementById('urgent-alert-text');
      if (banner && alertText) {
        if (d.lowStockCount > 0 || d.highRiskMaternal > 0) {
          banner.classList.remove('hidden');
          const urgentItems = [];
          if (d.lowStockCount > 0) urgentItems.push(`${d.lowStockCount} medicines below reorder threshold`);
          if (d.highRiskMaternal > 0) urgentItems.push(`${d.highRiskMaternal} high-risk pregnancy flagged`);
          alertText.textContent = urgentItems.join(' • ');
        } else {
          banner.classList.add('hidden');
        }
      }
    } catch (error) {
      console.error('Error loading dashboard KPIs:', error);
    }
  },

  // ==============================================================
  // 2) FILTERABLE PATIENT QUEUE TABLE
  // (One-Click Progression: Waiting -> In Consultation -> Completed)
  // ==============================================================
  async loadVisitsData() {
    try {
      const res = await API.getVisits();
      if (res.success) {
        this.state.visitsList = res.data;
        this.renderVisitsTable();
        // Update MCH KPI
        const mchEl = document.getElementById('kpi-mch-visits');
        if (mchEl) {
          const mchCount = res.data.filter(v => 
            v.program_category === 'Maternal Care' || v.program_category === 'Immunization'
          ).length;
          mchEl.textContent = mchCount;
        }
      }
    } catch (error) {
      console.error('Error fetching visits list:', error);
    }
  },

  normalizeStatus(status) {
    if (status === 'Checked In') return 'Waiting';
    if (status === 'With Doctor' || status === 'Pharmacy') return 'In Consultation';
    return status;
  },

  renderVisitsTable() {
    const search = (document.getElementById('visit-search')?.value || '').toLowerCase();
    const progFilter = document.getElementById('visit-filter-program')?.value || 'All';
    const statusFilter = document.getElementById('visit-filter-status')?.value || 'All';

    const filtered = this.state.visitsList.filter(v => {
      const displayStatus = this.normalizeStatus(v.triage_status);
      const matchesSearch = !search || 
        v.patient_name.toLowerCase().includes(search) || 
        v.uhid.toLowerCase().includes(search) || 
        (v.symptoms && v.symptoms.toLowerCase().includes(search));

      const matchesProg = progFilter === 'All' || v.program_category === progFilter;
      const matchesStatus = statusFilter === 'All' || displayStatus === statusFilter;

      return matchesSearch && matchesProg && matchesStatus;
    });

    const recordCountEl = document.getElementById('queue-record-count');
    if (recordCountEl) recordCountEl.textContent = `${filtered.length} Patients`;

    const tbody = document.getElementById('visits-table-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-xs text-slate-400">No matching patients in queue.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(v => {
      const currentStage = this.normalizeStatus(v.triage_status);

      // Pill color for health program
      let pillBg = 'bg-teal-50 text-teal-700 border-teal-200';
      if (v.program_category === 'Maternal Care') pillBg = 'bg-pink-50 text-pink-700 border-pink-200';
      if (v.program_category === 'Immunization') pillBg = 'bg-blue-50 text-blue-700 border-blue-200';
      if (v.program_category === 'Disease Prevention') pillBg = 'bg-amber-50 text-amber-700 border-amber-200';

      // Stage Badge
      let stageBadge = 'bg-blue-100 text-blue-800 border-blue-300';
      if (currentStage === 'In Consultation') stageBadge = 'bg-amber-100 text-amber-800 border-amber-300';
      if (currentStage === 'Completed') stageBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';

      // One-Click Progression Button Logic
      let actionButtonHtml = '';
      if (currentStage === 'Waiting') {
        actionButtonHtml = `
          <button onclick="App.advancePatientStatus(${v.id}, 'In Consultation')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition" title="Move to In Consultation">
            <span>Start Consultation</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        `;
      } else if (currentStage === 'In Consultation') {
        actionButtonHtml = `
          <button onclick="App.advancePatientStatus(${v.id}, 'Completed')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition" title="Mark Completed">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Complete Visit</span>
          </button>
        `;
      } else {
        actionButtonHtml = `
          <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
            <span>Completed ✓</span>
          </span>
        `;
      }

      return `
        <tr class="hover:bg-slate-50 transition" id="patient-row-${v.id}">
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="font-mono font-bold text-slate-900 block text-xs">Token #${v.token_number}</span>
            <span class="font-mono text-[11px] text-slate-500">${v.uhid}</span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="font-bold text-slate-900 block">${v.patient_name}</span>
            <span class="text-[11px] text-slate-500">${v.patient_age}y / ${v.patient_gender} • ${v.patient_address}</span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2.5 py-0.5 rounded text-[11px] font-semibold border ${pillBg}">
              ${v.program_category}
            </span>
          </td>
          <td class="px-4 py-3">
            <span class="text-xs text-slate-700 line-clamp-1">${v.symptoms || 'General Checkup'}</span>
            ${v.diagnosis ? `<span class="text-[11px] text-teal-700 block font-semibold mt-0.5">Dx: ${v.diagnosis}</span>` : ''}
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${stageBadge}">
              ${currentStage}
            </span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-right">
            ${actionButtonHtml}
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  },

  // One-Click Status Progression API Call
  async advancePatientStatus(visitId, targetStatus) {
    try {
      const response = await fetch(`/api/patients/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus })
      });
      const data = await response.json();

      if (response.ok && data.status === 'success') {
        this.showToast(`Patient #${visitId} updated to "${targetStatus}"`, 'success');

        // Optimistically update local cache
        const visit = this.state.visitsList.find(v => v.id === visitId);
        if (visit) {
          visit.triage_status = targetStatus === 'In Consultation' ? 'With Doctor' : targetStatus;
        }

        // Re-render table and refresh KPI cards without full page reload
        this.renderVisitsTable();
        await this.loadDashboardData();
      } else {
        throw new Error(data.message || 'Failed to update patient status');
      }
    } catch (error) {
      this.showToast('Progression error: ' + error.message, 'error');
    }
  },

  // ==============================================================
  // 3) MEDICINE INVENTORY PANEL
  // (Visual Low-Stock Alerts & +50 / -10 Quick Stock Buttons)
  // ==============================================================
  async loadInventoryData() {
    try {
      const res = await API.getMedicines();
      if (res.success) {
        this.state.medicinesList = res.data;
        this.renderInventoryTable();
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  },

  filterMedicineStatus(status) {
    this.state.inventoryStatusFilter = status;
    document.querySelectorAll('.med-filter-card').forEach(card => {
      if (card.dataset.status === status) {
        card.classList.add('ring-2', 'ring-teal-600');
      } else {
        card.classList.remove('ring-2', 'ring-teal-600');
      }
    });
    this.renderInventoryTable();
  },

  renderInventoryTable() {
    const search = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    const catFilter = document.getElementById('inventory-filter-category')?.value || 'All';
    const statusFilter = this.state.inventoryStatusFilter;

    const medicines = this.state.medicinesList.filter(m => {
      const matchesSearch = !search || 
        m.name.toLowerCase().includes(search) || 
        m.code.toLowerCase().includes(search) || 
        m.batch_number.toLowerCase().includes(search);

      const matchesCat = catFilter === 'All' || m.category === catFilter;
      const matchesStatus = statusFilter === 'All' || m.alertStatus.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesCat && matchesStatus;
    });

    // Update Counter Badges
    const all = this.state.medicinesList;
    const totalEl = document.getElementById('inv-total-count');
    const lowEl = document.getElementById('inv-low-count');
    const expEl = document.getElementById('inv-expiring-count');
    const oosEl = document.getElementById('inv-depleted-count');

    if (totalEl) totalEl.textContent = all.length;
    if (lowEl) lowEl.textContent = all.filter(m => m.alertStatus === 'Low Stock').length;
    if (expEl) expEl.textContent = all.filter(m => m.alertStatus === 'Expiring Soon').length;
    if (oosEl) oosEl.textContent = all.filter(m => m.alertStatus === 'Out of Stock').length;

    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    if (medicines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-xs text-slate-400">No medicines found matching the active filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = medicines.map(m => {
      let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      let alertIcon = 'check-circle';
      if (m.alertStatus === 'Out of Stock') {
        badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
        alertIcon = 'x-circle';
      } else if (m.alertStatus === 'Low Stock') {
        badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
        alertIcon = 'alert-triangle';
      } else if (m.alertStatus === 'Expiring Soon') {
        badgeClass = 'bg-purple-100 text-purple-800 border-purple-300';
        alertIcon = 'clock';
      }

      return `
        <tr class="hover:bg-slate-50 transition" id="med-row-${m.id}">
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="font-bold text-slate-900 block">${m.name}</span>
            <span class="font-mono text-[11px] text-slate-500">${m.code}</span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">
              ${m.category}
            </span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-xs">
            <span class="font-mono text-slate-700 block">${m.batch_number}</span>
            <span class="text-[11px] text-slate-500">Exp: ${m.expiry_date} (${m.daysUntilExpiry}d left)</span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <span class="text-sm font-extrabold ${m.quantity <= m.min_threshold ? 'text-amber-600' : 'text-slate-900'}" id="med-qty-${m.id}">
                ${m.quantity} ${m.unit}
              </span>
              <span class="text-[10px] text-slate-400">/ min ${m.min_threshold}</span>
            </div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}">
              <i data-lucide="${alertIcon}" class="w-3.5 h-3.5"></i>
              <span>${m.alertStatus}</span>
            </span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-right space-x-1.5">
            <!-- +50 Stock Button -->
            <button onclick="App.adjustStockDelta(${m.id}, 50)" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition shadow-xs" title="Replenish +50">
              <i data-lucide="plus" class="w-3 h-3"></i>
              <span>+50</span>
            </button>

            <!-- -10 Stock Button -->
            <button onclick="App.adjustStockDelta(${m.id}, -10)" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 transition shadow-xs" title="Deduct -10" ${m.quantity <= 0 ? 'disabled' : ''}>
              <i data-lucide="minus" class="w-3 h-3"></i>
              <span>-10</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  },

  // +50 / -10 Quick Stock Adjuster API Call
  async adjustStockDelta(medicineId, delta) {
    try {
      const response = await fetch(`/api/medicines/${medicineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        this.showToast(data.message, 'success');

        // Optimistically update local cache
        const med = this.state.medicinesList.find(m => m.id === medicineId);
        if (med) {
          med.quantity = Math.max(0, med.quantity + delta);
          if (med.quantity <= 0) med.alertStatus = 'Out of Stock';
          else if (med.quantity <= med.min_threshold) med.alertStatus = 'Low Stock';
          else if (med.daysUntilExpiry <= 60) med.alertStatus = 'Expiring Soon';
          else med.alertStatus = 'Normal';
        }

        // Re-render UI & update KPI cards without full page reload
        this.renderInventoryTable();
        await this.loadDashboardData();
      } else {
        throw new Error(data.message || 'Failed to update stock');
      }
    } catch (error) {
      this.showToast('Stock update error: ' + error.message, 'error');
    }
  },

  // ==============================================================
  // 4) STAFF DUTY STATUS TOGGLER
  // (Instant Duty Status Toggling without Page Reload)
  // ==============================================================
  async loadAllStaff() {
    try {
      const res = await API.getStaff();
      if (res.success) {
        this.state.staffList = res.data;
        const select = document.getElementById('shift-staff-select');
        if (select) {
          select.innerHTML = res.data.map(s => `
            <option value="${s.id}">${s.name} (${s.role})</option>
          `).join('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadStaffRoster() {
    try {
      const picker = document.getElementById('roster-date-picker');
      const date = picker ? picker.value : new Date().toISOString().split('T')[0];

      const res = await API.getDutyRoster(date);
      if (!res.success) return;

      const container = document.getElementById('staff-roster-cards');
      if (!container) return;

      if (res.data.length === 0) {
        container.innerHTML = `<div class="col-span-3 p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">No staff rostered for this date. Click "+ Assign Shift" to schedule.</div>`;
        return;
      }

      container.innerHTML = res.data.map(r => {
        return `
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover-lift transition flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  ${r.shift_type.split(' ')[0]} Shift
                </span>
                
                <!-- Instant Status Indicator Badge -->
                <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                  r.duty_status === 'On Duty' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                  r.duty_status === 'Emergency Call' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                  r.duty_status === 'On Leave' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                  'bg-slate-100 text-slate-700 border-slate-300'
                }" id="staff-status-badge-${r.id}">
                  ${r.duty_status}
                </span>
              </div>

              <div class="my-2">
                <h4 class="text-sm font-bold text-slate-900">${r.staff_name}</h4>
                <p class="text-xs text-teal-700 font-semibold">${r.staff_role}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${r.qualifications || ''}</p>
              </div>

              <div class="text-[11px] text-slate-600 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                <i data-lucide="phone" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>${r.staff_contact}</span>
              </div>
            </div>

            <!-- One-Click Duty Status Toggler Buttons -->
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-600">Quick Toggle:</span>
              <div class="flex items-center gap-1">
                <button onclick="App.toggleStaffDutyStatus(${r.id}, 'On Duty')" class="px-2.5 py-1 text-xs font-bold rounded-lg ${r.duty_status === 'On Duty' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition">
                  On Duty
                </button>
                <button onclick="App.toggleStaffDutyStatus(${r.id}, 'Off Duty')" class="px-2.5 py-1 text-xs font-bold rounded-lg ${r.duty_status === 'Off Duty' ? 'bg-slate-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition">
                  Off Duty
                </button>
                <button onclick="App.toggleStaffDutyStatus(${r.id}, 'Emergency Call')" class="px-2 py-1 text-xs font-bold rounded-lg ${r.duty_status === 'Emergency Call' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition" title="Emergency On-Call">
                  Call
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    } catch (error) {
      console.error('Error fetching staff roster:', error);
    }
  },

  // One-Click Staff Duty Toggler API Call
  async toggleStaffDutyStatus(rosterId, newStatus) {
    try {
      const response = await fetch(`/api/staff/${rosterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duty_status: newStatus })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        this.showToast(data.message, 'success');
        // Instantly reload roster & active staff KPI counter without full page reload
        await this.loadStaffRoster();
        await this.loadDashboardData();
      } else {
        throw new Error(data.message || 'Failed to update duty status');
      }
    } catch (error) {
      this.showToast('Duty toggle error: ' + error.message, 'error');
    }
  },

  // ==============================================================
  // 5) MODAL FORM TO REGISTER NEW PATIENT VISITS
  // (Submits to POST /api/patients with dynamic state sync)
  // ==============================================================
  // ==============================================================
  // PHASE 5: EXPORT DAILY PHC REPORT (Printable CSS view / PDF)
  // Formats current KPIs and low-stock medicines for authorities
  // ==============================================================
  async exportDailyReport() {
    this.showToast('Preparing Daily PHC Summary Report...', 'info');

    try {
      const [dashRes, invRes, staffRes, queueRes] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/staff').then(r => r.json()),
        fetch('/api/visits?today=true').then(r => r.json())
      ]);

      const kpis = dashRes.data || this.dashboardData || {};
      const medicines = (invRes.data || this.inventoryData || []);
      const staffList = (staffRes.data || this.staffRosterData || []);
      const visits = (queueRes.data || this.queueData || []);

      // Filter critical medicines: low-stock or expiring soon
      const lowStockMeds = medicines.filter(m => m.quantity <= m.min_threshold);
      const now = new Date();
      const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const expiringMeds = medicines.filter(m => new Date(m.expiry_date) <= sixtyDaysOut);

      // Unique critical medicines
      const criticalMeds = [...new Map([...lowStockMeds, ...expiringMeds].map(m => [m.id, m])).values()];

      // On-duty staff
      const onDutyList = staffList.filter(s => s.duty_status === 'On Duty');

      // Program breakdown count
      const programCounts = {
        'Outpatient': visits.filter(v => v.program_category === 'Outpatient').length,
        'Maternal Care': visits.filter(v => v.program_category === 'Maternal Care').length,
        'Child Immunization': visits.filter(v => v.program_category === 'Child Immunization').length,
        'Disease Prevention': visits.filter(v => v.program_category === 'Disease Prevention').length
      };

      const dateStr = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const timeStr = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const reportHtml = `
        <!-- Official Government Header -->
        <div class="border-b-2 border-slate-900 pb-4 text-center print-avoid-break">
          <div class="flex items-center justify-between border-b border-slate-300 pb-3 mb-3">
            <div class="text-left">
              <span class="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Government of Tamil Nadu</span>
              <h2 class="text-xs font-bold text-slate-800">Department of Health & Family Welfare</h2>
              <p class="text-[10px] text-slate-600">National Health Mission (NHM) • Directorate of Public Health</p>
            </div>
            <div class="text-center px-4">
              <div class="w-12 h-12 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-xl mx-auto shadow-sm">
                ✚
              </div>
              <span class="text-[9px] font-mono font-bold text-slate-600 block mt-1">ESTD. 1984 • 24x7</span>
            </div>
            <div class="text-right">
              <span class="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Facility Code: PHC-TN-402</span>
              <h2 class="text-xs font-bold text-teal-800">PHC Ramapuram Health Complex</h2>
              <p class="text-[10px] text-slate-600">Block: St. Thomas Mount | Dist: Chengalpattu</p>
            </div>
          </div>

          <h1 class="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 uppercase">
            DAILY PHC MONITORING & GOVERNANCE AUDIT REPORT
          </h1>
          <div class="flex items-center justify-center gap-4 text-xs font-semibold text-slate-600 mt-1">
            <span>Audit Date: <strong class="text-slate-900">${dateStr}</strong></span>
            <span>•</span>
            <span>Generated At: <strong class="text-slate-900">${timeStr} IST</strong></span>
            <span>•</span>
            <span class="text-emerald-700 font-bold">● Active 24x7 Operating Status</span>
          </div>
        </div>

        <!-- Section 1: Executive KPI Metrics (4 Primary NHM Metrics + Alerts) -->
        <div class="print-avoid-break">
          <h2 class="text-xs font-bold text-slate-900 tracking-wider uppercase mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <span>1. Executive Summary & Key Performance Indicators (KPIs)</span>
          </h2>
          <div class="grid grid-cols-4 gap-3 text-center">
            <div class="border border-slate-300 rounded-lg p-2.5 bg-slate-50">
              <span class="text-[10px] font-bold text-slate-500 uppercase block">Total Visits Today</span>
              <span class="text-xl font-extrabold text-slate-900">${kpis.today_visits || kpis.todayVisits || visits.length}</span>
              <span class="text-[10px] text-slate-500 block">Active Queue: ${kpis.active_queue || kpis.activeQueue || 0}</span>
            </div>
            <div class="border border-rose-300 rounded-lg p-2.5 bg-rose-50/50">
              <span class="text-[10px] font-bold text-rose-700 uppercase block">Low Stock Alerts</span>
              <span class="text-xl font-extrabold text-rose-700">${lowStockMeds.length}</span>
              <span class="text-[10px] text-rose-600 block">Critical Threshold Breach</span>
            </div>
            <div class="border border-emerald-300 rounded-lg p-2.5 bg-emerald-50/50">
              <span class="text-[10px] font-bold text-emerald-700 uppercase block">Active Staff On Duty</span>
              <span class="text-xl font-extrabold text-emerald-800">${onDutyList.length}</span>
              <span class="text-[10px] text-emerald-600 block">24x7 Shift Coverage</span>
            </div>
            <div class="border border-teal-300 rounded-lg p-2.5 bg-teal-50/50">
              <span class="text-[10px] font-bold text-teal-700 uppercase block">Maternal & Child Visits</span>
              <span class="text-xl font-extrabold text-teal-800">${(programCounts['Maternal Care'] || 0) + (programCounts['Child Immunization'] || 0)}</span>
              <span class="text-[10px] text-teal-600 block">High Risk ANC: ${kpis.high_risk_maternal || kpis.highRiskMaternal || 0}</span>
            </div>
          </div>
        </div>

        <!-- Section 2: Health Program Footfall Distribution -->
        <div class="print-avoid-break">
          <h2 class="text-xs font-bold text-slate-900 tracking-wider uppercase mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <span>2. Health Program Footfall & Patient Distribution</span>
          </h2>
          <table class="w-full text-xs text-left border-collapse border border-slate-300">
            <thead class="bg-slate-100 text-slate-700 uppercase text-[10px]">
              <tr>
                <th class="border border-slate-300 px-3 py-1.5">NHM National Program Pillar</th>
                <th class="border border-slate-300 px-3 py-1.5 text-center">Today's Footfall</th>
                <th class="border border-slate-300 px-3 py-1.5 text-center">% of Total</th>
                <th class="border border-slate-300 px-3 py-1.5">Primary Clinical Scope</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              <tr>
                <td class="border border-slate-300 px-3 py-1.5 font-bold text-slate-800">Outpatient Care (OPD)</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center font-bold">${programCounts['Outpatient']}</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center">${visits.length ? Math.round((programCounts['Outpatient'] / visits.length) * 100) : 0}%</td>
                <td class="border border-slate-300 px-3 py-1.5 text-slate-600">General consultation, acute minor illness, vitals & triage</td>
              </tr>
              <tr>
                <td class="border border-slate-300 px-3 py-1.5 font-bold text-teal-800">Maternal Care (ANC/PNC)</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center font-bold text-teal-800">${programCounts['Maternal Care']}</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center">${visits.length ? Math.round((programCounts['Maternal Care'] / visits.length) * 100) : 0}%</td>
                <td class="border border-slate-300 px-3 py-1.5 text-slate-600">Antenatal screening, IFA supplementation, high-risk pregnancy monitoring</td>
              </tr>
              <tr>
                <td class="border border-slate-300 px-3 py-1.5 font-bold text-indigo-800">Child Immunization (EPI)</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center font-bold text-indigo-800">${programCounts['Child Immunization']}</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center">${visits.length ? Math.round((programCounts['Child Immunization'] / visits.length) * 100) : 0}%</td>
                <td class="border border-slate-300 px-3 py-1.5 text-slate-600">Universal immunization (Pentavalent, BCG, OPV), growth monitoring</td>
              </tr>
              <tr>
                <td class="border border-slate-300 px-3 py-1.5 font-bold text-amber-800">Disease Prevention & NCDs</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center font-bold text-amber-800">${programCounts['Disease Prevention']}</td>
                <td class="border border-slate-300 px-3 py-1.5 text-center">${visits.length ? Math.round((programCounts['Disease Prevention'] / visits.length) * 100) : 0}%</td>
                <td class="border border-slate-300 px-3 py-1.5 text-slate-600">Vector-borne surveillance (Dengue/Malaria), hypertension & diabetes screening</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Section 3: Critical Low-Stock & Expiring Medicine Inventory -->
        <div class="print-avoid-break">
          <div class="flex items-center justify-between border-b border-slate-200 pb-1 mb-2">
            <h2 class="text-xs font-bold text-slate-900 tracking-wider uppercase flex items-center gap-1.5">
              <span>3. Priority Pharmacy Audit: Low Stock & Expiring Medicines</span>
            </h2>
            <span class="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              Immediate Requisition Required: ${lowStockMeds.length} items
            </span>
          </div>

          <table class="w-full text-xs text-left border-collapse border border-slate-300">
            <thead class="bg-slate-100 text-slate-700 uppercase text-[10px]">
              <tr>
                <th class="border border-slate-300 px-2.5 py-1.5">Medicine Name</th>
                <th class="border border-slate-300 px-2.5 py-1.5">Category</th>
                <th class="border border-slate-300 px-2.5 py-1.5 text-center">Batch No</th>
                <th class="border border-slate-300 px-2.5 py-1.5 text-center">Current Stock</th>
                <th class="border border-slate-300 px-2.5 py-1.5 text-center">Min Threshold</th>
                <th class="border border-slate-300 px-2.5 py-1.5 text-center">Expiry Date</th>
                <th class="border border-slate-300 px-2.5 py-1.5 text-center">Status / Urgency</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${criticalMeds.length > 0 ? criticalMeds.map(m => {
                const isLow = m.quantity <= m.min_threshold;
                const isExp = new Date(m.expiry_date) <= sixtyDaysOut;
                let statusBadge = isLow && isExp
                  ? '<span class="font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded">CRITICAL (Low + Expiring)</span>'
                  : isLow
                    ? '<span class="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">LOW STOCK (Reorder)</span>'
                    : '<span class="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">EXPIRING SOON</span>';
                return `
                  <tr class="${isLow ? 'bg-rose-50/30' : ''}">
                    <td class="border border-slate-300 px-2.5 py-1.5 font-bold text-slate-900">${m.name}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-slate-600">${m.category}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-[10px]">${m.batch_number || 'N/A'}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-center font-bold ${isLow ? 'text-rose-700' : 'text-slate-800'}">${m.quantity} ${m.unit || 'units'}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-center text-slate-600">${m.min_threshold} ${m.unit || 'units'}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-[11px] ${isExp ? 'text-amber-800 font-bold' : 'text-slate-600'}">${m.expiry_date}</td>
                    <td class="border border-slate-300 px-2.5 py-1.5 text-center text-[10px]">${statusBadge}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" class="border border-slate-300 px-3 py-3 text-center text-slate-500 italic">
                    All inventory items are currently above safety thresholds. No emergency restocking required.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Section 4: On-Duty Medical & Nursing Staff Deployment -->
        <div class="print-avoid-break">
          <h2 class="text-xs font-bold text-slate-900 tracking-wider uppercase mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <span>4. On-Duty Personnel Roster (Active Shift Deployment)</span>
          </h2>
          <table class="w-full text-xs text-left border-collapse border border-slate-300">
            <thead class="bg-slate-100 text-slate-700 uppercase text-[10px]">
              <tr>
                <th class="border border-slate-300 px-2.5 py-1.5">Staff Member</th>
                <th class="border border-slate-300 px-2.5 py-1.5">Designation / Role</th>
                <th class="border border-slate-300 px-2.5 py-1.5">Assigned Shift</th>
                <th class="border border-slate-300 px-2.5 py-1.5">Duty Status</th>
                <th class="border border-slate-300 px-2.5 py-1.5">Official Contact</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${onDutyList.length > 0 ? onDutyList.map(s => `
                <tr>
                  <td class="border border-slate-300 px-2.5 py-1.5 font-bold text-slate-900">${s.full_name}</td>
                  <td class="border border-slate-300 px-2.5 py-1.5 text-slate-700">${s.role} (${s.designation || 'Staff'})</td>
                  <td class="border border-slate-300 px-2.5 py-1.5 text-slate-600">${s.shift_type || 'Morning (08:00 - 14:00)'}</td>
                  <td class="border border-slate-300 px-2.5 py-1.5 font-bold text-emerald-800">
                    <span class="inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      ${s.duty_status}
                    </span>
                  </td>
                  <td class="border border-slate-300 px-2.5 py-1.5 font-mono text-[10px] text-slate-600">${s.phone}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="5" class="border border-slate-300 px-3 py-3 text-center text-slate-500 italic">
                    No personnel currently tagged as On Duty for the active shift.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Section 5: Statutory Medical Officer Seal & Authorization Block -->
        <div class="print-avoid-break pt-4 border-t-2 border-slate-900 mt-6">
          <div class="grid grid-cols-3 gap-6 text-center text-xs">
            <div class="border border-dashed border-slate-300 p-3 rounded-lg flex flex-col justify-between h-28">
              <span class="text-[10px] font-bold text-slate-500 uppercase">Pharmacy In-Charge Verification</span>
              <div class="border-b border-slate-400 w-3/4 mx-auto my-2"></div>
              <span class="text-[11px] font-semibold text-slate-700">Signature & Date</span>
            </div>
            <div class="border border-dashed border-slate-300 p-3 rounded-lg flex flex-col justify-between h-28">
              <span class="text-[10px] font-bold text-slate-500 uppercase">Staff Nurse Supervisor</span>
              <div class="border-b border-slate-400 w-3/4 mx-auto my-2"></div>
              <span class="text-[11px] font-semibold text-slate-700">Signature & Date</span>
            </div>
            <div class="border border-slate-800 p-3 rounded-lg flex flex-col justify-between h-28 bg-slate-50">
              <span class="text-[10px] font-bold text-teal-900 uppercase">Medical Officer In-Charge (MOIC)</span>
              <div class="border-b-2 border-slate-900 w-3/4 mx-auto my-2"></div>
              <div>
                <span class="text-[11px] font-bold text-slate-900 block">Dr. A. Sundaram, MBBS, MD</span>
                <span class="text-[9px] text-slate-500 font-mono">Reg. No: TNMC-49281 • Official Seal</span>
              </div>
            </div>
          </div>
          <div class="mt-3 text-center text-[10px] text-slate-500">
            Report authenticated automatically by PHC Management System v2.0 • Stored in compliance with NHM Digital Health Record Guidelines
          </div>
        </div>
      `;

      const contentEl = document.getElementById('printable-report-content');
      if (contentEl) {
        contentEl.innerHTML = reportHtml;
      }

      const modalEl = document.getElementById('printable-report-modal');
      if (modalEl) {
        modalEl.classList.remove('hidden');
      }

      if (window.lucide) {
        lucide.createIcons();
      }

      this.showToast('Daily PHC Report generated successfully', 'success');
    } catch (err) {
      console.error('Error generating report:', err);
      this.showToast('Failed to generate report: ' + err.message, 'error');
    }
  },

  openNewVisitModal() {
    this.closeModals();
    const modal = document.getElementById('modal-new-visit');
    if (modal) {
      modal.classList.remove('hidden');
      this.toggleProgramFields(document.getElementById('modal-program-select')?.value || 'Outpatient');
    }
  },

  closeModals() {
    ['modal-new-visit', 'modal-add-medicine', 'modal-assign-shift', 'printable-report-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  },

  toggleProgramFields(program) {
    const container = document.getElementById('dynamic-program-fields');
    if (!container) return;

    if (program === 'Maternal Care') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <label class="block text-xs font-bold text-teal-800 mb-2">Maternal Healthcare Parameters</label>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-[10px] text-teal-700">Trimester / Gestation</span>
            <input type="text" name="meta_trimester" placeholder="e.g. 2nd Trimester (24w)" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
          <div>
            <span class="text-[10px] text-teal-700">Expected Delivery (EDD)</span>
            <input type="date" name="meta_edd" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <input type="checkbox" id="check-high-risk" name="meta_high_risk" class="rounded text-rose-600">
          <label for="check-high-risk" class="text-xs font-bold text-rose-700">Flag as High-Risk Pregnancy</label>
        </div>
      `;
    } else if (program === 'Immunization') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <label class="block text-xs font-bold text-teal-800 mb-2">Universal Immunization Schedule</label>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-[10px] text-teal-700">Vaccine Required</span>
            <input type="text" name="meta_vaccine" placeholder="e.g. Pentavalent-1 + bOPV-1" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
          <div>
            <span class="text-[10px] text-teal-700">Child Weight (kg)</span>
            <input type="number" step="0.1" name="meta_weight" placeholder="e.g. 4.8" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
        </div>
      `;
    } else if (program === 'Disease Prevention') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <label class="block text-xs font-bold text-teal-800 mb-2">Disease Surveillance Notification</label>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-[10px] text-teal-700">Suspected Condition</span>
            <input type="text" name="meta_disease" placeholder="e.g. Dengue Fever / Cholera" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
          <div>
            <span class="text-[10px] text-teal-700">Hotspot Ward / Cluster</span>
            <input type="text" name="meta_cluster" placeholder="e.g. North Village Ward 2" class="w-full px-2 py-1.5 rounded border border-teal-300">
          </div>
        </div>
      `;
    } else {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  },

  // Submit New Patient Registration via POST /api/patients
  async handleCreateVisit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const payload = {
      patient_name: formData.get('patient_name'),
      patient_age: formData.get('patient_age'),
      patient_gender: formData.get('patient_gender'),
      patient_contact: formData.get('patient_contact'),
      patient_address: formData.get('patient_address'),
      program_category: formData.get('program_category'),
      symptoms: formData.get('symptoms'),
      bp: formData.get('bp'),
      pulse: formData.get('pulse'),
      temp: formData.get('temp'),
      spo2: formData.get('spo2'),
      metadata: {}
    };

    if (payload.program_category === 'Maternal Care') {
      payload.metadata = {
        trimester: formData.get('meta_trimester') || '2nd Trimester',
        edd: formData.get('meta_edd') || '',
        high_risk: formData.get('meta_high_risk') === 'on'
      };
    } else if (payload.program_category === 'Immunization') {
      payload.metadata = {
        vaccine_name: formData.get('meta_vaccine') || 'Scheduled Vaccine',
        child_weight_kg: formData.get('meta_weight') || '5.0'
      };
    } else if (payload.program_category === 'Disease Prevention') {
      payload.metadata = {
        suspected_condition: formData.get('meta_disease') || 'Syndromic Alert',
        hotspot_cluster: formData.get('meta_cluster') || 'Village Area'
      };
    }

    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok && data.success) {
        this.showToast(data.message, 'success');
        this.closeModals();
        form.reset();

        // Refresh state dynamically without full page reload
        await this.loadVisitsData();
        await this.loadDashboardData();
        await this.loadProgramData(this.state.activeProgramTab);
      } else {
        throw new Error(data.message || 'Registration failed');
      }
    } catch (error) {
      this.showToast('Registration error: ' + error.message, 'error');
    }
  },

  // ==============================================================
  // HEALTH PROGRAM CATEGORIZATION
  // ==============================================================
  async switchProgramTab(category) {
    this.state.activeProgramTab = category;

    document.querySelectorAll('.sub-tab').forEach(btn => {
      if (btn.dataset.program === category) {
        btn.classList.add('active', 'bg-teal-600', 'text-white');
        btn.classList.remove('bg-slate-200/70', 'text-slate-700');
      } else {
        btn.classList.remove('active', 'bg-teal-600', 'text-white');
        btn.classList.add('bg-slate-200/70', 'text-slate-700');
      }
    });

    await this.loadProgramData(category);
  },

  async loadProgramData(category) {
    try {
      const slugMap = {
        'Outpatient': 'outpatient',
        'Maternal Care': 'maternal-care',
        'Immunization': 'immunization',
        'Disease Prevention': 'disease-prevention'
      };

      const res = await API.getProgramData(slugMap[category]);
      if (!res.success) return;

      const header = document.getElementById('program-header-container');
      const tableTitle = document.getElementById('program-table-title');
      const countLabel = document.getElementById('program-record-count');
      const tbody = document.getElementById('program-visits-tbody');

      if (tableTitle) tableTitle.textContent = `${category} - Patient Case Registry`;
      if (countLabel) countLabel.textContent = `${res.visits.length} registered cases`;

      if (header) {
        if (category === 'Outpatient') {
          header.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">General OPD Patients</span>
                <div class="text-2xl font-bold text-teal-700 mt-1">${res.summary.totalPatients}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">District Hospital Referrals</span>
                <div class="text-2xl font-bold text-amber-600 mt-1">${res.summary.referralsToDistrictHospital}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">NCD Chronic Care</span>
                <div class="text-2xl font-bold text-blue-600 mt-1">${res.summary.chronicCareFollowups}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Triage Completed</span>
                <div class="text-2xl font-bold text-emerald-600 mt-1">${res.summary.triageCompleted}</div>
              </div>
            </div>
          `;
        } else if (category === 'Maternal Care') {
          header.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Total ANC/PNC Cases</span>
                <div class="text-2xl font-bold text-pink-600 mt-1">${res.summary.totalMaternalVisits}</div>
              </div>
              <div class="bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                <span class="text-xs font-bold text-rose-800 uppercase flex items-center gap-1">
                  <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-600"></i>
                  High-Risk Cases
                </span>
                <div class="text-2xl font-bold text-rose-700 mt-1">${res.summary.highRiskPregnanciesCount}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Trimester Breakdown</span>
                <div class="text-xs text-slate-700 mt-1">1st: <b>${res.summary.trimesterBreakdown.firstTrimester}</b> | 2nd: <b>${res.summary.trimesterBreakdown.secondTrimester}</b> | 3rd: <b>${res.summary.trimesterBreakdown.thirdTrimester}</b></div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">IFA Distribution</span>
                <p class="text-xs text-slate-600 mt-1">100% IFA active under Janani Suraksha</p>
              </div>
            </div>
          `;
        } else if (category === 'Immunization') {
          header.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Scheduled Vaccine Sessions</span>
                <div class="text-2xl font-bold text-blue-600 mt-1">${res.summary.totalImmunizationVisits}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Doses Administered</span>
                <div class="text-2xl font-bold text-emerald-600 mt-1">${res.summary.dosesAdministered}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Awaiting Vaccination</span>
                <div class="text-2xl font-bold text-amber-600 mt-1">${res.summary.pendingAdministration}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Tracked for Follow-up</span>
                <div class="text-2xl font-bold text-indigo-600 mt-1">${res.summary.upcomingDuesCount}</div>
              </div>
            </div>
          `;
        } else if (category === 'Disease Prevention') {
          header.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Surveillance Cases</span>
                <div class="text-2xl font-bold text-amber-700 mt-1">${res.summary.totalSurveillanceCases}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Vector-Borne (Dengue/Malaria)</span>
                <div class="text-2xl font-bold text-rose-600 mt-1">${res.summary.vectorBorneCount}</div>
              </div>
              <div>
                <span class="text-xs font-semibold text-slate-500 uppercase">Water-Borne (Diarrhea)</span>
                <div class="text-2xl font-bold text-blue-600 mt-1">${res.summary.waterBorneCount}</div>
              </div>
              <div class="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <span class="text-xs font-bold text-amber-900 uppercase">Active Cluster</span>
                <p class="text-[11px] text-amber-800 mt-1">North Village Ward 2 (Fogging team active)</p>
              </div>
            </div>
          `;
        }
      }

      if (tbody) {
        tbody.innerHTML = res.visits.map(v => `
          <tr class="hover:bg-slate-50 transition">
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-mono font-bold text-slate-900 block text-xs">Token #${v.token_number}</span>
              <span class="font-mono text-[11px] text-slate-500">${v.uhid}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-bold text-slate-900 block">${v.patient_name}</span>
              <span class="text-[11px] text-slate-500">${v.patient_age}y / ${v.patient_gender} • ${v.patient_address}</span>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs font-semibold text-slate-800 block">${v.diagnosis || 'Pending Consultation'}</span>
              <span class="text-[11px] text-slate-500 line-clamp-1">${v.symptoms}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-600">
              ${category === 'Maternal Care' ? `Trimester: <b>${v.metadata.trimester || 'ANC'}</b> ${v.metadata.high_risk ? '<span class="text-rose-600 font-bold ml-1">[High-Risk]</span>' : ''}` : ''}
              ${category === 'Immunization' ? `Vaccine: <b>${v.metadata.vaccine_name || 'Vaccine'}</b>` : ''}
              ${category === 'Disease Prevention' ? `Condition: <b>${v.metadata.suspected_condition || 'Syndromic Alert'}</b>` : ''}
              ${category === 'Outpatient' ? `Follow-up: 3 days` : ''}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                v.triage_status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                v.triage_status === 'With Doctor' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }">
                ${v.triage_status}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              <button onclick="App.advancePatientStatus(${v.id}, 'In Consultation')" class="text-xs text-teal-600 hover:text-teal-800 font-semibold">
                Manage &rarr;
              </button>
            </td>
          </tr>
        `).join('');
      }

      lucide.createIcons();
    } catch (error) {
      console.error('Error loading program data:', error);
    }
  },

  // Modal Handlers
  openAddMedicineModal() {
    this.closeModals();
    const modal = document.getElementById('modal-add-medicine');
    if (modal) modal.classList.remove('hidden');
  },

  async handleAddMedicine(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      batch_number: formData.get('batch_number'),
      quantity: formData.get('quantity'),
      min_threshold: formData.get('min_threshold'),
      unit: formData.get('unit'),
      expiry_date: formData.get('expiry_date')
    };

    try {
      const res = await API.addMedicine(payload);
      if (res.success) {
        this.showToast(res.message, 'success');
        this.closeModals();
        form.reset();
        await this.loadInventoryData();
        await this.loadDashboardData();
      }
    } catch (error) {
      this.showToast('Error adding medicine: ' + error.message, 'error');
    }
  },

  openAssignShiftModal() {
    this.closeModals();
    const modal = document.getElementById('modal-assign-shift');
    if (modal) {
      document.getElementById('shift-date-input').value = document.getElementById('roster-date-picker')?.value || new Date().toISOString().split('T')[0];
      modal.classList.remove('hidden');
    }
  },

  async handleAssignShift(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const payload = {
      staff_id: parseInt(formData.get('staff_id'), 10),
      shift_date: formData.get('shift_date'),
      shift_type: formData.get('shift_type'),
      duty_status: formData.get('duty_status'),
      notes: formData.get('notes')
    };

    try {
      const res = await API.assignShift(payload);
      if (res.success) {
        this.showToast(res.message, 'success');
        this.closeModals();
        form.reset();
        await this.loadStaffRoster();
        await this.loadDashboardData();
      }
    } catch (error) {
      this.showToast('Error assigning shift: ' + error.message, 'error');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let bg = 'bg-slate-900 text-white';
    if (type === 'success') bg = 'bg-emerald-600 text-white';
    if (type === 'error') bg = 'bg-rose-600 text-white';
    if (type === 'warning') bg = 'bg-amber-600 text-white';

    toast.className = `p-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 transform transition duration-300 translate-y-2 pointer-events-auto ${bg}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2'), 10);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
