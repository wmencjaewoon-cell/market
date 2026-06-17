import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

type AdminViewMode = 'grid' | 'list';
type DateFilter = 'all' | 'today' | '7days' | '30days';

type AdminViewModes = {
  reports: AdminViewMode;
  users: AdminViewMode;
  listings: AdminViewMode;
};

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
  admin_deleted_at: string | null;
  admin_delete_scheduled_at: string | null;
  admin_delete_previous_status: string | null;
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

function isUserRestricted(item: AdminUser) {
  return (
    item.status === 'suspended' ||
    item.status === 'blocked' ||
    item.can_start_chat === false ||
    item.can_create_listing === false
  );
}

function isDeletionPendingUser(item: AdminUser) {
  return item.status === 'deletion_pending';
}

function getUserStatusLabel(item: AdminUser) {
  if (isDeletionPendingUser(item)) return '탈퇴 대기';
  if (isUserRestricted(item)) return '이용 제한';
  return '정상';
}

function formatAdminDate(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isWithinDateFilter(createdAt: string, filter: DateFilter) {
  if (filter === 'all') return true;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;

  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (filter === 'today') {
    return createdDate.toDateString() === now.toDateString();
  }

  if (filter === '7days') return diffDays <= 7;
  if (filter === '30days') return diffDays <= 30;

  return true;
}

function getDateFilterLabel(filter: DateFilter) {
  if (filter === 'today') return '오늘';
  if (filter === '7days') return '최근 7일';
  if (filter === '30days') return '최근 30일';
  return '전체 날짜';
}

function isListingHidden(item: AdminListing) {
  return item.status === 'hidden';
}

function isListingDeletePending(item: AdminListing) {
  return item.status === 'delete_pending';
}

function canCancelListingDelete(item: AdminListing) {
  if (!isListingDeletePending(item) || !item.admin_delete_scheduled_at) return false;
  return new Date(item.admin_delete_scheduled_at).getTime() > Date.now();
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

  const [viewModes, setViewModes] = useState<AdminViewModes>({
  reports: 'grid',
  users: 'grid',
  listings: 'grid',
});

const [reportDateFilter, setReportDateFilter] = useState<DateFilter>('all');
const [reportReasonFilter, setReportReasonFilter] = useState('all');
const [reportStatusFilter, setReportStatusFilter] = useState('all');
const [reportIdKeyword, setReportIdKeyword] = useState('');

const [userKeyword, setUserKeyword] = useState('');
const [listingDateFilter, setListingDateFilter] = useState<DateFilter>('all');
const [listingStatusFilter, setListingStatusFilter] = useState('all');
const [listingKeyword, setListingKeyword] = useState('');

const toggleViewMode = (tab: keyof AdminViewModes) => {
  setViewModes((prev) => ({
    ...prev,
    [tab]: prev[tab] === 'grid' ? 'list' : 'grid',
  }));
};

const goToListingDetail = (listingId: number) => {
  router.push(`/(tabs)/home/post/${listingId}` as any);
};

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
          admin_deleted_at,
          admin_delete_scheduled_at,
          admin_delete_previous_status,
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
    if (isDeletionPendingUser(item)) {
      showAdminAlert('사용자 상태 변경', '탈퇴 대기 중인 계정은 이 화면에서 이용제한을 변경할 수 없습니다.');
      return;
    }

    const restricted = isUserRestricted(item);
    const nextStatus = restricted ? 'active' : 'suspended';
    const enabled = nextStatus === 'active';
    const ok = await confirmAdminAction(
      nextStatus === 'active' ? '이용제한 취소' : '사용자 이용 제한',
      `${item.display_name || item.email || item.id} 계정을 ${
        nextStatus === 'active' ? '정상 상태로 되돌릴까요?' : '이용 제한할까요?'
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
    if (isListingDeletePending(item)) {
      showAdminAlert('게시글 숨김', '삭제 대기 중인 게시글은 숨김 상태를 변경할 수 없습니다.');
      return;
    }

    const nextStatus = isListingHidden(item) ? 'active' : 'hidden';
    const ok = await confirmAdminAction(
      nextStatus === 'hidden' ? '게시글 숨김' : '숨김 취소',
      `"${item.title}" 게시글을 ${nextStatus === 'hidden' ? '숨길까요?' : '다시 보이게 할까요?'}`
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

  const requestListingDelete = async (item: AdminListing) => {
    const ok = await confirmAdminAction(
      '게시글 삭제',
      `"${item.title}" 게시글을 삭제 대기 상태로 변경할까요?\n3일 동안 삭제 취소가 가능합니다.`
    );

    if (!ok) return;

    const { error } = await supabase.rpc('admin_request_listing_delete', {
      p_listing_id: item.id,
    });

    if (error) {
      showAdminAlert(
        '게시글 삭제 실패',
        error.message.includes('function')
          ? 'Supabase SQL 설정이 필요합니다. admin_setup.sql을 실행해 주세요.'
          : error.message
      );
      return;
    }

    await loadAdminData();
  };

  const cancelListingDelete = async (item: AdminListing) => {
    if (!canCancelListingDelete(item)) {
      showAdminAlert('삭제 취소 불가', '삭제 취소 가능 기간 3일이 지났습니다.');
      return;
    }

    const ok = await confirmAdminAction(
      '삭제 취소',
      `"${item.title}" 게시글 삭제를 취소하고 이전 상태로 복구할까요?`
    );

    if (!ok) return;

    const { error } = await supabase.rpc('admin_cancel_listing_delete', {
      p_listing_id: item.id,
    });

    if (error) {
      showAdminAlert(
        '삭제 취소 실패',
        error.message.includes('period')
          ? '삭제 취소 가능 기간 3일이 지났습니다.'
          : error.message
      );
      return;
    }

    await loadAdminData();
  };

  const reportReasons = useMemo(() => {
  return Array.from(new Set(reports.map((item) => item.reason).filter(Boolean)));
}, [reports]);

const listingStatuses = useMemo(() => {
  return Array.from(new Set(listings.map((item) => item.status || 'active')));
}, [listings]);

const filteredReports = useMemo(() => {
  const keyword = reportIdKeyword.trim().toLowerCase();

  return reports.filter((item) => {
    const status = item.status || 'pending';

    const matchesDate = isWithinDateFilter(item.created_at, reportDateFilter);
    const matchesReason = reportReasonFilter === 'all' || item.reason === reportReasonFilter;
    const matchesStatus = reportStatusFilter === 'all' || status === reportStatusFilter;

    const matchesKeyword =
      !keyword ||
      String(item.id).includes(keyword) ||
      item.reporter_id.toLowerCase().includes(keyword) ||
      item.target_user_id.toLowerCase().includes(keyword) ||
      item.reason.toLowerCase().includes(keyword);

    return matchesDate && matchesReason && matchesStatus && matchesKeyword;
  });
}, [reports, reportDateFilter, reportReasonFilter, reportStatusFilter, reportIdKeyword]);

const filteredUsers = useMemo(() => {
  const keyword = userKeyword.trim().toLowerCase();

  return users.filter((item) => {
    if (!keyword) return true;

    return (
      item.id.toLowerCase().includes(keyword) ||
      (item.email || '').toLowerCase().includes(keyword) ||
      (item.display_name || '').toLowerCase().includes(keyword) ||
      (item.user_type || '').toLowerCase().includes(keyword) ||
      (item.status || '').toLowerCase().includes(keyword)
    );
  });
}, [users, userKeyword]);

const filteredListings = useMemo(() => {
  const keyword = listingKeyword.trim().toLowerCase();

  return listings.filter((item) => {
    const status = item.status || 'active';

    const matchesDate = isWithinDateFilter(item.created_at, listingDateFilter);
    const matchesStatus = listingStatusFilter === 'all' || status === listingStatusFilter;

    const authorText = getListingAuthorText(item).toLowerCase();

    const matchesKeyword =
      !keyword ||
      String(item.id).includes(keyword) ||
      item.title.toLowerCase().includes(keyword) ||
      item.author_id.toLowerCase().includes(keyword) ||
      authorText.includes(keyword);

    return matchesDate && matchesStatus && matchesKeyword;
  });
}, [listings, listingDateFilter, listingStatusFilter, listingKeyword]);

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
    <View style={styles.toolCard}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolTitle}>신고 목록 {filteredReports.length}건</Text>

        <TouchableOpacity style={styles.viewToggleBtn} onPress={() => toggleViewMode('reports')}>
          <Text style={styles.viewToggleText}>
            {viewModes.reports === 'grid' ? '한줄 보기' : '바둑판 보기'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="신고 ID, 신고자 ID, 대상자 ID, 항목 검색"
        value={reportIdKeyword}
        onChangeText={setReportIdKeyword}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(['all', 'today', '7days', '30days'] as DateFilter[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filterChip, reportDateFilter === item && styles.filterChipActive]}
            onPress={() => setReportDateFilter(item)}
          >
            <Text style={[styles.filterChipText, reportDateFilter === item && styles.filterChipTextActive]}>
              {getDateFilterLabel(item)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {['all', ...reportReasons].map((reason) => (
          <TouchableOpacity
            key={reason}
            style={[styles.filterChip, reportReasonFilter === reason && styles.filterChipActive]}
            onPress={() => setReportReasonFilter(reason)}
          >
            <Text style={[styles.filterChipText, reportReasonFilter === reason && styles.filterChipTextActive]}>
              {reason === 'all' ? '전체 항목' : reason}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {['all', 'pending', 'reviewed', 'dismissed'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, reportStatusFilter === status && styles.filterChipActive]}
            onPress={() => setReportStatusFilter(status)}
          >
            <Text style={[styles.filterChipText, reportStatusFilter === status && styles.filterChipTextActive]}>
              {status === 'all'
                ? '전체 상태'
                : status === 'pending'
                ? '대기'
                : status === 'reviewed'
                ? '처리완료'
                : '기각'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>

    <View style={viewModes.reports === 'grid' ? styles.gridWrap : styles.listWrap}>
      {filteredReports.map((report) => (
        <View
          key={report.id}
          style={[
            styles.card,
            viewModes.reports === 'grid' ? styles.gridCard : styles.listCard,
          ]}
        >
          <Text style={styles.cardTitle}>{report.reason}</Text>
          <Text style={styles.desc}>
            #{report.id} · 상태 {report.status || 'pending'} · {new Date(report.created_at).toLocaleString()}
          </Text>
          <Text style={styles.itemText}>{report.content || '내용 없음'}</Text>
          <Text style={styles.metaText}>신고자: {report.reporter_id}</Text>
          <Text style={styles.metaText}>대상자: {report.target_user_id}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => updateReportStatus(report, 'reviewed')}>
              <Text style={styles.secondaryText}>확인</Text>
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
  </View>
) : null}

        {activeTab === 'users' ? (
  <View>
    <View style={styles.toolCard}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolTitle}>사용자 목록 {filteredUsers.length}명</Text>

        <TouchableOpacity style={styles.viewToggleBtn} onPress={() => toggleViewMode('users')}>
          <Text style={styles.viewToggleText}>
            {viewModes.users === 'grid' ? '한줄 보기' : '바둑판 보기'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="아이디, 이메일, 닉네임, 상태 검색"
        value={userKeyword}
        onChangeText={setUserKeyword}
      />
    </View>

    <View style={viewModes.users === 'grid' ? styles.gridWrap : styles.listWrap}>
      {filteredUsers.map((item) => (
        <View
          key={item.id}
          style={[
            styles.card,
            viewModes.users === 'grid' ? styles.gridCard : styles.listCard,
          ]}
        >
          <Text style={styles.cardTitle}>{item.display_name || item.email || '사용자'}</Text>
          <Text style={styles.desc}>
            {item.user_type === 'store' ? '가게' : '개인'} · {item.role || 'user'} · 신고{' '}
            {item.reports_count ?? 0}
          </Text>
          <Text style={styles.metaText}>ID: {item.id}</Text>
          <Text style={styles.metaText}>상태: {item.status || 'active'}</Text>
          <Text style={styles.metaText}>표시 상태: {getUserStatusLabel(item)}</Text>
          <Text style={styles.metaText}>이메일: {item.email || '-'}</Text>

          <TouchableOpacity
            style={[
              isUserRestricted(item) || isDeletionPendingUser(item)
                ? styles.secondaryBtn
                : styles.dangerBtn,
              isDeletionPendingUser(item) && styles.disabledBtn,
            ]}
            onPress={() => toggleUserSuspended(item)}
            disabled={isDeletionPendingUser(item)}
          >
            <Text
              style={
                isUserRestricted(item) || isDeletionPendingUser(item)
                  ? styles.secondaryText
                  : styles.dangerText
              }
            >
              {isDeletionPendingUser(item)
                ? '탈퇴 대기'
                : isUserRestricted(item)
                ? '이용제한 취소'
                : '이용 제한'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  </View>
) : null}

        {activeTab === 'listings' ? (
  <View>
    <View style={styles.toolCard}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolTitle}>게시글 목록 {filteredListings.length}개</Text>

        <TouchableOpacity style={styles.viewToggleBtn} onPress={() => toggleViewMode('listings')}>
          <Text style={styles.viewToggleText}>
            {viewModes.listings === 'grid' ? '한줄 보기' : '바둑판 보기'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="게시글 ID, 제목, 작성자 ID 검색"
        value={listingKeyword}
        onChangeText={setListingKeyword}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(['all', 'today', '7days', '30days'] as DateFilter[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filterChip, listingDateFilter === item && styles.filterChipActive]}
            onPress={() => setListingDateFilter(item)}
          >
            <Text style={[styles.filterChipText, listingDateFilter === item && styles.filterChipTextActive]}>
              {getDateFilterLabel(item)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {['all', ...listingStatuses].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, listingStatusFilter === status && styles.filterChipActive]}
            onPress={() => setListingStatusFilter(status)}
          >
            <Text style={[styles.filterChipText, listingStatusFilter === status && styles.filterChipTextActive]}>
              {status === 'all' ? '전체 상태' : status}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>

    <View style={viewModes.listings === 'grid' ? styles.gridWrap : styles.listWrap}>
      {filteredListings.map((item) => (
        <View
          key={item.id}
          style={[
            styles.card,
            viewModes.listings === 'grid' ? styles.gridCard : styles.listCard,
          ]}
        >
          <TouchableOpacity onPress={() => goToListingDetail(item.id)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.openDetailText}>게시글 보기</Text>
          </TouchableOpacity>

          <Text style={styles.desc}>
            #{item.id} · {item.price_text || '가격 문의'} · 상태 {item.status || 'active'}
          </Text>
          <Text style={styles.metaText}>작성자: {getListingAuthorText(item)}</Text>
          <Text style={styles.metaText}>작성자 ID: {item.author_id}</Text>
          <Text style={styles.metaText}>등록일: {new Date(item.created_at).toLocaleString()}</Text>

          {isListingDeletePending(item) ? (
            <>
              <Text style={styles.metaText}>
                삭제 요청: {formatAdminDate(item.admin_deleted_at) || '-'}
              </Text>
              <Text style={styles.metaText}>
                삭제 취소 가능 기한: {formatAdminDate(item.admin_delete_scheduled_at) || '-'}
              </Text>
            </>
          ) : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                isListingHidden(item) ? styles.secondaryBtn : styles.dangerBtn,
                isListingDeletePending(item) && styles.disabledBtn,
              ]}
              onPress={() => toggleListingHidden(item)}
              disabled={isListingDeletePending(item)}
            >
              <Text style={isListingHidden(item) ? styles.secondaryText : styles.dangerText}>
                {isListingHidden(item) ? '숨김취소' : '숨김'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                isListingDeletePending(item) ? styles.secondaryBtn : styles.dangerBtn,
                isListingDeletePending(item) &&
                  !canCancelListingDelete(item) &&
                  styles.disabledBtn,
              ]}
              onPress={() =>
                isListingDeletePending(item)
                  ? cancelListingDelete(item)
                  : requestListingDelete(item)
              }
              disabled={isListingDeletePending(item) && !canCancelListingDelete(item)}
            >
              <Text
                style={
                  isListingDeletePending(item)
                    ? styles.secondaryText
                    : styles.dangerText
                }
              >
                {isListingDeletePending(item)
                  ? canCancelListingDelete(item)
                    ? '삭제 취소'
                    : '삭제 취소 만료'
                  : '삭제'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '900',
  },
  toolCard: {
  borderRadius: 14,
  backgroundColor: '#fff',
  padding: 14,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  marginBottom: 12,
},

toolHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

toolTitle: {
  fontSize: 15,
  fontWeight: '900',
  color: '#111827',
},

viewToggleBtn: {
  borderRadius: 999,
  backgroundColor: '#111827',
  paddingHorizontal: 12,
  paddingVertical: 8,
},

viewToggleText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '900',
},

searchInput: {
  marginTop: 12,
  borderWidth: 1,
  borderColor: '#d1d5db',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: '#fff',
  fontSize: 14,
},

filterRow: {
  gap: 8,
  paddingTop: 10,
},

filterChip: {
  borderRadius: 999,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  backgroundColor: '#fff',
  paddingHorizontal: 12,
  paddingVertical: 8,
},

filterChipActive: {
  backgroundColor: '#2563eb',
  borderColor: '#2563eb',
},

filterChipText: {
  fontSize: 12,
  fontWeight: '800',
  color: '#374151',
},

filterChipTextActive: {
  color: '#fff',
},

gridWrap: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 10,
},

listWrap: {
  gap: 10,
},

gridCard: {
  width: '48%',
  marginBottom: 0,
},

listCard: {
  width: '100%',
  marginBottom: 0,
},

openDetailText: {
  marginTop: 4,
  fontSize: 12,
  fontWeight: '900',
  color: '#2563eb',
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
  disabledBtn: {
    opacity: 0.55,
  },
});
