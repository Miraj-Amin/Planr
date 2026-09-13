// dates.js — working-day date math for the scheduling engine.
// Working days = Mon–Fri. Holidays could be layered in later.

export const iso = d => d.toISOString().slice(0, 10);
export const parse = s => (s ? new Date(s + 'T00:00:00') : null);

export const fmt = s => {
  const d = parse(s);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
};
export const fmtLong = s => {
  const d = parse(s);
  return d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
};

export const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;

// add N working days to a date (N can be negative)
export function addWorkingDays(date, n) {
  const d = new Date(date);
  if (n === 0) return d;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

// count working days between two dates, inclusive of start, exclusive of end
export function workingDaysBetween(a, b) {
  let count = 0;
  const d = new Date(a);
  const end = new Date(b);
  const step = end >= d ? 1 : -1;
  while ((step > 0 && d < end) || (step < 0 && d > end)) {
    d.setDate(d.getDate() + step);
    if (!isWeekend(d)) count += step;
  }
  return count;
}

// end date = start + (duration-1) working days (duration counts the start day)
export function endFromDuration(startISO, durationDays) {
  if (!startISO || !durationDays) return null;
  const start = parse(startISO);
  return iso(addWorkingDays(start, durationDays - 1));
}

export function durationFromDates(startISO, endISO) {
  if (!startISO || !endISO) return null;
  return workingDaysBetween(parse(startISO), parse(endISO)) + 1;
}

export const daysUntil = (isoDate, from = new Date()) =>
  Math.round((parse(isoDate) - stripTime(from)) / 86400000);

export const stripTime = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
