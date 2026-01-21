const crypto = require('crypto');
const { run, get, all } = require('../db');
const {
  adminPassword,
  sessionSecret,
  spinCooldownDays,
  spinRateLimitMs
} = require('../config');
const { pickDiscount, generateCouponCode, calculateExpiry } = require('../wheelLogic');

const rateLimitMap = new Map();

const signToken = (payload) =>
  crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');

const createSessionToken = (userId) => {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const signature = signToken(payload);
  return `${payload}.${signature}`;
};

const verifySessionToken = (token) => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, issuedAt, signature] = parts;
  const payload = `${userId}.${issuedAt}`;
  const expected = signToken(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return Number(userId);
};

const touchExpiredCoupons = async () => {
  const now = new Date().toISOString();
  await run(
    `UPDATE coupons
     SET status = 'expired'
     WHERE status = 'active' AND expires_at < ?`,
    [now]
  );
};

const requireUser = async (req, res, next) => {
  const token = req.cookies.sessionToken;
  const userId = verifySessionToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  return next();
};

const requireAdmin = async (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = await get(
    'SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?',
    [token, new Date().toISOString()]
  );
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
};

const logEvent = async (userId, type, meta) => {
  await run(
    'INSERT INTO events (user_id, type, created_at, meta) VALUES (?, ?, ?, ?)',
    [userId, type, new Date().toISOString(), meta ? JSON.stringify(meta) : null]
  );
};

const api = (app) => {
  app.post('/api/identify', async (req, res) => {
    const { client_id: clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const now = new Date().toISOString();
    const existing = await get('SELECT * FROM users WHERE client_id = ?', [clientId]);
    let userId;
    if (existing) {
      userId = existing.id;
    } else {
      const result = await run(
        'INSERT INTO users (client_id, created_at) VALUES (?, ?)',
        [clientId, now]
      );
      userId = result.lastID;
    }

    const token = createSessionToken(userId);
    res.cookie('sessionToken', token, {
      httpOnly: true,
      sameSite: 'lax'
    });

    await logEvent(userId, 'identify', { clientId });

    return res.json({ ok: true });
  });

  app.get('/api/me', requireUser, async (req, res) => {
    await touchExpiredCoupons();
    const coupons = await all(
      `SELECT * FROM coupons WHERE user_id = ? AND status = 'active' ORDER BY issued_at DESC`,
      [req.user.id]
    );

    const nextSpinAt = req.user.last_spin_at
      ? new Date(req.user.last_spin_at).getTime() + spinCooldownDays * 24 * 60 * 60 * 1000
      : null;

    return res.json({
      id: req.user.id,
      clientId: req.user.client_id,
      coupons,
      nextSpinAt
    });
  });

  app.post('/api/wheel/spin', requireUser, async (req, res) => {
    const now = Date.now();
    const key = `${req.user.id}`;
    const lastAttempt = rateLimitMap.get(key) || 0;
    if (now - lastAttempt < spinRateLimitMs) {
      return res.status(429).json({ error: 'Слишком частые запросы. Попробуйте позже.' });
    }
    rateLimitMap.set(key, now);

    const lastSpin = req.user.last_spin_at ? new Date(req.user.last_spin_at).getTime() : 0;
    const nextAllowed = lastSpin + spinCooldownDays * 24 * 60 * 60 * 1000;

    if (now < nextAllowed) {
      return res.status(403).json({
        error: 'Cooldown',
        nextSpinAt: nextAllowed
      });
    }

    const discount = pickDiscount();
    let code = generateCouponCode();
    const issuedAt = new Date().toISOString();
    const expiresAt = calculateExpiry(issuedAt);

    let attempts = 0;
    while (attempts < 5) {
      const existing = await get('SELECT id FROM coupons WHERE code = ?', [code]);
      if (!existing) break;
      code = generateCouponCode();
      attempts += 1;
    }

    await run(
      `INSERT INTO coupons (user_id, discount_percent, code, issued_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [req.user.id, discount, code, issuedAt, expiresAt]
    );

    await run('UPDATE users SET last_spin_at = ? WHERE id = ?', [issuedAt, req.user.id]);

    await logEvent(req.user.id, 'spin', { discount, code });

    const nextSpinAt = new Date(issuedAt).getTime() + spinCooldownDays * 24 * 60 * 60 * 1000;

    return res.json({
      discount,
      code,
      issuedAt,
      expiresAt,
      nextSpinAt
    });
  });

  app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);

    await run(
      'INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)',
      [token, createdAt.toISOString(), expiresAt.toISOString()]
    );

    res.cookie('adminToken', token, {
      httpOnly: true,
      sameSite: 'lax'
    });

    return res.json({ ok: true });
  });

  app.get('/api/coupons', requireAdmin, async (req, res) => {
    await touchExpiredCoupons();
    const coupons = await all(
      `SELECT coupons.*, users.client_id
       FROM coupons
       JOIN users ON coupons.user_id = users.id
       ORDER BY coupons.issued_at DESC`
    );
    return res.json({ coupons });
  });

  app.post('/api/coupons/:id/use', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const coupon = await get('SELECT * FROM coupons WHERE id = ?', [id]);
    if (!coupon) {
      return res.status(404).json({ error: 'Купон не найден' });
    }
    if (coupon.status !== 'active') {
      return res.status(400).json({ error: 'Купон уже закрыт' });
    }
    await run(
      'UPDATE coupons SET status = ?, used_at = ? WHERE id = ?',
      ['used', new Date().toISOString(), id]
    );
    return res.json({ ok: true });
  });

  app.get('/api/coupons/verify', requireAdmin, async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }
    await touchExpiredCoupons();
    const coupon = await get('SELECT * FROM coupons WHERE code = ?', [code]);
    if (!coupon) {
      return res.json({ status: 'invalid' });
    }
    return res.json({
      status: coupon.status,
      coupon
    });
  });
};

module.exports = api;
