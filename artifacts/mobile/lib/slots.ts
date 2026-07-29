/**
 * Scheduling slots for non-instant bookings.
 *
 * Slots are generated from the device clock rather than hardcoded, so the list
 * never offers a time that has already passed.
 */

/** Experts work 08:00–20:00; the last start is one slot before closing. */
const FIRST_HOUR = 8;
const LAST_HOUR = 20;

/** Earliest a scheduled visit can start, in hours from now. */
const LEAD_HOURS = 2;

const SLOT_STEP_HOURS = 2;

export interface Slot {
  /** Stable identifier, e.g. `2026-07-30T09:00`. */
  key: string;
  /** Day heading: "Today", "Tomorrow", or "Fri, 31 Jul". */
  day: string;
  /** Time only: "9:00 AM". */
  time: string;
  /** Full label persisted onto the booking: "Tomorrow, 9:00 AM". */
  label: string;
}

/**
 * The next `count` bookable slots, starting at least `LEAD_HOURS` from now and
 * rolling into following days once the current day is exhausted.
 */
export function buildSlots(count = 8, now: Date = new Date()): Slot[] {
  const slots: Slot[] = [];

  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + LEAD_HOURS);
  // Align to the slot grid (even hours).
  if (cursor.getHours() % SLOT_STEP_HOURS !== 0) {
    cursor.setHours(cursor.getHours() + 1);
  }

  while (slots.length < count) {
    const hour = cursor.getHours();
    if (hour < FIRST_HOUR) {
      cursor.setHours(FIRST_HOUR);
      continue;
    }
    if (hour > LAST_HOUR - SLOT_STEP_HOURS) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(FIRST_HOUR);
      continue;
    }

    const day = describeDay(cursor, now);
    const time = cursor.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    slots.push({
      key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}T${pad(hour)}:00`,
      day,
      time,
      label: `${day}, ${time}`,
    });

    cursor.setHours(hour + SLOT_STEP_HOURS);
  }

  return slots;
}

function describeDay(date: Date, now: Date): string {
  const dayDiff = daysBetween(now, date);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Whole calendar days from `a` to `b`, ignoring the time of day. */
function daysBetween(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86_400_000);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
