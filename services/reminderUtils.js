/**
 * Minutes-before-due reminders per task. Stored in RemindersJSON as JSON array;
 * first three are also mirrored in ReminderMinutes / Reminder2Minutes / Reminder3Minutes for legacy code.
 */
import { MAX_REMINDERS_PER_TASK } from '../constants/reminders.js';

export const MAX_REMINDERS = MAX_REMINDERS_PER_TASK;

/** Sentinel: alarm/notification at task due date & time (not “X minutes before”). */
export const REMINDER_AT_DUE_TIME = -1;

export function hasDueDateTime(todo) {
  if (!todo) return false;
  const d = todo.DueDate ?? todo.Date;
  const t = todo.DueTime ?? todo.Time;
  return d != null && String(d).trim() !== '' && t != null && String(t).trim() !== '';
}

/**
 * Ordered list of minute offsets from todo row (JSON preferred, else legacy 3 columns).
 * Values: positive = minutes before due; REMINDER_AT_DUE_TIME (-1) = at due time.
 * If nothing stored but the task has date+time, defaults to one reminder at due time.
 */
export function reminderMinutesArrayFromTodo(todo) {
  if (!todo) return [];
  const raw = todo.RemindersJSON;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const parsed = arr
          .map((n) => (typeof n === 'number' ? n : parseInt(String(n), 10)))
          .filter((n) => !isNaN(n) && (n > 0 || n === REMINDER_AT_DUE_TIME))
          .slice(0, MAX_REMINDERS);
        if (parsed.length > 0) return parsed;
      }
    } catch (_) {
      /* fall through */
    }
  }
  const r1 = todo.ReminderMinutes ?? 0;
  const r2 = todo.Reminder2Minutes ?? 0;
  const r3 = todo.Reminder3Minutes ?? 0;
  const out = [];
  for (const m of [r1, r2, r3]) {
    if (m === REMINDER_AT_DUE_TIME) out.push(REMINDER_AT_DUE_TIME);
    else if (m > 0) out.push(m);
  }
  if (out.length > 0) return out.slice(0, MAX_REMINDERS);
  if (hasDueDateTime(todo)) return [REMINDER_AT_DUE_TIME];
  return [];
}

/** DB fields for insert/update from UI minutes list (positive ints and/or -1 at due, max MAX_REMINDERS). */
export function legacyReminderColumnsFromArray(minutesArray) {
  const a = (minutesArray || [])
    .filter((m) => (typeof m === 'number' && m > 0) || m === REMINDER_AT_DUE_TIME)
    .slice(0, MAX_REMINDERS);
  if (a.length === 0) {
    return {
      ReminderMinutes: 0,
      Reminder2Minutes: 0,
      Reminder3Minutes: 0,
      RemindersJSON: null,
    };
  }
  return {
    ReminderMinutes: a[0] ?? 0,
    Reminder2Minutes: a[1] ?? 0,
    Reminder3Minutes: a[2] ?? 0,
    RemindersJSON: JSON.stringify(a),
  };
}
