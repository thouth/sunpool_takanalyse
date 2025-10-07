// backend/src/middleware/validateRequest.js
const isEmpty = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const typeCheckers = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && !Number.isNaN(value),
  boolean: (value) => typeof value === 'boolean',
  object: (value) => value && typeof value === 'object' && !Array.isArray(value),
  array: (value) => Array.isArray(value),
};

const validateField = (value, config, path, errors) => {
  const fieldPath = path.join('.');

  if (config.required && isEmpty(value)) {
    errors.push(config.requiredMessage || `${fieldPath} is required`);
    return;
  }

  if (isEmpty(value)) {
    return;
  }

  if (config.type) {
    const checker = typeCheckers[config.type];
    if (checker && !checker(value)) {
      errors.push(config.typeMessage || `${fieldPath} must be of type ${config.type}`);
      return;
    }
  }

  if (config.enum && !config.enum.includes(value)) {
    errors.push(config.enumMessage || `${fieldPath} must be one of: ${config.enum.join(', ')}`);
  }

  if (config.pattern && typeof value === 'string' && !config.pattern.test(value)) {
    errors.push(config.patternMessage || `${fieldPath} has invalid format`);
  }

  if (typeof value === 'number') {
    if (config.min !== undefined && value < config.min) {
      errors.push(config.minMessage || `${fieldPath} must be at least ${config.min}`);
    }
    if (config.max !== undefined && value > config.max) {
      errors.push(config.maxMessage || `${fieldPath} must be at most ${config.max}`);
    }
  }

  if (config.custom && typeof config.custom === 'function') {
    const customResult = config.custom(value);
    if (typeof customResult === 'string') {
      errors.push(customResult);
    }
  }

  if (config.type === 'object' && config.properties) {
    Object.entries(config.properties).forEach(([key, childConfig]) => {
      validateField(value[key], childConfig, [...path, key], errors);
    });
  }

  if (config.type === 'array' && config.items) {
    value.forEach((item, index) => {
      validateField(item, config.items, [...path, index], errors);
    });
  }
};

const validateSection = (schemaSection, requestSection, sectionName, errors) => {
  if (!schemaSection) {
    return;
  }

  Object.entries(schemaSection).forEach(([field, config]) => {
    validateField(requestSection[field], config, [sectionName, field], errors);
  });
};

const validateRequest = (schema = {}) => (req, res, next) => {
  const errors = [];

  validateSection(schema.params, req.params || {}, 'params', errors);
  validateSection(schema.query, req.query || {}, 'query', errors);
  validateSection(schema.body, req.body || {}, 'body', errors);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
  }

  return next();
};

module.exports = validateRequest;
