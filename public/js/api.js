const API = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }
      return data;
    } catch (error) {
      console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
      throw error;
    }
  },

  // Analytics
  getKPIs() {
    return this.request('/analytics/kpis');
  },
  getTrends() {
    return this.request('/analytics/trends');
  },

  // Visits
  getVisits(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/visits${query ? '?' + query : ''}`);
  },
  getVisitById(id) {
    return this.request(`/visits/${id}`);
  },
  createVisit(payload) {
    return this.request('/visits', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateTriageStatus(id, status) {
    return this.request(`/visits/${id}/triage`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },
  recordConsultation(id, payload) {
    return this.request(`/visits/${id}/consultation`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Health Programs
  getProgramData(category) {
    return this.request(`/programs/${category}`);
  },

  // Medicine Inventory
  getMedicines(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/inventory${query ? '?' + query : ''}`);
  },
  getInventoryAlerts() {
    return this.request('/inventory/alerts');
  },
  addMedicine(payload) {
    return this.request('/inventory', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  dispenseMedicine(payload) {
    return this.request('/inventory/dispense', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateStock(id, payload) {
    return this.request(`/inventory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },

  // Staff & Roster
  getStaff() {
    return this.request('/staff');
  },
  getDutyRoster(date) {
    const query = date ? `?date=${date}` : '';
    return this.request(`/staff/roster${query}`);
  },
  assignShift(payload) {
    return this.request('/staff/roster', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateDutyStatus(id, payload) {
    return this.request(`/staff/roster/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }
};

window.API = API;
