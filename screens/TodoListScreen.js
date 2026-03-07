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

      <MenuModal visible={menuVisible} onClose={() => setMenuVisible(false)} />

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
    backgroundColor: '#e8e8e8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  menuButtonText: {
    fontSize: 24,
    color: '#333',
    fontWeight: '600',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSummary: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  filters: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? {} : { gap: 8 }),
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginHorizontal: 4,
  },
  filterBtnActive: {
    backgroundColor: '#e8e0f0',
    borderWidth: 1,
    borderColor: '#9e8fb8',
  },
  filterIcon: {
    fontSize: 16,
    marginRight: 6,
    color: '#666',
  },
  filterLabel: {
    fontSize: 15,
    color: '#666',
  },
  filterLabelActive: {
    color: '#333',
    fontWeight: '600',
  },
  listContainer: {
    padding: 12,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.85,
    backgroundColor: '#f5f0fa',
  },
  checkbox: {
    marginRight: 12,
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6200ee',
  },
  checkmark: {
    color: '#fff',
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
    color: '#333',
    marginBottom: 4,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  taskNotes: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    ...(Platform.OS === 'web' ? {} : { gap: 8 }),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8e0f0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 8,
  },
  badgeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 12,
    color: '#555',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionBtn: {
    padding: 8,
  },
  actionIcon: {
    fontSize: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
  },
});
