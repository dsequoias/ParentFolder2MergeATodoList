/**
 * Schedule/cancel reminder notifications for tasks.
 * Native: expo-notifications (when available) + in-app alert fallback when app is open.
 * Web: browser Notification API + setTimeout (reminders only fire while tab is open).
 */

import { Alert, AppState, Linking, Platform } from 'react-native';
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
    const expoNotif = require('expo-notifications');
    Notifications = expoNotif.default || expoNotif;
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

const REMINDER_CHANNEL_ID = 'todo-alarm-v1';

function getAndroidPackageName() {
  try {
    const Constants = require('expo-constants').default;
    return Constants?.expoConfig?.android?.package || 'com.dosDailyDuty';
  } catch (_) {
    return 'com.dosDailyDuty';
  }
}

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

let hasPromptedBackgroundSettings = false;

function promptBackgroundReminderSettingsIfNeeded() {
  if (Platform.OS !== 'android') return;
  if (hasPromptedBackgroundSettings) return;
  hasPromptedBackgroundSettings = true;
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

function getTaskName(todoOrTitle) {
  if (todoOrTitle == null) return 'Task';
  if (typeof todoOrTitle === 'string') {
    const t = todoOrTitle.trim();
    return t || 'Task';
  }
  const name = (todoOrTitle.Task ?? todoOrTitle.task ?? '').toString().trim();
  return name || 'Task';
}

const webTimeouts = {};
let webTestNotificationTimeoutId = null;

export function isNotificationSupported() {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return true;
}

let channelConfiguredPromise = null;

async function ensureAndroidReminderChannelConfigured() {
  if (Platform.OS !== 'android' || !Notifications) return;
  if (channelConfiguredPromise) return channelConfiguredPromise;
  channelConfiguredPromise = _configureAndroidChannel().catch((e) => {
    channelConfiguredPromise = null;
    throw e;
  });
  return channelConfiguredPromise;
}

async function _configureAndroidChannel() {
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

const FOREGROUND_CHECK_INTERVAL_MS = 10 * 1000;
const REMINDER_WINDOW_BEFORE_MS = 30 * 1000;
const REMINDER_WINDOW_AFTER_MS = 5 * 60 * 1000;
const FOREGROUND_DEDUPE_CLEAR_AFTER_MS = 90 * 1000;
const REMINDER_SOUND_MAX_DURATION_MS = 2 * 60 * 1000;
const shownForegroundKeys = new Map();

let REMINDER_SOUND_ASSET = null;
try {
  REMINDER_SOUND_ASSET = require('../assets/sounds/reminder.wav');
} catch (_) {}

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

function triggerReminderHaptic() {
  if (Platform.OS === 'web' || !Haptics) return;
  try {
    const type = Haptics.NotificationFeedbackType?.Warning ?? Haptics.NotificationFeedbackType ?? 1;
    Haptics.notificationAsync(type);
  } catch (_) {}
}

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
            const dismissSound = () => { void stopReminderSound(); };
            if (Platform.OS === 'web') {
              playTestBeep();
            } else {
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
      for (const [key, rec] of shownForegroundKeys.entries()) {
        const ts = rec?.triggerTs;
        if (typeof ts === 'number' && now > ts + REMINDER_WINDOW_AFTER_MS + FOREGROUND_DEDUPE_CLEAR_AFTER_MS) {
          shownForegroundKeys.delete(key);
        }
      }
    }
  } catch (_) {}
}

let foregroundCheckerInterval = null;
let foregroundCheckerSubscription = null;

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
        if (reminderMinutes === 0) continue;
        const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000;
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
    await cancelReminder(TaskID);
    const due = parseDueDateTime(dueDate, dueTime);
    if (!due || isNaN(due.getTime())) return;
    const minutes = Array.isArray(reminderMinutesArray) ? reminderMinutesArray.slice(0, MAX_REMINDERS) : [];
    const toSchedule = [];
    for (let i = 0; i < minutes.length; i++) {
      const reminderMinutes = minutes[i];
      if (reminderMinutes === 0) continue;
      const offsetMs = reminderMinutes === -1 ? 0 : reminderMinutes * 60 * 1000;
      const triggerDate = new Date(due.getTime() - offsetMs);
      if (triggerDate.getTime() <= Date.now() + 15 * 1000) continue;
      toSchedule.push({ index: i, reminderMinutes, triggerDate });
    }
    toSchedule.sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());
    const displayName = getTaskName(taskTitle);
    const scheduledIdentifiers = [];
    for (const { index: i, reminderMinutes, triggerDate } of toSchedule) {
      const identifier = `todo-${TaskID}-${i + 1}`;
      const minsLabel = reminderMinutes === -1 ? 'now' : `${reminderMinutes} min`;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Reminder: ' + displayName,
            body: `${minsLabel} until due — ${formatDueForNotification(dueDate, dueTime)}`,
            data: { TaskID, taskTitle: displayName },
            sound: 'default',
            ...(Platform.OS === 'android' && {
              channelId: REMINDER_CHANNEL_ID,
              color: '#C62828',
              vibrate: [0, 400, 200, 400, 200, 400],
              priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
            }),
          },
          trigger: {
            type: 'date',
            date: triggerDate,
            ...(Platform.OS === 'android' && { channelId: REMINDER_CHANNEL_ID }),
          },
        });
        scheduledIdentifiers.push(identifier);
      } catch (schedErr) {
        console.warn('[DailyDuty] scheduleNotificationAsync failed:', identifier, schedErr?.message || schedErr);
      }
    }
    if (Platform.OS === 'android' && toSchedule.length > 0) {
      promptBackgroundReminderSettingsIfNeeded();
    }
  } catch (e) {
    console.warn('Schedule reminders error:', e);
  }
}

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
        sound: 'default',
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