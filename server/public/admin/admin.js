const loginSection = document.getElementById('login');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const couponsBody = document.getElementById('coupons-body');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh');
const verifyInput = document.getElementById('verify-code');
const verifyBtn = document.getElementById('verify-btn');
const verifyResult = document.getElementById('verify-result');

let couponsCache = [];

const renderCoupons = (filter = '') => {
  couponsBody.innerHTML = '';
  const normalized = filter.trim().toLowerCase();
  const filtered = couponsCache.filter((coupon) =>
    coupon.code.toLowerCase().includes(normalized)
  );

  filtered.forEach((coupon) => {
    const tr = document.createElement('tr');
    const statusBadge = `<span class="badge ${coupon.status}">${coupon.status}</span>`;
    tr.innerHTML = `
      <td>${coupon.id}</td>
      <td>${coupon.client_id.slice(0, 8)}</td>
      <td>${coupon.discount_percent}%</td>
      <td>${coupon.code}</td>
      <td>${new Date(coupon.issued_at).toLocaleString('ru-RU')}</td>
      <td>${new Date(coupon.expires_at).toLocaleDateString('ru-RU')}</td>
      <td>${statusBadge}</td>
      <td>
        ${
          coupon.status === 'active'
            ? `<button data-id="${coupon.id}">Отметить использован</button>`
            : ''
        }
      </td>
    `;
    couponsBody.appendChild(tr);
  });

  document.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await fetch(`/api/coupons/${id}/use`, { method: 'POST' });
      await loadCoupons();
    });
  });
};

const loadCoupons = async () => {
  const response = await fetch('/api/coupons');
  if (!response.ok) {
    loginSection.classList.remove('hidden');
    dashboard.classList.add('hidden');
    return;
  }
  const data = await response.json();
  couponsCache = data.coupons;
  renderCoupons(searchInput.value);
};

const login = async () => {
  loginError.textContent = '';
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value })
  });
  if (!response.ok) {
    loginError.textContent = 'Неверный пароль.';
    return;
  }
  loginSection.classList.add('hidden');
  dashboard.classList.remove('hidden');
  await loadCoupons();
};

const verifyCode = async () => {
  const code = verifyInput.value.trim();
  if (!code) {
    verifyResult.textContent = 'Введите код для проверки.';
    return;
  }
  const response = await fetch(`/api/coupons/verify?code=${encodeURIComponent(code)}`);
  if (!response.ok) {
    verifyResult.textContent = 'Ошибка проверки.';
    return;
  }
  const data = await response.json();
  if (data.status === 'invalid') {
    verifyResult.textContent = 'Код не найден.';
    return;
  }
  const statusMap = {
    active: 'валиден',
    used: 'уже использован',
    expired: 'истёк'
  };
  verifyResult.textContent = `Статус: ${statusMap[data.status]}`;
};

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', loadCoupons);
searchInput.addEventListener('input', (event) => renderCoupons(event.target.value));
verifyBtn.addEventListener('click', verifyCode);

loadCoupons();
