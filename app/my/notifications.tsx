import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    fetchMyNotifications,
    markNotificationAsRead,
} from '../../lib/notificationsData';

export default function NotificationsScreen() {
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const data = await fetchMyNotifications();
    setItems(data);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handlePress = async (item: any) => {
    await markNotificationAsRead(item.id);

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

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const unread = !item.read_at;

          return (
            <TouchableOpacity
              style={[styles.item, unread && styles.unreadItem]}
              onPress={() => handlePress(item)}
            >
              <View style={styles.row}>
                <Text style={styles.itemTitle}>{item.title}</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
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
