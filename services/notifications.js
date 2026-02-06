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

export async function requestReminderPermissions() {
  if (Platform.OS === 'web') {
    try {
      if (typeof Notification === 'undefined') return false;
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
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
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

/**
 * Schedule a single notification in 10 seconds for testing (web + native).
 * Call requestReminderPermissions() first so permission is granted.
 */
export async function scheduleTestNotification() {
  if (Platform.OS === 'web') {
    try {
      if (typeof Notification === 'undefined') {
        console.warn('Browser does not support Notification API');
        return;
      }
      if (Notification.permission !== 'granted') {
        const granted = await requestReminderPermissions();
        if (!granted) return;
      }
      if (webTestNotificationTimeoutId != null) {
        clearTimeout(webTestNotificationTimeoutId);
        webTestNotificationTimeoutId = null;
      }
      webTestNotificationTimeoutId = setTimeout(() => {
        webTestNotificationTimeoutId = null;
        try {
          new Notification('DailyDuty test', { body: 'Reminder test — if you see this, reminders work!' });
        } catch (e) {
          console.warn('Test notification failed:', e);
        }
      }, 10 * 1000);
    } catch (e) {
      console.warn('Test notification error:', e);
    }
    return;
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
