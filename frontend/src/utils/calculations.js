// frontend/src/utils/calculations.js
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const calculateAnnualProduction = (capacityKwp, specificYield, weather = {}) => {
  if (!capacityKwp || !specificYield) {
    return 0;
  }

  const modifier = typeof weather.productionModifier === 'number'
    ? clamp(weather.productionModifier, 0.75, 1.15)
    : weather.clearnessIndex
      ? clamp(0.85 + (weather.clearnessIndex - 0.5) * 1.1, 0.75, 1.15)
      : 1;

  return Math.round(capacityKwp * specificYield * modifier);
};

export const calculateCo2Savings = (annualProductionKwh, emissionFactor = 0.4) => {
  if (!annualProductionKwh) {
    return 0;
  }

  return Math.round((annualProductionKwh * emissionFactor) / 1000 * 10) / 10; // tons per year (1 decimal)
};

export const calculateAnnualSavings = (annualProductionKwh, electricityPrice = 1.2) => {
  if (!annualProductionKwh) {
    return 0;
  }

  return Math.round(annualProductionKwh * electricityPrice);
};

export const calculatePaybackPeriod = (
  capacityKwp,
  specificYield,
  weather = {},
  { investmentPerKwp = 12000, supportRate = 0.35, electricityPrice = 1.2 } = {},
) => {
  if (!capacityKwp || !specificYield) {
    return 0;
  }

  const investmentCost = capacityKwp * investmentPerKwp;
  const support = investmentCost * supportRate;
  const netCost = investmentCost - support;

  const annualProduction = calculateAnnualProduction(capacityKwp, specificYield, weather);
  const annualSavings = calculateAnnualSavings(annualProduction, electricityPrice);

  if (!annualSavings) {
    return 0;
  }

  return Math.max(1, Math.round(netCost / annualSavings));
};

export const formatNumber = (value, options = {}) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }

  return new Intl.NumberFormat('no-NO', {
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }

  return new Intl.NumberFormat('no-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatPercentage = (value, fractionDigits = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }

  return `${value.toFixed(fractionDigits)}%`;
};

export const formatEnergy = (value) => `${formatNumber(value)} kWh`;

export const formatTonsPerYear = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }

  return `${formatNumber(value, { maximumFractionDigits: 1 })} tonn/år`;
};

export const formatYears = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '–';
  }

  return `${formatNumber(value)} år`;
};
