// backend/src/middleware/ratelimit.js
const rateLimit = require('express-rate-limit');

const DEFAULT_WINDOW_MS = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000;
const DEFAULT_MAX_REQUESTS = parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 30;

const createRateLimiter = (options = {}) => rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'For mange forespørsler fra denne IP-adressen. Vennligst prøv igjen senere.',
  },
  ...options,
});

module.exports = {
  createRateLimiter,
  defaultLimiter: createRateLimiter(),
};
