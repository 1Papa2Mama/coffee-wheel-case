const crypto = require('crypto');
const { couponExpiresDays } = require('./config');

const discountWeights = [
  { percent: 10, weight: 45 },
  { percent: 15, weight: 25 },
  { percent: 20, weight: 15 },
  { percent: 30, weight: 10 },
  { percent: 50, weight: 5 }
];

const pickDiscount = () => {
  const totalWeight = discountWeights.reduce((sum, item) => sum + item.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const item of discountWeights) {
    cumulative += item.weight;
    if (roll <= cumulative) {
      return item.percent;
    }
  }
  return discountWeights[0].percent;
};

const generateCouponCode = () => {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `VC-${random}`;
};

const calculateExpiry = (issuedAt) => {
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + couponExpiresDays);
  return expiresAt.toISOString();
};

module.exports = {
  pickDiscount,
  generateCouponCode,
  calculateExpiry
};
