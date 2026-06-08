import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function NoticesScreen() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setItems(data || []);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>공지사항이 없습니다.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
          <Text style={styles.contentText}>{item.content}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16 },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  date: { color: '#9ca3af', marginBottom: 10 },
  contentText: { color: '#374151', lineHeight: 22 },
});