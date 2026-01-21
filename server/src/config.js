require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  dbPath: process.env.DB_PATH || './vector-coffee.sqlite',
  adminPassword: process.env.ADMIN_PASSWORD || 'vector-secret',
  sessionSecret: process.env.SESSION_SECRET || 'vector-session-secret',
  spinCooldownDays: 7,
  couponExpiresDays: 30,
  spinRateLimitMs: 5000
};

module.exports = config;
