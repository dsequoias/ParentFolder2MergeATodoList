/**
 * Schedule/cancel reminder notifications for tasks.
 * Native: expo-notifications.
 * Web: browser Notification API + setTimeout (reminders only fire while tab is open).
 */
import { Platform } from 'react-native';

let Notifications = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications').default;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('expo-notifications not available:', e);
  }
}

const REMINDER_CHANNEL_ID = 'todo-reminders';

// Web: keep timeouts so we can cancel them (only works while tab is open)
const webTimeouts = {};
let webTestNotificationTimeoutId = null;

/** Web: check if notifications are supported (secure context + API). */
export function isNotificationSupported() {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return true;
}

export async function requestReminderPermissions() {
  if (Platform.OS === 'web') {
    try {
      if (!isNotificationSupported()) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn('Web reminder permission error:', e);
      return false;
    }
  }
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Task reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: true,
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    return final === 'granted';
  } catch (e) {
    console.warn('Reminder permission error:', e);
    return false;
  }
}

function parseDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  let h = 0, min = 0, s = 0;
  if (dueTime) {
    const parts = dueTime.split(':').map(Number);
    h = parts[0] || 0;
    min = parts[1] || 0;
    s = parts[2] || 0;
  }
  return new Date(y, m - 1, d, h, min, s);
}

/**
 * Schedule up to 3 reminder notifications for a task.
 * On web: uses setTimeout; reminders only fire while the tab is open.
 */
export async function scheduleReminders(TaskID, taskTitle, dueDate, dueTime, reminderMinutesArray) {
  if (Platform.OS === 'web') {
    try {
      await cancelReminder(TaskID);
      if (!isNotificationSupported() || Notification.permission !== 'granted') return;
      const due = parseDueDateTime(dueDate, dueTime);
      if (!due || isNaN(due.getTime())) return;
      const minutes = Array.isArray(reminderMinutesArray) ? reminderMinutesArray.slice(0, 3) : [];
      const ids = [];
      for (let i = 0; i < minutes.length; i++) {
        const reminderMinutes = minutes[i];
        if (!reminderMinutes || reminderMinutes <= 0) continue;
        const triggerDate = new Date(due.getTime() - reminderMinutes * 60 * 1000);
        const ms = triggerDate.getTime() - Date.now();
        if (ms <= 0) continue;
        const id = setTimeout(() => {
          try {
            new Notification('Reminder', { body: taskTitle });
          } catch (_) {}
        }, ms);
        ids.push(id);
      }
      if (ids.length) webTimeouts[TaskID] = ids;
    } catch (e) {
      console.warn('Web schedule reminders error:', e);
    }
    return;
  }
  if (!Notifications) return;
  try {
    await cancelReminder(TaskID);
    const due = parseDueDateTime(dueDate, dueTime);
    if (!due || isNaN(due.getTime())) return;
    const minutes = Array.isArray(reminderMinutesArray) ? reminderMinutesArray.slice(0, 3) : [];
    for (let i = 0; i < minutes.length; i++) {
      const reminderMinutes = minutes[i];
      if (!reminderMinutes || reminderMinutes <= 0) continue;
      const triggerDate = new Date(due.getTime() - reminderMinutes * 60 * 1000);
      if (triggerDate.getTime() <= Date.now()) continue;
      const identifier = `todo-${TaskID}-${i + 1}`;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Reminder',
          body: taskTitle,
          data: { TaskID, taskTitle },
          sound: true,
          ...(Platform.OS === 'android' && { channelId: REMINDER_CHANNEL_ID }),
        },
        trigger: {
          type: 'date',
          date: triggerDate,
        },
      });
    }
  } catch (e) {
    console.warn('Schedule reminders error:', e);
  }
}

/**
 * Cancel all scheduled reminders for a task (up to 3).
 */
export async function cancelReminder(TaskID) {
  if (Platform.OS === 'web') {
    const ids = webTimeouts[TaskID];
    if (ids) {
      ids.forEach((id) => clearTimeout(id));
      delete webTimeouts[TaskID];
    }
    return;
  }
  if (!Notifications) return;
  try {
    for (let i = 1; i <= 3; i++) {
      await Notifications.cancelScheduledNotificationAsync(`todo-${TaskID}-${i}`);
    }
  } catch (_) {}
}

/** Web: play a short beep as fallback when notification may be suppressed (e.g. tab in background). */
function playTestBeep() {
  try {
    if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

/**
 * Schedule a single test notification (web: 3 seconds + beep fallback; native: 10 seconds).
 * On web, permission must be granted first; call requestReminderPermissions() from a user gesture (e.g. button click).
 */
export async function scheduleTestNotification() {
  if (Platform.OS === 'web') {
    const TEST_DELAY_MS = 3 * 1000;
    try {
      if (!isNotificationSupported()) {
        console.warn('Notifications require HTTPS or localhost and a supporting browser.');
        return { ok: false, reason: 'not-supported' };
      }
      if (Notification.permission !== 'granted') {
        const granted = await requestReminderPermissions();
        if (!granted) return { ok: false, reason: 'permission-denied' };
      }
      if (webTestNotificationTimeoutId != null) {
        clearTimeout(webTestNotificationTimeoutId);
        webTestNotificationTimeoutId = null;
      }
      webTestNotificationTimeoutId = setTimeout(() => {
        webTestNotificationTimeoutId = null;
        try {
          const n = new Notification('DailyDuty reminder', {
            body: 'Reminder test — if you see this, reminders work!',
            tag: 'todo-test',
            requireInteraction: false,
          });
          if (typeof window !== 'undefined' && window.focus) n.onclick = () => window.focus();
        } catch (e) {
          console.warn('Test notification failed:', e);
        }
        playTestBeep();
      }, TEST_DELAY_MS);
      return { ok: true, delaySeconds: 3 };
    } catch (e) {
      console.warn('Test notification error:', e);
      return { ok: false, reason: String(e?.message || e) };
    }
  }
  if (!Notifications) return;
  try {
    const granted = await requestReminderPermissions();
    if (!granted) return;
    const triggerDate = new Date(Date.now() + 10 * 1000);
    await Notifications.scheduleNotificationAsync({
      identifier: 'todo-test-10sec',
      content: {
        title: 'DailyDuty test',
        body: 'Reminder test — if you see this, reminders work!',
        sound: true,
        ...(Platform.OS === 'android' && { channelId: REMINDER_CHANNEL_ID }),
      },
      trigger: { type: 'date', date: triggerDate },
    });
  } catch (e) {
    console.warn('Test notification error:', e);
  }
}
