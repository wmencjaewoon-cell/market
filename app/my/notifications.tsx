import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    deleteAllNotifications,
    fetchMyNotifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
} from '../../lib/notificationsData';

type NotificationItem = {
  id: number;
  type: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  data?: {
    listingId?: number | string;
    roomId?: number | string;
  } | null;
};

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function confirmDeleteAllNotifications() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm('모든 알림을 삭제할까요?'));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('전체 삭제', '모든 알림을 삭제할까요?', [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [bulkAction, setBulkAction] = useState<'read' | 'delete' | null>(null);
  const unreadCount = items.filter((item) => !item.read_at).length;
  const hasUnread = unreadCount > 0;
  const hasItems = items.length > 0;

  const load = async () => {
    const data = await fetchMyNotifications();
    setItems(data);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handlePress = async (item: NotificationItem) => {
    const readAt = new Date().toISOString();
    await markNotificationAsRead(item.id);
    setItems((prev) =>
      prev.map((notification) =>
        notification.id === item.id
          ? { ...notification, read_at: notification.read_at || readAt }
          : notification
      )
    );

    if (item.type === 'review') {
      const roomId = item.data?.roomId;
      if (roomId) {
        router.push(`/chat/${roomId}` as any);
        return;
      }

      const listingId = item.data?.listingId;
      if (listingId) {
        router.push(`/(tabs)/home/post/${listingId}` as any);
        return;
      }
    }

    if (item.type === 'keyword_listing' || item.type === 'favorite_listing_updated') {
      const listingId = item.data?.listingId;
      if (listingId) {
        router.push(`/(tabs)/home/post/${listingId}` as any);
        return;
      }
    }

    if (item.type === 'chat') {
      const roomId = item.data?.roomId;
      if (roomId) {
        router.push(`/chat/${roomId}` as any);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!hasUnread || bulkAction) return;

    setBulkAction('read');
    const readAt = new Date().toISOString();

    try {
      await markAllNotificationsAsRead();
      setItems((prev) =>
        prev.map((item) => (item.read_at ? item : { ...item, read_at: readAt }))
      );
    } catch (e: any) {
      console.log('전체 읽음 처리 실패:', e);
      showAlert('읽음 처리 실패', e?.message || '알림을 읽음 처리하지 못했습니다.');
    } finally {
      setBulkAction(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!hasItems || bulkAction) return;

    const ok = await confirmDeleteAllNotifications();
    if (!ok) return;

    setBulkAction('delete');

    try {
      await deleteAllNotifications();
      setItems([]);
    } catch (e: any) {
      console.log('전체 알림 삭제 실패:', e);
      showAlert('삭제 실패', e?.message || '알림을 모두 삭제하지 못했습니다.');
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          hasItems ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.readAllBtn,
                  (!hasUnread || bulkAction !== null) && styles.disabledBtn,
                ]}
                onPress={handleMarkAllRead}
                disabled={!hasUnread || bulkAction !== null}
                activeOpacity={0.75}
              >
                {bulkAction === 'read' ? (
                  <ActivityIndicator size="small" color="#166534" />
                ) : (
                  <Ionicons name="checkmark-done-outline" size={18} color="#166534" />
                )}
                <Text style={styles.readAllText}>모두 읽음</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.deleteAllBtn,
                  bulkAction !== null && styles.disabledBtn,
                ]}
                onPress={handleDeleteAll}
                disabled={bulkAction !== null}
                activeOpacity={0.75}
              >
                {bulkAction === 'delete' ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                )}
                <Text style={styles.deleteAllText}>전체 삭제</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const unread = !item.read_at;

          return (
            <TouchableOpacity
              style={[styles.item, unread && styles.unreadItem]}
              onPress={() => handlePress(item)}
              activeOpacity={0.8}
            >
              <View style={styles.row}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {unread ? <View style={styles.dot} /> : null}
              </View>

              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}

              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>아직 알림이 없습니다.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 16, gap: 10 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  readAllBtn: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  deleteAllBtn: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  readAllText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563eb',
  },
  deleteAllText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ef4444',
  },
  item: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },
  unreadItem: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#111827' },
  body: { marginTop: 6, color: '#374151', lineHeight: 20 },
  date: { marginTop: 8, fontSize: 12, color: '#9ca3af' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  empty: {
    marginTop: 80,
    textAlign: 'center',
    color: '#9ca3af',
  },
});
