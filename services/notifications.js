/**
 * Schedule/cancel reminder notifications for tasks.
 * Native: expo-notifications (when available) + in-app alert fallback when app is open.
 * Web: browser Notification API + setTimeout (reminders only fire while tab is open).
 */
import { Platform, Alert, AppState, Linking } from 'react-native';
import { MAX_REMINDERS, reminderMinutesArrayFromTodo } from './reminderUtils';

let createAudioPlayer = null;
let setAudioModeAsync = null;
if (Platform.OS !== 'web') {
  try {
    const audio = require('expo-audio');
    createAudioPlayer = audio.createAudioPlayer;
    setAudioModeAsync = audio.setAudioModeAsync;
  } catch (_) {}
}

let Haptics = null;
if (Platform.OS !== 'web') {
  try {
    Haptics = require('expo-haptics');
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

/** New channel id so installs pick up MAX importance + alarm audio (old channel settings stick otherwise). */
const REMINDER_CHANNEL_ID = 'todo-alarm-v1';

function getAndroidPackageName() {
  try {
    const Constants = require('expo-constants').default;
    return Constants?.expoConfig?.android?.package || 'com.dosDailyDuty';
  } catch (_) {
    return 'com.dosDailyDuty';
  }
}

/** Android 12+: opens system screen to allow exact alarm scheduling (required for on-time delivery). */
export function openAndroidExactAlarmSettings() {
  if (Platform.OS !== 'android') return;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    const action =
      IntentLauncher.ActivityAction?.REQUEST_SCHEDULE_EXACT_ALARM ||
      'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';
    const pkg = getAndroidPackageName();
    IntentLauncher.startActivityAsync(action, { data: `package:${pkg}` }).catch(() => {});
  } catch (_) {
    try {
      Linking.openSettings();
    } catch (_) {}
  }
}

/**
 * On Android, prompt for exact alarms + battery — required for background alarms on time.
 * Shown after scheduling (settings can reset after reboot).
 */
function promptBackgroundReminderSettingsIfNeeded() {
  if (Platform.OS !== 'android') return;
  Alert.alert(
    'Alarms when app is in background',
    'For reminders to ring on time when My.Daily.Duty is closed or in the background:\n\n1. Tap "Allow exact alarms" and turn it ON for this app\n2. Tap "App settings" → Battery → Unrestricted (if available)\n3. Use the Home button instead of swiping the app away from Recents',
    [
      { text: 'Later' },
      { text: 'Allow exact alarms', onPress: openAndroidExactAlarmSettings },
      {
        text: 'App settings',
        onPress: () => {
          try {
            Linking.openSettings();
          } catch (_) {}
        },
      },
    ]
  );
}

/** Normalize task name from todo row (DB may return Task or task) or string; never empty for display. */
function getTaskName(todoOrTitle) {
  if (todoOrTitle == null) return 'Task';
  if (typeof todoOrTitle === 'string') {
    const t = todoOrTitle.trim();
    return t || 'Task';
  }
  const name = (todoOrTitle.Task ?? todoOrTitle.task ?? '').toString().trim();
  return name || 'Task';
}

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

/** Android: (re)create high-priority alarm channel. Call before scheduling and from permission flow. */
async function ensureAndroidReminderChannelConfigured() {
  if (Platform.OS !== 'android' || !Notifications) return;
  try {
    const Imp = Notifications.AndroidImportance;
    const Usage = Notifications.AndroidAudioUsage;
    const Content = Notifications.AndroidAudioContentType;
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Task alarms',
      description: 'Reminder sounds at due times. Allow exact alarms in system settings for reliability.',
      importance: Imp?.MAX ?? Imp?.HIGH ?? 7,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 400, 200, 400, 200, 400, 200, 600],
      enableLights: true,
      ...(Usage &&
        Content && {
          audioAttributes: {
            usage: Usage.ALARM,
            contentType: Content.SONIFICATION,
            flags: {
              enforceAudibility: true,
              requestHardwareAudioVideoSynchronization: false,
            },
          },
        }),
      ...(Notifications.AndroidNotificationVisibility && {
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }),
    });
  } catch (e) {
    console.warn('Reminder channel setup error:', e?.message || e);
  }
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
    await ensureAndroidReminderChannelConfigured();
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

/** Parse date string (YYYY-MM-DD or M/D/YY or M/D/YYYY) and optional time (HH:MM or HH:MM:SS). */
function parseDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;
  let y, m, d;
  const isoMatch = String(dueDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    [, y, m, d] = isoMatch.map(Number);
  } else {
    const slashParts = String(dueDate).split(/[/-]/).map((n) => parseInt(n, 10));
    if (slashParts.length >= 3) {
      if (slashParts[0] > 31) {
        y = slashParts[0];
        m = slashParts[1];
        d = slashParts[2];
      } else {
        m = slashParts[0];
        d = slashParts[1];
        y = slashParts[2];
        if (y < 100) y += 2000;
      }
    } else return null;
  }
  let h = 0, min = 0, s = 0;
  if (dueTime) {
    const parts = String(dueTime).split(':').map(Number);
    h = parts[0] || 0;
    min = parts[1] || 0;
    s = parts[2] || 0;
  }
  const date = new Date(y, m - 1, d, h, min, s);
  return isNaN(date.getTime()) ? null : date;
}

/** Format due date/time for notification body so user sees when the task is due. */
function formatDueForNotification(dueDate, dueTime) {
  const due = parseDueDateTime(dueDate, dueTime);
  if (!due || isNaN(due.getTime())) return 'Due soon';
  const h = due.getHours();
  const m = due.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  return `Due at ${timeStr}`;
}

// In-app reminder fallback when system notifications don't fire (e.g. expo-notifications not loaded)
const FOREGROUND_CHECK_INTERVAL_MS = 10 * 1000;  // check every 10s so we don't miss the minute
const REMINDER_WINDOW_AFTER_MS = 5 * 60 * 1000; // in-app catch-up only shortly after due (avoid confusing late meds with other tasks)
const REMINDER_WINDOW_BEFORE_MS = 20 * 1000;     // only ~20s before due — avoids "alarm" a full minute early
/** Extra buffer after grace ends before we forget we showed (must NOT use "5 min since show" — that caused duplicate popups). */
const FOREGROUND_DEDUPE_CLEAR_AFTER_MS = 90 * 1000;
/** In-app alarm loop stops automatically after this long (OK still stops sooner). Prevents runaway playback (e.g. 10+ minutes if dismiss never runs). */
const REMINDER_SOUND_MAX_DURATION_MS = 2 * 60 * 1000; // 2 minutes
// shownForegroundKeys: key -> { triggerTs } — one popup per (task, reminder slot, due instant); clear only after grace window + buffer
const shownForegroundKeys = new Map();

/** Alarm-style looping sound when the in-app reminder pops up (native only; stops when user dismisses). */
// Bundled asset. Create via: node scripts/create-reminder-sound.js
let REMINDER_SOUND_ASSET = null;
try {
  REMINDER_SOUND_ASSET = require('../assets/sounds/reminder.wav');
} catch (_) {
  // File missing if script wasn't run; reminders still show, just no sound
}

let currentReminderSound = null;
let reminderSoundAutoStopTimer = null;

async function stopReminderSound() {
  if (reminderSoundAutoStopTimer != null) {
    clearTimeout(reminderSoundAutoStopTimer);
    reminderSoundAutoStopTimer = null;
  }
  if (currentReminderSound) {
    try {
      currentReminderSound.loop = false;
      currentReminderSound.pause();
      if (typeof currentReminderSound.remove === 'function') {
        currentReminderSound.remove();
      }
    } catch (_) {}
    currentReminderSound = null;
  }
}

/** Trigger haptic feedback so user feels the reminder even if sound fails (native only). */
function triggerReminderHaptic() {
  if (Platform.OS === 'web' || !Haptics) return;
  try {
    const type = Haptics.NotificationFeedbackType?.Warning ?? Haptics.NotificationFeedbackType ?? 1;
    Haptics.notificationAsync(type);
  } catch (_) {}
}

/** Start looping alarm sound; call stopReminderSound() when user dismisses the reminder (e.g. Alert onPress). */
async function playReminderSound() {
  if (Platform.OS === 'web') return;
  triggerReminderHaptic();
  if (!createAudioPlayer || !setAudioModeAsync || !REMINDER_SOUND_ASSET) return;
  try {
    await stopReminderSound();
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
    });
    const player = createAudioPlayer(REMINDER_SOUND_ASSET);
    currentReminderSound = player;
    player.volume = 1.0;
    player.loop = true;
    player.play();
    if (reminderSoundAutoStopTimer != null) {
      clearTimeout(reminderSoundAutoStopTimer);
    }
    reminderSoundAutoStopTimer = setTimeout(() => {
      reminderSoundAutoStopTimer = null;
      void stopReminderSound();
    }, REMINDER_SOUND_MAX_DURATION_MS);
  } catch (e) {
    console.warn('Reminder sound failed:', e?.message || e);
    currentReminderSound = null;
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
      const minutes = reminderMinutesArrayFromTodo(todo);
      if (!dueDate || minutes.length === 0) continue;
      const due = parseDueDateTime(dueDate, dueTime);
      if (!due || isNaN(due.getTime())) continue;
      for (let i = 0; i < minutes.length; i++) {
        const reminderMinutes = minutes[i];
        if (reminderMinutes === 0) continue;
        const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000;
        const triggerTs = due.getTime() - offsetMs;
        const key = `${todo.TaskID}|${i}|${triggerTs}`;
        if (triggerTs <= now + REMINDER_WINDOW_BEFORE_MS && triggerTs >= now - REMINDER_WINDOW_AFTER_MS) {
          if (!shownForegroundKeys.has(key)) {
            shownForegroundKeys.set(key, { triggerTs });
            const taskName = getTaskName(todo);
            const dueStr = due ? `Due at ${due.getHours() % 12 || 12}:${String(due.getMinutes()).padStart(2, '0')} ${due.getHours() >= 12 ? 'PM' : 'AM'}` : '';
            const message = dueStr ? `${dueStr}\n\n"${taskName}"` : `"${taskName}"`;
            const dismissSound = () => {
              void stopReminderSound();
            };
            if (Platform.OS === 'web') {
              playTestBeep();
            } else {
              // Must await so OK/back dismiss cannot run before currentReminderSound is set (otherwise sound never stops).
              await playReminderSound();
            }
            Alert.alert(
              'Reminder: ' + taskName,
              message,
              [{ text: 'OK', onPress: dismissSound }],
              Platform.OS === 'android' ? { cancelable: true, onDismiss: dismissSound } : undefined
            );
          }
        }
      }
    }
    for (const [key, rec] of shownForegroundKeys.entries()) {
      const ts = rec?.triggerTs;
      if (typeof ts === 'number' && now > ts + REMINDER_WINDOW_AFTER_MS + FOREGROUND_DEDUPE_CLEAR_AFTER_MS) {
        shownForegroundKeys.delete(key);
      }
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
    if (state === 'background' || state === 'inactive') stopReminderSound();
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
 * Schedule up to MAX_REMINDERS (24) reminder notifications for a task.
 * On web: uses setTimeout; reminders only fire while the tab is open.
 */
export async function scheduleReminders(TaskID, taskTitle, dueDate, dueTime, reminderMinutesArray) {
  if (Platform.OS === 'web') {
    try {
      await cancelReminder(TaskID);
      if (!isNotificationSupported() || Notification.permission !== 'granted') return;
      const due = parseDueDateTime(dueDate, dueTime);
      if (!due || isNaN(due.getTime())) return;
      const minutes = Array.isArray(reminderMinutesArray) ? reminderMinutesArray.slice(0, MAX_REMINDERS) : [];
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
            const name = getTaskName(taskTitle);
            new Notification('Reminder: ' + name, { body: name + ' — ' + formatDueForNotification(dueDate, dueTime) });
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
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (__DEV__) {
        console.warn(
          '[DailyDuty] Notifications not scheduled (permission not granted). Save a task after allowing notifications, or enable them in system settings.'
        );
      }
      return;
    }
    await ensureAndroidReminderChannelConfigured();
    await cancelReminder(TaskID);
    const due = parseDueDateTime(dueDate, dueTime);
    if (!due || isNaN(due.getTime())) return;
    const minutes = Array.isArray(reminderMinutesArray) ? reminderMinutesArray.slice(0, MAX_REMINDERS) : [];
    // Build list of { index, reminderMinutes, triggerDate } for non-zero reminders
    const toSchedule = [];
    for (let i = 0; i < minutes.length; i++) {
      const reminderMinutes = minutes[i];
      if (reminderMinutes === 0) continue; // None
      const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000; // -1 = at due time
      let triggerDate = new Date(due.getTime() - offsetMs);
      const now = Date.now();
      // If trigger is in the past: skip unless within last 1 min (fire "late" in 3 sec so user gets something)
      if (triggerDate.getTime() <= now) {
        if (triggerDate.getTime() >= now - 60 * 1000) {
          triggerDate = new Date(now + 3000);
        } else {
          continue;
        }
      }
      toSchedule.push({ index: i, reminderMinutes, triggerDate });
    }
    // Schedule in chronological order (earliest first) so the soonest alarm is registered first;
    // on Android this can help the first reminder fire reliably when app is in background.
    toSchedule.sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());
    const displayName = getTaskName(taskTitle);
    const scheduledIdentifiers = [];
    for (const { index: i, triggerDate } of toSchedule) {
      const identifier = `todo-${TaskID}-${i + 1}`;
      const triggerType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
      try {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Reminder: ' + displayName,
            body: `${displayName} — ${formatDueForNotification(dueDate, dueTime)}`,
            data: { TaskID, taskTitle: displayName },
            sound: Platform.OS === 'android' ? 'default' : true,
            ...(Platform.OS === 'android' && {
              channelId: REMINDER_CHANNEL_ID,
              color: '#C62828',
              vibrate: [0, 400, 200, 400, 200, 400],
              priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
            }),
          },
          trigger: {
            type: triggerType,
            date: triggerDate,
            ...(Platform.OS === 'android' && { channelId: REMINDER_CHANNEL_ID }),
          },
        });
        scheduledIdentifiers.push(identifier);
      } catch (schedErr) {
        console.warn('[DailyDuty] scheduleNotificationAsync failed:', identifier, schedErr?.message || schedErr);
      }
    }
    if (__DEV__ && scheduledIdentifiers.length > 0 && typeof Notifications.getAllScheduledNotificationsAsync === 'function') {
      try {
        const all = await Notifications.getAllScheduledNotificationsAsync();
        const idSet = new Set(all.map((r) => r.request?.identifier).filter(Boolean));
        for (const id of scheduledIdentifiers) {
          if (!idSet.has(id)) {
            console.warn('[DailyDuty] Notification not in system schedule after request:', id);
          }
        }
      } catch (e) {
        console.warn('[DailyDuty] getAllScheduledNotificationsAsync:', e?.message || e);
      }
    }
    if (Platform.OS === 'android' && toSchedule.length > 0) {
      promptBackgroundReminderSettingsIfNeeded();
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
    const minutes = reminderMinutesArrayFromTodo(todo);
    if (!dueDate || minutes.length === 0) continue;
    try {
      await scheduleReminders(todo.TaskID, getTaskName(todo), dueDate, dueTime, minutes);
    } catch (_) {}
  }
}

/**
 * Cancel all scheduled reminders for a task (up to MAX_REMINDERS slots).
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
    for (let i = 1; i <= MAX_REMINDERS; i++) {
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
    const play = () => {
      playTone(ctx.currentTime, 0.2);
      playTone(ctx.currentTime + 0.35, 0.25);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
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
