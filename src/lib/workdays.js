// workdays.js — Working-day arithmetic (Mon–Fri only, no holiday calendar).
// Mirrors Excel's WORKDAY: add N working days to a start date.

export function addWorkdays(start, days) {
  if (!(start instanceof Date)) start = new Date(start);
  if (!Number.isFinite(days)) days = 0;
  const d = new Date(start.getTime());
  let added = 0;
  const step = days >= 0 ? 1 : -1;
  const target = Math.abs(days);
  while (added < target) {
    d.setDate(d.getDate() + step);
    const dow = d.getDay(); // 0=Sun 6=Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export function isoDate(d) {
  if (!d) return null;
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Count workdays between two dates, inclusive. If a > b, returns 0.
export function workdaysBetween(a, b) {
  if (!a || !b) return 0;
  const start = new Date(a);
  const end = new Date(b);
  if (start > end) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
