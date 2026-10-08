function parseEntryYear(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d{4}$/.test(value))) return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= new Date().getFullYear() ? year : null;
}

module.exports = { parseEntryYear };
