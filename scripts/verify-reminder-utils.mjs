/**
 * Quick sanity checks for reminderUtils (run: npm test)
 */
import assert from 'assert';
import {
  MAX_REMINDERS,
  REMINDER_AT_DUE_TIME,
  reminderMinutesArrayFromTodo,
  legacyReminderColumnsFromArray,
} from '../services/reminderUtils.js';

assert.strictEqual(MAX_REMINDERS, 24, 'MAX_REMINDERS should be 24');
assert.strictEqual(REMINDER_AT_DUE_TIME, -1);

assert.deepStrictEqual(
  reminderMinutesArrayFromTodo({ RemindersJSON: '[10,20,30]' }),
  [10, 20, 30],
  'parse RemindersJSON'
);

assert.deepStrictEqual(
  reminderMinutesArrayFromTodo({ ReminderMinutes: 5, Reminder2Minutes: 0, Reminder3Minutes: 15 }),
  [5, 15],
  'legacy columns skip zeros'
);

const big = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
assert.strictEqual(
  reminderMinutesArrayFromTodo({ RemindersJSON: JSON.stringify(big) }).length,
  24,
  'cap at 24'
);

const cols = legacyReminderColumnsFromArray([120, 60, 30, 15]);
assert.strictEqual(cols.ReminderMinutes, 120);
assert.strictEqual(cols.Reminder3Minutes, 30);
assert.strictEqual(JSON.parse(cols.RemindersJSON).length, 4);

const empty = legacyReminderColumnsFromArray([]);
assert.strictEqual(empty.RemindersJSON, null);
assert.strictEqual(empty.ReminderMinutes, 0);

assert.deepStrictEqual(
  reminderMinutesArrayFromTodo({ Date: '2026-06-01', Time: '21:00:00' }),
  [REMINDER_AT_DUE_TIME],
  'default at-due when no stored reminders'
);

assert.deepStrictEqual(reminderMinutesArrayFromTodo({ Date: '', Time: '' }), [], 'no date/time → no default');

const atDueCols = legacyReminderColumnsFromArray([REMINDER_AT_DUE_TIME]);
assert.strictEqual(atDueCols.ReminderMinutes, -1);
assert.strictEqual(atDueCols.RemindersJSON, '[-1]');

console.log('verify-reminder-utils: all checks passed');
