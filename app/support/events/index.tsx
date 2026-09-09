// 이벤트 목록 화면: 공개 중이고 종료되지 않은 운영 이벤트를 고객지원 메뉴에서 보여준다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { type AppPalette } from '../../../contexts/theme';
import { useAppTheme } from '../../../hooks/use-app-theme';
import { supabase } from '../../../lib/supabase';

type EventItem = {
  id: number;
  title: string;
  summary: string | null;
  content: string;
  image_url: string | null;
  is_published: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number | null;
  created_at: string;
};

function formatEventDate(dateString?: string | null) {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getEventPeriod(item: EventItem) {
  const startText = formatEventDate(item.starts_at);
  const endText = formatEventDate(item.ends_at);

  if (startText && endText) return `${startText} - ${endText}`;
  if (startText) return `${startText} 시작`;
  if (endText) return `${endText}까지`;
  return formatEventDate(item.created_at);
}

function getEventBadge(item: EventItem) {
  const now = Date.now();
  const startsAt = item.starts_at ? new Date(item.starts_at).getTime() : null;
  const endsAt = item.ends_at ? new Date(item.ends_at).getTime() : null;

  if (startsAt && startsAt > now) return '예정';
  if (endsAt && endsAt < now) return '종료';
  return '진행중';
}

function getEventPreview(item: EventItem) {
  return (item.summary || item.content).replace(/\s+/g, ' ').trim();
}

export default function EventsScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_events')
      .select('id, title, summary, content, image_url, is_published, starts_at, ends_at, sort_order, created_at')
      .eq('is_published', true)
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {      return;
    }

    const now = Date.now();
    const visibleEvents = ((data || []) as EventItem[]).filter((item) => {
      if (!item.ends_at) return true;
      return new Date(item.ends_at).getTime() >= now;
    });

    setItems(visibleEvents);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const load = async () => {
        setLoading(true);
        await fetchEvents();
        if (mounted) setLoading(false);
      };

      void load();

      return () => {
        mounted = false;
      };
    }, [fetchEvents])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerBox}>
          <Text style={styles.headerTitle}>이벤트</Text>
          <Text style={styles.headerDesc}>진행 중인 혜택과 안내를 확인해 주세요.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>진행 중인 이벤트가 없습니다.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.eventRow}
          activeOpacity={0.75}
          onPress={() => router.push(`/support/events/${item.id}` as any)}
        >
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" />
          ) : (
            <View style={styles.eventIcon}>
              <Ionicons name="gift-outline" size={20} color="#166534" />
            </View>
          )}

          <View style={styles.eventBody}>
            <View style={styles.eventMetaRow}>
              <Text style={styles.eventLabel}>{getEventBadge(item)}</Text>
              <Text style={styles.eventDate}>{getEventPeriod(item)}</Text>
            </View>

            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.title}
            </Text>

            <Text style={styles.eventPreview} numberOfLines={2}>
              {getEventPreview(item)}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={theme.textSubtle} />
        </TouchableOpacity>
      )}
    />
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centerScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
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
      color: theme.text,
    },
    headerDesc: {
      marginTop: 7,
      fontSize: 14,
      color: theme.textMuted,
      lineHeight: 20,
    },
    empty: {
      marginTop: 60,
      textAlign: 'center',
      color: theme.textSubtle,
      fontSize: 14,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 17,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSoft,
    },
    eventIcon: {
      width: 52,
      height: 52,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primarySoft,
    },
    eventImage: {
      width: 52,
      height: 52,
      borderRadius: 8,
      backgroundColor: theme.surfaceSoft,
    },
    eventBody: {
      flex: 1,
      minWidth: 0,
    },
    eventMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 5,
    },
    eventLabel: {
      color: '#166534',
      fontSize: 12,
      fontWeight: '900',
    },
    eventDate: {
      color: theme.textSubtle,
      fontSize: 12,
      flexShrink: 1,
    },
    eventTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
    },
    eventPreview: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
