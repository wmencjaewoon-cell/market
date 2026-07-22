import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type NoticeDetail = {
  id: number;
  title: string;
  content: string;
  is_published: boolean | null;
  created_at: string;
  updated_at: string | null;
};

function formatNoticeDate(dateString?: string | null) {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const NOTICE_LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function normalizeNoticeUrl(rawUrl: string) {
  return rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
}

function splitTrailingPunctuation(rawUrl: string) {
  const punctuation = rawUrl.match(/[.,!?)]*$/)?.[0] || '';
  const url = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
  return { url, punctuation };
}

export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchNotice = async () => {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await supabase
        .from('notices')
        .select('id, title, content, is_published, created_at, updated_at')
        .eq('id', Number(id))
        .eq('is_published', true)
        .maybeSingle();

      if (error) {
        console.log('공지사항 상세 조회 실패:', error);
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setNotice(data as NoticeDetail);
      setLoading(false);
    };

    void fetchNotice();
  }, [id]);

  const openHelp = () => {
    router.push('/support/help' as any);
  };

  const openEmail = () => {
    Linking.openURL('mailto:wmenc.jaewoon@gmail.com');
  };

  const openNoticeLink = async (rawUrl: string) => {
    const url = normalizeNoticeUrl(rawUrl);

    try {
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('링크 열기', '이 링크를 열 수 없습니다.');
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.log('공지 링크 열기 실패:', error);
      Alert.alert('링크 열기', '링크를 열지 못했습니다.');
    }
  };

  const renderNoticeContent = (content: string) => {
    const parts = content.split(NOTICE_LINK_REGEX);

    return parts.map((part, index) => {
      if (!part.match(NOTICE_LINK_REGEX)) {
        return part;
      }

      const { url, punctuation } = splitTrailingPunctuation(part);

      return (
        <Text key={`${url}-${index}`}>
          <Text style={styles.bodyLink} onPress={() => openNoticeLink(url)}>
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

  if (notFound || !notice) {
    return (
      <View style={styles.centerScreen}>
        <Ionicons name="document-text-outline" size={42} color={theme.textSubtle} />
        <Text style={styles.notFoundTitle}>공지사항을 찾을 수 없습니다.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.article}>
        <View style={styles.metaRow}>
          <Text style={styles.noticeLabel}>공지</Text>
          {/* {notice.is_published === false ? (
            <Text style={styles.privateLabel}>비공개</Text>
          ) : null} */}
        </View>

        <Text style={styles.title}>{notice.title}</Text>

        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{formatNoticeDate(notice.created_at)}</Text>
          {notice.updated_at && notice.updated_at !== notice.created_at ? (
            <Text style={styles.dateText}>수정 {formatNoticeDate(notice.updated_at)}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <Text style={styles.bodyText}>{renderNoticeContent(notice.content)}</Text>
      </View>

      <View style={styles.helpBox}>
        <View style={styles.helpIcon}>
          <Ionicons name="help-buoy-outline" size={22} color="#166534" />
        </View>

        <View style={styles.helpContent}>
          <Text style={styles.helpTitle}>궁금한 점이 있으신가요?</Text>
          <Text style={styles.helpDesc}>
            공지 내용과 관련해 도움이 필요하면 고객센터로 문의해 주세요.
          </Text>

          <View style={styles.helpActions}>
            <TouchableOpacity style={styles.helpPrimaryBtn} onPress={openHelp}>
              <Text style={styles.helpPrimaryText}>고객센터</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helpSecondaryBtn} onPress={openEmail}>
              <Text style={styles.helpSecondaryText}>이메일 문의</Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: 20,
    paddingBottom: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  noticeLabel: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '900',
  },
  privateLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 30,
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
    backgroundColor: theme.warningBg,
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
  helpActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  helpPrimaryBtn: {
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
  helpSecondaryBtn: {
    backgroundColor: theme.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  helpSecondaryText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  notFoundTitle: {
    marginTop: 12,
    color: theme.text,
    fontSize: 17,
    fontWeight: '800',
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: theme.text,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  backBtnText: {
    color: theme.background,
    fontWeight: '800',
  },
});
}
