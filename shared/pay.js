/**
 * Pure earnings arithmetic. Amounts are whole rupees.
 * perHour and dailyEquivalent are null when hours is not positive.
 */
export function computePay({ earnings, hours, fuel = 0, other = 0 }) {
  const costs = Math.round(fuel + other);
  const net = Math.round(earnings - costs);
  const perHour = hours > 0 ? Math.round(net / hours) : null;
  const dailyEquivalent = hours > 0 ? Math.round((net / hours) * 8) : null;
  const costShare = earnings > 0 ? Math.round((costs / earnings) * 100) / 100 : 0;
  return { earnings, hours, fuel, other, costs, net, perHour, dailyEquivalent, costShare };
}

/**
 * Compare an 8-hour equivalent with the daily minimum wage.
 * fair: at least 110% of the minimum. low: 80% to 110%. very_low: under 80%. unknown: no data.
 */
export function payVerdict(dailyEquivalent, minimumWageDaily) {
  if (!isPositive(dailyEquivalent) || !isPositive(minimumWageDaily)) return "unknown";
  const ratio = dailyEquivalent / minimumWageDaily;
  if (ratio >= 1.1) return "fair";
  if (ratio >= 0.8) return "low";
  return "very_low";
}

/**
 * Sum log entries from the last `days` days, counting today.
 * Each entry has { date: "YYYY-MM-DD", net, hours }.
 */
export function summarizeLog(entries, { days = 7, today = new Date() } = {}) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const recent = entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= cutoff);
  const total = recent.reduce((sum, entry) => sum + (entry.net ?? 0), 0);
  const hours = recent.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
  const best = recent.reduce((top, entry) => (top === null || entry.net > top.net ? entry : top), null);
  return { days, count: recent.length, total, hours, perHour: hours > 0 ? Math.round(total / hours) : null, best };
}

function isPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
