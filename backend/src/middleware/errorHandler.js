// backend/src/middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isClientError = status >= 400 && status < 500;

  if (!isClientError) {
    console.error('Unhandled error:', err);
  }

  const response = {
    success: false,
    error: err.message || 'Internal server error',
  };

  if (err.details && Array.isArray(err.details)) {
    response.details = err.details;
  }

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
};
