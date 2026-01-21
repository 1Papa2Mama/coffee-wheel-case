const sections = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-route]');
const spinBtn = document.getElementById('spin-btn');
const wheelCanvas = document.getElementById('wheel');
const resultModal = document.getElementById('result-modal');
const modalTitle = document.getElementById('modal-title');
const modalCode = document.getElementById('modal-code');
const copyBtn = document.getElementById('copy-code');
const closeBtn = document.getElementById('close-modal');
const timerEl = document.getElementById('spin-timer');

const profileIdEl = document.getElementById('profile-id');
const profileStatusEl = document.getElementById('profile-status');
const profileNextEl = document.getElementById('profile-next');
const profileCouponsEl = document.getElementById('profile-coupons');

const wheel = {
  sectors: [10, 15, 20, 10, 30, 10, 15, 20, 30, 10, 50, 10],
  colors: ['#d6a36a', '#f2d2a9', '#c9905b', '#b07a4c'],
  angle: 0,
  spinning: false
};

const getClientId = () => {
  const stored = localStorage.getItem('vc_client_id');
  if (stored) return stored;
  const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  localStorage.setItem('vc_client_id', uuid);
  return uuid;
};

const setActivePage = (path) => {
  sections.forEach((section) => {
    section.classList.toggle('active', `/${section.id}` === path || (path === '/' && section.id === 'home'));
  });
  navLinks.forEach((link) => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === path || (href === '/' && path === '/'));
  });
};

const navigate = (path) => {
  history.pushState({}, '', path);
  setActivePage(path);
};

const formatRemaining = (ms) => {
  if (!ms || ms <= 0) return 'Можно крутить прямо сейчас.';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `До следующей попытки: ${days}д ${hours}ч ${minutes}м`;
};

const updateTimer = (nextSpinAt) => {
  if (!nextSpinAt) {
    timerEl.textContent = '';
    spinBtn.disabled = false;
    return;
  }
  const now = Date.now();
  const remaining = nextSpinAt - now;
  if (remaining <= 0) {
    timerEl.textContent = 'Можно крутить прямо сейчас.';
    spinBtn.disabled = false;
    return;
  }
  timerEl.textContent = formatRemaining(remaining);
  spinBtn.disabled = true;
};

const startTimerLoop = (nextSpinAt) => {
  updateTimer(nextSpinAt);
  if (nextSpinAt) {
    const interval = setInterval(() => {
      updateTimer(nextSpinAt);
      if (Date.now() >= nextSpinAt) {
        clearInterval(interval);
      }
    }, 1000 * 30);
  }
};

const drawWheel = () => {
  const ctx = wheelCanvas.getContext('2d');
  const radius = wheelCanvas.width / 2;
  ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
  ctx.save();
  ctx.translate(radius, radius);
  ctx.rotate(wheel.angle);

  const sectorAngle = (2 * Math.PI) / wheel.sectors.length;
  wheel.sectors.forEach((value, index) => {
    const start = index * sectorAngle;
    const end = start + sectorAngle;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius - 10, start, end);
    ctx.closePath();
    ctx.fillStyle = wheel.colors[index % wheel.colors.length];
    ctx.fill();

    ctx.save();
    ctx.rotate(start + sectorAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1b1410';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${value}%`, radius - 30, 10);
    ctx.restore();
  });

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(radius - 10, 10);
  ctx.lineTo(radius + 10, 10);
  ctx.lineTo(radius, 30);
  ctx.closePath();
  ctx.fillStyle = '#f2d2a9';
  ctx.fill();
};

const spinToDiscount = (discount) => {
  if (wheel.spinning) return;
  const indices = wheel.sectors
    .map((value, index) => (value === discount ? index : null))
    .filter((item) => item !== null);
  const targetIndex = indices[Math.floor(Math.random() * indices.length)];
  const sectorAngle = (2 * Math.PI) / wheel.sectors.length;
  const pointerAngle = -Math.PI / 2;
  const targetAngle = pointerAngle - (targetIndex + 0.5) * sectorAngle;
  const spins = 4 + Math.floor(Math.random() * 3);
  const startAngle = wheel.angle;
  const endAngle = targetAngle + spins * 2 * Math.PI;
  const duration = 4000;
  const startTime = performance.now();
  wheel.spinning = true;

  const animate = (time) => {
    const progress = Math.min((time - startTime) / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    wheel.angle = startAngle + (endAngle - startAngle) * easeOut;
    drawWheel();
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      wheel.spinning = false;
    }
  };

  requestAnimationFrame(animate);
};

const openModal = (discount, code) => {
  modalTitle.textContent = `Ваша скидка: ${discount}%`;
  modalCode.textContent = `Ваш специальный код: ${code}`;
  resultModal.classList.remove('hidden');
  copyBtn.onclick = () => navigator.clipboard.writeText(code);
};

const loadProfile = async () => {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return;
    const data = await response.json();
    const shortId = data.clientId.slice(0, 8);
    profileIdEl.textContent = shortId;
    profileStatusEl.textContent = data.coupons.length ? 'посетитель Vector Coffee' : 'гость';
    if (data.nextSpinAt) {
      profileNextEl.textContent = new Date(data.nextSpinAt).toLocaleString('ru-RU');
    } else {
      profileNextEl.textContent = 'доступно сейчас';
    }
    profileCouponsEl.innerHTML = '';
    if (!data.coupons.length) {
      profileCouponsEl.innerHTML = '<p>У вас пока нет купонов.</p>';
    } else {
      data.coupons.forEach((coupon) => {
        const item = document.createElement('div');
        item.className = 'coupon-item';
        item.innerHTML = `
          <strong>${coupon.discount_percent}%</strong><br />
          Код: ${coupon.code}<br />
          Действует до: ${new Date(coupon.expires_at).toLocaleDateString('ru-RU')}
        `;
        profileCouponsEl.appendChild(item);
      });
    }
    if (data.nextSpinAt) {
      startTimerLoop(data.nextSpinAt);
    }
  } catch (error) {
    console.error(error);
  }
};

const initIdentify = async () => {
  const clientId = getClientId();
  await fetch('/api/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId })
  });
  await loadProfile();
};

const spin = async () => {
  if (wheel.spinning) return;
  spinBtn.disabled = true;
  try {
    const response = await fetch('/api/wheel/spin', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      if (data.nextSpinAt) {
        startTimerLoop(data.nextSpinAt);
      }
      spinBtn.disabled = false;
      return;
    }
    spinToDiscount(data.discount);
    openModal(data.discount, data.code);
    startTimerLoop(data.nextSpinAt);
    await loadProfile();
  } catch (error) {
    console.error(error);
    spinBtn.disabled = false;
  }
};

navLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const path = link.getAttribute('href');
    navigate(path);
  });
});

document.querySelectorAll('[data-route="/menu"], [data-route="/discounts"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const path = btn.getAttribute('data-route');
    navigate(path);
  });
});

window.addEventListener('popstate', () => {
  setActivePage(location.pathname);
});

spinBtn.addEventListener('click', spin);
closeBtn.addEventListener('click', () => resultModal.classList.add('hidden'));

setActivePage(location.pathname);

initIdentify();
drawWheel();
