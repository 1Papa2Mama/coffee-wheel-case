const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const pages = require('./routes/pages');
const api = require('./routes/api');
require('./db');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

pages(app);
api(app);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, () => {
  console.log(`Vector Coffee server running on port ${config.port}`);
});
