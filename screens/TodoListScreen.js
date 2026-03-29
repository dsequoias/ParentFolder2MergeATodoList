import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getAllTodos, deleteTodo, toggleTodoCompletion } from '../services/database';
import { cancelReminder, scheduleRemindersForTodoList } from '../services/notifications';
import { useSettings } from '../contexts/SettingsContext';
import MenuModal from '../components/MenuModal';
import { colors, spacing, radius } from '../theme';

const FILTER_ALL = 'all';
const FILTER_ACTIVE = 'active';
const FILTER_DONE = 'done';

export default function TodoListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [todos, setTodos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState(FILTER_ACTIVE);
  const [menuVisible, setMenuVisible] = useState(false);
  const { timeZone } = useSettings();

  const loadTodos = async () => {
    try {
      const todosList = await getAllTodos();
      setTodos(todosList);
      await scheduleRemindersForTodoList(todosList);
    } catch (error) {
      Alert.alert('Error', 'Failed to load todos');
      console.error(error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTodos();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTodos();
    setRefreshing(false);
  };

  const activeCount = useMemo(() => todos.filter((t) => t.Completed !== 1).length, [todos]);
  const completedCount = useMemo(() => todos.filter((t) => t.Completed === 1).length, [todos]);

  const filteredTodos = useMemo(() => {
    if (filter === FILTER_ACTIVE) return todos.filter((t) => t.Completed !== 1);
    if (filter === FILTER_DONE) return todos.filter((t) => t.Completed === 1);
    return todos;
  }, [todos, filter]);

  const handleToggleComplete = async (TaskID, currentStatus) => {
    try {
      await toggleTodoCompletion(TaskID, !currentStatus);
      await loadTodos();
    } catch (error) {
      Alert.alert('Error', 'Failed to update todo');
      console.error(error);
    }
  };

  const handleDelete = async (TaskID, task) => {
    const message = `Are you sure you want to delete "${task}"?`;
    if (Platform.OS === 'web') {
      if (!window.confirm(message)) return;
      try {
        await deleteTodo(TaskID);
        await cancelReminder(TaskID);
        await loadTodos();
      } catch (error) {
        alert(error?.message || 'Failed to delete. Start the API server: cd todo-api-server && npm start');
        console.error(error);
      }
      return;
    }
    Alert.alert(
      'Delete Todo',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTodo(TaskID);
              await cancelReminder(TaskID);
              await loadTodos();
            } catch (error) {
              Alert.alert('Error', error?.message || 'Failed to delete todo. Is the API server running? (cd todo-api-server && npm start)');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  // Parse YYYY-MM-DD and format in user's selected time zone
  const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      const date = new Date(y, m, d);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
      }
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return timeString.slice(0, 8); // HH:MM:SS (display as stored; timezone affects new dates)
  };

  const renderTodoItem = ({ item }) => {
    const isCompleted = item.Completed === 1;

    return (
      <View style={[styles.card, isCompleted && styles.cardCompleted]}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => handleToggleComplete(item.TaskID, isCompleted)}
        >
          <View style={[styles.checkboxCircle, isCompleted && styles.checkboxChecked]}>
            {isCompleted && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => navigation.navigate('TodoDetail', { todoId: item.TaskID })}
          activeOpacity={0.7}
        >
          <Text style={[styles.taskTitle, isCompleted && styles.taskTitleDone]} numberOfLines={1}>
            {item.Task}
          </Text>
          {item.Notes ? (
            <Text style={styles.taskNotes} numberOfLines={1}>
              {item.Notes}
            </Text>
          ) : null}
          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeIcon}>📅</Text>
              <Text style={styles.badgeText}>{formatDateShort(item.Date) || 'No date'}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeIcon}>🕐</Text>
              <Text style={styles.badgeText}>{formatTime(item.Time) || '--:--'}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('TodoDetail', { todoId: item.TaskID })}
          >
            <Text style={styles.actionIcon}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDelete(item.TaskID, item.Task)}
          >
            <Text style={styles.actionIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          hitSlop={8}
        >
          <Text style={styles.menuButtonText}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My.Daily.Duty</Text>
          <Text style={styles.headerSummary}>
            {activeCount} active, {completedCount} completed
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('TodoDetail', { todoId: null })}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <MenuModal visible={menuVisible} onClose={() => setMenuVisible(false)} onReset={loadTodos} />

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === FILTER_ALL && styles.filterBtnActive]}
          onPress={() => setFilter(FILTER_ALL)}
        >
          <Text style={styles.filterIcon}>☰</Text>
          <Text style={[styles.filterLabel, filter === FILTER_ALL && styles.filterLabelActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === FILTER_ACTIVE && styles.filterBtnActive]}
          onPress={() => setFilter(FILTER_ACTIVE)}
        >
          <Text style={[styles.filterLabel, filter === FILTER_ACTIVE && styles.filterLabelActive]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === FILTER_DONE && styles.filterBtnActive]}
          onPress={() => setFilter(FILTER_DONE)}
        >
          <Text style={styles.filterIcon}>✓</Text>
          <Text style={[styles.filterLabel, filter === FILTER_DONE && styles.filterLabelActive]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredTodos}
        renderItem={renderTodoItem}
        keyExtractor={(item) => String(item.TaskID)}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No todos yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add one</Text>
          </View>
        }
      />
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
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  menuButtonText: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '600',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerSummary: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.surface,
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 30,
  },
  filters: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? {} : { gap: spacing.sm }),
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    marginHorizontal: spacing.xs,
  },
  filterBtnActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  filterIcon: {
    fontSize: 14,
    marginRight: 4,
    color: colors.textMuted,
  },
  filterLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  filterLabelActive: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.92,
    backgroundColor: colors.primaryLight,
  },
  checkbox: {
    marginRight: spacing.md,
  },
  checkboxCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  taskNotes: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    ...(Platform.OS === 'web' ? {} : { gap: spacing.sm }),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundAlt,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  badgeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  actionBtn: {
    padding: spacing.sm,
  },
  actionIcon: {
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
