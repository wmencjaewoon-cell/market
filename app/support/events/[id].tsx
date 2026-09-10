// 이벤트 상세 화면: 이벤트 기간, 이미지, 본문을 보여주고 본문 링크를 외부 브라우저로 연결한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { type AppPalette } from '../../../contexts/theme';
import { useAppTheme } from '../../../hooks/use-app-theme';
import { supabase } from '../../../lib/supabase';

type EventDetail = {
  id: number;
  title: string;
  summary: string | null;
  content: string;
  image_url: string | null;
  is_published: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const EVENT_LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function formatEventDate(dateString?: string | null) {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function normalizeEventUrl(rawUrl: string) {
  return rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
}

function splitTrailingPunctuation(rawUrl: string) {
  const punctuation = rawUrl.match(/[.,!?)]*$/)?.[0] || '';
  const url = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
  return { url, punctuation };
}

function getEventPeriod(event: EventDetail) {
  const startText = formatEventDate(event.starts_at);
  const endText = formatEventDate(event.ends_at);

  if (startText && endText) return `${startText} - ${endText}`;
  if (startText) return `${startText} 시작`;
  if (endText) return `${endText}까지`;
  return formatEventDate(event.created_at);
}

function getEventBadge(event: EventDetail) {
  const now = Date.now();
  const startsAt = event.starts_at ? new Date(event.starts_at).getTime() : null;
  const endsAt = event.ends_at ? new Date(event.ends_at).getTime() : null;

  if (startsAt && startsAt > now) return '예정';
  if (endsAt && endsAt < now) return '종료';
  return '진행중';
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchEvent = async () => {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await supabase
        .from('support_events')
        .select('id, title, summary, content, image_url, is_published, starts_at, ends_at, created_at, updated_at')
        .eq('id', Number(id))
        .eq('is_published', true)
        .maybeSingle();

      if (error) {        setNotFound(true);
        setLoading(false);
        return;
      }

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const loadedEvent = data as EventDetail;
      const endedAt = loadedEvent.ends_at ? new Date(loadedEvent.ends_at).getTime() : null;
      if (endedAt && endedAt < Date.now()) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(loadedEvent);
      setLoading(false);
    };

    void fetchEvent();
  }, [id]);

  const openHelp = () => {
    router.push('/support/help' as any);
  };

  const openEventLink = async (rawUrl: string) => {
    const url = normalizeEventUrl(rawUrl);

    try {
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('링크 열기', '이 링크를 열 수 없습니다.');
        return;
      }

      await Linking.openURL(url);
    } catch {      Alert.alert('링크 열기', '링크를 열지 못했습니다.');
    }
  };

  const renderEventContent = (content: string) => {
    const parts = content.split(EVENT_LINK_REGEX);

    return parts.map((part, index) => {
      if (!part.match(EVENT_LINK_REGEX)) {
        return part;
      }

      const { url, punctuation } = splitTrailingPunctuation(part);

      return (
        <Text key={`${url}-${index}`}>
          <Text style={styles.bodyLink} onPress={() => openEventLink(url)}>
            {url}
          </Text>
          {punctuation}
        </Text>
      );
    });
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (notFound || !event) {
    return (
      <View style={styles.centerScreen}>
        <Ionicons name="gift-outline" size={42} color={theme.textSubtle} />
        <Text style={styles.notFoundTitle}>이벤트를 찾을 수 없습니다.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.article}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.heroImage} resizeMode="cover" />
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.eventLabel}>{getEventBadge(event)}</Text>
          <Text style={styles.dateText}>{getEventPeriod(event)}</Text>
        </View>

        <Text style={styles.title}>{event.title}</Text>

        {event.summary ? <Text style={styles.summary}>{event.summary}</Text> : null}

        <View style={styles.dateRow}>
          <Text style={styles.dateText}>등록 {formatEventDate(event.created_at)}</Text>
          {event.updated_at && event.updated_at !== event.created_at ? (
            <Text style={styles.dateText}>수정 {formatEventDate(event.updated_at)}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <Text style={styles.bodyText}>{renderEventContent(event.content)}</Text>
      </View>

      <View style={styles.helpBox}>
        <View style={styles.helpIcon}>
          <Ionicons name="help-buoy-outline" size={22} color="#166534" />
        </View>

        <View style={styles.helpContent}>
          <Text style={styles.helpTitle}>이벤트 관련 문의</Text>
          <Text style={styles.helpDesc}>참여 조건이나 적용 여부가 궁금하면 고객센터로 문의해 주세요.</Text>

          <TouchableOpacity style={styles.helpPrimaryBtn} onPress={openHelp}>
            <Text style={styles.helpPrimaryText}>고객센터</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
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
      padding: 24,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
    },
    article: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 24,
    },
    heroImage: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 8,
      marginBottom: 16,
      backgroundColor: theme.surfaceSoft,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 9,
    },
    eventLabel: {
      color: '#166534',
      fontSize: 13,
      fontWeight: '900',
    },
    title: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '900',
      lineHeight: 30,
    },
    summary: {
      marginTop: 10,
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 23,
      fontWeight: '700',
    },
    dateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 10,
    },
    dateText: {
      color: theme.textSubtle,
      fontSize: 13,
    },
    divider: {
      height: 1,
      backgroundColor: theme.borderSoft,
      marginTop: 18,
      marginBottom: 22,
    },
    bodyText: {
      color: theme.text,
      fontSize: 16,
      lineHeight: 27,
    },
    bodyLink: {
      color: theme.primary,
      fontWeight: '800',
      textDecorationLine: 'underline',
    },
    helpBox: {
      marginTop: 14,
      backgroundColor: theme.surface,
      borderRadius: 8,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
    },
    helpIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primarySoft,
    },
    helpContent: {
      flex: 1,
    },
    helpTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    helpDesc: {
      marginTop: 5,
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    helpPrimaryBtn: {
      marginTop: 12,
      alignSelf: 'flex-start',
      backgroundColor: '#166534',
      borderRadius: 8,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    helpPrimaryText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },
    notFoundTitle: {
      marginTop: 12,
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
    },
    backBtn: {
      marginTop: 16,
      borderRadius: 8,
      backgroundColor: '#166534',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    backBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
  });
}
