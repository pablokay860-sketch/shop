/**
 * admin.js — Jack's Brand Admin Dashboard (frontend)
 *
 * Handles: login, session check, dashboard stats, orders table,
 * filtering, order detail modal, CSV export, and logout.
 */

'use strict';

// ─── DOM refs ──────────────────────────────────────────────────────────
const loginScreen    = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm      = document.getElementById('login-form');
const loginBtn       = document.getElementById('login-btn');
const loginError     = document.getElementById('login-error');
const logoutBtn      = document.getElementById('logout-btn');

const statTotal     = document.getElementById('stat-total');
const statRevenue   = document.getElementById('stat-revenue');
const statPending   = document.getElementById('stat-pending');
const statCompleted = document.getElementById('stat-completed');
const statFailed    = document.getElementById('stat-failed');

const ordersTbody       = document.getElementById('orders-tbody');
const filterStatus      = document.getElementById('filter-status');
const filterFrom        = document.getElementById('filter-from');
const filterTo          = document.getElementById('filter-to');
const applyFiltersBtn   = document.getElementById('apply-filters-btn');
const resetFiltersBtn   = document.getElementById('reset-filters-btn');
const exportBtn         = document.getElementById('export-btn');

const orderModal      = document.getElementById('order-modal');
const modalTitle      = document.getElementById('modal-title');
const modalBody       = document.getElementById('modal-body');
const modalCloseBtn   = document.getElementById('modal-close-btn');

// ─── State ───────────────────────────────────────────────────────────
let currentOrders = [];

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Format a number as KES currency string.
 */
const formatKES = (n) =>
  Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Format an ISO date string to a readable local date-time.
 */
const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

/**
 * Return a status badge HTML string.
 */
const statusBadge = (status) => {
  const icons = {
    pending:   'fa-clock',
    completed: 'fa-circle-check',
    failed:    'fa-circle-xmark',
  };
  const icon = icons[status] || 'fa-circle';
  return `<span class="badge badge-${status}">
    <i class="fa-solid ${icon}"></i> ${status}
  </span>`;
};

/**
 * Generic authenticated fetch wrapper.
 * Returns parsed JSON or throws on non-2xx / 401.
 */
const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 401) {
    // Session expired — show login
    showLogin();
    throw new Error('Session expired');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

// ─── Auth ───────────────────────────────────────────────────────────

const showLogin = () => {
  loginScreen.style.display    = 'flex';
  dashboardScreen.style.display = 'none';
};

const showDashboard = () => {
  loginScreen.style.display    = 'none';
  dashboardScreen.style.display = 'block';
};

/**
 * Check whether the current session is still valid by hitting a protected
 * endpoint. If it returns 401 we stay on the login screen; otherwise we
 * load the dashboard.
 */
const checkSession = async () => {
  try {
    await apiFetch('/admin/api/dashboard');
    showDashboard();
    loadDashboard();
  } catch {
    showLogin();
  }
};

// ─── Login ──────────────────────────────────────────────────────────

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> Signing in…';

  const password = document.getElementById('password').value;

  try {
    await apiFetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    showDashboard();
    loadDashboard();
  } catch (err) {
    loginError.textContent = err.message || 'Invalid password. Please try again.';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

// ─── Logout ──────────────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  try {
    await apiFetch('/admin/logout', { method: 'POST' });
  } catch { /* ignore */ }
  showLogin();
  loginForm.reset();
  loginError.textContent = '';
});

// ─── Dashboard stats ───────────────────────────────────────────────────────

const loadStats = async () => {
  try {
    const { stats } = await apiFetch('/admin/api/dashboard');
    statTotal.textContent     = stats.totalOrders.toLocaleString();
    statRevenue.textContent   = formatKES(stats.totalRevenue);
    statPending.textContent   = stats.pendingCount.toLocaleString();
    statCompleted.textContent = stats.completedCount.toLocaleString();
    statFailed.textContent    = stats.failedCount.toLocaleString();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
};

// ─── Orders table ────────────────────────────────────────────────────────

const renderOrders = (orders) => {
  currentOrders = orders;

  if (!orders.length) {
    ordersTbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <p>No orders found.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  ordersTbody.innerHTML = orders.map((o) => `
    <tr data-ref="${escapeHtml(o.orderRef)}">
      <td class="order-ref">${escapeHtml(o.orderRef)}</td>
      <td>${escapeHtml(o.phone)}</td>
      <td><strong>${formatKES(o.amount)}</strong></td>
      <td>${statusBadge(o.status)}</td>
      <td class="mpesa-ref">${o.mpesaTransactionRef ? escapeHtml(o.mpesaTransactionRef) : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="white-space:nowrap;color:var(--muted);font-size:0.82rem">${formatDate(o.createdAt)}</td>
    </tr>
  `).join('');

  // Row click → open detail modal
  ordersTbody.querySelectorAll('tr[data-ref]').forEach((row) => {
    row.addEventListener('click', () => openOrderModal(row.dataset.ref));
  });
};

const loadOrders = async (filters = {}) => {
  ordersTbody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <p>Loading orders…</p>
        </div>
      </td>
    </tr>`;

  try {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.set('dateTo',   filters.dateTo);

    const { orders } = await apiFetch(`/admin/api/orders?${params}`);
    renderOrders(orders);
  } catch (err) {
    ordersTbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>Failed to load orders: ${escapeHtml(err.message)}</p>
          </div>
        </td>
      </tr>`;
  }
};

// ─── Filters ──────────────────────────────────────────────────────────

applyFiltersBtn.addEventListener('click', () => {
  loadOrders({
    status:   filterStatus.value,
    dateFrom: filterFrom.value,
    dateTo:   filterTo.value,
  });
});

resetFiltersBtn.addEventListener('click', () => {
  filterStatus.value = 'all';
  filterFrom.value   = '';
  filterTo.value     = '';
  loadOrders();
});

// ─── Order detail modal ──────────────────────────────────────────────────────

const openOrderModal = async (orderRef) => {
  modalTitle.textContent = `Order: ${orderRef}`;
  modalBody.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted)">
    <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem"></i>
    <p style="margin-top:.75rem">Loading…</p>
  </div>`;
  orderModal.classList.add('open');

  try {
    const { order, items } = await apiFetch(`/admin/api/orders/${encodeURIComponent(orderRef)}`);

    const itemsHtml = items.length
      ? `<div class="items-table-wrap">
          <h4>Order Items</h4>
          <table class="items-table">
            <thead>
              <tr>
                <th>Product</th>
                <th style="text-align:right">Qty</th>
                <th style="text-align:right">Unit Price</th>
                <th style="text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td style="text-align:right">${item.quantity}</td>
                  <td style="text-align:right">KES ${formatKES(item.price)}</td>
                  <td style="text-align:right">KES ${formatKES(item.price * item.quantity)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total</td>
                <td style="text-align:right">KES ${formatKES(order.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      : `<p style="color:var(--muted);font-size:.875rem;margin-top:1rem">No item details recorded for this order.</p>`;

    modalBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <label>Order Reference</label>
          <span style="font-family:monospace;font-size:.85rem">${escapeHtml(order.orderRef)}</span>
        </div>
        <div class="detail-item">
          <label>Status</label>
          <span>${statusBadge(order.status)}</span>
        </div>
        <div class="detail-item">
          <label>Phone</label>
          <span>${escapeHtml(order.phone)}</span>
        </div>
        <div class="detail-item">
          <label>Amount</label>
          <span style="font-weight:700">KES ${formatKES(order.amount)}</span>
        </div>
        <div class="detail-item">
          <label>M-Pesa Ref</label>
          <span style="font-family:monospace">${order.mpesaTransactionRef ? escapeHtml(order.mpesaTransactionRef) : '—'}</span>
        </div>
        <div class="detail-item">
          <label>Created</label>
          <span>${formatDate(order.createdAt)}</span>
        </div>
        <div class="detail-item">
          <label>Last Updated</label>
          <span>${formatDate(order.updatedAt)}</span>
        </div>
      </div>
      ${itemsHtml}
    `;
  } catch (err) {
    modalBody.innerHTML = `<p style="color:var(--danger);padding:1rem">
      Failed to load order details: ${escapeHtml(err.message)}
    </p>`;
  }
};

const closeModal = () => orderModal.classList.remove('open');

modalCloseBtn.addEventListener('click', closeModal);
orderModal.addEventListener('click', (e) => {
  if (e.target === orderModal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ─── CSV Export ─────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  if (!currentOrders.length) {
    alert('No orders to export. Apply filters first or wait for orders to load.');
    return;
  }

  const headers = ['Order Ref', 'Phone', 'Amount (KES)', 'Status', 'M-Pesa Ref', 'Created At'];
  const rows = currentOrders.map((o) => [
    o.orderRef,
    o.phone,
    o.amount,
    o.status,
    o.mpesaTransactionRef || '',
    o.createdAt,
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// ─── XSS guard ─────────────────────────────────────────────────────────

const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ─── Bootstrap ─────────────────────────────────────────────────────────

const loadDashboard = () => {
  loadStats();
  loadOrders();
};

// On page load, check if there's already a valid session
checkSession();
