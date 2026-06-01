// Minimal Vercel function - tests if functions work at all
module.exports = (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
};
