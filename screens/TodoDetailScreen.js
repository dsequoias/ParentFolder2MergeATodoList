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
} from 'react-native';
import { getTodoById, insertTodo, updateTodo } from '../services/database';
import { requestReminderPermissions, scheduleReminders, cancelReminder } from '../services/notifications';

const REMINDER_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

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
  const [dateInputStr, setDateInputStr] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(2);
    return `${m}/${day}/${yy}`;
  });
  const [reminder1, setReminder1] = useState(0);
  const [reminder2, setReminder2] = useState(0);
  const [reminder3, setReminder3] = useState(0);

  useEffect(() => {
    if (todoId) {
      loadTodo();
    }
  }, [todoId]);

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
        setReminder1(todo.ReminderMinutes ?? 0);
        setReminder2(todo.Reminder2Minutes ?? 0);
        setReminder3(todo.Reminder3Minutes ?? 0);
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
      const todoData = {
        Task: task.trim(),
        DueDate: dueDate,
        DueTime: dueTime,
        Completed: completed ? 1 : 0,
        Notes: notes.trim() || null,
        CompletDateTime: completed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
        ReminderMinutes: reminder1,
        Reminder2Minutes: reminder2,
        Reminder3Minutes: reminder3,
      };

      let savedTaskId = todoId;
      if (todoId) {
        await updateTodo(todoId, todoData);
        Alert.alert('Success', 'Todo updated successfully');
      } else {
        savedTaskId = await insertTodo(todoData);
        Alert.alert('Success', 'Todo created successfully');
      }

      const hasReminders = (reminder1 > 0 || reminder2 > 0 || reminder3 > 0);
      if (hasReminders && dueDate && dueTime) {
        const granted = await requestReminderPermissions();
        if (granted) {
          await scheduleReminders(savedTaskId, task.trim(), dueDate, dueTime, [reminder1, reminder2, reminder3]);
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

        {/* Reminders: 3 slots */}
        <View style={styles.field}>
          <Text style={styles.label}>Reminders</Text>
          <Text style={styles.reminderHint}>Choose up to 3 (e.g. 1 day, 2 hours, 30 min)</Text>
          {[
            { label: '1st reminder', value: reminder1, setValue: setReminder1 },
            { label: '2nd reminder', value: reminder2, setValue: setReminder2 },
            { label: '3rd reminder', value: reminder3, setValue: setReminder3 },
          ].map(({ label, value, setValue }) => (
            <View key={label} style={styles.reminderRow}>
              <Text style={styles.reminderRowLabel}>{label}</Text>
              <View style={styles.reminderOptions}>
                {REMINDER_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.reminderOption, value === opt.value && styles.reminderOptionActive]}
                    onPress={() => setValue(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reminderOptionText, value === opt.value && styles.reminderOptionTextActive]}>
                      {opt.label}
                    </Text>
                    {value === opt.value && <Text style={styles.reminderCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 22,
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  form: {
    padding: 20,
    paddingBottom: 32,
  },
  field: {
    marginBottom: 20,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#333',
  },
  inputFlex: {
    flex: 1,
  },
  dateTimeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingLeft: 12,
    paddingRight: 8,
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
    color: '#333',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  calendarIconTouch: {
    padding: 4,
  },
  inputIcon: {
    fontSize: 18,
    marginLeft: 4,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#999',
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  reminderHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  reminderRow: {
    marginBottom: 14,
  },
  reminderRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  reminderOptions: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    overflow: 'hidden',
  },
  reminderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  reminderOptionActive: {
    backgroundColor: '#e8e0f0',
  },
  reminderOptionText: {
    fontSize: 15,
    color: '#333',
  },
  reminderOptionTextActive: {
    fontWeight: '600',
    color: '#6200ee',
  },
  reminderCheck: {
    fontSize: 16,
    color: '#6200ee',
    fontWeight: 'bold',
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
    borderColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#6200ee',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200ee',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
