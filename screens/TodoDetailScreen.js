import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  Pressable,
  AppState,
} from 'react-native';
import { getTodoById, insertTodo, updateTodo } from '../services/database';
import { MAX_REMINDERS_PER_TASK } from '../constants/reminders.js';
import {
  reminderMinutesArrayFromTodo,
  legacyReminderColumnsFromArray,
  REMINDER_AT_DUE_TIME,
} from '../services/reminderUtils.js';
import { isNotificationSupported, requestReminderPermissions, scheduleReminders, cancelReminder, scheduleTestNotification } from '../services/notifications';
import { colors, spacing, radius } from '../theme';

let IntentLauncher = null;
if (Platform.OS === 'android') {
  try {
    IntentLauncher = require('expo-intent-launcher');
  } catch (_) {}
}

const REMINDER_UNITS = [
  { key: 'minutes', label: 'Minutes' },
  { key: 'hours', label: 'Hours' },
  { key: 'days', label: 'Days' },
];
function minutesToDisplay(min) {
  if (min == null || min <= 0) return null;
  if (min % 1440 === 0) return { value: min / 1440, unit: 'days' };
  if (min % 60 === 0) return { value: min / 60, unit: 'hours' };
  return { value: min, unit: 'minutes' };
}

function displayToMinutes(value, unit) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) return 0;
  if (unit === 'days') return n * 1440;
  if (unit === 'hours') return n * 60;
  return n;
}

function formatReminderLabel(item) {
  const v = item.value;
  const u = item.unit;
  const singular = u === 'days' ? 'day' : u === 'hours' ? 'hour' : 'min';
  const plural = u === 'days' ? 'days' : u === 'hours' ? 'hours' : 'mins';
  return `${v} ${v === 1 ? singular : plural} before`;
}

// Conditionally import DateTimePicker (not available on web)
let DateTimePicker = null;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (e) {
    console.warn('DateTimePicker not available:', e);
  }
}

// Format date as YYYY-MM-DD in local timezone (avoid UTC shift)
const formatDateForDisplay = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Format time as HH:MM:SS in local timezone
const formatTimeForDisplay = (date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export default function TodoDetailScreen({ route, navigation }) {
  const todoId = route?.params?.todoId || null;
  const [task, setTask] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  // Web: editable date/time strings so user can type freely
  const [dateStr, setDateStr] = useState(() => formatDateForDisplay(new Date()));
  const [timeStr, setTimeStr] = useState(() => formatTimeForDisplay(new Date()));
  const [notes, setNotes] = useState('');
  const [completed, setCompleted] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const webDateInputRef = useRef(null);
  /** Queue of { hour, minutes, message } for Clock app; next is sent when app returns to foreground. */
  const pendingClockAlarmsRef = useRef([]);
  const pendingClockTimeoutRef = useRef(null);
  const [dateInputStr, setDateInputStr] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(2);
    return `${m}/${day}/${yy}`;
  });
  // Reminders: list of { value, unit } (max MAX_REMINDERS_PER_TASK). Input row: number + unit dropdown + add.
  const [reminderList, setReminderList] = useState([]);
  const [reminderInputValue, setReminderInputValue] = useState('');
  const [reminderInputUnit, setReminderInputUnit] = useState('minutes');
  const [reminderUnitDropdownOpen, setReminderUnitDropdownOpen] = useState(false);
  /** Parse due date (YYYY-MM-DD) and time (HH:MM or HH:MM:SS) into a Date (local time). */
  const parseDueToDate = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const parts = String(dueDate).split(/[-/]/).map((n) => parseInt(n, 10));
    if (parts.length < 3) return null;
    let y = parts[0],
      m = parts[1],
      d = parts[2];
    if (parts[0] <= 31 && parts[2] > 31) {
      m = parts[0];
      d = parts[1];
      y = parts[2];
      if (y < 100) y += 2000;
    }
    const timeParts = String(dueTime || '0:0').split(':').map((n) => parseInt(n, 10));
    const h = timeParts[0] ?? 0;
    const min = timeParts[1] ?? 0;
    const s = timeParts[2] ?? 0;
    const date = new Date(y, m - 1, d, h, min, s);
    return isNaN(date.getTime()) ? null : date;
  };

  /**
   * Send first reminder to Clock app and queue the rest. When the user returns from Clock,
   * the next alarm is sent automatically (see AppState effect).
   */
  const addAlarmsToClockAppForReminders = (dueDate, dueTime, reminderMinutesArray, taskName) => {
    if (Platform.OS !== 'android' || !IntentLauncher?.startActivityAsync) return;
    const due = parseDueToDate(dueDate, dueTime);
    if (!due || !Array.isArray(reminderMinutesArray)) return;
    const message = (taskName && taskName.trim()) || 'Task';
    const baseMessage = message + ' (Daily Duty)';
    const seen = new Set();
    const alarms = [];
    for (let i = 0; i < reminderMinutesArray.length; i++) {
      const reminderMinutes = reminderMinutesArray[i];
      let alarmAt;
      let msgSuffix;
      if (reminderMinutes === REMINDER_AT_DUE_TIME) {
        alarmAt = new Date(due.getTime());
        msgSuffix = ' — at due time';
      } else {
        if (reminderMinutes == null || reminderMinutes <= 0) continue;
        alarmAt = new Date(due.getTime() - reminderMinutes * 60 * 1000);
        msgSuffix = reminderMinutes === 1 ? ' — 1 min before' : ` — ${reminderMinutes} min before`;
      }
      const hour = alarmAt.getHours();
      const minutes = alarmAt.getMinutes();
      const key = `${hour}:${minutes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alarms.push({ hour, minutes, message: baseMessage + msgSuffix });
    }
    if (alarms.length === 0) return;
    const [first, ...rest] = alarms;
    try {
      IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
        extra: {
          'android.intent.extra.alarm.HOUR': first.hour,
          'android.intent.extra.alarm.MINUTES': first.minutes,
          'android.intent.extra.alarm.MESSAGE': first.message,
        },
      }).catch(() => {});
    } catch (_) {}
    pendingClockAlarmsRef.current = rest;
  };

  /** Open Clock app to set alarm(s): reminder times if any, otherwise due time (Android). One tap fires all reminder intents. */
  const openAddToClockApp = async () => {
    if (Platform.OS !== 'android' || !IntentLauncher?.startActivityAsync) return;
    const dueDate = getDateToSave();
    const dueTime = getTimeToSave();
    if (!dueDate || !dueTime) {
      Alert.alert('Set date and time', 'Set the task due date and time first, then tap Add to Clock app.');
      return;
    }
    let minutesArray = reminderList.map((item) => displayToMinutes(item.value, item.unit)).filter((m) => m > 0);
    if (minutesArray.length === 0) {
      minutesArray = [REMINDER_AT_DUE_TIME];
    }
    addAlarmsToClockAppForReminders(dueDate, dueTime, minutesArray, task.trim());
  };

  useEffect(() => {
    if (todoId) {
      loadTodo();
    }
  }, [todoId]);

  // When returning from Clock app, send the next queued alarm so all reminders get added.
  useEffect(() => {
    if (Platform.OS !== 'android' || !IntentLauncher?.startActivityAsync) return;
    let prevState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (prevState !== 'active' && nextState === 'active') {
        const pending = pendingClockAlarmsRef.current;
        if (pending.length > 0) {
          const [next, ...rest] = pending;
          pendingClockAlarmsRef.current = rest;
          if (pendingClockTimeoutRef.current) clearTimeout(pendingClockTimeoutRef.current);
          pendingClockTimeoutRef.current = setTimeout(() => {
            pendingClockTimeoutRef.current = null;
            try {
              IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
                extra: {
                  'android.intent.extra.alarm.HOUR': next.hour,
                  'android.intent.extra.alarm.MINUTES': next.minutes,
                  'android.intent.extra.alarm.MESSAGE': next.message,
                },
              }).catch(() => {});
            } catch (_) {}
          }, 400);
        }
      }
      prevState = nextState;
    });
    return () => {
      sub.remove();
      if (pendingClockTimeoutRef.current) clearTimeout(pendingClockTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const parsed = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parsed) {
      const [, y, m, d] = parsed;
      setDateInputStr(`${m}/${d}/${y.slice(2)}`);
    } else if (!dateStr) {
      setDateInputStr('');
    }
  }, [dateStr]);

  // Web: create a persistent hidden <input type="date"> so showPicker() works from user gesture
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'date';
    input.setAttribute('aria-hidden', 'true');
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    input.onchange = (e) => {
      const v = e.target.value;
      if (v) {
        setDateStr(v);
        const [y, m, d] = v.split('-');
        setDateInputStr(`${m}/${d}/${y.slice(2)}`);
        setDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
      }
    };
    document.body.appendChild(input);
    webDateInputRef.current = input;
    return () => {
      try {
        if (document.body.contains(input)) document.body.removeChild(input);
      } catch (_) {}
      webDateInputRef.current = null;
    };
  }, []);

  const loadTodo = async () => {
    try {
      const todo = await getTodoById(todoId);
      if (todo) {
        setTask(todo.Task || '');
        setNotes(todo.Notes || '');
        setCompleted(todo.Completed === 1);
        if (todo.Date) {
          const d = new Date(todo.Date + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            setDate(d);
            setDateStr(formatDateForDisplay(d));
          }
        }
        if (todo.Time) {
          const parts = todo.Time.split(':');
          const h = parseInt(parts[0], 10) || 0;
          const m = parseInt(parts[1], 10) || 0;
          const s = parseInt(parts[2], 10) || 0;
          const t = new Date();
          t.setHours(h, m, s);
          setTime(t);
          setTimeStr(formatTimeForDisplay(t));
        }
        const mins = reminderMinutesArrayFromTodo(todo);
        const list = mins.map((m) => minutesToDisplay(m)).filter(Boolean);
        setReminderList(list);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load todo');
      console.error(error);
    }
  };

  // Get date string for saving (use dateStr when valid so picked date is correct)
  const getDateToSave = () => {
    const parsed = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parsed) {
      const d = new Date(parseInt(parsed[1], 10), parseInt(parsed[2], 10) - 1, parseInt(parsed[3], 10));
      if (!isNaN(d.getTime())) return `${parsed[1]}-${parsed[2]}-${parsed[3]}`;
    }
    const d = date && !isNaN(date.getTime()) ? date : new Date();
    return formatDateForDisplay(d);
  };

  const getTimeToSave = () => {
    if (Platform.OS === 'web') {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = match[3] ? parseInt(match[3], 10) : 0;
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59) {
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
      }
      return formatTimeForDisplay(time);
    }
    const t = time && !isNaN(time.getTime()) ? time : new Date();
    return formatTimeForDisplay(t);
  };

  const handleSave = async () => {
    if (!task.trim()) {
      Alert.alert('Error', 'Task name is required');
      return;
    }

    if (task.length > 40) {
      Alert.alert('Error', 'Task name must be 40 characters or less');
      return;
    }

    if (notes.length > 70) {
      Alert.alert('Error', 'Notes must be 70 characters or less');
      return;
    }

    try {
      const dueDate = getDateToSave();
      const dueTime = getTimeToSave();
      let minutesArray = reminderList
        .map((item) => displayToMinutes(item.value, item.unit))
        .filter((m) => m > 0)
        .slice(0, MAX_REMINDERS_PER_TASK);
      if (minutesArray.length === 0 && dueDate && dueTime) {
        minutesArray = [REMINDER_AT_DUE_TIME];
      }
      const reminderFields = legacyReminderColumnsFromArray(minutesArray);
      const todoData = {
        Task: task.trim(),
        DueDate: dueDate,
        DueTime: dueTime,
        Completed: completed ? 1 : 0,
        Notes: notes.trim() || null,
        CompletDateTime: completed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
        ...reminderFields,
      };

      let savedTaskId = todoId;
      const hasReminders = minutesArray.length > 0;
      if (todoId) {
        await updateTodo(todoId, todoData);
        Alert.alert('Success', hasReminders && Platform.OS === 'android'
          ? 'Todo updated. Reminders set. If they don\'t fire when the app is closed, use Settings → Alarms & reminders and Battery.'
          : 'Todo updated successfully');
      } else {
        savedTaskId = await insertTodo(todoData);
        Alert.alert('Success', hasReminders && Platform.OS === 'android'
          ? 'Todo created. Reminders set. If they don\'t fire when the app is closed, use Settings → Alarms & reminders and Battery.'
          : 'Todo created successfully');
      }

      if (hasReminders && dueDate && dueTime) {
        const granted = await requestReminderPermissions();
        if (granted) {
          await scheduleReminders(savedTaskId, task.trim(), dueDate, dueTime, minutesArray);
        }
      } else {
        await cancelReminder(savedTaskId);
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save todo: ' + (error?.message || String(error)));
      console.error(error);
    }
  };

  const isNewTask = todoId == null;
  const headerTitle = isNewTask ? 'New Task' : 'Edit Task';
  const primaryButtonText = isNewTask ? 'Create' : 'Save';

  // Display date as mm/dd/yy for the input placeholder/display
  const dateDisplayStr = (() => {
    const parsed = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parsed) {
      const [, y, m, d] = parsed;
      const yy = y.slice(2);
      return `${m}/${d}/${yy}`;
    }
    return '';
  })();

  const timeDisplayStr = (() => {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = match[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    }
    return timeStr || '';
  })();

  const handleDateInputChange = (text) => {
    setDateInputStr(text);
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length >= 6) {
      const m = digits.slice(0, 2);
      const d = digits.slice(2, 4);
      let y = digits.slice(4);
      if (y.length === 2) y = '20' + y;
      if (y.length === 4) {
        setDateStr(`${y}-${m}-${d}`);
        setDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
      }
    } else if (digits.length === 0) {
      setDateStr('');
    }
  };

  const openDatePicker = () => {
    if (Platform.OS === 'web') {
      const input = webDateInputRef.current;
      if (input && document.body.contains(input)) {
        input.value = dateStr || formatDateForDisplay(new Date());
        try {
          if (typeof input.showPicker === 'function') {
            input.showPicker();
          } else {
            input.click();
          }
        } catch (_) {
          input.click();
        }
      }
    } else {
      setShowDatePicker(true);
    }
  };

  const addReminder = () => {
    const n = parseInt(reminderInputValue.trim(), 10);
    if (isNaN(n) || n <= 0) {
      Alert.alert('Invalid', 'Enter a positive number.');
      return;
    }
    if (reminderList.length >= MAX_REMINDERS_PER_TASK) {
      Alert.alert('Limit', `You can add up to ${MAX_REMINDERS_PER_TASK} reminders.`);
      return;
    }
    setReminderList((prev) => [...prev, { value: n, unit: reminderInputUnit }]);
    setReminderInputValue('');
  };

  const removeReminder = (index) => {
    setReminderList((prev) => prev.filter((_, i) => i !== index));
  };

  const currentUnitLabel = REMINDER_UNITS.find((u) => u.key === reminderInputUnit)?.label ?? 'Minutes';

  return (
    <View style={styles.container}>
      {/* Header: title + close (X) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} hitSlop={12}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form}>
        {/* Task Name * */}
        <View style={styles.field}>
          <Text style={styles.label}>Task Name *</Text>
          <TextInput
            style={styles.input}
            value={task}
            onChangeText={setTask}
            placeholder="Enter task name"
            placeholderTextColor="#999"
            maxLength={40}
          />
          <Text style={styles.charCount}>{task.length}/40</Text>
        </View>

        {/* Date and Time side by side */}
        <View style={styles.row}>
          <View style={[styles.field, styles.fieldHalf]}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateTimeInputWrap}>
              <TextInput
                style={styles.dateTimeInputInner}
                value={dateInputStr}
                placeholder="mm/dd/yy"
                placeholderTextColor="#999"
                onChangeText={handleDateInputChange}
                keyboardType="numbers-and-punctuation"
                editable
              />
              <TouchableOpacity
                onPress={Platform.OS === 'web' ? undefined : openDatePicker}
                onPressIn={Platform.OS === 'web' ? openDatePicker : undefined}
                style={styles.calendarIconTouch}
                hitSlop={12}
                activeOpacity={0.6}
              >
                <Text style={styles.inputIcon}>📅</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.field, styles.fieldHalf]}>
            <Text style={styles.label}>Time</Text>
            {Platform.OS === 'web' ? (
              <TextInput
                style={styles.input}
                value={timeDisplayStr}
                placeholder="--:-- --"
                placeholderTextColor="#999"
                onChangeText={(text) => {
                  setTimeStr(text);
                  const match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                  if (match) {
                    let h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10) || 0;
                    const ampm = (match[3] || '').toUpperCase();
                    if (ampm === 'PM' && h < 12) h += 12;
                    if (ampm === 'AM' && h === 12) h = 0;
                    const t = new Date();
                    t.setHours(h, m, 0);
                    setTime(t);
                    setTimeStr(formatTimeForDisplay(t));
                  }
                }}
              />
            ) : (
              <TouchableOpacity
                style={styles.inputWithIcon}
                onPress={() => setShowTimePicker(true)}
              >
                <Text
                  style={[
                    styles.inputFlex,
                    styles.dateTimeText,
                    !timeDisplayStr && styles.placeholder,
                  ]}
                  numberOfLines={1}
                >
                  {timeDisplayStr || '--:-- --'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {Platform.OS !== 'web' && showDatePicker && DateTimePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selectedDate != null) {
                setDate(selectedDate);
                setDateStr(formatDateForDisplay(selectedDate));
                const y = selectedDate.getFullYear(), m = String(selectedDate.getMonth() + 1).padStart(2, '0'), d = String(selectedDate.getDate()).padStart(2, '0');
                setDateInputStr(`${m}/${d}/${String(y).slice(2)}`);
              }
            }}
          />
        )}
        {Platform.OS !== 'web' && showTimePicker && DateTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            display="default"
            onChange={(event, selectedTime) => {
              setShowTimePicker(Platform.OS === 'ios');
              if (selectedTime != null) {
                setTime(selectedTime);
                setTimeStr(formatTimeForDisplay(selectedTime));
              }
            }}
          />
        )}

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            placeholderTextColor="#999"
            maxLength={70}
            multiline
            numberOfLines={3}
          />
          <Text style={styles.charCount}>{notes.length}/70</Text>
        </View>

        {/* Reminders: bell + title, number input, unit dropdown, +, list */}
        <View style={styles.section}>
          <View style={styles.reminderSectionHeader}>
            <Text style={styles.reminderBell}>🔔</Text>
            <View style={styles.reminderTitleBlock}>
              <Text style={styles.reminderSectionTitle}>Reminders</Text>
              <Text style={styles.reminderLimitHint}>
                {reminderList.length} of {MAX_REMINDERS_PER_TASK} — tap + to add earlier reminders. If you add none, you
                still get an alarm at the due date and time.
              </Text>
            </View>
          </View>
          <View style={styles.reminderInputRow}>
            <TextInput
              style={styles.reminderNumberInput}
              value={reminderInputValue}
              onChangeText={setReminderInputValue}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
            <TouchableOpacity
              style={styles.reminderUnitButton}
              onPress={() => setReminderUnitDropdownOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.reminderUnitButtonText}>{currentUnitLabel}</Text>
              <Text style={styles.reminderUnitChevron}>▼</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reminderAddButton}
              onPress={addReminder}
              activeOpacity={0.8}
            >
              <Text style={styles.reminderAddButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          {reminderList.length > 0 && (
            <View style={styles.reminderList}>
              {reminderList.map((item, index) => (
                <View key={index} style={styles.reminderListItem}>
                  <Text style={styles.reminderListItemText}>{formatReminderLabel(item)}</Text>
                  <TouchableOpacity
                    style={styles.reminderListRemove}
                    onPress={() => removeReminder(index)}
                    hitSlop={8}
                  >
                    <Text style={styles.reminderListRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {Platform.OS === 'android' && reminderList.length > 0 && (
            <Text style={styles.reminderHint}>
              Tip: Use the Home button instead of closing the app from recents so reminders can fire when the app is in the background.
            </Text>
          )}
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.phoneAlarmButton} onPress={openAddToClockApp} activeOpacity={0.8}>
              <Text style={styles.phoneAlarmButtonText}>Add to Clock app</Text>
              <Text style={styles.phoneAlarmButtonSubtext}>
                {reminderList.length > 0
                  ? 'Set alarms at your reminder times (works when screen is off)'
                  : 'Set alarm at due time (works when screen is off)'}
              </Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.testReminderButton}
              onPress={async () => {
                if (!isNotificationSupported()) {
                  Alert.alert('Not supported', 'Notifications need HTTPS or localhost. Open this app via http://localhost (or your HTTPS URL) and try again.');
                  return;
                }
                if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
                  Alert.alert('Permission denied', 'Allow notifications in your browser (e.g. Firefox: lock icon → Permissions → Notifications) and reload the page.');
                  return;
                }
                if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                  const granted = await requestReminderPermissions();
                  if (!granted) {
                    Alert.alert('Permission needed', 'Please allow notifications when the browser asks, then tap "Test reminder" again.');
                    return;
                  }
                }
                const result = await scheduleTestNotification();
                if (result?.ok) {
                  Alert.alert('Test reminder', 'A notification and short sound will appear in 3 seconds. Keep this tab open and visible for best results.');
                } else if (result?.reason === 'permission-denied') {
                  Alert.alert('Permission denied', 'Notifications were blocked. Allow them in your browser settings and try again.');
                } else if (result?.reason) {
                  Alert.alert('Error', result.reason);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.testReminderButtonText}>Test reminder (3 sec)</Text>
            </TouchableOpacity>
          )}
          <Modal
            visible={reminderUnitDropdownOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setReminderUnitDropdownOpen(false)}
          >
            <Pressable style={styles.unitDropdownOverlay} onPress={() => setReminderUnitDropdownOpen(false)}>
              <View style={styles.unitDropdownBox}>
                {REMINDER_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.key}
                    style={[styles.unitDropdownOption, reminderInputUnit === u.key && styles.unitDropdownOptionActive]}
                    onPress={() => {
                      setReminderInputUnit(u.key);
                      setReminderUnitDropdownOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.unitDropdownOptionText, reminderInputUnit === u.key && styles.unitDropdownOptionTextActive]}>
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>
        </View>
        {/* Completed: only when editing */}
        {!isNewTask && (
          <View style={styles.field}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setCompleted(!completed)}
            >
              <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
                {completed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Mark as completed</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel + Create/Save */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{primaryButtonText}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 22,
    color: colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  form: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
  },
  field: {
    marginBottom: spacing.xl,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  section: {
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  inputFlex: {
    flex: 1,
  },
  dateTimeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minHeight: 48,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  dateTimeInputInner: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 16,
    color: colors.text,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  calendarIconTouch: {
    padding: spacing.xs,
  },
  inputIcon: {
    fontSize: 18,
    marginLeft: spacing.xs,
  },
  dateTimeText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholder: {
    color: colors.textMuted,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  reminderHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  reminderSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  reminderTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  reminderSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  reminderLimitHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  reminderBell: {
    fontSize: 22,
    marginRight: spacing.sm,
    marginTop: 2,
  },
  reminderInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  reminderNumberInput: {
    width: 72,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  reminderUnitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minWidth: 100,
  },
  reminderUnitButtonText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  reminderUnitChevron: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 4,
  },
  reminderAddButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderAddButtonText: {
    fontSize: 24,
    color: colors.surface,
    fontWeight: '600',
    lineHeight: 28,
  },
  reminderList: {
    marginTop: spacing.sm,
  },
  reminderListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF3E0',
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  reminderListItemText: {
    fontSize: 15,
    color: colors.text,
  },
  reminderListRemove: {
    padding: spacing.xs,
  },
  reminderListRemoveText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '600',
  },
  phoneAlarmButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#E8F5E9',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  phoneAlarmButtonText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  phoneAlarmButtonSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  unitDropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitDropdownBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.xs,
    minWidth: 160,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 }),
  },
  unitDropdownOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  unitDropdownOptionActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
  },
  unitDropdownOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  unitDropdownOptionTextActive: {
    fontWeight: '600',
    color: colors.primaryDark,
  },
  testReminderButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  testReminderButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  reminderRow: {
    marginBottom: spacing.md,
  },
  reminderRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  reminderOptions: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  reminderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  reminderOptionActive: {
    backgroundColor: colors.primaryLight,
  },
  reminderOptionText: {
    fontSize: 15,
    color: colors.text,
  },
  reminderOptionTextActive: {
    fontWeight: '600',
    color: colors.primaryDark,
  },
  reminderCheck: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
  },
  phoneAlarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  phoneAlarmLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: spacing.xs,
  },
  phoneAlarmButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  phoneAlarmButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  phoneAlarmButtonDisabled: {
    opacity: 0.5,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
});
