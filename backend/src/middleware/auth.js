// backend/src/middleware/auth.js
const extractToken = (req) => {
  const apiKeyHeader = req.get('x-api-key');
  if (apiKeyHeader) {
    return apiKeyHeader.trim();
  }

  const authHeader = req.get('authorization');
  if (!authHeader) {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return authHeader.trim();
};

const requireApiKey = ({ optional = false } = {}) => (req, res, next) => {
  const configuredKey = process.env.API_ACCESS_KEY;

  if (!configuredKey) {
    req.authenticated = true;
    return next();
  }

  const providedKey = extractToken(req);

  if (!providedKey) {
    if (optional) {
      req.authenticated = false;
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized – missing API key',
    });
  }

  if (providedKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized – invalid API key',
    });
  }

  req.authenticated = true;
  return next();
};

module.exports = {
  requireApiKey,
};
