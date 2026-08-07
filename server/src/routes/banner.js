const express = require('express');
const { getBanner, setBanner } = require('../store');

const router = express.Router();

const MAX_TEXT_LENGTH = 2000;

function requireAdminToken(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'invalid or missing admin token' });
  }
  return next();
}

// Public: read the current banner text for an account. No auth - this is
// called from every user's browser while they have the deals list open.
router.get('/banner', async (req, res, next) => {
  try {
    const domain = String(req.query.domain || '').trim();
    if (!domain) {
      return res.status(400).json({ error: 'domain query param is required' });
    }
    const banner = await getBanner(domain);
    return res.json(banner);
  } catch (err) {
    return next(err);
  }
});

// Admin only: create/update the banner text for an account.
router.put('/banner', requireAdminToken, async (req, res, next) => {
  try {
    const domain = String((req.body && req.body.domain) || '').trim();
    const text = String((req.body && req.body.text) || '');

    if (!domain) {
      return res.status(400).json({ error: 'domain is required' });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be at most ${MAX_TEXT_LENGTH} characters` });
    }

    const banner = await setBanner(domain, text);
    return res.json(banner);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
