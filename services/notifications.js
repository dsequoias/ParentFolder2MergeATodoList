/**
 * Schedule/cancel reminder notifications for tasks.
 * Native: expo-notifications (when available) + in-app alert fallback when app is open.
 * Web: browser Notification API + setTimeout (reminders only fire while tab is open).
 */
import { Platform, Alert, AppState } from 'react-native';

let Audio = null;
let InterruptionModeAndroid = null;
if (Platform.OS !== 'web') {
  try {
    const av = require('expo-av');
    Audio = av.Audio;
    InterruptionModeAndroid = av.InterruptionModeAndroid;
  } catch (_) {}
}

let Notifications = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications').default;
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
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
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
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

// In-app reminder fallback when system notifications don't fire (e.g. expo-notifications not loaded)
const FOREGROUND_CHECK_INTERVAL_MS = 15 * 1000;  // check every 15s so we don't miss the minute
const REMINDER_WINDOW_AFTER_MS = 5 * 60 * 1000;  // show popup if user opens app up to 5 min after reminder time
const REMINDER_WINDOW_BEFORE_MS = 30 * 1000;     // show up to 30s before
const shownForegroundKeys = new Map(); // key -> timestamp when shown

/** Play a short sound when the in-app reminder pops up (native only; web uses playTestBeep). */
// Bundled asset so playback works without network. Create via: node scripts/create-reminder-sound.js
let REMINDER_SOUND_ASSET = null;
try {
  REMINDER_SOUND_ASSET = require('../assets/sounds/reminder.wav');
} catch (_) {
  // File missing if script wasn't run; reminders still show, just no sound
}

async function playReminderSound() {
  if (Platform.OS === 'web') return;
  if (!Audio || !REMINDER_SOUND_ASSET) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid?.DoNotMix ?? 1,
    });
    const { sound } = await Audio.Sound.createAsync(REMINDER_SOUND_ASSET, { shouldPlay: false });
    await sound.setVolumeAsync(1.0);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status?.didJustFinish) sound.unloadAsync();
    });
    await sound.playAsync();
  } catch (e) {
    console.warn('Reminder sound failed:', e?.message || e);
  }
}

async function checkForegroundReminders(getTodos) {
  try {
    const todos = await getTodos();
    if (!Array.isArray(todos)) return;
    const now = Date.now();
    for (const todo of todos) {
      if (todo.Completed === 1) continue;
      const dueDate = todo.DueDate ?? todo.Date ?? null;
      const dueTime = todo.DueTime ?? todo.Time ?? null;
      const r1 = todo.ReminderMinutes ?? 0;
      const r2 = todo.Reminder2Minutes ?? 0;
      const r3 = todo.Reminder3Minutes ?? 0;
      if (!dueDate || (r1 === 0 && r2 === 0 && r3 === 0)) continue;
      const due = parseDueDateTime(dueDate, dueTime);
      if (!due || isNaN(due.getTime())) continue;
      const minutes = [r1, r2, r3];
      for (let i = 0; i < minutes.length; i++) {
        const reminderMinutes = minutes[i];
        if (reminderMinutes === 0) continue;
        const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000;
        const triggerTs = due.getTime() - offsetMs;
        const key = `${todo.TaskID}-${i}-${triggerTs}`;
        if (triggerTs <= now + REMINDER_WINDOW_BEFORE_MS && triggerTs >= now - REMINDER_WINDOW_AFTER_MS) {
          if (!shownForegroundKeys.has(key)) {
            shownForegroundKeys.set(key, now);
            playReminderSound();
            Alert.alert('Reminder', (todo.Task || 'Task') + (dueTime ? ` — due ${dueTime}` : ''));
          }
        }
      }
    }
    for (const [key, ts] of shownForegroundKeys.entries()) {
      if (now - ts > 5 * 60 * 1000) shownForegroundKeys.delete(key);
    }
  } catch (_) {}
}

let foregroundCheckerInterval = null;
let foregroundCheckerSubscription = null;

/**
 * Start checking for due reminders while the app is open. Shows an in-app Alert when a reminder
 * is due, even if system notifications (expo-notifications) are not working.
 * Call once after DB is ready, e.g. from App.js with getTodos = () => getAllTodos().
 * Returns a cleanup function to stop the checker.
 */
export function startForegroundReminderChecker(getTodos) {
  if (typeof getTodos !== 'function') return () => {};
  if (foregroundCheckerInterval) clearInterval(foregroundCheckerInterval);
  if (foregroundCheckerSubscription) foregroundCheckerSubscription.remove();
  checkForegroundReminders(getTodos);
  foregroundCheckerInterval = setInterval(() => checkForegroundReminders(getTodos), FOREGROUND_CHECK_INTERVAL_MS);
  foregroundCheckerSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') checkForegroundReminders(getTodos);
  });
  return () => {
    if (foregroundCheckerInterval) {
      clearInterval(foregroundCheckerInterval);
      foregroundCheckerInterval = null;
    }
    if (foregroundCheckerSubscription) {
      foregroundCheckerSubscription.remove();
      foregroundCheckerSubscription = null;
    }
  };
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
        if (reminderMinutes === 0) continue; // None
        const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000; // -1 = at due time
        const triggerDate = new Date(due.getTime() - offsetMs);
        const ms = triggerDate.getTime() - Date.now();
        if (ms <= 0) continue;
        const id = setTimeout(() => {
          try {
            new Notification('Reminder', { body: taskTitle });
          } catch (_) {}
          playTestBeep();
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
      if (reminderMinutes === 0) continue; // None
      const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000; // -1 = at due time
      const triggerDate = new Date(due.getTime() - offsetMs);
      if (triggerDate.getTime() <= Date.now()) continue;
      const identifier = `todo-${TaskID}-${i + 1}`;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Reminder',
          body: taskTitle,
          data: { TaskID, taskTitle },
          sound: true,
          ...(Platform.OS === 'android' && {
            channelId: REMINDER_CHANNEL_ID,
            vibrate: [0, 250, 250, 250],
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
          }),
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
 * Reschedule reminders for all incomplete todos that have due date, time, and at least one reminder.
 * Call after loading the todo list so reminders work after app start/refresh (web) and are restored (native).
 */
export async function scheduleRemindersForTodoList(todos) {
  if (!Array.isArray(todos)) return;
  for (const todo of todos) {
    if (todo.Completed === 1) continue;
    const dueDate = todo.DueDate ?? todo.Date ?? null;
    const dueTime = todo.DueTime ?? todo.Time ?? null;
    const r1 = todo.ReminderMinutes ?? 0;
    const r2 = todo.Reminder2Minutes ?? 0;
    const r3 = todo.Reminder3Minutes ?? 0;
    if (!dueDate || (r1 === 0 && r2 === 0 && r3 === 0)) continue;
    try {
      await scheduleReminders(todo.TaskID, todo.Task ?? '', dueDate, dueTime, [r1, r2, r3]);
    } catch (_) {}
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

/** Web: play a short double beep so the reminder is audible (e.g. when notification is suppressed). */
function playTestBeep() {
  try {
    if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const playTone = (startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    playTone(ctx.currentTime, 0.2);
    playTone(ctx.currentTime + 0.35, 0.25);
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
  if (!Notifications) return { ok: false, reason: 'Notifications not available' };
  try {
    const granted = await requestReminderPermissions();
    if (!granted) return { ok: false, reason: 'permission-denied' };
    const triggerDate = new Date(Date.now() + 10 * 1000);
    await Notifications.scheduleNotificationAsync({
      identifier: 'todo-test-10sec',
      content: {
        title: 'DailyDuty test',
        body: 'Reminder test — if you see this, reminders work!',
        sound: true,
        ...(Platform.OS === 'android' && {
          channelId: REMINDER_CHANNEL_ID,
          vibrate: [0, 250, 250, 250],
          priority: (Notifications.AndroidNotificationPriority && Notifications.AndroidNotificationPriority.MAX) || 'max',
        }),
      },
      trigger: { type: 'date', date: triggerDate },
    });
    return { ok: true, delaySeconds: 10 };
  } catch (e) {
    console.warn('Test notification error:', e);
    return { ok: false, reason: String(e?.message || e) };
  }
}
