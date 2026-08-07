const path = require('path');
const express = require('express');
const cors = require('cors');
const bannerRoutes = require('./routes/banner');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').trim();

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGINS === '*' ? true : ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', bannerRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`service-banner backend listening on port ${PORT}`);
});
