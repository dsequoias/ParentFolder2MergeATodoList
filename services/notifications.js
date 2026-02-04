/**
 * Schedule/cancel reminder notifications for tasks.
 * Uses expo-notifications on native; no-op on web (or could use Notification API).
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

export async function requestReminderPermissions() {
  if (Platform.OS === 'web' || !Notifications) return false;
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

/**
 * Schedule up to 3 reminder notifications for a task.
 * @param {number} TaskID
 * @param {string} taskTitle
 * @param {string} dueDate YYYY-MM-DD
 * @param {string} dueTime HH:MM:SS
 * @param {number[]} reminderMinutesArray [first, second, third] minutes before due (e.g. [1440, 120, 30])
 */
export async function scheduleReminders(TaskID, taskTitle, dueDate, dueTime, reminderMinutesArray) {
  if (Platform.OS === 'web' || !Notifications) return;
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
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    for (let i = 1; i <= 3; i++) {
      await Notifications.cancelScheduledNotificationAsync(`todo-${TaskID}-${i}`);
    }
  } catch (_) {}
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
