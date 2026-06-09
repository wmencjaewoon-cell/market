import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type AdminTab = 'overview' | 'notices' | 'reports' | 'users' | 'listings';

type NoticeItem = {
  id: number;
  title: string;
  content: string;
  is_published: boolean | null;
  created_at: string;
};

type ReportItem = {
  id: number;
  reporter_id: string;
  target_user_id: string;
  reason: string;
  content: string | null;
  status: string | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  user_type: string | null;
  status: string | null;
  role: string | null;
  reports_count: number | null;
  can_start_chat: boolean | null;
  can_create_listing: boolean | null;
};

type AdminListing = {
  id: number;
  title: string;
  price_text: string | null;
  status: string | null;
  author_id: string;
  created_at: string;
  profiles?:
    | {
        display_name: string | null;
        email: string | null;
      }
    | {
        display_name: string | null;
        email: string | null;
      }[]
    | null;
};

function showAdminAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmAdminAction(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`${title}\n${message}`);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '확인', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function getListingAuthorText(item: AdminListing) {
  const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
  return profile?.display_name || profile?.email || item.author_id;
}

export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [adminName, setAdminName] = useState('');

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [listings, setListings] = useState<AdminListing[]>([]);

  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticePublished, setNoticePublished] = useState(true);

  const loadAdminData = useCallback(async () => {
    const [noticeResult, reportResult, userResult, listingResult] = await Promise.all([
      supabase
        .from('notices')
        .select('id, title, content, is_published, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('reports')
        .select('id, reporter_id, target_user_id, reason, content, status, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('profiles')
        .select(
          'id, email, display_name, user_type, status, role, reports_count, can_start_chat, can_create_listing'
        )
        .order('reports_count', { ascending: false })
        .limit(80),
      supabase
        .from('listings')
        .select(
          `
          id,
          title,
          price_text,
          status,
          author_id,
          created_at,
          profiles!listings_author_id_fkey (
            display_name,
            email
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(80),
    ]);

    if (noticeResult.error) throw noticeResult.error;
    if (reportResult.error) throw reportResult.error;
    if (userResult.error) throw userResult.error;
    if (listingResult.error) throw listingResult.error;

    setNotices((noticeResult.data || []) as NoticeItem[]);
    setReports((reportResult.data || []) as ReportItem[]);
    setUsers((userResult.data || []) as AdminUser[]);
    setListings((listingResult.data || []) as AdminListing[]);
  }, []);

  const loadAdmin = useCallback(async () => {
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;

      if (!currentUser) {
        router.replace('/login?redirect=/admin' as any);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, email, role')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile?.role !== 'admin') {
        setUnauthorized(true);
        return;
      }

      setUnauthorized(false);
      setAdminName(profile.display_name || profile.email || '관리자');
      await loadAdminData();
    } catch (error: any) {
      console.log('관리자 화면 로드 실패:', error);
      showAdminAlert('관리자 화면', error?.message || '관리자 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loadAdminData]);

  useFocusEffect(
    useCallback(() => {
      void loadAdmin();
    }, [loadAdmin])
  );

  const createNotice = async () => {
    const title = noticeTitle.trim();
    const content = noticeContent.trim();

    if (!title || !content) {
      showAdminAlert('공지사항', '제목과 내용을 입력해 주세요.');
      return;
    }

    const { error } = await supabase.from('notices').insert({
      title,
      content,
      is_published: noticePublished,
    });

    if (error) {
      showAdminAlert('공지사항 등록 실패', error.message);
      return;
    }

    setNoticeTitle('');
    setNoticeContent('');
    setNoticePublished(true);
    await loadAdminData();
  };

  const toggleNoticePublished = async (notice: NoticeItem) => {
    const { error } = await supabase
      .from('notices')
      .update({ is_published: !notice.is_published })
      .eq('id', notice.id);

    if (error) {
      showAdminAlert('공지사항 변경 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const deleteNotice = async (notice: NoticeItem) => {
    const ok = await confirmAdminAction('공지사항 삭제', `"${notice.title}" 공지를 삭제할까요?`);
    if (!ok) return;

    const { error } = await supabase.from('notices').delete().eq('id', notice.id);

    if (error) {
      showAdminAlert('공지사항 삭제 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const updateReportStatus = async (report: ReportItem, status: 'reviewed' | 'dismissed') => {
    const { error } = await supabase.rpc('admin_update_report_status', {
      p_report_id: report.id,
      p_status: status,
      p_admin_note: null,
    });

    if (error) {
      showAdminAlert('신고 처리 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const deleteReport = async (report: ReportItem) => {
    const ok = await confirmAdminAction(
      '신고 삭제',
      '이 신고를 삭제하면 대상자의 신고 건수에서도 빠집니다. 삭제할까요?'
    );

    if (!ok) return;

    const { error } = await supabase.rpc('admin_delete_report', {
      p_report_id: report.id,
    });

    if (error) {
      showAdminAlert('신고 삭제 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const toggleUserSuspended = async (item: AdminUser) => {
    const nextStatus = item.status === 'suspended' ? 'active' : 'suspended';
    const enabled = nextStatus === 'active';
    const ok = await confirmAdminAction(
      nextStatus === 'active' ? '사용자 제한 해제' : '사용자 이용 제한',
      `${item.display_name || item.email || item.id} 계정을 ${
        nextStatus === 'active' ? '정상 상태로 변경할까요?' : '이용 제한할까요?'
      }`
    );

    if (!ok) return;

    const { error } = await supabase.rpc('admin_set_user_status', {
      p_user_id: item.id,
      p_status: nextStatus,
      p_can_start_chat: enabled,
      p_can_create_listing: enabled,
    });

    if (error) {
      showAdminAlert('사용자 상태 변경 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const toggleListingHidden = async (item: AdminListing) => {
    const nextStatus = item.status === 'hidden' ? 'active' : 'hidden';
    const ok = await confirmAdminAction(
      nextStatus === 'hidden' ? '게시글 숨김' : '게시글 복구',
      `"${item.title}" 게시글을 ${nextStatus === 'hidden' ? '숨길까요?' : '판매중으로 복구할까요?'}`
    );

    if (!ok) return;

    const { error } = await supabase.rpc('admin_set_listing_status', {
      p_listing_id: item.id,
      p_status: nextStatus,
    });

    if (error) {
      showAdminAlert('게시글 상태 변경 실패', error.message);
      return;
    }

    await loadAdminData();
  };

  const stats = [
    { label: '공지', value: notices.length },
    { label: '신고', value: reports.filter((item) => item.status !== 'reviewed').length },
    { label: '사용자', value: users.length },
    { label: '게시글', value: listings.length },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <Text style={styles.loadingText}>관리자 정보를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (unauthorized) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <Text style={styles.title}>접근 권한이 없습니다.</Text>
          <Text style={styles.desc}>관리자 권한이 있는 계정만 사용할 수 있습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>관리자</Text>
            <Text style={styles.desc}>{adminName}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadAdmin}>
            <Text style={styles.refreshText}>새로고침</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {[
            ['overview', '요약'],
            ['notices', '공지'],
            ['reports', '신고'],
            ['users', '사용자'],
            ['listings', '게시글'],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabBtn, activeTab === key && styles.tabBtnActive]}
              onPress={() => setActiveTab(key as AdminTab)}
            >
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'overview' ? (
          <View style={styles.statsGrid}>
            {stats.map((item) => (
              <View key={item.label} style={styles.statCard}>
                <Text style={styles.statValue}>{item.value}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'notices' ? (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>공지 등록</Text>
              <TextInput
                style={styles.input}
                placeholder="제목"
                value={noticeTitle}
                onChangeText={setNoticeTitle}
              />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="내용"
                value={noticeContent}
                onChangeText={setNoticeContent}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.switchRow}>
                <Text style={styles.itemText}>공개</Text>
                <Switch value={noticePublished} onValueChange={setNoticePublished} />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={createNotice}>
                <Text style={styles.primaryText}>공지 등록</Text>
              </TouchableOpacity>
            </View>

            {notices.map((notice) => (
              <View key={notice.id} style={styles.card}>
                <Text style={styles.cardTitle}>{notice.title}</Text>
                <Text style={styles.desc}>{new Date(notice.created_at).toLocaleString()}</Text>
                <Text style={styles.itemText}>{notice.content}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => toggleNoticePublished(notice)}>
                    <Text style={styles.secondaryText}>
                      {notice.is_published ? '비공개' : '공개'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => deleteNotice(notice)}>
                    <Text style={styles.dangerText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'reports' ? (
          <View>
            {reports.map((report) => (
              <View key={report.id} style={styles.card}>
                <Text style={styles.cardTitle}>{report.reason}</Text>
                <Text style={styles.desc}>
                  상태 {report.status || 'pending'} · {new Date(report.created_at).toLocaleString()}
                </Text>
                <Text style={styles.itemText}>{report.content || '내용 없음'}</Text>
                <Text style={styles.metaText}>신고자: {report.reporter_id}</Text>
                <Text style={styles.metaText}>대상자: {report.target_user_id}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => updateReportStatus(report, 'reviewed')}>
                    <Text style={styles.secondaryText}>처리완료</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => updateReportStatus(report, 'dismissed')}>
                    <Text style={styles.secondaryText}>기각</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => deleteReport(report)}>
                    <Text style={styles.dangerText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'users' ? (
          <View>
            {users.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.display_name || item.email || '사용자'}</Text>
                <Text style={styles.desc}>
                  {item.user_type === 'store' ? '가게' : '개인'} · {item.role || 'user'} · 신고{' '}
                  {item.reports_count ?? 0}
                </Text>
                <Text style={styles.metaText}>상태: {item.status || 'active'}</Text>
                <Text style={styles.metaText}>이메일: {item.email || '-'}</Text>
                <TouchableOpacity
                  style={item.status === 'suspended' ? styles.secondaryBtn : styles.dangerBtn}
                  onPress={() => toggleUserSuspended(item)}
                >
                  <Text style={item.status === 'suspended' ? styles.secondaryText : styles.dangerText}>
                    {item.status === 'suspended' ? '제한 해제' : '이용 제한'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'listings' ? (
          <View>
            {listings.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.desc}>
                  {item.price_text || '가격 문의'} · 상태 {item.status || 'active'}
                </Text>
                <Text style={styles.metaText}>
                  작성자: {getListingAuthorText(item)}
                </Text>
                <TouchableOpacity
                  style={item.status === 'hidden' ? styles.secondaryBtn : styles.dangerBtn}
                  onPress={() => toggleListingHidden(item)}
                >
                  <Text style={item.status === 'hidden' ? styles.secondaryText : styles.dangerText}>
                    {item.status === 'hidden' ? '복구' : '숨김'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  container: {
    padding: 16,
    paddingBottom: 80,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  desc: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  loadingText: {
    color: '#6b7280',
    fontWeight: '700',
  },
  refreshBtn: {
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '800',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tabBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  tabTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#6b7280',
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  itemText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  metaText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  textarea: {
    minHeight: 120,
  },
  switchRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '900',
  },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '900',
  },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dangerText: {
    color: '#dc2626',
    fontWeight: '900',
  },
});
