// public/js/api.js
// Thin wrapper around the REST API

const API = {
  async getStaff() {
    const res = await fetch('api/staff');
    if (!res.ok) throw new Error('Failed to fetch staff');
    return res.json();
  },

  async addStaff(name, position) {
    const res = await fetch('api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, position }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add staff');
    }
    return res.json();
  },

  async getTasks() {
    const res = await fetch('api/tasks');
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async createTask(payload) {
    const res = await fetch('api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create task');
    }
    return res.json();
  },

  async acceptTask(id, deadline, deadlineRevised) {
    const res = await fetch(`api/tasks/${id}/accept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline, deadlineRevised }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to accept task');
    }
    return res.json();
  },

  async rejectTask(id, rejectReason) {
    const res = await fetch(`api/tasks/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectReason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reject task');
    }
    return res.json();
  },

  async doneTask(id, completionNote) {
    const res = await fetch(`api/tasks/${id}/done`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completionNote }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to mark done');
    }
    return res.json();
  },

  async deleteTask(id) {
    const res = await fetch(`api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete task');
    }
    return res.json();
  },
};
