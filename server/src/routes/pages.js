const path = require('path');

const siteRoot = path.join(__dirname, '..', '..', 'public');
const siteIndex = path.join(siteRoot, 'site', 'index.html');
const adminPage = path.join(siteRoot, 'admin', 'admin.html');

const pages = (app) => {
  app.get('/', (req, res) => {
    res.sendFile(siteIndex);
  });

  app.get('/admin', (req, res) => {
    res.sendFile(adminPage);
  });

  app.get(['/profile', '/menu', '/discounts'], (req, res) => {
    res.sendFile(siteIndex);
  });
};

module.exports = pages;
