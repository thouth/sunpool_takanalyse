// backend/src/middleware/ratelimit.js
const rateLimit = require('express-rate-limit');

const DEFAULT_WINDOW_MS = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000;
const DEFAULT_MAX_REQUESTS = parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 50;

const createRateLimiter = (options = {}) => {
  const config = {
    windowMs: DEFAULT_WINDOW_MS,
    max: DEFAULT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'For mange forespørsler. Vennligst prøv igjen senere.',
    },
    // KRITISK: Disable validation for production
    validate: {
      xForwardedForHeader: false,
      trustProxy: false,
    },
    ...options,
  };
  
  return rateLimit(config);
};

module.exports = {
  createRateLimiter,
  defaultLimiter: createRateLimiter(),
};
