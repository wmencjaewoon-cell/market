import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../../lib/supabase';

type NoticeItem = {
  id: number;
  title: string;
  content: string;
  is_published: boolean | null;
  created_at: string;
};

function formatNoticeDate(dateString?: string) {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getNoticePreview(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}

export default function NoticesScreen() {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotices = useCallback(async () => {
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, content, is_published, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
      

    if (error) {
      console.log('공지사항 조회 실패:', error);
      return;
    }

    setItems((data || []) as NoticeItem[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const load = async () => {
        setLoading(true);
        await fetchNotices();
        if (mounted) setLoading(false);
      };

      void load();

      return () => {
        mounted = false;
      };
    }, [fetchNotices])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotices();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.headerBox}>
          <Text style={styles.headerTitle}>공지사항</Text>
          <Text style={styles.headerDesc}>서비스 이용에 필요한 소식을 확인해 주세요.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>등록된 공지사항이 없습니다.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.noticeRow}
          activeOpacity={0.75}
          onPress={() => router.push(`/support/notices/${item.id}` as any)}
        >
          <View style={styles.noticeIcon}>
            <Ionicons name="megaphone-outline" size={19} color="#f97316" />
          </View>

          <View style={styles.noticeBody}>
            <View style={styles.noticeMetaRow}>
              <Text style={styles.noticeLabel}>공지</Text>
              {/* {item.is_published === false ? (
                <Text style={styles.privateLabel}>비공개</Text>
              ) : null} */}
              <Text style={styles.noticeDate}>{formatNoticeDate(item.created_at)}</Text>
            </View>

            <Text style={styles.noticeTitle} numberOfLines={1}>
              {item.title}
            </Text>

            <Text style={styles.noticePreview} numberOfLines={2}>
              {getNoticePreview(item.content)}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#c4c4c4" />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f6f8',
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  content: {
    paddingBottom: 32,
  },
  headerBox: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  headerDesc: {
    marginTop: 7,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  empty: {
    marginTop: 60,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 17,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f1f3',
  },
  noticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7ed',
  },
  noticeBody: {
    flex: 1,
    minWidth: 0,
  },
  noticeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  noticeLabel: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '900',
  },
  privateLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  noticeDate: {
    color: '#9ca3af',
    fontSize: 12,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  noticePreview: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
  },
});
