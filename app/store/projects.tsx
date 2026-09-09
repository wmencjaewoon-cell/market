// 현장관리 화면: 확정 견적/오프라인 계약에서 생성된 현장, 일정, 일일보고서, 참여자를 관리한다.
// 파트너는 같은 현장을 보지만 소유 가게 권한을 얻지 않도록 모든 수정 권한을 별도로 계산한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { usePreventRemove } from '@react-navigation/native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { getStoreCategoryLabel, STORE_CATEGORY_OPTIONS } from '../../lib/storeCategories';
import { getMyStoreAccessContext, type StoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_PREVIEW_CLOSE_DISTANCE = 90;
const IMAGE_PREVIEW_CLOSE_VELOCITY = 900;

type ProjectStatus = 'preparing' | 'in_progress' | 'completed' | 'on_hold' | 'canceled';
type ProjectFilter = ProjectStatus | 'all';
type ProjectScopeFilter = 'all' | 'owned' | 'partner';
type ScheduleStatus = 'scheduled' | 'in_progress' | 'done' | 'canceled';
type PartnerInputMode = 'registered' | 'manual';
type ProjectActivityNotificationType =
  | 'project_schedule_created'
  | 'project_schedule_updated'
  | 'project_daily_report_created';
type ProjectPeriodUpdate = {
  id: string;
  storeUserId?: string | null;
  assignedStaffUserId?: string | null;
  startDate: string;
  endDate: string;
};

const REPORT_IMAGE_BUCKET = 'project-report-images';

const PROJECT_STATUS_OPTIONS: { key: ProjectFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'preparing', label: '준비중' },
  { key: 'in_progress', label: '진행중' },
  { key: 'completed', label: '완료' },
  { key: 'on_hold', label: '보류' },
  { key: 'canceled', label: '취소' },
];

const PROJECT_SCOPE_OPTIONS: { key: ProjectScopeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'owned', label: '내 현장' },
  { key: 'partner', label: '협력 참여' },
];

const SCHEDULE_STATUS_OPTIONS: { key: ScheduleStatus; label: string }[] = [
  { key: 'scheduled', label: '예정' },
  { key: 'in_progress', label: '진행' },
  { key: 'done', label: '완료' },
  { key: 'canceled', label: '취소' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function getTodayYmd() {
  return formatYmd(new Date());
}

function formatShortDate(value?: string | null) {
  if (!value) return '미정';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatScheduleNotificationRange(startDate: string, endDate?: string | null) {
  const start = formatShortDate(startDate);
  const end = endDate && endDate !== startDate ? formatShortDate(endDate) : '';
  return end ? `${start} ~ ${end}` : start;
}

function getStatusLabel(status?: string | null) {
  return PROJECT_STATUS_OPTIONS.find((item) => item.key === status)?.label || '준비중';
}

function getScheduleStatusLabel(status?: string | null) {
  return SCHEDULE_STATUS_OPTIONS.find((item) => item.key === status)?.label || '예정';
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9]/g, '')) || 0;
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return amount ? `${amount.toLocaleString('ko-KR')}원` : '금액 미입력';
}

function getMonthCells(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { key: string; day: number | null; dateText: string | null }[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({ key: `empty-${index}`, day: null, dateText: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      dateText: formatYmd(new Date(year, month, day)),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${cells.length}`, day: null, dateText: null });
  }

  return cells;
}

function moveMonth(date: Date, diff: number) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function isDateInSchedule(dateText: string, schedule: any) {
  const start = schedule.start_date;
  const end = schedule.end_date || schedule.start_date;
  return dateText >= start && dateText <= end;
}

function getSchedulePeriod(schedules: any[]) {
  const ranges = schedules
    .map((schedule) => {
      const start = String(schedule.start_date || '').trim();
      const end = String(schedule.end_date || schedule.start_date || '').trim();
      return { start, end };
    })
    .filter((range) => isValidYmd(range.start) && isValidYmd(range.end));

  if (ranges.length === 0) {
    return { startDate: null, endDate: null };
  }

  return {
    startDate: ranges.reduce((min, range) => (range.start < min ? range.start : min), ranges[0].start),
    endDate: ranges.reduce((max, range) => (range.end > max ? range.end : max), ranges[0].end),
  };
}

function getProjectPeriod(project: any) {
  const schedulePeriod = getSchedulePeriod(project?.project_schedules || []);

  return {
    startDate: schedulePeriod.startDate || project?.start_date || null,
    endDate: schedulePeriod.endDate || project?.end_date || null,
  };
}

function getRouteParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function clampNumber(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function ZoomableReportImage({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissY.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clampNumber(savedScale.value * event.scale, 1, 4);
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value <= 1.02) {
        resetZoom();
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => {
      if (scale.value > 1.05) {
        resetZoom();
        return;
      }

      scale.value = withTiming(2.5);
      savedScale.value = 2.5;
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1.05) {
        const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;

        translateX.value = clampNumber(savedX.value + event.translationX, -maxX, maxX);
        translateY.value = clampNumber(savedY.value + event.translationY, -maxY, maxY);
        return;
      }

      dismissY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (scale.value > 1.05) {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }

      const shouldClose =
        event.translationY > IMAGE_PREVIEW_CLOSE_DISTANCE ||
        (event.translationY > 36 && event.velocityY > IMAGE_PREVIEW_CLOSE_VELOCITY);

      if (shouldClose) {
        dismissY.value = withTiming(SCREEN_HEIGHT, { duration: 150 }, (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        });
        return;
      }

      dismissY.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const composedGesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View collapsable={false} style={reportImageViewerStyles.gestureBox}>
        <Reanimated.Image
          source={{ uri }}
          style={[reportImageViewerStyles.image, animatedStyle]}
          resizeMode="contain"
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function getRelationItem(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function getProjectEstimateRequest(project: any) {
  return getRelationItem(project?.estimate_requests);
}

function getProjectCustomerName(project: any, emptyText = '고객 미지정') {
  const request = getProjectEstimateRequest(project);
  return project?.store_customers?.name || request?.applicant_name || emptyText;
}

function getProjectCustomerAddress(project: any, emptyText = '주소 미입력') {
  const request = getProjectEstimateRequest(project);
  return (
    project?.address ||
    project?.store_customers?.address ||
    request?.address ||
    request?.region ||
    emptyText
  );
}

function canReadProjectInternalReports(
  project: any,
  access: StoreAccessContext | null,
  userId?: string | null
) {
  if (!project || !userId) return false;

  if (project.store_user_id === userId) return true;

  if (access?.canManageStore && project.store_user_id === access.storeUserId) {
    return true;
  }

  if (
    access?.isStaff &&
    project.store_user_id === access.storeUserId &&
    project.assigned_staff_user_id === userId
  ) {
    return true;
  }

  return (project.project_members || []).some((member: any) => (
    member.member_user_id === userId &&
    member.invitation_status === 'accepted' &&
    ['owner', 'manager', 'employee', 'partner'].includes(member.role)
  ));
}

// Partner access is a separate view of the same project.
// Partners can see invited projects without gaining the owning store's management permissions.
function isProjectPartnerAccess(
  project: any,
  access: StoreAccessContext | null,
  userId?: string | null
) {
  if (!project || !userId) return false;

  if (project.store_user_id === userId) return false;

  if (access?.storeUserId && project.store_user_id === access.storeUserId) {
    return false;
  }

  return (project.project_members || []).some((member: any) => {
    if (member.invitation_status !== 'accepted' || member.role !== 'partner') return false;
    return (
      member.member_user_id === userId ||
      (!!access?.storeUserId && member.member_user_id === access.storeUserId)
    );
  });
}

function getProjectAccessLabel(
  project: any,
  access: StoreAccessContext | null,
  userId?: string | null
) {
  return isProjectPartnerAccess(project, access, userId) ? '협력 참여' : '내 현장';
}

function projectMatchesScope(
  project: any,
  scope: ProjectScopeFilter,
  access: StoreAccessContext | null,
  userId?: string | null
) {
  if (scope === 'all') return true;

  const partnerAccess = isProjectPartnerAccess(project, access, userId);
  return scope === 'partner' ? partnerAccess : !partnerAccess;
}

async function syncProjectPeriodUpdates(
  updates: ProjectPeriodUpdate[],
  access: StoreAccessContext | null
) {
  if (!access?.storeUserId || updates.length === 0) return;

  const writableUpdates = updates.filter((update) => {
    if (update.storeUserId !== access.storeUserId) return false;
    if (access.canManageStore) return true;
    return access.isStaff && update.assignedStaffUserId === access.currentUserId;
  });

  if (writableUpdates.length === 0) return;

  await Promise.all(
    writableUpdates.map(async (update) => {
      const { error } = await supabase
        .from('store_projects')
        .update({
          start_date: update.startDate,
          end_date: update.endDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);    })
  );
}

// The project period is derived from the earliest and latest schedules.
// Only persist it when the current user can write to the owning store's project.
async function syncProjectPeriodFromSchedules(
  project: any,
  schedules: any[],
  clearWhenEmpty = false
) {
  const period = getSchedulePeriod(schedules);
  const nextStartDate = period.startDate || (clearWhenEmpty ? null : project?.start_date || null);
  const nextEndDate = period.endDate || (clearWhenEmpty ? null : project?.end_date || null);

  if (project?.start_date === nextStartDate && project?.end_date === nextEndDate) {
    return null;
  }

  if (!period.startDate && !period.endDate && !clearWhenEmpty) {
    return null;
  }

  const { error } = await supabase
    .from('store_projects')
    .update({
      start_date: nextStartDate,
      end_date: nextEndDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.id);

  return error;
}

function sanitizeFileName(value?: string | null) {
  const baseName = (value || 'daily-report').trim() || 'daily-report';
  return baseName.replace(/[^\w.\-가-힣]/g, '_').slice(0, 80);
}

function getExtensionFromMime(mimeType?: string | null) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function readImageBody(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return decode(base64);
}

function normalizeSearchText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getProjectInviteLink(inviteToken?: string | null) {
  if (!inviteToken) return null;
  return `interiormarket:///project-invite/${inviteToken}`;
}

function getSmsInviteUrl(phone: string, body: string) {
  const recipient = phone.replace(/[^\d+]/g, '');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${recipient}${separator}body=${encodeURIComponent(body)}`;
}

function getProjectInviteMessage(projectName: string, inviteLink: string) {
  return [
    '인테리어마켓 현장관리 초대 링크입니다.',
    projectName ? `현장: ${projectName}` : null,
    '아래 링크를 눌러 현장 일정, 채팅, 일일보고서를 확인해 주세요.',
    inviteLink,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 현장 완료/삭제/일정 삭제처럼 되돌리기 어려운 작업 전에 확인을 받는다.
 * web과 native가 같은 boolean 흐름을 쓰도록 분기만 이 함수에 모아둔다.
 */
function confirmProjectLifecycleAction(title: string, message: string, confirmText: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n${message}`));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: confirmText === '삭제' ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export default function StoreProjectsScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{
    projectId?: string;
    returnTo?: string;
    reportId?: string;
    action?: string;
    focus?: string;
  }>();
  const projectReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const requestedProjectId = getRouteParam(params.projectId);
  const requestedReportId = getRouteParam(params.reportId);
  const requestedProjectAction = getRouteParam(params.action);
  const requestedActionFocus = getRouteParam(params.focus);

  // 같은 화면을 목록/상세/채팅 return 진입에 모두 사용한다.
  // route param이 바뀔 때 한 번만 적용하기 위해 ref로 마지막 적용값을 기억한다.
  const appliedProjectParamRef = useRef<string | null>(null);
  const appliedReportParamRef = useRef<string | null>(null);
  const appliedProjectActionParamRef = useRef<string | null>(null);
  const selectedProjectIdRef = useRef<string | null>(requestedProjectId);
  const projectScrollRef = useRef<ScrollView>(null);
  const reportFormYRef = useRef(0);
  const reportDetailScrollYRef = useRef(0);
  const [storeAccess, setStoreAccess] = useState<StoreAccessContext | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [projectStaffProfiles, setProjectStaffProfiles] = useState<any[]>([]);
  const [partnerStores, setPartnerStores] = useState<any[]>([]);
  const [partnerStoreStaffMembers, setPartnerStoreStaffMembers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedProjectIdState, setSelectedProjectIdState] = useState<string | null>(() => requestedProjectId);
  const selectedProjectId = selectedProjectIdState;
  const setSelectedProjectId = useCallback((nextProjectId: string | null) => {
    selectedProjectIdRef.current = nextProjectId;
    setSelectedProjectIdState(nextProjectId);
  }, []);
  const [projectStatusOverrides, setProjectStatusOverrides] = useState<Record<string, ProjectStatus>>({});
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ProjectScopeFilter>('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [projectCustomerId, setProjectCustomerId] = useState<string | null>(null);
  const [projectAddress, setProjectAddress] = useState('');
  const [projectStartDate, setProjectStartDate] = useState('');
  const [projectEndDate, setProjectEndDate] = useState('');
  const [projectAmount, setProjectAmount] = useState('');
  const [projectMemo, setProjectMemo] = useState('');
  const [projectAssignedStaffId, setProjectAssignedStaffId] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(getTodayYmd());

  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleStartDate, setScheduleStartDate] = useState(getTodayYmd());
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>('scheduled');
  const [scheduleMemo, setScheduleMemo] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const [reportDate, setReportDate] = useState(getTodayYmd());
  const [reportContent, setReportContent] = useState('');
  const [reportWorkers, setReportWorkers] = useState('');
  const [reportProgress, setReportProgress] = useState('');
  const [reportIssues, setReportIssues] = useState('');
  const [reportMemo, setReportMemo] = useState('');
  const [reportCustomerVisible, setReportCustomerVisible] = useState(false);
  const [reportImages, setReportImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReportImageUrls, setSelectedReportImageUrls] = useState<Record<string, string>>({});
  const [loadingSelectedReportImages, setLoadingSelectedReportImages] = useState(false);
  const [reportPreviewImage, setReportPreviewImage] = useState<{ uri: string; title: string } | null>(null);
  const [pendingReportFormFocus, setPendingReportFormFocus] = useState(false);
  const reportDetailPanY = useRef(new Animated.Value(0)).current;

  // 협력업체 초대 form 상태다.
  // 등록된 앱 가게를 고르면 partnerStores/partnerStoreStaffMembers에서 담당자와 전화번호를 자동 채우고,
  // 기타 입력 모드에서는 회사명/담당자/전화번호를 직접 받아 SMS/카카오/링크복사로 초대한다.
  const [partnerCompany, setPartnerCompany] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [selectedPartnerStoreId, setSelectedPartnerStoreId] = useState<string | null>(null);
  const [selectedPartnerStaffUserId, setSelectedPartnerStaffUserId] = useState<string | null>(null);
  const [partnerInputMode, setPartnerInputMode] = useState<PartnerInputMode>('registered');
  const [partnerCategoryFilter, setPartnerCategoryFilter] = useState('전체');
  const [partnerStorePickerOpen, setPartnerStorePickerOpen] = useState(false);
  const [partnerContactPickerOpen, setPartnerContactPickerOpen] = useState(false);
  const [scheduleRangeMode, setScheduleRangeMode] = useState<'start' | 'end' | null>(null);

  /**
   * 채팅방의 "일일보고서" 버튼으로 들어왔을 때 보고서 작성 폼으로 스크롤한다.
   * ScrollView layout이 잡힌 뒤 움직여야 하므로 requestAnimationFrame에서 실행한다.
   */
  const scrollToReportForm = useCallback(() => {
    requestAnimationFrame(() => {
      projectScrollRef.current?.scrollTo({
        y: Math.max(reportFormYRef.current - 16, 0),
        animated: true,
      });
    });
  }, []);

  /**
   * 현장 목록에 필요한 모든 연결 데이터를 조회한다.
   *
   * 대표/매니저는 소유 가게 현장과 협력업체로 초대받은 현장을 같이 보고,
   * 일반 직원은 배정된 현장 중심으로 본다. 한 화면에서 고객, 견적문의, 참여자,
   * 일정, 일일보고서를 모두 보여줘야 하므로 select에서 관계 row를 같이 가져온다.
   */
  const loadProjects = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const access = await getMyStoreAccessContext();
    setStoreAccess(access);

    const projectQuery = supabase
      .from('store_projects')
      .select(`
          *,
          store_customers (
            id,
            name,
            phone,
            address
          ),
          estimate_requests (
            id,
            title,
            applicant_name,
            applicant_phone,
            address,
            region,
            assigned_staff_user_id,
            preferred_staff_user_id
          ),
          project_members (
            id,
            member_user_id,
            member_type,
            role,
            company_name,
            display_name,
            phone,
            invitation_status,
            created_at
          ),
          project_schedules (
            id,
            title,
            start_date,
            end_date,
            start_time,
            end_time,
            status,
            memo,
            created_at
          ),
          daily_reports (
            id,
            report_date,
            author_id,
            work_content,
            worker_count,
            progress_percent,
            issues,
            memo,
            customer_visible,
            created_at,
            daily_report_images (
              id,
              image_path,
              description,
              sort_order
            )
          )
        `)
      .order('updated_at', { ascending: false });

    const [projectResult, staffResult, customerResult, partnerStoreResult] = await Promise.all([
      projectQuery,
      access.canManageStore && access.storeUserId
        ? supabase
            .from('store_staff_members')
            .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
            .eq('store_user_id', access.storeUserId)
            .eq('status', 'active')
            .eq('role', 'staff')
            .order('display_name', { ascending: true })
        : Promise.resolve({ data: access.membership ? [access.membership] : [], error: null }),
      access.storeUserId
        ? supabase
            .from('store_customers')
            .select('id, name, phone, address, assigned_staff_user_id')
            .eq('store_user_id', access.storeUserId)
            .order('last_activity_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      access.storeUserId
        ? supabase
            .from('profiles')
            .select('id, display_name, phone, store_category, store_address')
            .eq('user_type', 'store')
            .eq('business_verified', true)
            .neq('id', access.storeUserId)
            .order('display_name', { ascending: true })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectResult.error) {      setMessage(projectResult.error.message);
      setProjects([]);
      setLoading(false);
      return;
    }
    const assignedStaffUserIds = Array.from(new Set(
      (projectResult.data || [])
        .map((project: any) => project.assigned_staff_user_id)
        .filter(Boolean)
    ));
    const projectStoreIds = Array.from(new Set(
      (projectResult.data || [])
        .map((project: any) => project.store_user_id)
        .filter(Boolean)
    ));
    let projectStaffRows: any[] = [];
    let projectStaffProfileRows: any[] = [];

    if (assignedStaffUserIds.length > 0) {
      const [projectStaffResult, projectStaffProfileResult] = await Promise.all([
        projectStoreIds.length > 0
          ? supabase
              .from('store_staff_members')
              .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
              .in('store_user_id', projectStoreIds)
              .in('staff_user_id', assignedStaffUserIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('profiles')
          .select('id, display_name, phone')
          .in('id', assignedStaffUserIds),
      ]);

      if (projectStaffResult.error) {      } else {
        projectStaffRows = projectStaffResult.data || [];
      }

      if (projectStaffProfileResult.error) {      } else {
        projectStaffProfileRows = projectStaffProfileResult.data || [];
      }
    }

    const periodUpdates: ProjectPeriodUpdate[] = [];
    const nextProjects = (projectResult.data || []).map((project: any) => {
      const projectSchedules = [...(project.project_schedules || [])].sort(
        (a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date))
      );
      const schedulePeriod = getSchedulePeriod(projectSchedules);

      if (
        schedulePeriod.startDate &&
        schedulePeriod.endDate &&
        (
          project.start_date !== schedulePeriod.startDate ||
          project.end_date !== schedulePeriod.endDate
        )
      ) {
        periodUpdates.push({
          id: project.id,
          storeUserId: project.store_user_id,
          assignedStaffUserId: project.assigned_staff_user_id,
          startDate: schedulePeriod.startDate,
          endDate: schedulePeriod.endDate,
        });
      }

      return {
        ...project,
        start_date: schedulePeriod.startDate || project.start_date,
        end_date: schedulePeriod.endDate || project.end_date,
        project_members: [...(project.project_members || [])]
        .filter((member: any) => member.invitation_status !== 'removed')
        .sort(
          (a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        ),
        project_schedules: projectSchedules,
        daily_reports: [...(project.daily_reports || [])].sort(
          (a: any, b: any) => String(b.report_date).localeCompare(String(a.report_date))
        ),
      };
    });

    setProjects(nextProjects);
    void syncProjectPeriodUpdates(periodUpdates, access);
    const mergedStaffMembers = new Map<string, any>();
    [...(staffResult.data || []), ...projectStaffRows].forEach((staff: any) => {
      const key = staff?.staff_user_id || staff?.id;
      if (key && !mergedStaffMembers.has(key)) {
        mergedStaffMembers.set(key, staff);
      }
    });

    setStaffMembers(Array.from(mergedStaffMembers.values()));
    setProjectStaffProfiles(projectStaffProfileRows);
    setCustomers(customerResult.data || []);
    setPartnerStores(partnerStoreResult.data || []);

    const partnerStoreIds = (partnerStoreResult.data || []).map((store: any) => store.id);
    if (partnerStoreIds.length > 0) {
      const { data: partnerStaffData, error: partnerStaffError } = await supabase
        .from('store_staff_members')
        .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
        .eq('status', 'active')
        .eq('role', 'staff')
        .in('store_user_id', partnerStoreIds)
        .order('display_name', { ascending: true });

      if (partnerStaffError) {        setPartnerStoreStaffMembers([]);
      } else {
        setPartnerStoreStaffMembers(partnerStaffData || []);
      }
    } else {
      setPartnerStoreStaffMembers([]);
    }

    const currentSelectedProjectId = selectedProjectIdRef.current;
    const shouldApplyRequestedProject =
      !!requestedProjectId &&
      (
        appliedProjectParamRef.current !== requestedProjectId ||
        currentSelectedProjectId !== requestedProjectId
      );
    const nextSelected =
      shouldApplyRequestedProject && nextProjects.some((project) => project.id === requestedProjectId)
        ? requestedProjectId
        : currentSelectedProjectId && nextProjects.some((project) => project.id === currentSelectedProjectId)
          ? currentSelectedProjectId
          : null;

    if (shouldApplyRequestedProject && nextSelected === requestedProjectId) {
      appliedProjectParamRef.current = requestedProjectId;
    }

    setSelectedProjectId(nextSelected);

    const reportParamKey = requestedReportId && nextSelected
      ? `${nextSelected}:${requestedReportId}`
      : null;
    if (requestedReportId && nextSelected && appliedReportParamRef.current !== reportParamKey) {
      const reportProject = nextProjects.find((project) => project.id === nextSelected);
      const requestedReport = (reportProject?.daily_reports || []).find(
        (report: any) => String(report.id) === requestedReportId
      );

      if (requestedReport) {
        const reportDateText = requestedReport.report_date || getTodayYmd();
        const nextDate = new Date(`${reportDateText}T00:00:00`);

        setSelectedReportId(String(requestedReport.id));
        setSelectedDate(reportDateText);
        setReportDate(reportDateText);

        if (!Number.isNaN(nextDate.getTime())) {
          setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
        }

        appliedReportParamRef.current = reportParamKey;
      }
    }

    const projectActionKey = requestedProjectAction && nextSelected
      ? `${nextSelected}:${requestedProjectAction}:${requestedActionFocus || ''}`
      : null;
    if (
      requestedProjectAction === 'dailyReport' &&
      nextSelected &&
      projectActionKey &&
      appliedProjectActionParamRef.current !== projectActionKey
    ) {
      const today = getTodayYmd();
      const nextDate = new Date(`${today}T00:00:00`);

      setSelectedReportId(null);
      setSelectedReportImageUrls({});
      setReportPreviewImage(null);
      setEditingReportId(null);
      setReportDate(today);
      setReportContent('');
      setReportWorkers('');
      setReportProgress('');
      setReportIssues('');
      setReportMemo('');
      setReportCustomerVisible(false);
      setReportImages([]);
      setSelectedDate(today);

      if (!Number.isNaN(nextDate.getTime())) {
        setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
      }

      setPendingReportFormFocus(true);
      appliedProjectActionParamRef.current = projectActionKey;
    }

    setLoading(false);
  }, [
    requestedActionFocus,
    requestedProjectAction,
    requestedProjectId,
    requestedReportId,
    setSelectedProjectId,
    user,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadProjects();
    }, [loadProjects])
  );

  const canUseProjects =
    (!!storeAccess?.storeUserId && (storeAccess.canManageStore || storeAccess.isStaff)) ||
    projects.length > 0;
  const canManageProjects = !!storeAccess?.canManageStore;

  const projectScopeCounts = useMemo(() => {
    return projects.reduce<Record<ProjectScopeFilter, number>>(
      (acc, project) => {
        const partnerAccess = isProjectPartnerAccess(project, storeAccess, user?.id);
        acc.all += 1;
        if (partnerAccess) {
          acc.partner += 1;
        } else {
          acc.owned += 1;
        }
        return acc;
      },
      { all: 0, owned: 0, partner: 0 }
    );
  }, [projects, storeAccess, user?.id]);

  const scopedProjects = useMemo(() => {
    return projects.filter((project) =>
      projectMatchesScope(project, scopeFilter, storeAccess, user?.id)
    );
  }, [projects, scopeFilter, storeAccess, user?.id]);

  const filteredProjects = useMemo(() => {
    const keyword = normalizeSearchText(projectSearch);

    return scopedProjects.filter((project) => {
      const statusMatched = filter === 'all' || project.status === filter;
      if (!statusMatched) return false;
      if (!keyword) return true;

      const assignedStaff =
        staffMembers.find((staff) => staff.staff_user_id === project.assigned_staff_user_id) ||
        projectStaffProfiles.find((profile) => profile.id === project.assigned_staff_user_id);
      const estimateRequest = getProjectEstimateRequest(project);
      const memberText = (project.project_members || [])
        .map((member: any) => [
          member.company_name,
          member.display_name,
          member.phone,
          member.role,
        ].filter(Boolean).join(' '))
        .join(' ');

      return [
        project.name,
        getProjectCustomerAddress(project, ''),
        project.work_summary,
        project.memo,
        getProjectCustomerName(project, ''),
        project.store_customers?.phone,
        project.store_customers?.address,
        estimateRequest?.title,
        estimateRequest?.applicant_phone,
        estimateRequest?.address,
        estimateRequest?.region,
        assignedStaff?.display_name,
        assignedStaff?.phone,
        memberText,
      ].some((value) => normalizeSearchText(value).includes(keyword));
    });
  }, [filter, projectSearch, projectStaffProfiles, scopedProjects, staffMembers]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  // 알림/채팅에서 projectId로 바로 들어왔는데 아직 목록 조회가 끝나지 않은 잠깐의 상태다.
  // 이 값을 이용해 "빈 목록"이 아니라 "해당 현장 불러오는 중"처럼 처리한다.
  const isLoadingRequestedProject = !!(
    requestedProjectId &&
    loading &&
    (!selectedProject || selectedProject.id !== requestedProjectId)
  );
  const canReadSelectedProjectInternalReports = useMemo(() => {
    return canReadProjectInternalReports(selectedProject, storeAccess, user?.id);
  }, [selectedProject, storeAccess, user?.id]);

  // 내부 보고서는 가게 관계자/협력업체만 보고, 고객은 customer_visible 보고서만 본다.
  // 고객 화면에서 내부 보고서가 보이면 RLS와 이 필터를 같이 확인해야 한다.
  const visibleSelectedProjectReports = useMemo(() => {
    if (!selectedProject) return [];
    return (selectedProject.daily_reports || []).filter(
      (report: any) => canReadSelectedProjectInternalReports || !!report.customer_visible
    );
  }, [canReadSelectedProjectInternalReports, selectedProject]);

  const selectedReport = useMemo(() => {
    if (!selectedProject || !selectedReportId) return null;
    return (
      visibleSelectedProjectReports.find(
        (report: any) => String(report.id) === selectedReportId
      ) || null
    );
  }, [selectedProject, selectedReportId, visibleSelectedProjectReports]);

  // 보고서 상세 모달에서 표시할 사진은 sort_order 기준으로 고정한다.
  // 업로드 순서가 DB 조회 순서와 달라도 사용자가 추가한 순서대로 보이게 하기 위함이다.
  const selectedReportImages = useMemo(() => {
    return [...(selectedReport?.daily_report_images || [])].sort(
      (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)
    );
  }, [selectedReport]);

  const selectedProjectMember = useMemo(() => {
    if (!selectedProject || !user?.id) return null;
    return (
      (selectedProject.project_members || []).find(
        (member: any) =>
          member.member_user_id === user.id && member.invitation_status === 'accepted'
      ) || null
    );
  }, [selectedProject, user?.id]);

  // 협력업체로 초대된 사람은 본인에게 보이는 상태 override만 가능하고,
  // 소유 가게의 실제 현장 상태/참여자/일정 권한은 갖지 않는다.
  const isSelectedProjectPartner = selectedProject
    ? isProjectPartnerAccess(selectedProject, storeAccess, user?.id)
    : selectedProjectMember?.role === 'partner';
  const selectedProjectAccessLabel = selectedProject
    ? getProjectAccessLabel(selectedProject, storeAccess, user?.id)
    : '';
  const canManageSelectedProjectMembers = !!(
    selectedProject &&
    user?.id &&
    (
      selectedProject.store_user_id === user.id ||
      (storeAccess?.canManageStore && selectedProject.store_user_id === storeAccess.storeUserId)
    )
  );
  /**
   * 현장 상태를 실제 DB에 바꿀 수 있는지 판단한다.
   *
   * 소유 가게 대표/매니저, 담당 직원, 내부 참여자만 공유 상태를 변경할 수 있다.
   * 협력업체는 자신의 화면에서만 상태처럼 보이는 값을 바꿔야 하므로 여기서 제외한다.
   */
  const canUpdateSelectedProjectStatus = !!(
    selectedProject &&
    user?.id &&
    !isSelectedProjectPartner &&
    (
      selectedProject.store_user_id === user.id ||
      (storeAccess?.canManageStore && selectedProject.store_user_id === storeAccess.storeUserId) ||
      (
        storeAccess?.isStaff &&
        selectedProject.store_user_id === storeAccess.storeUserId &&
        selectedProject.assigned_staff_user_id === user.id
      ) ||
      ['owner', 'manager', 'employee'].includes(selectedProjectMember?.role || '')
    )
  );
  const selectedProjectDisplayStatus =
    selectedProject ? projectStatusOverrides[selectedProject.id] || selectedProject.status : null;
  const selectedProjectPeriod = selectedProject
    ? getProjectPeriod(selectedProject)
    : { startDate: null, endDate: null };

  const closeReportImagePreview = useCallback(() => {
    setReportPreviewImage(null);
  }, []);

  const closeReportDetail = useCallback(() => {
    reportDetailPanY.setValue(0);
    reportDetailScrollYRef.current = 0;
    closeReportImagePreview();
    setSelectedReportId(null);
  }, [closeReportImagePreview, reportDetailPanY]);

  const resetReportDetailSwipe = useCallback(() => {
    Animated.spring(reportDetailPanY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 120,
      friction: 18,
    }).start();
  }, [reportDetailPanY]);

  const dismissReportDetailBySwipe = useCallback(() => {
    Animated.timing(reportDetailPanY, {
      toValue: 700,
      duration: 170,
      useNativeDriver: true,
    }).start(() => {
      reportDetailPanY.setValue(0);
      closeReportDetail();
    });
  }, [closeReportDetail, reportDetailPanY]);

  const reportDetailPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      !reportPreviewImage &&
      reportDetailScrollYRef.current <= 1 &&
      gestureState.dy > 10 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      !reportPreviewImage &&
      reportDetailScrollYRef.current <= 1 &&
      gestureState.dy > 10 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
    onPanResponderMove: (_, gestureState) => {
      reportDetailPanY.setValue(Math.max(gestureState.dy, 0));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 110 || gestureState.vy > 0.9) {
        dismissReportDetailBySwipe();
        return;
      }

      resetReportDetailSwipe();
    },
    onPanResponderTerminate: resetReportDetailSwipe,
  }), [dismissReportDetailBySwipe, reportDetailPanY, reportPreviewImage, resetReportDetailSwipe]);

  const closeProjectDetail = useCallback(() => {
    setSelectedProjectId(null);
    closeReportDetail();
    setEditingScheduleId(null);
    setScheduleTitle('');
    setScheduleStartDate(selectedDate);
    setScheduleEndDate('');
    setScheduleStatus('scheduled');
    setScheduleMemo('');
    setScheduleRangeMode(null);
    setEditingReportId(null);
    setReportDate(selectedDate);
    setReportContent('');
    setReportWorkers('');
    setReportProgress('');
    setReportIssues('');
    setReportMemo('');
    setReportCustomerVisible(false);
    setReportImages([]);
    setShowProjectForm(false);
    setMessage('');
  }, [closeReportDetail, selectedDate, setSelectedProjectId]);

  useEffect(() => {
    if (!selectedProject || !selectedReportId) return;

    const reportExists = visibleSelectedProjectReports.some(
      (report: any) => String(report.id) === selectedReportId
    );

    if (!reportExists) {
      setSelectedReportId(null);
    }
  }, [selectedProject, selectedReportId, visibleSelectedProjectReports]);

  useEffect(() => {
    if (selectedReport) {
      reportDetailScrollYRef.current = 0;
      reportDetailPanY.setValue(0);
    }
  }, [reportDetailPanY, selectedReport]);

  useEffect(() => {
    let cancelled = false;

    const loadReportImageUrls = async () => {
      setSelectedReportImageUrls({});

      if (!selectedReport || selectedReportImages.length === 0) {
        setLoadingSelectedReportImages(false);
        return;
      }

      setLoadingSelectedReportImages(true);

      const entries = await Promise.all(
        selectedReportImages.map(async (image: any, index: number) => {
          const key = String(image.id || image.image_path || index);

          if (!image.image_path) return [key, ''] as const;

          const { data, error } = await supabase.storage
            .from(REPORT_IMAGE_BUCKET)
            .createSignedUrl(image.image_path, 60 * 30);

          return [key, error ? '' : data?.signedUrl || ''] as const;
        })
      );

      if (!cancelled) {
        setSelectedReportImageUrls(Object.fromEntries(entries));
        setLoadingSelectedReportImages(false);
      }
    };

    void loadReportImageUrls();

    return () => {
      cancelled = true;
    };
  }, [selectedReport, selectedReportImages]);

  usePreventRemove(!!selectedProjectId && projectReturnTo !== 'chat', closeProjectDetail);

  const partnerCategoryOptions = useMemo(() => {
    const categories = new Set<string>();

    partnerStores.forEach((store) => {
      const label = getStoreCategoryLabel(store.store_category);
      if (label && label !== '업종 미등록') {
        categories.add(label);
      }
    });

    return STORE_CATEGORY_OPTIONS.filter(
      (category) => category === '전체' || categories.has(category)
    );
  }, [partnerStores]);

  const filteredPartnerStores = useMemo(() => {
    const keyword = normalizeSearchText(partnerCompany);

    return partnerStores.filter((store) => {
      const categoryLabel = getStoreCategoryLabel(store.store_category);
      const categoryMatched =
        partnerCategoryFilter === '전체' || categoryLabel === partnerCategoryFilter;

      if (!categoryMatched) return false;
      if (!keyword) return true;

      return [
        store.display_name,
        categoryLabel,
        store.store_address,
        store.phone,
      ].some((value) => normalizeSearchText(value).includes(keyword));
    });
  }, [partnerCategoryFilter, partnerCompany, partnerStores]);

  const selectedPartnerStore = useMemo(() => {
    return partnerStores.find((store) => store.id === selectedPartnerStoreId) || null;
  }, [partnerStores, selectedPartnerStoreId]);

  const selectedPartnerStoreStaff = useMemo(() => {
    if (!selectedPartnerStoreId) return [];
    return partnerStoreStaffMembers.filter((staff) => staff.store_user_id === selectedPartnerStoreId);
  }, [partnerStoreStaffMembers, selectedPartnerStoreId]);

  const selectedPartnerStaff = useMemo(() => {
    if (!selectedPartnerStaffUserId) return null;
    return (
      selectedPartnerStoreStaff.find(
        (staff) => staff.staff_user_id === selectedPartnerStaffUserId
      ) || null
    );
  }, [selectedPartnerStaffUserId, selectedPartnerStoreStaff]);

  const selectedPartnerContacts = useMemo(() => {
    if (!selectedPartnerStore) return [];

    const storeContact = {
      id: `store-${selectedPartnerStore.id}`,
      type: 'store',
      displayName: selectedPartnerStore.display_name || '가게 본계정',
      meta: '가게 아이디',
      phone: selectedPartnerStore.phone || '',
      staffUserId: null as string | null,
    };

    const staffContacts = selectedPartnerStoreStaff.map((staff) => ({
      id: staff.id,
      type: 'staff',
      displayName: staff.display_name || '직원',
      meta: staff.position ? `직원 · ${staff.position}` : '직원',
      phone: staff.phone || '',
      staffUserId: staff.staff_user_id as string | null,
    }));

    return [storeContact, ...staffContacts];
  }, [selectedPartnerStore, selectedPartnerStoreStaff]);

  useEffect(() => {
    if (!selectedPartnerStore) return;

    setPartnerCompany(selectedPartnerStore.display_name || '');
  }, [selectedPartnerStore]);

  useEffect(() => {
    if (!selectedPartnerStaff) return;

    setPartnerName(selectedPartnerStaff.display_name || '');
    setPartnerPhone(selectedPartnerStaff.phone || '');
  }, [selectedPartnerStaff]);

  useEffect(() => {
    if (!partnerCategoryOptions.includes(partnerCategoryFilter)) {
      setPartnerCategoryFilter('전체');
    }
  }, [partnerCategoryFilter, partnerCategoryOptions]);

  const monthCells = useMemo(() => getMonthCells(calendarMonth), [calendarMonth]);
  const calendarWeeks = useMemo(() => {
    const weeks = [];

    for (let index = 0; index < monthCells.length; index += 7) {
      weeks.push(monthCells.slice(index, index + 7));
    }

    return weeks;
  }, [monthCells]);

  const selectedSchedules = useMemo(() => {
    if (!selectedProject) return [];
    return (selectedProject.project_schedules || []).filter((schedule: any) =>
      isDateInSchedule(selectedDate, schedule)
    );
  }, [selectedDate, selectedProject]);

  // 선택한 날짜의 일일보고서만 보여준다.
  // 내부/고객공개 필터는 `visibleSelectedProjectReports`에서 이미 적용된 상태다.
  const selectedReports = useMemo(() => {
    if (!selectedProject) return [];
    return visibleSelectedProjectReports.filter(
      (report: any) => report.report_date === selectedDate
    );
  }, [selectedDate, selectedProject, visibleSelectedProjectReports]);

  /**
   * 일정 생성/수정 권한이다.
   *
   * 요구사항상 일정은 "견적을 받은 가게" 쪽에서만 관리한다.
   * 협력업체와 고객은 달력에서 일정을 볼 수 있어도 시작/종료일을 바꾸면 안 된다.
   */
  const canManageSelectedProjectSchedule = useMemo(() => {
    if (!selectedProject || !user?.id) return false;

    if (selectedProject.store_user_id === user.id) return true;

    if (
      storeAccess?.canManageStore &&
      selectedProject.store_user_id === storeAccess.storeUserId
    ) {
      return true;
    }

    return !!(
      storeAccess?.isStaff &&
      selectedProject.store_user_id === storeAccess.storeUserId &&
      selectedProject.assigned_staff_user_id === user.id
    );
  }, [selectedProject, storeAccess, user?.id]);

  /**
   * 일일보고서 수정/삭제 권한이다.
   *
   * 작성자는 본인 보고서만 수정/삭제할 수 있다. 대표/매니저라도 다른 작성자의 보고서를
   * 임의로 고치게 두면 현장 기록의 책임 소재가 흐려지므로 author-only로 유지한다.
   */
  const canEditReport = useCallback((report: any) => {
    return !!report?.author_id && !!user?.id && report.author_id === user.id;
  }, [user?.id]);

  const resetReportForm = useCallback((dateText = selectedDate) => {
    setEditingReportId(null);
    setReportDate(dateText);
    setReportContent('');
    setReportWorkers('');
    setReportProgress('');
    setReportIssues('');
    setReportMemo('');
    setReportCustomerVisible(false);
    setReportImages([]);
  }, [selectedDate]);

  /**
   * 선택한 보고서를 작성 폼으로 불러와 수정 모드로 전환한다.
   * 기존 사진은 그대로 두고, 새로 추가한 사진만 append하도록 `reportImages`는 비워둔다.
   */
  const startEditReport = (report: any) => {
    if (!canEditReport(report)) {
      Alert.alert('일일보고서 수정', '작성자만 수정할 수 있습니다.');
      return;
    }

    const reportDateText = report.report_date || selectedDate;
    const nextDate = new Date(`${reportDateText}T00:00:00`);

    setEditingReportId(String(report.id));
    setReportDate(reportDateText);
    setReportContent(report.work_content || '');
    setReportWorkers(report.worker_count ? String(report.worker_count) : '');
    setReportProgress(report.progress_percent ? String(report.progress_percent) : '');
    setReportIssues(report.issues || '');
    setReportMemo(report.memo || '');
    setReportCustomerVisible(!!report.customer_visible);
    setReportImages([]);
    setSelectedDate(reportDateText);
    setSelectedReportId(null);
    setReportPreviewImage(null);

    if (!Number.isNaN(nextDate.getTime())) {
      setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  };

  const resetScheduleForm = useCallback((dateText = selectedDate) => {
    setEditingScheduleId(null);
    setScheduleTitle('');
    setScheduleStartDate(dateText);
    setScheduleEndDate('');
    setScheduleStatus('scheduled');
    setScheduleMemo('');
    setScheduleRangeMode(null);
  }, [selectedDate]);

  /**
   * 선택한 일정을 일정 폼으로 불러와 수정 모드로 전환한다.
   * 시작일 기준으로 달력 월도 같이 이동해서 사용자가 수정 대상 날짜를 잃어버리지 않게 한다.
   */
  const startEditSchedule = (schedule: any) => {
    if (!canManageSelectedProjectSchedule) {
      Alert.alert('일정 수정', '일정은 견적을 받은 가게만 수정할 수 있습니다.');
      return;
    }

    const startDate = schedule.start_date || selectedDate;
    const nextDate = new Date(`${startDate}T00:00:00`);
    const nextStatus = SCHEDULE_STATUS_OPTIONS.some((item) => item.key === schedule.status)
      ? schedule.status as ScheduleStatus
      : 'scheduled';

    setEditingScheduleId(String(schedule.id));
    setScheduleTitle(schedule.title || '');
    setScheduleStartDate(startDate);
    setScheduleEndDate(schedule.end_date || '');
    setScheduleStatus(nextStatus);
    setScheduleMemo(schedule.memo || '');
    setSelectedDate(startDate);
    setScheduleRangeMode(null);

    if (!Number.isNaN(nextDate.getTime())) {
      setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  };

  const canWriteSelectedProject = useMemo(() => {
    if (!selectedProject || !user?.id) return false;

    if (storeAccess?.canManageStore || selectedProject.store_user_id === user.id) return true;

    if (
      storeAccess?.isStaff &&
      selectedProject.store_user_id === storeAccess.storeUserId &&
      selectedProject.assigned_staff_user_id === user.id
    ) {
      return true;
    }

    // 일일보고서는 협력업체도 작성할 수 있다.
    // 다만 참여자 추가/내보내기, 공유 현장 상태 변경, 일정 관리는 별도 권한에서 막는다.
    return (selectedProject.project_members || []).some((member: any) => (
      member.member_user_id === user.id &&
      member.invitation_status === 'accepted' &&
      ['owner', 'manager', 'employee', 'partner'].includes(member.role)
    ));
  }, [selectedProject, storeAccess, user?.id]);

  useEffect(() => {
    if (!pendingReportFormFocus || !selectedProject) return;

    if (!canWriteSelectedProject) {
      setPendingReportFormFocus(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      scrollToReportForm();
      setPendingReportFormFocus(false);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [canWriteSelectedProject, pendingReportFormFocus, scrollToReportForm, selectedProject]);

  const statusCounts = useMemo(() => {
    return scopedProjects.reduce<Record<string, number>>((acc, project) => {
      const status = project.status || 'preparing';
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});
  }, [scopedProjects]);

  const getStaffName = (staffUserId?: string | null) => {
    if (!staffUserId) return '담당 미지정';
    const staff = staffMembers.find((item) => item.staff_user_id === staffUserId);
    if (!staff) {
      const profile = projectStaffProfiles.find((item) => item.id === staffUserId);
      return profile?.display_name || '담당 직원';
    }
    return `${staff.display_name || '직원'}${staff.position ? ` · ${staff.position}` : ''}`;
  };

  const refreshProjects = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  const selectCalendarDate = (dateText: string) => {
    setSelectedDate(dateText);
    setReportDate(dateText);

    if (scheduleRangeMode === 'start') {
      setScheduleStartDate(dateText);
      if (scheduleEndDate && scheduleEndDate < dateText) {
        setScheduleEndDate('');
      }
      setScheduleRangeMode('end');
      return;
    }

    if (scheduleRangeMode === 'end') {
      if (scheduleStartDate && dateText < scheduleStartDate) {
        setScheduleStartDate(dateText);
        setScheduleEndDate('');
        setScheduleRangeMode('end');
        return;
      }

      setScheduleEndDate(dateText);
      setScheduleRangeMode(null);
      return;
    }

    setScheduleStartDate(dateText);
  };

  const resetProjectForm = () => {
    setProjectName('');
    setProjectCustomerId(null);
    setProjectAddress('');
    setProjectStartDate('');
    setProjectEndDate('');
    setProjectAmount('');
    setProjectMemo('');
    setProjectAssignedStaffId(null);
    setMessage('');
  };

  const createProject = async () => {
    if (!storeAccess?.storeUserId || saving) return;

    if (!projectName.trim()) {
      setMessage('현장명을 입력해 주세요.');
      return;
    }

    if (projectStartDate.trim() && !isValidYmd(projectStartDate)) {
      setMessage('시작일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (projectEndDate.trim() && !isValidYmd(projectEndDate)) {
      setMessage('완료 예정일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');

    const selectedCustomer = customers.find((customer) => customer.id === projectCustomerId);

    const { data, error } = await supabase
      .from('store_projects')
      .insert({
        store_user_id: storeAccess.storeUserId,
        customer_id: projectCustomerId,
        name: projectName.trim(),
        address: projectAddress.trim() || selectedCustomer?.address || null,
        contract_amount: parseAmount(projectAmount),
        start_date: projectStartDate.trim() || null,
        end_date: projectEndDate.trim() || null,
        assigned_staff_user_id: projectAssignedStaffId,
        memo: projectMemo.trim() || null,
        status: 'preparing',
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    resetProjectForm();
    setShowProjectForm(false);
    await loadProjects();
    setSelectedProjectId(data?.id || null);
  };

  const updateProjectStatus = async (status: ProjectStatus) => {
    if (!selectedProject || saving) return;

    if (isSelectedProjectPartner) {
      setProjectStatusOverrides((prev) => ({
        ...prev,
        [selectedProject.id]: status,
      }));
      return;
    }

    if (!canUpdateSelectedProjectStatus) {
      Alert.alert('상태 변경', '현장 상태를 변경할 권한이 없습니다.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('store_projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', selectedProject.id);

    setSaving(false);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    setProjects((prev) =>
      prev.map((project) => (project.id === selectedProject.id ? { ...project, status } : project))
    );
  };

  const completeProjectThread = async () => {
    if (!selectedProject || saving || isSelectedProjectPartner) return;

    if (!canUpdateSelectedProjectStatus) {
      Alert.alert('완료 처리', '현장을 완료 처리할 권한이 없습니다.');
      return;
    }

    const ok = await confirmProjectLifecycleAction(
      '현장 완료 처리',
      '이 현장과 연결된 견적서, 견적관리 상태, 채팅방을 완료 상태로 보관할까요?',
      '완료'
    );
    if (!ok) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc('complete_estimate_project_thread', {
        p_estimate_request_id: selectedProject.estimate_request_id || null,
        p_project_id: selectedProject.id,
        p_store_user_id: selectedProject.store_user_id || storeAccess?.storeUserId || null,
      });

      if (error) throw error;

      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProject.id ? { ...project, status: 'completed' } : project
        )
      );
      setFilter('completed');
      await loadProjects();
      Alert.alert('완료 처리', '완료 목록에 보관되었습니다.');
    } catch (error: any) {
      Alert.alert(
        '완료 처리 실패',
        error?.message?.includes('complete_estimate_project_thread') ||
          error?.message?.includes('schema cache')
          ? 'Supabase에 최신 lifecycle SQL을 먼저 실행해 주세요.'
          : error?.message || '완료 처리 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteProjectThread = async () => {
    if (!selectedProject || saving) return;

    if (!canManageSelectedProjectMembers) {
      Alert.alert('현장 삭제', '현장을 삭제할 권한이 없습니다.');
      return;
    }

    const ok = await confirmProjectLifecycleAction(
      '현장 삭제',
      '이 현장과 연결된 견적서, 견적문의, 채팅방, 일정, 일일보고서가 함께 삭제됩니다.',
      '삭제'
    );
    if (!ok) return;

    setSaving(true);

    try {
      const targetProjectId = selectedProject.id;
      const { error } = await supabase.rpc('delete_estimate_project_thread', {
        p_estimate_request_id: selectedProject.estimate_request_id || null,
        p_project_id: targetProjectId,
        p_store_user_id: selectedProject.store_user_id || storeAccess?.storeUserId || null,
      });

      if (error) throw error;

      setProjects((prev) => prev.filter((project) => project.id !== targetProjectId));
      setSelectedProjectId(null);
      await loadProjects();
      Alert.alert('현장 삭제', '현장과 연결 데이터가 삭제되었습니다.');
    } catch (error: any) {
      Alert.alert(
        '현장 삭제 실패',
        error?.message?.includes('delete_estimate_project_thread') ||
          error?.message?.includes('schema cache')
          ? 'Supabase에 최신 lifecycle SQL을 먼저 실행해 주세요.'
          : error?.message || '삭제 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const openProjectChat = async () => {
    if (!selectedProject) return;

    const { data, error } = await supabase.rpc('ensure_project_chat_room', {
      p_project_id: selectedProject.id,
    });

    if (error || !data) {
      Alert.alert('현장 채팅방', error?.message || '채팅방을 열 수 없습니다.');
      return;
    }

    router.push({
      pathname: '/chat/[roomId]',
      params: {
        roomId: String(data),
        returnTo: 'project',
        projectId: selectedProject.id,
      },
    } as any);
  };

  const openProjectEstimate = () => {
    if (!selectedProject) return;

    if (selectedProject.estimate_request_id) {
      router.push(
        `/store/estimates?requestId=${selectedProject.estimate_request_id}&projectId=${selectedProject.id}` as any
      );
      return;
    }

    if (selectedProject.estimate_quote_id) {
      router.push(
        `/store/estimates?quoteId=${selectedProject.estimate_quote_id}&projectId=${selectedProject.id}` as any
      );
      return;
    }

    Alert.alert('견적서 보기', '이 현장에 연결된 견적서가 없습니다.');
  };

  const addStaffMember = async (staff: any) => {
    if (!selectedProject || !canManageSelectedProjectMembers) return;

    setSaving(true);

    const { error } = await supabase.from('project_members').upsert(
      {
        project_id: selectedProject.id,
        store_user_id: selectedProject.store_user_id,
        member_user_id: staff.staff_user_id,
        member_type: 'employee',
        role: 'employee',
        display_name: staff.display_name || null,
        phone: staff.phone || null,
        invitation_status: 'accepted',
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,member_user_id' }
    );

    setSaving(false);

    if (error) {
      Alert.alert('직원 추가 실패', error.message);
      return;
    }

    await loadProjects();
  };

  const changePartnerInputMode = (mode: PartnerInputMode) => {
    setPartnerInputMode(mode);
    setSelectedPartnerStoreId(null);
    setSelectedPartnerStaffUserId(null);
    setPartnerCompany('');
    setPartnerName('');
    setPartnerPhone('');
    setPartnerCategoryFilter('전체');
    setPartnerStorePickerOpen(mode === 'registered');
    setPartnerContactPickerOpen(false);
  };

  const handlePartnerCompanyChange = (value: string) => {
    setPartnerCompany(value);

    if (partnerInputMode !== 'registered') return;

    setPartnerStorePickerOpen(true);

    if (selectedPartnerStore && value !== (selectedPartnerStore.display_name || '')) {
      setSelectedPartnerStoreId(null);
      setSelectedPartnerStaffUserId(null);
      setPartnerName('');
      setPartnerPhone('');
      setPartnerContactPickerOpen(false);
    }
  };

  const selectPartnerStore = (store: any) => {
    setPartnerInputMode('registered');
    setSelectedPartnerStoreId(store.id);
    setSelectedPartnerStaffUserId(null);
    setPartnerCompany(store.display_name || '인증 가게');
    setPartnerName('');
    setPartnerPhone('');
    setPartnerStorePickerOpen(false);
    setPartnerContactPickerOpen(false);
  };

  const selectPartnerContact = (contact: any) => {
    setSelectedPartnerStaffUserId(contact.staffUserId);
    setPartnerName(contact.displayName);
    setPartnerPhone(contact.phone || '');
    setPartnerContactPickerOpen(false);
  };

  const resetPartnerInviteForm = () => {
    setPartnerCompany('');
    setPartnerName('');
    setPartnerPhone('');
    setSelectedPartnerStoreId(null);
    setSelectedPartnerStaffUserId(null);
    setPartnerInputMode('registered');
    setPartnerCategoryFilter('전체');
    setPartnerStorePickerOpen(false);
    setPartnerContactPickerOpen(false);
  };

  const openProjectInviteSms = async (phone: string, messageBody: string, inviteLink: string) => {
    try {
      await Linking.openURL(getSmsInviteUrl(phone, messageBody));
    } catch {      Alert.alert(
        '문자 열기 실패',
        `문자 앱을 열지 못했습니다. 아래 링크를 전달해 주세요.\n\n${inviteLink}`
      );
    }
  };

  const shareProjectInvite = async (messageBody: string, inviteLink: string) => {
    try {
      await Share.share({
        title: '인테리어마켓 현장관리 초대',
        message: messageBody,
        url: inviteLink,
      });
    } catch {      Alert.alert('공유 실패', '공유창을 열지 못했습니다.');
    }
  };

  const copyProjectInviteLink = async (inviteLink: string) => {
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert('링크 복사 완료', '초대 링크가 복사되었습니다.');
  };

  const showProjectInviteActions = (phone: string, projectName: string, inviteLink: string) => {
    const messageBody = getProjectInviteMessage(projectName, inviteLink);

    Alert.alert('협력업체 추가 완료', '초대 링크를 어떻게 보낼까요?', [
      {
        text: '문자로 보내기',
        onPress: () => {
          void openProjectInviteSms(phone, messageBody, inviteLink);
        },
      },
      {
        text: '카톡/공유',
        onPress: () => {
          void shareProjectInvite(messageBody, inviteLink);
        },
      },
      {
        text: '링크 복사',
        onPress: () => {
          void copyProjectInviteLink(inviteLink);
        },
      },
      { text: '닫기', style: 'cancel' },
    ]);
  };

  const sendRegisteredPartnerInviteNotification = async (memberId: string) => {
    try {
      const { error } = await supabase.functions.invoke('send-project-invite-notification', {
        body: { projectMemberId: memberId },
      });

      return error;
    } catch (error: any) {
      return {
        code: 'PROJECT_INVITE_NOTIFICATION_FAILED',
        message: error?.message || '앱 알림을 보내지 못했습니다.',
      };
    }
  };

  /**
   * 협력업체를 현장 참여자로 추가한다.
   *
   * 등록된 가게/직원:
   * - member_user_id가 있으므로 project_members에 user id를 저장한다.
   * - 현장 채팅방 멤버도 RPC로 동기화한다.
   * - 앱 알림을 보내 초대받은 사용자가 앱 안에서 수락/진입할 수 있게 한다.
   *
   * 기타 직접 입력 업체:
   * - 앱 계정이 없으므로 전화번호와 invite_token만 저장한다.
   * - 서버 SMS를 보내지 않고 문자앱/카카오/링크복사 액션으로 사용자가 직접 공유한다.
   */
  const addPartnerMember = async () => {
    if (!selectedProject || !canManageSelectedProjectMembers || saving) return;

    const displayName = partnerName.trim() || selectedPartnerStaff?.display_name || selectedPartnerStore?.display_name || '';
    const companyName = partnerCompany.trim() || selectedPartnerStore?.display_name || '';
    const phone = partnerPhone.trim();
    const memberUserId = selectedPartnerStaff?.staff_user_id || selectedPartnerStore?.id || null;

    if (!displayName && !companyName) {
      Alert.alert('협력업체 초대', '협력업체명 또는 담당자명을 입력해 주세요.');
      return;
    }

    if (!phone) {
      Alert.alert('협력업체 초대', '협력업체 연락처를 입력해 주세요.');
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const payload = {
        project_id: selectedProject.id,
        store_user_id: selectedProject.store_user_id,
        member_user_id: memberUserId,
        member_type: 'partner',
        role: 'partner',
        company_name: companyName || null,
        display_name: displayName || companyName || '협력업체',
        phone,
        invitation_status: 'pending',
        invite_sent_at: now,
      };

      let memberRow: any = null;

      // 같은 현장에 같은 등록 사용자를 다시 추가하면 insert가 아니라 기존 row를 갱신한다.
      // 이 처리 없이 insert하면 project_members_project_id_member_user_id_key 중복 오류가 난다.
      if (memberUserId) {
        const { data: existingMember, error: lookupError } = await supabase
          .from('project_members')
          .select('id, invite_token, invitation_status, joined_at, member_type, role')
          .eq('project_id', selectedProject.id)
          .eq('member_user_id', memberUserId)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingMember?.id) {
          const { data, error } = await supabase
            .from('project_members')
            .update({
              company_name: payload.company_name,
              display_name: payload.display_name,
              phone,
              member_type:
                existingMember.invitation_status === 'accepted'
                  ? existingMember.member_type
                  : 'partner',
              role:
                existingMember.invitation_status === 'accepted'
                  ? existingMember.role
                  : 'partner',
              invitation_status:
                existingMember.invitation_status === 'accepted' ? 'accepted' : 'pending',
              joined_at:
                existingMember.invitation_status === 'accepted'
                  ? existingMember.joined_at
                  : null,
              invite_sent_at: now,
              updated_at: now,
            })
            .eq('id', existingMember.id)
            .select('id, invite_token, invitation_status')
            .single();

          if (error) throw error;
          memberRow = data;
        } else {
          const { data, error } = await supabase
            .from('project_members')
            .insert(payload)
            .select('id, invite_token, invitation_status')
            .single();

          if (error) throw error;
          memberRow = data;
        }
      } else {
        const { data, error } = await supabase
          .from('project_members')
          .insert(payload)
          .select('id, invite_token, invitation_status')
          .single();

        if (error) throw error;
        memberRow = data;
      }

      if (memberUserId) {
        // 등록 사용자 초대는 채팅방에도 즉시 보이도록 현장 채팅방 멤버십을 보장한다.
        // 기타 입력 초대는 사용자가 링크를 수락하기 전까지 실제 user id가 없으므로 여기서 제외한다.
        const { error: chatMemberError } = await supabase.rpc('ensure_project_chat_room', {
          p_project_id: selectedProject.id,
        });      }

      const inviteLink = getProjectInviteLink(memberRow?.invite_token);
      // 등록된 앱 사용자는 push/in-app 알림으로 안내하고,
      // 미등록 업체는 inviteLink를 문자/카카오/복사로 직접 전달한다.
      const registeredInviteNotificationError =
        memberUserId && memberRow?.id
          ? await sendRegisteredPartnerInviteNotification(memberRow.id)
          : null;

      resetPartnerInviteForm();
      await loadProjects();

      if (memberUserId && memberRow?.id) {
        if (registeredInviteNotificationError) {
          Alert.alert(
            '협력업체 추가 완료',
            registeredInviteNotificationError.code ===
              'PROJECT_INVITE_NOTIFICATION_FUNCTION_MISSING'
              ? registeredInviteNotificationError.message
              : `업체는 현장에 추가됐지만 앱 알림을 보내지 못했습니다.\n\n${registeredInviteNotificationError.message}`
          );
        } else {
          Alert.alert(
            '협력업체 추가 완료',
            '등록된 업체에 앱 알림을 보냈습니다. 상대방은 알림에서 초대를 확인하고 현장관리에 들어올 수 있습니다.'
          );
        }
      } else if (inviteLink) {
        showProjectInviteActions(phone, selectedProject.name || '현장', inviteLink);
      } else {
        Alert.alert('협력업체 추가 완료', '협력업체가 현장에 추가되었습니다.');
      }
    } catch (error: any) {
      Alert.alert('협력업체 추가 실패', error?.message || '협력업체를 추가하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removeProjectMember = async (member: any) => {
    if (!selectedProject || !canManageSelectedProjectMembers || saving) return;

    if (member.role === 'owner') {
      Alert.alert('참여자 내보내기', '현장 소유자는 내보낼 수 없습니다.');
      return;
    }

    setSaving(true);

    try {
      let handledByProjectChatRpc = false;

      if (member.member_user_id) {
        // 현장 채팅방에서 내보내면 project_members 상태와 chat_room_members 제거가 같이 일어나야 한다.
        // 최신 RPC가 있으면 그 경로를 우선 사용하고, 없으면 기존 remove_project_member로 fallback한다.
        const { data: roomRows, error: roomLookupError } = await supabase
          .from('chat_rooms')
          .select('id')
          .eq('project_id', selectedProject.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const projectRoomId = Array.isArray(roomRows) ? roomRows[0]?.id : null;

        if (projectRoomId) {
          const { error: projectChatRemoveError } = await supabase.rpc(
            'remove_project_chat_participant',
            {
              p_room_id: projectRoomId,
              p_member_user_id: member.member_user_id,
              p_project_member_id: member.id,
            }
          );

          if (projectChatRemoveError) {
            const functionMissing =
              projectChatRemoveError.code === 'PGRST202' ||
              projectChatRemoveError.message?.includes('Could not find the function');

            if (!functionMissing) {
              throw projectChatRemoveError;
            }
          } else {
            handledByProjectChatRpc = true;
          }
        }
      }

      if (!handledByProjectChatRpc) {
        const { error } = await supabase.rpc('remove_project_member', {
          p_member_id: member.id,
        });

        if (error) {
          throw error;
        }
      }

      await loadProjects();
    } catch (error: any) {
      Alert.alert('참여자 내보내기 실패', error?.message || '참여자를 내보내지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 일정/보고서 변경을 현장 채팅방 참여자에게 알린다.
   *
   * 현장 활동은 별도 알림 목록에도 남고, push는 기존 `send-chat-push` Edge Function을 재사용한다.
   * `visibleToCustomer`가 false인 내부 보고서는 고객에게 인앱 표시되지 않도록 서버 RPC에 flag를 넘긴다.
   */
  const notifyProjectChatActivity = useCallback(async ({
    projectId,
    type,
    title,
    body,
    entityId,
    visibleToCustomer = true,
    sendPush = true,
  }: {
    projectId: string;
    type: ProjectActivityNotificationType;
    title: string;
    body: string;
    entityId?: string | null;
    visibleToCustomer?: boolean;
    sendPush?: boolean;
  }) => {
    if (!user?.id) return;

    try {
      const { data: roomIdData, error: roomError } = await supabase.rpc('ensure_project_chat_room', {
        p_project_id: projectId,
      });

      if (roomError || !roomIdData) {        return;
      }

      const roomId = String(roomIdData);

      const { error: notificationError } = await supabase.rpc(
        'create_project_chat_activity_notifications',
        {
          p_project_id: projectId,
          p_room_id: roomId,
          p_activity_type: type,
          p_title: title,
          p_body: body,
          p_entity_id: entityId || null,
          p_visible_to_customer: visibleToCustomer,
        }
      );
      if (!sendPush) return;

      const { error: pushError } = await supabase.functions.invoke('send-chat-push', {
        body: {
          roomId,
          senderId: user.id,
          message: `${title}\n${body}`,
        },
      });    } catch {    }
  }, [user?.id]);

  /**
   * 현장 일정을 생성하거나 수정한다.
   *
   * 저장 후에는 남아 있는 일정의 가장 빠른 시작일과 가장 늦은 종료일을 계산해
   * 현장 기간(`start_date/end_date`)을 자동 갱신한다. 그래서 일정이 추가/수정될 때
   * 현장 목록의 기간도 별도 입력 없이 따라 바뀐다.
   */
  const saveSchedule = async () => {
    const projectStoreUserId = selectedProject?.store_user_id || storeAccess?.storeUserId;

    if (!selectedProject || !projectStoreUserId || !user?.id || !canManageSelectedProjectSchedule || saving) return;

    if (!scheduleTitle.trim()) {
      Alert.alert(editingScheduleId ? '일정 수정' : '일정 등록', '일정 제목을 입력해 주세요.');
      return;
    }

    if (!isValidYmd(scheduleStartDate)) {
      Alert.alert(editingScheduleId ? '일정 수정' : '일정 등록', '시작일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (scheduleEndDate.trim() && !isValidYmd(scheduleEndDate)) {
      Alert.alert(editingScheduleId ? '일정 수정' : '일정 등록', '종료일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (scheduleEndDate.trim() && scheduleEndDate.trim() < scheduleStartDate.trim()) {
      Alert.alert(editingScheduleId ? '일정 수정' : '일정 등록', '종료일은 시작일 이후로 입력해 주세요.');
      return;
    }

    setSaving(true);

    const schedulePayload = {
      project_id: selectedProject.id,
      store_user_id: projectStoreUserId,
      title: scheduleTitle.trim(),
      start_date: scheduleStartDate.trim(),
      end_date: scheduleEndDate.trim() || null,
      status: scheduleStatus,
      memo: scheduleMemo.trim() || null,
    };

    // editingScheduleId가 있으면 update, 없으면 insert다.
    // 두 경로 모두 이후 로컬 nextSchedules를 만들어 기간 동기화를 같은 방식으로 처리한다.
    const isUpdatingSchedule = !!editingScheduleId;
    const scheduleResult = isUpdatingSchedule
      ? await supabase
          .from('project_schedules')
          .update(schedulePayload)
          .eq('id', editingScheduleId)
          .eq('project_id', selectedProject.id)
          .select('id')
          .maybeSingle()
      : await supabase
          .from('project_schedules')
          .insert(schedulePayload)
          .select('id')
          .single();

    if (scheduleResult.error) {
      setSaving(false);
      Alert.alert(editingScheduleId ? '일정 수정 실패' : '일정 등록 실패', scheduleResult.error.message);
      return;
    }

    const nextSchedules = editingScheduleId
      ? (selectedProject.project_schedules || []).map((schedule: any) =>
          String(schedule.id) === editingScheduleId ? { ...schedule, ...schedulePayload } : schedule
        )
      : [...(selectedProject.project_schedules || []), schedulePayload];
    const periodError = await syncProjectPeriodFromSchedules(selectedProject, nextSchedules);

    if (periodError) {
      Alert.alert('현장 기간 갱신 실패', periodError.message);
    }

    await notifyProjectChatActivity({
      projectId: selectedProject.id,
      type: isUpdatingSchedule ? 'project_schedule_updated' : 'project_schedule_created',
      title: isUpdatingSchedule ? '현장 일정 수정' : '현장 일정 추가',
      body: `${selectedProject.name || '현장'} · ${schedulePayload.title} · ${formatScheduleNotificationRange(
        schedulePayload.start_date,
        schedulePayload.end_date
      )}`,
      entityId: String(scheduleResult.data?.id || editingScheduleId || ''),
    });

    resetScheduleForm(selectedDate);
    await loadProjects();
    setSaving(false);
  };

  /**
   * 현장 일정을 삭제한다.
   *
   * 삭제 후 남은 일정으로 현장 기간을 다시 계산한다. 마지막 일정이 삭제되면
   * `allowEmpty`를 true로 넘겨 현장 기간을 비울 수 있게 한다.
   */
  const deleteSchedule = async (schedule: any) => {
    if (!selectedProject || !canManageSelectedProjectSchedule || saving) return;

    const ok = await confirmProjectLifecycleAction(
      '일정 삭제',
      `"${schedule.title || '일정'}" 일정을 삭제할까요?`,
      '삭제'
    );

    if (!ok) return;

    setSaving(true);

    const { error } = await supabase
      .from('project_schedules')
      .delete()
      .eq('id', schedule.id)
      .eq('project_id', selectedProject.id);

    if (error) {
      setSaving(false);
      Alert.alert('일정 삭제 실패', error.message);
      return;
    }

    const nextSchedules = (selectedProject.project_schedules || []).filter(
      (item: any) => String(item.id) !== String(schedule.id)
    );
    const periodError = await syncProjectPeriodFromSchedules(selectedProject, nextSchedules, true);

    if (periodError) {
      Alert.alert('현장 기간 갱신 실패', periodError.message);
    }

    if (editingScheduleId === String(schedule.id)) {
      resetScheduleForm(selectedDate);
    }

    await loadProjects();
    setSaving(false);
  };

  const pickReportImages = async () => {
    const remain = 6 - reportImages.length;
    if (remain <= 0) {
      Alert.alert('사진 첨부', '일일보고서 사진은 최대 6장까지 첨부할 수 있습니다.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 권한 필요', '보고서 사진을 첨부하려면 사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setReportImages((prev) => [...prev, ...result.assets].slice(0, 6));
    }
  };

  const takeReportPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('카메라 권한 필요', '보고서 사진을 촬영하려면 카메라 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (!result.canceled && result.assets?.[0]) {
      setReportImages((prev) => [...prev, result.assets[0]].slice(0, 6));
    }
  };

  /**
   * 보고서 사진을 Supabase Storage와 daily_report_images row로 저장한다.
   *
   * storage path는 `가게id/현장id/보고서id/파일명` 구조다.
   * 이 구조를 유지해야 RLS, 삭제, signed URL 생성에서 특정 현장/보고서 사진만 다루기 쉽다.
   */
  const uploadReportImage = async (
    projectStoreUserId: string,
    projectId: string,
    reportId: string,
    asset: ImagePicker.ImagePickerAsset,
    sortOrder: number
  ) => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const extension = getExtensionFromMime(mimeType);
    const fileName = sanitizeFileName(
      asset.fileName || `report-${reportId}-${sortOrder}.${extension}`
    );
    const filePath = `${projectStoreUserId}/${projectId}/${reportId}/${Date.now()}-${sortOrder}-${fileName}`;
    const uploadBody = await readImageBody(asset.uri);

    const { error: uploadError } = await supabase.storage
      .from(REPORT_IMAGE_BUCKET)
      .upload(filePath, uploadBody, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: imageError } = await supabase.from('daily_report_images').insert({
      report_id: reportId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (imageError) throw imageError;
  };

  /**
   * 일일보고서를 생성하거나 수정한다.
   *
   * 보고서는 반드시 하나의 현장(`project_id`)에 속한다. `customer_visible`이 true면 고객도 볼 수 있고,
   * false면 가게 관계자/협력업체 내부용으로만 보여야 한다. 새 보고서를 만들 때만 채팅방 활동 알림을 보내고,
   * 수정은 기록 정정 성격이라 현재는 추가 push를 보내지 않는다.
   */
  const saveDailyReport = async () => {
    const projectStoreUserId = selectedProject?.store_user_id || storeAccess?.storeUserId;
    const authorUserId = user?.id || null;

    if (!selectedProject || !projectStoreUserId || !authorUserId || !canWriteSelectedProject || saving) return;

    if (!isValidYmd(reportDate)) {
      Alert.alert(editingReportId ? '일일보고서 수정' : '일일보고서', '작성일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (!reportContent.trim()) {
      Alert.alert(editingReportId ? '일일보고서 수정' : '일일보고서', '작업내용을 입력해 주세요.');
      return;
    }

    const progress = Math.min(100, Math.max(0, parseAmount(reportProgress)));

    setSaving(true);

    try {
      const reportPayload = {
        project_id: selectedProject.id,
        store_user_id: projectStoreUserId,
        author_id: authorUserId,
        report_date: reportDate.trim(),
        work_content: reportContent.trim(),
        worker_count: parseAmount(reportWorkers),
        progress_percent: progress,
        issues: reportIssues.trim() || null,
        memo: reportMemo.trim() || null,
        customer_visible: reportCustomerVisible,
      };

      let reportId = editingReportId;
      const isCreatingReport = !editingReportId;
      const existingReport = editingReportId
        ? (selectedProject.daily_reports || []).find(
            (report: any) => String(report.id) === editingReportId
          )
        : null;

      if (editingReportId) {
        // 수정은 작성자 본인만 가능하다. update 조건에도 author_id를 넣어 UI 우회 시도를 한 번 더 막는다.
        if (!canEditReport(existingReport)) {
          throw new Error('작성자만 일일보고서를 수정할 수 있습니다.');
        }

        const { error } = await supabase
          .from('daily_reports')
          .update(reportPayload)
          .eq('id', editingReportId)
          .eq('project_id', selectedProject.id)
          .eq('author_id', authorUserId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('daily_reports')
          .insert(reportPayload)
          .select('id')
          .single();

        if (error) throw error;

        reportId = data?.id ? String(data.id) : null;
        if (!reportId) throw new Error('일일보고서 저장 결과를 받지 못했습니다.');
      }

      if (!reportId) throw new Error('일일보고서 정보를 찾지 못했습니다.');

      const existingImageCount = existingReport?.daily_report_images?.length || 0;

      // 수정 모드에서는 기존 이미지를 지우지 않고 새 이미지가 뒤에 추가된다.
      // 기존 이미지 개수를 sort_order 시작값으로 써서 상세 보기 순서가 유지되게 한다.
      for (let index = 0; index < reportImages.length; index += 1) {
        await uploadReportImage(
          projectStoreUserId,
          selectedProject.id,
          reportId,
          reportImages[index],
          existingImageCount + index
        );
      }

      if (isCreatingReport) {
        // 내부 보고서는 고객에게 보이지 않아야 하므로 push도 고객 공개 보고서일 때만 보낸다.
        await notifyProjectChatActivity({
          projectId: selectedProject.id,
          type: 'project_daily_report_created',
          title: '일일보고서 등록',
          body: `${selectedProject.name || '현장'} · ${reportPayload.report_date} 일일보고서가 등록되었습니다.`,
          entityId: reportId,
          visibleToCustomer: reportPayload.customer_visible,
          sendPush: reportPayload.customer_visible,
        });
      }

      resetReportForm(reportDate.trim());
      await loadProjects();
    } catch (error: any) {
      Alert.alert(
        editingReportId ? '일일보고서 수정 실패' : '일일보고서 저장 실패',
        error?.message || '저장 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * 일일보고서를 삭제한다.
   *
   * 작성자만 삭제할 수 있고, storage 파일을 먼저 지운 뒤 image row와 report row를 삭제한다.
   * 파일만 남거나 DB row만 남는 상태를 줄이기 위해 한 흐름 안에서 순서대로 처리한다.
   */
  const deleteDailyReport = async (report: any) => {
    if (!selectedProject || !user?.id || saving) return;

    if (!canEditReport(report)) {
      Alert.alert('일일보고서 삭제', '작성자만 삭제할 수 있습니다.');
      return;
    }

    const ok = await confirmProjectLifecycleAction(
      '일일보고서 삭제',
      `${report.report_date || '선택한 날짜'} 일일보고서를 삭제할까요?`,
      '삭제'
    );

    if (!ok) return;

    setSaving(true);

    try {
      const imagePaths = (report.daily_report_images || [])
        .map((image: any) => image.image_path)
        .filter(Boolean);

      if (imagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(REPORT_IMAGE_BUCKET)
          .remove(imagePaths);

        if (storageError) throw storageError;

        const { error: imageDeleteError } = await supabase
          .from('daily_report_images')
          .delete()
          .eq('report_id', report.id);

        if (imageDeleteError) throw imageDeleteError;
      }

      const { error } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', report.id)
        .eq('project_id', selectedProject.id)
        .eq('author_id', user.id);

      if (error) throw error;

      if (editingReportId === String(report.id)) {
        resetReportForm(selectedDate);
      }

      if (selectedReportId === String(report.id)) {
        closeReportDetail();
      }

      await loadProjects();
    } catch (error: any) {
      Alert.alert('일일보고서 삭제 실패', error?.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const openReportImage = async (imagePath: string, title = '보고서 사진', signedUrl?: string) => {
    if (signedUrl) {
      setReportPreviewImage({ uri: signedUrl, title });
      return;
    }

    const { data, error } = await supabase.storage
      .from(REPORT_IMAGE_BUCKET)
      .createSignedUrl(imagePath, 60 * 10);

    if (error || !data?.signedUrl) {
      Alert.alert('사진 열기 실패', error?.message || '사진 주소를 만들지 못했습니다.');
      return;
    }

    setReportPreviewImage({ uri: data.signedUrl, title });
  };

  const renderReportImageChips = (report: any) => {
    const images = report?.daily_report_images || [];

    if (images.length === 0) return null;

    return (
      <View style={styles.reportImageList}>
        {images.map((image: any, index: number) => (
          <TouchableOpacity
            key={image.id || `${report.id}-${index}`}
            style={styles.reportImageChip}
            onPress={(event) => {
              event.stopPropagation();
              if (image.image_path) {
                void openReportImage(
                  image.image_path,
                  `${report.report_date || '일일보고서'} 사진 ${index + 1}`
                );
              }
            }}
            activeOpacity={0.86}
          >
            <Ionicons name="image-outline" size={15} color={theme.primary} />
            <Text style={styles.reportImageText}>사진 {index + 1}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderReportImagePreview = () => {
    if (!reportPreviewImage) return null;

    return (
      <GestureHandlerRootView style={styles.imagePreviewBackdrop}>
        <View style={styles.imagePreviewHeader}>
          <Text style={styles.imagePreviewTitle}>{reportPreviewImage.title || '보고서 사진'}</Text>
          <TouchableOpacity
            style={styles.imagePreviewCloseBtn}
            onPress={closeReportImagePreview}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.imagePreviewBody}>
          <ZoomableReportImage
            key={reportPreviewImage.uri}
            uri={reportPreviewImage.uri}
            onClose={closeReportImagePreview}
          />
        </View>
      </GestureHandlerRootView>
    );
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '현장관리', headerBackButtonMenuEnabled: false }} />

      <Modal
        visible={!!selectedReport}
        animationType="slide"
        transparent
        onRequestClose={closeReportDetail}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.reportDetailSheet,
              { transform: [{ translateY: reportDetailPanY }] },
            ]}
            {...reportDetailPanResponder.panHandlers}
          >
            {selectedReport ? (
              <>
                <View style={styles.sheetDragArea} {...reportDetailPanResponder.panHandlers}>
                  <View style={styles.sheetDragHandle} />
                </View>
                <View style={styles.reportDetailHeader} {...reportDetailPanResponder.panHandlers}>
                  <View style={styles.headerTitleBox}>
                    <Text style={styles.reportDetailTitle}>{selectedReport.report_date} 일일보고서</Text>
                    <Text style={styles.metaText}>
                      진행률 {selectedReport.progress_percent || 0}% · 투입 {selectedReport.worker_count || 0}명 ·{' '}
                      {selectedReport.customer_visible ? '고객 공개' : '내부'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={closeReportDetail}
                  >
                    <Ionicons name="close" size={20} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={styles.reportDetailContent}
                  scrollEventThrottle={16}
                  onScroll={(event) => {
                    reportDetailScrollYRef.current = event.nativeEvent.contentOffset.y;
                  }}
                >
                  {canEditReport(selectedReport) ? (
                    <View style={styles.reportDetailActionRow}>
                      <TouchableOpacity
                        style={styles.scheduleActionBtn}
                        onPress={() => startEditReport(selectedReport)}
                        disabled={saving}
                      >
                        <Text style={styles.scheduleActionText}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.scheduleDeleteBtn}
                        onPress={() => deleteDailyReport(selectedReport)}
                        disabled={saving}
                      >
                        <Text style={styles.scheduleDeleteText}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={styles.reportDetailBlock}>
                    <Text style={styles.reportDetailLabel}>작업내용</Text>
                    <Text style={styles.reportDetailBody}>
                      {selectedReport.work_content || '작성된 작업내용이 없습니다.'}
                    </Text>
                  </View>

                  {selectedReport.issues ? (
                    <View style={styles.reportDetailBlock}>
                      <Text style={styles.reportDetailLabel}>특이사항</Text>
                      <Text style={styles.reportDetailBody}>{selectedReport.issues}</Text>
                    </View>
                  ) : null}

                  {selectedReport.memo ? (
                    <View style={styles.reportDetailBlock}>
                      <Text style={styles.reportDetailLabel}>메모</Text>
                      <Text style={styles.reportDetailBody}>{selectedReport.memo}</Text>
                    </View>
                  ) : null}

                  <View style={styles.reportDetailBlock}>
                    <Text style={styles.reportDetailLabel}>사진</Text>
                    {loadingSelectedReportImages ? (
                      <View style={styles.reportImageLoading}>
                        <ActivityIndicator color={theme.primary} />
                      </View>
                    ) : selectedReportImages.length === 0 ? (
                      <Text style={styles.emptyInlineText}>첨부된 사진이 없습니다.</Text>
                    ) : (
                      <View style={styles.reportDetailImageList}>
                        {selectedReportImages.map((image: any, index: number) => {
                          const imageKey = String(image.id || image.image_path || index);
                          const signedUrl = selectedReportImageUrls[imageKey];

                          return (
                            <TouchableOpacity
                              key={imageKey}
                              style={styles.reportDetailImageCard}
                              onPress={() =>
                                image.image_path &&
                                openReportImage(image.image_path, `사진 ${index + 1}`, signedUrl)
                              }
                              activeOpacity={0.86}
                            >
                              {signedUrl ? (
                                <Image
                                  source={{ uri: signedUrl }}
                                  style={styles.reportDetailImage}
                                  resizeMode="contain"
                                />
                              ) : (
                                <View style={styles.reportImagePlaceholder}>
                                  <Ionicons name="image-outline" size={26} color={theme.textMuted} />
                                  <Text style={styles.metaText}>사진을 불러오지 못했습니다.</Text>
                                </View>
                              )}
                              <Text style={styles.reportImageCaption}>사진 {index + 1}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </ScrollView>
              </>
            ) : null}
          </Animated.View>
          {selectedReport && reportPreviewImage ? (
            <View style={styles.imagePreviewInlineOverlay}>
              {renderReportImagePreview()}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!reportPreviewImage && !selectedReport}
        animationType="fade"
        transparent
        onRequestClose={closeReportImagePreview}
      >
        {renderReportImagePreview()}
      </Modal>

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.title}>현장관리</Text>
            <Text style={styles.desc}>견적 확정 후 현장, 일정, 일일보고서, 참여자를 관리합니다.</Text>
          </View>
          {canManageProjects && !selectedProject ? (
            <TouchableOpacity
              style={styles.primaryMiniBtn}
              onPress={() => {
                setShowProjectForm((visible) => !visible);
                setMessage('');
              }}
            >
              <Ionicons name={showProjectForm ? 'close' : 'add'} size={17} color={theme.primaryText} />
              <Text style={styles.primaryMiniText}>{showProjectForm ? '닫기' : '현장 등록'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {(!canUseProjects && loading) || isLoadingRequestedProject ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !canUseProjects ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>
            현장관리는 가게 인증 완료 계정 또는 배정된 직원 계정만 사용할 수 있습니다.
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={projectScrollRef}
          style={styles.body}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshProjects} tintColor={theme.primary} />
          }
        >
          {selectedProject ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={closeProjectDetail}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text} />
              <Text style={styles.backText}>현장 목록</Text>
            </TouchableOpacity>
          ) : null}

          {!selectedProject ? (
            <>
          {showProjectForm ? (
            <View style={styles.formBox}>
              <Text style={styles.formTitle}>현장 직접 등록</Text>
              <Text style={styles.label}>현장명</Text>
              <TextInput
                style={styles.input}
                value={projectName}
                onChangeText={setProjectName}
                placeholder="예: 천호동 아파트 욕실 공사"
                placeholderTextColor={theme.textSubtle}
              />

              <Text style={styles.label}>고객</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !projectCustomerId && styles.chipActive]}
                  onPress={() => setProjectCustomerId(null)}
                >
                  <Text style={[styles.chipText, !projectCustomerId && styles.chipTextActive]}>미지정</Text>
                </TouchableOpacity>
                {customers.map((customer) => {
                  const active = projectCustomerId === customer.id;
                  return (
                    <TouchableOpacity
                      key={customer.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        setProjectCustomerId(customer.id);
                        if (!projectAddress.trim() && customer.address) {
                          setProjectAddress(customer.address);
                        }
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {customer.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>주소</Text>
              <TextInput
                style={styles.input}
                value={projectAddress}
                onChangeText={setProjectAddress}
                placeholder="현장 주소"
                placeholderTextColor={theme.textSubtle}
              />

              <View style={styles.twoColumn}>
                <View style={styles.fieldFlex}>
                  <Text style={styles.label}>시작일</Text>
                  <TextInput
                    style={styles.input}
                    value={projectStartDate}
                    onChangeText={setProjectStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSubtle}
                  />
                </View>
                <View style={styles.fieldFlex}>
                  <Text style={styles.label}>완료 예정일</Text>
                  <TextInput
                    style={styles.input}
                    value={projectEndDate}
                    onChangeText={setProjectEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSubtle}
                  />
                </View>
              </View>

              <Text style={styles.label}>계약금액</Text>
              <TextInput
                style={styles.input}
                value={projectAmount}
                onChangeText={setProjectAmount}
                placeholder="0"
                placeholderTextColor={theme.textSubtle}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>담당 직원</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !projectAssignedStaffId && styles.chipActive]}
                  onPress={() => setProjectAssignedStaffId(null)}
                >
                  <Text style={[styles.chipText, !projectAssignedStaffId && styles.chipTextActive]}>미지정</Text>
                </TouchableOpacity>
                {staffMembers.map((staff) => {
                  const active = projectAssignedStaffId === staff.staff_user_id;
                  return (
                    <TouchableOpacity
                      key={staff.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setProjectAssignedStaffId(staff.staff_user_id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {staff.display_name || '직원'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>메모</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={projectMemo}
                onChangeText={setProjectMemo}
                placeholder="계약 특이사항, 고객 요청사항"
                placeholderTextColor={theme.textSubtle}
                multiline
                textAlignVertical="top"
              />

              {message ? <Text style={styles.messageText}>{message}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.disabledBtn]}
                onPress={createProject}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>{saving ? '등록 중...' : '현장 등록'}</Text>
              </TouchableOpacity>
            </View>
          ) : message ? (
            <Text style={styles.messageText}>{message}</Text>
          ) : null}

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={projectSearch}
              onChangeText={setProjectSearch}
              placeholder="현장명, 신청자명, 전화번호, 주소 검색"
              placeholderTextColor={theme.textSubtle}
              returnKeyType="search"
            />
            {projectSearch ? (
              <TouchableOpacity onPress={() => setProjectSearch('')} style={styles.clearSearchBtn}>
                <Ionicons name="close-circle" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.scopeFilterRow}>
            {PROJECT_SCOPE_OPTIONS.map((item) => {
              const active = scopeFilter === item.key;
              const count = projectScopeCounts[item.key] || 0;

              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.scopeFilterBtn, active && styles.scopeFilterBtnActive]}
                  onPress={() => setScopeFilter(item.key)}
                >
                  <Text style={[styles.scopeFilterText, active && styles.scopeFilterTextActive]}>
                    {item.label} {count ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.filterRow}>
            {PROJECT_STATUS_OPTIONS.map((item) => {
              const active = filter === item.key;
              const count = statusCounts[item.key] || 0;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label} {count ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : filteredProjects.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="business-outline" size={34} color={theme.textSubtle} />
              <Text style={styles.emptyTitle}>현장이 없습니다</Text>
              <Text style={styles.emptyText}>견적관리에서 현장으로 전환하거나 직접 현장을 등록하세요.</Text>
            </View>
          ) : (
            <View style={styles.projectList}>
              {filteredProjects.map((project) => {
                const active = selectedProjectId === project.id;
                const projectPeriod = getProjectPeriod(project);
                const partnerAccess = isProjectPartnerAccess(project, storeAccess, user?.id);
                const accessLabel = getProjectAccessLabel(project, storeAccess, user?.id);
                return (
                  <TouchableOpacity
                    key={project.id}
                    style={[styles.projectCard, active && styles.projectCardActive]}
                    onPress={() => {
                      setSelectedProjectId(project.id);
                      setSelectedReportId(null);
                      setEditingScheduleId(null);
                      setScheduleTitle('');
                      setScheduleEndDate('');
                      setScheduleStatus('scheduled');
                      setScheduleMemo('');
                      setEditingReportId(null);
                      setReportContent('');
                      setReportWorkers('');
                      setReportProgress('');
                      setReportIssues('');
                      setReportMemo('');
                      setReportCustomerVisible(false);
                      setReportImages([]);
                      setScheduleRangeMode(null);
                      if (projectPeriod.startDate) {
                        const nextDate = new Date(`${projectPeriod.startDate}T00:00:00`);
                        if (!Number.isNaN(nextDate.getTime())) {
                          setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
                          setSelectedDate(projectPeriod.startDate);
                          setScheduleStartDate(projectPeriod.startDate);
                          setReportDate(projectPeriod.startDate);
                        }
                      }
                    }}
                  >
                    <View style={styles.projectCardHeader}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                      <View style={styles.projectBadgeGroup}>
                        <Text
                          style={[
                            styles.projectAccessBadge,
                            partnerAccess
                              ? styles.projectAccessBadgePartner
                              : styles.projectAccessBadgeOwned,
                          ]}
                        >
                          {accessLabel}
                        </Text>
                        <Text style={styles.statusBadge}>{getStatusLabel(project.status)}</Text>
                      </View>
                    </View>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {getProjectCustomerName(project)} · {getStaffName(project.assigned_staff_user_id)}
                    </Text>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {getProjectCustomerAddress(project)}
                    </Text>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {formatShortDate(projectPeriod.startDate)} ~ {formatShortDate(projectPeriod.endDate)} · {formatAmount(project.contract_amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
            </>
          ) : null}

          {selectedProject ? (
            <View style={styles.detailBox}>
              <View style={styles.detailHeader}>
                <View style={styles.headerTitleBox}>
                  <Text style={styles.detailTitle}>{selectedProject.name}</Text>
                  <View style={styles.detailBadgeRow}>
                    <Text
                      style={[
                        styles.projectAccessBadge,
                        isSelectedProjectPartner
                          ? styles.projectAccessBadgePartner
                          : styles.projectAccessBadgeOwned,
                      ]}
                    >
                      {selectedProjectAccessLabel}
                    </Text>
                    <Text style={styles.statusBadge}>
                      {getStatusLabel(selectedProjectDisplayStatus)}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>
                    {getProjectCustomerAddress(selectedProject)}
                  </Text>
                </View>
              </View>

              <View style={styles.detailActionRow}>
                <TouchableOpacity style={styles.chatBtn} onPress={openProjectChat}>
                  <Ionicons name="chatbubbles-outline" size={17} color={theme.primaryText} />
                  <Text style={styles.chatBtnText}>현장 채팅</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.estimateBtn,
                    !(selectedProject.estimate_request_id || selectedProject.estimate_quote_id) &&
                      styles.disabledBtn,
                  ]}
                  onPress={openProjectEstimate}
                  disabled={!(selectedProject.estimate_request_id || selectedProject.estimate_quote_id)}
                >
                  <Ionicons name="document-text-outline" size={17} color={theme.text} />
                  <Text style={styles.estimateBtnText}>
                    {selectedProject.estimate_request_id || selectedProject.estimate_quote_id
                      ? '견적서 보기'
                    : '연결 견적서 없음'}
                  </Text>
                </TouchableOpacity>
                {canUpdateSelectedProjectStatus && selectedProjectDisplayStatus !== 'completed' ? (
                  <TouchableOpacity
                    style={[styles.completeProjectBtn, saving && styles.disabledBtn]}
                    onPress={completeProjectThread}
                    disabled={saving}
                  >
                    <Ionicons name="checkmark-circle-outline" size={17} color={theme.primaryText} />
                    <Text style={styles.completeProjectBtnText}>
                      {saving ? '처리 중...' : '완료 처리'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {canManageSelectedProjectMembers ? (
                  <TouchableOpacity
                    style={[styles.dangerProjectBtn, saving && styles.disabledBtn]}
                    onPress={deleteProjectThread}
                    disabled={saving}
                  >
                    <Ionicons name="trash-outline" size={17} color={theme.danger} />
                    <Text style={styles.dangerProjectBtnText}>
                      {saving ? '처리 중...' : '삭제'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.statusActions}>
                {PROJECT_STATUS_OPTIONS.filter((item) => item.key !== 'all').map((item) => {
                  const active = selectedProjectDisplayStatus === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.statusBtn, active && styles.statusBtnActive]}
                      onPress={() => {
                        if (item.key === 'completed' && !isSelectedProjectPartner) {
                          completeProjectThread();
                          return;
                        }

                        updateProjectStatus(item.key as ProjectStatus);
                      }}
                      disabled={saving}
                    >
                      <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isSelectedProjectPartner ? (
                <Text style={styles.helpText}>
                  협력업체의 현장 상태 선택은 내 화면에서만 표시됩니다.
                </Text>
              ) : null}

              <View style={styles.summaryGrid}>
                <SummaryItem label="고객" value={getProjectCustomerName(selectedProject, '미지정')} />
                <SummaryItem label="담당자" value={getStaffName(selectedProject.assigned_staff_user_id)} />
                <SummaryItem label="계약금액" value={formatAmount(selectedProject.contract_amount)} />
                <SummaryItem label="기간" value={`${formatShortDate(selectedProjectPeriod.startDate)} ~ ${formatShortDate(selectedProjectPeriod.endDate)}`} />
              </View>

              {selectedProject.memo ? (
                <View style={styles.memoBox}>
                  <Text style={styles.sectionTitle}>현장 메모</Text>
                  <Text style={styles.bodyText}>{selectedProject.memo}</Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>참여자 · 협력업체</Text>
                <View style={styles.memberList}>
                  {(selectedProject.project_members || []).map((member: any) => (
                    <View key={member.id} style={styles.memberRow}>
                      <View style={styles.memberIcon}>
                        <Ionicons
                          name={member.role === 'partner' ? 'hammer-outline' : 'person-outline'}
                          size={17}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {member.company_name || member.display_name || '참여자'}
                        </Text>
                        <Text style={styles.memberMeta}>
                          {member.role} · {member.invitation_status}
                          {member.phone ? ` · ${member.phone}` : ''}
                        </Text>
                      </View>
                      {canManageSelectedProjectMembers && member.role !== 'owner' ? (
                        <TouchableOpacity
                          style={styles.removeMemberBtn}
                          onPress={() => removeProjectMember(member)}
                          disabled={saving}
                        >
                          <Text style={styles.removeMemberText}>내보내기</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>

                {canManageSelectedProjectMembers ? (
                  <>
                    <Text style={styles.label}>직원 추가</Text>
                    <View style={styles.chipRow}>
                      {staffMembers.map((staff) => (
                        <TouchableOpacity
                          key={staff.id}
                          style={styles.chip}
                          onPress={() => addStaffMember(staff)}
                          disabled={saving}
                        >
                          <Text style={styles.chipText}>{staff.display_name || '직원'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.label}>협력업체 추가</Text>
                    <View style={styles.partnerForm}>
                      <View style={styles.partnerModeRow}>
                        <TouchableOpacity
                          style={[
                            styles.partnerModeBtn,
                            partnerInputMode === 'registered' && styles.partnerModeBtnActive,
                          ]}
                          onPress={() => changePartnerInputMode('registered')}
                        >
                          <Text
                            style={[
                              styles.partnerModeText,
                              partnerInputMode === 'registered' && styles.partnerModeTextActive,
                            ]}
                          >
                            등록 업체
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.partnerModeBtn,
                            partnerInputMode === 'manual' && styles.partnerModeBtnActive,
                          ]}
                          onPress={() => changePartnerInputMode('manual')}
                        >
                          <Text
                            style={[
                              styles.partnerModeText,
                              partnerInputMode === 'manual' && styles.partnerModeTextActive,
                            ]}
                          >
                            직접 입력
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {partnerInputMode === 'manual' ? (
                        <Text style={styles.helpText}>
                          등록되지 않은 업체는 협력업체명, 담당자명, 연락처를 직접 입력하면 초대 링크를 보낼 수 있습니다.
                        </Text>
                      ) : null}

                      <TextInput
                        style={styles.input}
                        value={partnerCompany}
                        onChangeText={handlePartnerCompanyChange}
                        onFocus={() => {
                          if (partnerInputMode === 'registered') {
                            setPartnerStorePickerOpen(true);
                            setPartnerContactPickerOpen(false);
                          }
                        }}
                        placeholder={
                          partnerInputMode === 'registered'
                            ? '협력업체명 검색 또는 선택'
                            : '협력업체명'
                        }
                        placeholderTextColor={theme.textSubtle}
                      />

                      {partnerInputMode === 'registered' && partnerStorePickerOpen ? (
                        <>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                            {partnerCategoryOptions.map((category) => {
                              const active = partnerCategoryFilter === category;
                              return (
                                <TouchableOpacity
                                  key={category}
                                  style={[styles.chip, active && styles.chipActive]}
                                  onPress={() => setPartnerCategoryFilter(category)}
                                >
                                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {category}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>

                          <View style={styles.partnerStoreList}>
                            {filteredPartnerStores.length === 0 ? (
                              <Text style={styles.emptyInlineText}>
                                조건에 맞는 등록 업체가 없습니다. 등록되지 않은 업체는 직접 입력으로 추가하세요.
                              </Text>
                            ) : (
                              filteredPartnerStores.map((store) => {
                                const active = selectedPartnerStoreId === store.id;
                                return (
                                  <TouchableOpacity
                                    key={store.id}
                                    style={[styles.partnerStoreCard, active && styles.partnerStoreCardActive]}
                                    onPress={() => selectPartnerStore(store)}
                                  >
                                    <View style={styles.partnerStoreInfo}>
                                      <Text style={styles.partnerStoreName}>
                                        {store.display_name || '인증 가게'}
                                      </Text>
                                      <Text style={styles.partnerStoreMeta} numberOfLines={2}>
                                        {getStoreCategoryLabel(store.store_category)}
                                        {store.store_address ? ` · ${store.store_address}` : ''}
                                        {store.phone ? ` · ${store.phone}` : ''}
                                      </Text>
                                    </View>
                                    {active ? (
                                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                                    ) : (
                                      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })
                            )}
                            <TouchableOpacity
                              style={styles.partnerStoreCard}
                              onPress={() => changePartnerInputMode('manual')}
                            >
                              <View style={styles.partnerStoreInfo}>
                                <Text style={styles.partnerStoreName}>등록되지 않은 업체 직접 입력</Text>
                                <Text style={styles.partnerStoreMeta}>
                                  업체명, 담당자명, 연락처를 직접 입력해서 초대 링크를 보냅니다.
                                </Text>
                              </View>
                              <Ionicons name="create-outline" size={18} color={theme.textMuted} />
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : null}

                      <TextInput
                        style={styles.input}
                        value={partnerName}
                        onChangeText={setPartnerName}
                        onFocus={() => {
                          if (partnerInputMode === 'registered') {
                            if (selectedPartnerStoreId) {
                              setPartnerContactPickerOpen(true);
                              setPartnerStorePickerOpen(false);
                            } else {
                              setPartnerStorePickerOpen(true);
                            }
                          }
                        }}
                        placeholder={
                          partnerInputMode === 'registered'
                            ? selectedPartnerStoreId
                              ? '담당자명 선택 또는 입력'
                              : '업체를 먼저 선택해 주세요'
                            : '담당자명'
                        }
                        placeholderTextColor={theme.textSubtle}
                      />

                      {partnerInputMode === 'registered' && selectedPartnerStoreId && partnerContactPickerOpen ? (
                        <View style={styles.partnerStoreList}>
                          {selectedPartnerContacts.map((contact) => {
                            const active = contact.staffUserId
                              ? selectedPartnerStaffUserId === contact.staffUserId
                              : !selectedPartnerStaffUserId && partnerName === contact.displayName;

                            return (
                              <TouchableOpacity
                                key={contact.id}
                                style={[styles.partnerStoreCard, active && styles.partnerStoreCardActive]}
                                onPress={() => selectPartnerContact(contact)}
                              >
                                <View style={styles.partnerStoreInfo}>
                                  <Text style={styles.partnerStoreName}>{contact.displayName}</Text>
                                  <Text style={styles.partnerStoreMeta} numberOfLines={2}>
                                    {contact.meta}
                                    {contact.phone ? ` · ${contact.phone}` : ' · 연락처 미등록'}
                                  </Text>
                                </View>
                                {active ? (
                                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                                ) : (
                                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                          {selectedPartnerStoreStaff.length === 0 ? (
                            <Text style={styles.emptyInlineText}>
                              선택한 가게에 등록된 활성 직원이 없어 가게 아이디만 선택할 수 있습니다.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <TextInput
                        style={styles.input}
                        value={partnerPhone}
                        onChangeText={setPartnerPhone}
                        placeholder="연락처"
                        placeholderTextColor={theme.textSubtle}
                        keyboardType="phone-pad"
                      />
                      <TouchableOpacity
                        style={[styles.secondaryBtn, saving && styles.disabledBtn]}
                        onPress={addPartnerMember}
                        disabled={saving}
                      >
                        <Text style={styles.secondaryBtnText}>협력업체 추가</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.section}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setCalendarMonth((current) => moveMonth(current, -1))}
                  >
                    <Ionicons name="chevron-back" size={18} color={theme.text} />
                  </TouchableOpacity>
                  <Text style={styles.calendarTitle}>
                    {calendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setCalendarMonth((current) => moveMonth(current, 1))}
                  >
                    <Ionicons name="chevron-forward" size={18} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map((day) => (
                    <Text key={day} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarWeeks.map((week, weekIndex) => (
                    <View key={`week-${weekIndex}`} style={styles.calendarWeekRow}>
                      {week.map((cell) => {
                        const dateText = cell.dateText;
                        const isSelected = dateText === selectedDate;
                        const daySchedules = dateText
                          ? (selectedProject.project_schedules || []).filter((schedule: any) =>
                              isDateInSchedule(dateText, schedule)
                            )
                          : [];
                        const dayReports = dateText
                          ? visibleSelectedProjectReports.filter(
                              (report: any) => report.report_date === dateText
                            )
                          : [];
                        const draftStart = scheduleStartDate || '';
                        const draftEnd = scheduleEndDate || scheduleStartDate || '';
                        const draftMin = draftStart && draftEnd && draftEnd < draftStart ? draftEnd : draftStart;
                        const draftMax = draftStart && draftEnd && draftEnd < draftStart ? draftStart : draftEnd;
                        const inDraftRange =
                          !!dateText &&
                          !!draftMin &&
                          !!draftMax &&
                          dateText >= draftMin &&
                          dateText <= draftMax;
                        const isDraftEdge =
                          !!dateText && (dateText === scheduleStartDate || dateText === scheduleEndDate);

                        return (
                          <TouchableOpacity
                            key={cell.key}
                            style={[
                              styles.dayCell,
                              !dateText && styles.dayCellEmpty,
                              inDraftRange && styles.dayCellDraftRange,
                              isDraftEdge && styles.dayCellDraftEdge,
                              isSelected && styles.dayCellSelected,
                            ]}
                            disabled={!dateText}
                            onPress={() => dateText && selectCalendarDate(dateText)}
                          >
                            <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                              {cell.day || ''}
                            </Text>
                            {dateText ? (
                              <View style={styles.dayMarkerRow}>
                                {daySchedules.length > 0 ? <View style={styles.scheduleDot} /> : null}
                                {dayReports.length > 0 ? <View style={styles.reportDot} /> : null}
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

                <View style={styles.selectedDateBox}>
                  <Text style={styles.sectionTitle}>{selectedDate}</Text>

                  {selectedSchedules.length === 0 && selectedReports.length === 0 ? (
                    <Text style={styles.emptyInlineText}>선택한 날짜에 일정이나 보고서가 없습니다.</Text>
                  ) : null}

                  {selectedSchedules.map((schedule: any) => (
                    <View key={schedule.id} style={styles.timelineItem}>
                      <View style={styles.timelineTitleRow}>
                        <Text style={styles.timelineTitle}>{schedule.title}</Text>
                        {canManageSelectedProjectSchedule ? (
                          <View style={styles.scheduleActionRow}>
                            <TouchableOpacity
                              style={styles.scheduleActionBtn}
                              onPress={() => startEditSchedule(schedule)}
                              disabled={saving}
                            >
                              <Text style={styles.scheduleActionText}>수정</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.scheduleDeleteBtn}
                              onPress={() => deleteSchedule(schedule)}
                              disabled={saving}
                            >
                              <Text style={styles.scheduleDeleteText}>삭제</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.metaText}>
                        {formatShortDate(schedule.start_date)} ~ {formatShortDate(schedule.end_date)} · {getScheduleStatusLabel(schedule.status)}
                      </Text>
                      {schedule.memo ? <Text style={styles.bodyText}>{schedule.memo}</Text> : null}
                    </View>
                  ))}

                  {selectedReports.map((report: any) => (
                    <TouchableOpacity
                      key={report.id}
                      style={[
                        styles.timelineItem,
                        String(report.id) === selectedReportId && styles.timelineItemActive,
                      ]}
                      onPress={() => setSelectedReportId(String(report.id))}
                      activeOpacity={0.86}
                    >
                      <View style={styles.timelineTitleRow}>
                        <Text style={styles.timelineTitle}>일일보고서</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                      </View>
                      <Text style={styles.metaText}>
                        진행률 {report.progress_percent || 0}% · 투입 {report.worker_count || 0}명 ·{' '}
                        {(report.daily_report_images || []).length}장 · {report.customer_visible ? '고객 공개' : '내부'}
                      </Text>
                      <Text style={styles.bodyText}>{report.work_content}</Text>
                      {renderReportImageChips(report)}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {canManageSelectedProjectSchedule ? (
                <>
                  <View style={styles.section}>
                    <View style={styles.formSectionHeader}>
                      <Text style={styles.sectionTitle}>{editingScheduleId ? '일정 수정' : '일정 등록'}</Text>
                      {editingScheduleId ? (
                        <TouchableOpacity
                          style={styles.formHeaderAction}
                          onPress={() => resetScheduleForm(selectedDate)}
                          disabled={saving}
                        >
                          <Text style={styles.formHeaderActionText}>취소</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TextInput
                      style={styles.input}
                      value={scheduleTitle}
                      onChangeText={setScheduleTitle}
                      placeholder="예: 욕실 철거, 타일 시공"
                      placeholderTextColor={theme.textSubtle}
                    />
                    <View style={styles.rangePickerBox}>
                      <Text style={styles.helpText}>
                        시작일 선택 또는 종료일 선택을 누른 뒤 위 달력에서 날짜를 선택하세요.
                      </Text>
                      <View style={styles.rangePickerActions}>
                        <TouchableOpacity
                          style={[
                            styles.rangeModeBtn,
                            scheduleRangeMode === 'start' && styles.rangeModeBtnActive,
                          ]}
                          onPress={() => setScheduleRangeMode('start')}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={15}
                            color={scheduleRangeMode === 'start' ? theme.primaryText : theme.text}
                          />
                          <Text
                            style={[
                              styles.rangeModeText,
                              scheduleRangeMode === 'start' && styles.rangeModeTextActive,
                            ]}
                          >
                            시작일 선택
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.rangeModeBtn,
                            scheduleRangeMode === 'end' && styles.rangeModeBtnActive,
                          ]}
                          onPress={() => setScheduleRangeMode('end')}
                        >
                          <Ionicons
                            name="calendar-number-outline"
                            size={15}
                            color={scheduleRangeMode === 'end' ? theme.primaryText : theme.text}
                          />
                          <Text
                            style={[
                              styles.rangeModeText,
                              scheduleRangeMode === 'end' && styles.rangeModeTextActive,
                            ]}
                          >
                            종료일 선택
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.twoColumn}>
                      <View style={styles.fieldFlex}>
                        <Text style={styles.label}>시작일</Text>
                        <TextInput
                          style={styles.input}
                          value={scheduleStartDate}
                          onChangeText={setScheduleStartDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={theme.textSubtle}
                        />
                      </View>
                      <View style={styles.fieldFlex}>
                        <Text style={styles.label}>종료일</Text>
                        <TextInput
                          style={styles.input}
                          value={scheduleEndDate}
                          onChangeText={setScheduleEndDate}
                          placeholder="선택"
                          placeholderTextColor={theme.textSubtle}
                        />
                      </View>
                    </View>
                    <View style={styles.chipRow}>
                      {SCHEDULE_STATUS_OPTIONS.map((item) => {
                        const active = scheduleStatus === item.key;
                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setScheduleStatus(item.key)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={scheduleMemo}
                      onChangeText={setScheduleMemo}
                      placeholder="일정 메모"
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity style={[styles.secondaryBtn, saving && styles.disabledBtn]} onPress={saveSchedule} disabled={saving}>
                      <Text style={styles.secondaryBtnText}>
                        {editingScheduleId ? '일정 수정 저장' : '일정 등록'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : canWriteSelectedProject ? (
                <View style={styles.readOnlyBox}>
                  <Text style={styles.sectionTitle}>일정 권한</Text>
                  <Text style={styles.helpText}>일정 등록, 수정, 삭제는 견적을 받은 가게만 할 수 있습니다.</Text>
                </View>
              ) : null}

              {canWriteSelectedProject ? (
                <>
                  <View
                    style={styles.section}
                    onLayout={(event) => {
                      reportFormYRef.current = event.nativeEvent.layout.y;
                      if (pendingReportFormFocus) {
                        scrollToReportForm();
                      }
                    }}
                  >
                    <View style={styles.formSectionHeader}>
                      <Text style={styles.sectionTitle}>{editingReportId ? '일일보고서 수정' : '일일보고서 작성'}</Text>
                      {editingReportId ? (
                        <TouchableOpacity
                          style={styles.formHeaderAction}
                          onPress={() => resetReportForm(selectedDate)}
                          disabled={saving}
                        >
                          <Text style={styles.formHeaderActionText}>취소</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={styles.label}>작성일</Text>
                    <TextInput
                      style={styles.input}
                      value={reportDate}
                      onChangeText={setReportDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textSubtle}
                    />
                    <Text style={styles.label}>작업내용</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={reportContent}
                      onChangeText={setReportContent}
                      placeholder="오늘 진행한 작업을 입력하세요"
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <View style={styles.twoColumn}>
                      <View style={styles.fieldFlex}>
                        <Text style={styles.label}>투입 인원</Text>
                        <TextInput
                          style={styles.input}
                          value={reportWorkers}
                          onChangeText={setReportWorkers}
                          placeholder="0"
                          placeholderTextColor={theme.textSubtle}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.fieldFlex}>
                        <Text style={styles.label}>진행률</Text>
                        <TextInput
                          style={styles.input}
                          value={reportProgress}
                          onChangeText={setReportProgress}
                          placeholder="0~100"
                          placeholderTextColor={theme.textSubtle}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={reportIssues}
                      onChangeText={setReportIssues}
                      placeholder="특이사항"
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={reportMemo}
                      onChangeText={setReportMemo}
                      placeholder="내부 메모"
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.visibilityToggle, reportCustomerVisible && styles.visibilityToggleActive]}
                      onPress={() => setReportCustomerVisible((visible) => !visible)}
                    >
                      <Ionicons
                        name={reportCustomerVisible ? 'eye-outline' : 'eye-off-outline'}
                        size={18}
                        color={reportCustomerVisible ? theme.primary : theme.textMuted}
                      />
                      <Text style={[styles.visibilityText, reportCustomerVisible && styles.visibilityTextActive]}>
                        {reportCustomerVisible ? '고객에게 공개' : '내부 보고서'}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.reportImageActions}>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={pickReportImages}>
                        <Text style={styles.secondaryBtnText}>사진 선택</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={takeReportPhoto}>
                        <Text style={styles.secondaryBtnText}>촬영</Text>
                      </TouchableOpacity>
                    </View>

                    {reportImages.length > 0 ? (
                      <View style={styles.previewRow}>
                        {reportImages.map((asset, index) => (
                          <TouchableOpacity
                            key={`${asset.uri}-${index}`}
                            style={styles.previewImageWrap}
                            onPress={() =>
                              setReportPreviewImage({
                                uri: asset.uri,
                                title: `첨부 사진 ${index + 1}`,
                              })
                            }
                            activeOpacity={0.86}
                          >
                            <Image source={{ uri: asset.uri }} style={styles.previewImage} />
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.clearImageBtn} onPress={() => setReportImages([])}>
                          <Ionicons name="close" size={17} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.primaryBtn, saving && styles.disabledBtn]}
                      onPress={saveDailyReport}
                      disabled={saving}
                    >
                      <Text style={styles.primaryBtnText}>
                        {saving
                          ? '저장 중...'
                          : editingReportId
                            ? '일일보고서 수정 저장'
                            : '일일보고서 저장'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.readOnlyBox}>
                  <Text style={styles.sectionTitle}>보기 권한</Text>
                  <Text style={styles.helpText}>이 현장은 일정과 일일보고서를 확인할 수만 있습니다.</Text>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>최근 일일보고서</Text>
                {visibleSelectedProjectReports.length === 0 ? (
                  <Text style={styles.emptyInlineText}>작성된 일일보고서가 없습니다.</Text>
                ) : (
                  visibleSelectedProjectReports.slice(0, 8).map((report: any) => (
                    <TouchableOpacity
                      key={report.id}
                      style={[
                        styles.reportCard,
                        String(report.id) === selectedReportId && styles.reportCardActive,
                      ]}
                      onPress={() => setSelectedReportId(String(report.id))}
                      activeOpacity={0.86}
                    >
                      <View style={styles.reportHeader}>
                        <Text style={styles.reportDate}>{report.report_date}</Text>
                        <View style={styles.reportHeaderActions}>
                          <Text style={styles.statusBadge}>{report.customer_visible ? '고객 공개' : '내부'}</Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                        </View>
                      </View>
                      <Text style={styles.bodyText}>{report.work_content}</Text>
                      {report.issues ? <Text style={styles.metaText}>특이사항: {report.issues}</Text> : null}
                      {report.memo ? <Text style={styles.metaText}>메모: {report.memo}</Text> : null}
                      {renderReportImageChips(report)}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const reportImageViewerStyles = StyleSheet.create({
  gestureBox: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: Math.max(SCREEN_HEIGHT - 130, 320),
  },
});

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.canvas },
    header: {
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      padding: 16,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitleBox: { flex: 1, minWidth: 0, gap: 5 },
    title: { color: theme.text, fontSize: 24, fontWeight: '900' },
    desc: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    body: { flex: 1 },
    content: { padding: 16, paddingBottom: 48, gap: 14 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.42)',
      justifyContent: 'flex-end',
    },
    reportDetailSheet: {
      maxHeight: '88%',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingTop: 14,
      overflow: 'hidden',
    },
    sheetDragArea: {
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetDragHandle: {
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.border,
    },
    reportDetailHeader: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    reportDetailTitle: { color: theme.text, fontSize: 18, fontWeight: '900', lineHeight: 24 },
    modalCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportDetailContent: { padding: 16, paddingBottom: 30, gap: 12 },
    reportDetailActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    reportDetailBlock: {
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    reportDetailLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    reportDetailBody: { color: theme.text, fontSize: 14, fontWeight: '700', lineHeight: 21 },
    reportImageLoading: {
      minHeight: 140,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportDetailImageList: { gap: 12 },
    reportDetailImageCard: {
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    reportDetailImage: {
      width: '100%',
      height: 240,
      backgroundColor: theme.canvas,
    },
    reportImagePlaceholder: {
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.canvas,
    },
    reportImageCaption: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    imagePreviewBackdrop: {
      flex: 1,
      backgroundColor: '#000',
      paddingHorizontal: 12,
      paddingTop: 54,
      paddingBottom: 24,
    },
    imagePreviewInlineOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
      zIndex: 20,
      elevation: 20,
    },
    imagePreviewHeader: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    imagePreviewTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '900' },
    imagePreviewCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePreviewBody: {
      flex: 1,
      width: '100%',
    },
    imagePreview: { flex: 1, width: '100%' },
    noticeBox: {
      margin: 16,
      borderRadius: 14,
      backgroundColor: theme.warningBg,
      borderWidth: 1,
      borderColor: theme.warningText,
      padding: 14,
      gap: 6,
    },
    noticeTitle: { color: theme.warningText, fontSize: 16, fontWeight: '900' },
    noticeText: { color: theme.warningText, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    primaryMiniBtn: {
      minHeight: 40,
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    primaryMiniText: { color: theme.primaryText, fontSize: 13, fontWeight: '900' },
    formBox: {
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    formTitle: { color: theme.text, fontSize: 17, fontWeight: '900' },
    label: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    helpText: { color: theme.textMuted, fontSize: 12, fontWeight: '800', lineHeight: 18 },
    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '700',
    },
    textarea: { minHeight: 84, lineHeight: 20 },
    twoColumn: { flexDirection: 'row', gap: 10 },
    fieldFlex: { flex: 1, gap: 6 },
    searchBox: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      paddingVertical: 10,
    },
    clearSearchBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeFilterRow: {
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 4,
      flexDirection: 'row',
      gap: 4,
    },
    scopeFilterBtn: {
      flex: 1,
      minHeight: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    scopeFilterBtnActive: {
      backgroundColor: theme.primarySoft,
    },
    scopeFilterText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'center',
    },
    scopeFilterTextActive: {
      color: theme.primary,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 11,
      paddingVertical: 7,
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    chipTextActive: { color: theme.primaryText },
    messageText: { color: theme.danger, fontSize: 13, fontWeight: '800', lineHeight: 19 },
    primaryBtn: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: theme.primaryText, fontSize: 14, fontWeight: '900' },
    secondaryBtn: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { color: theme.text, fontSize: 13, fontWeight: '900' },
    disabledBtn: { opacity: 0.55 },
    backBtn: {
      alignSelf: 'flex-start',
      minHeight: 38,
      borderRadius: 999,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    backText: { color: theme.text, fontSize: 13, fontWeight: '900' },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterBtn: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBtnActive: { backgroundColor: theme.text, borderColor: theme.text },
    filterText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    filterTextActive: { color: theme.background },
    center: { paddingVertical: 72, alignItems: 'center', justifyContent: 'center' },
    emptyBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
    emptyText: { color: theme.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 19 },
    emptyInlineText: { color: theme.textMuted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
    projectList: { gap: 10 },
    projectCard: {
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 6,
    },
    projectCardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    projectCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    projectName: { flex: 1, color: theme.text, fontSize: 16, fontWeight: '900' },
    projectBadgeGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 5,
      maxWidth: '48%',
    },
    projectAccessBadge: {
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '900',
      borderWidth: 1,
    },
    projectAccessBadgeOwned: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
      color: theme.primary,
    },
    projectAccessBadgePartner: {
      backgroundColor: theme.surfaceSoft,
      borderColor: theme.border,
      color: theme.text,
    },
    statusBadge: {
      borderRadius: 999,
      backgroundColor: theme.primarySoft,
      color: theme.primary,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '900',
    },
    metaText: { color: theme.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    bodyText: { color: theme.text, fontSize: 13, fontWeight: '700', lineHeight: 20 },
    detailBox: {
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 14,
    },
    detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    detailTitle: { color: theme.text, fontSize: 19, fontWeight: '900', lineHeight: 25 },
    detailBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    detailActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chatBtn: {
      minHeight: 38,
      borderRadius: 10,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    chatBtnText: { color: theme.primaryText, fontSize: 13, fontWeight: '900' },
    estimateBtn: {
      minHeight: 38,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    estimateBtnText: { color: theme.text, fontSize: 13, fontWeight: '900' },
    completeProjectBtn: {
      minHeight: 38,
      borderRadius: 10,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    completeProjectBtnText: { color: theme.primaryText, fontSize: 13, fontWeight: '900' },
    dangerProjectBtn: {
      minHeight: 38,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.danger,
      paddingHorizontal: 12,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    dangerProjectBtnText: { color: theme.danger, fontSize: 13, fontWeight: '900' },
    statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    statusBtnActive: { backgroundColor: theme.text, borderColor: theme.text },
    statusBtnText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    statusBtnTextActive: { color: theme.background },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    summaryItem: {
      width: '48%',
      minHeight: 68,
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 11,
      gap: 5,
    },
    summaryLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '900' },
    summaryValue: { color: theme.text, fontSize: 13, fontWeight: '900', lineHeight: 18 },
    memoBox: { borderRadius: 12, backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border, padding: 12, gap: 7 },
    section: { gap: 10 },
    formSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '900' },
    formHeaderAction: {
      minHeight: 30,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formHeaderActionText: { color: theme.text, fontSize: 12, fontWeight: '900' },
    memberList: { gap: 8 },
    memberRow: {
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    memberIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberInfo: { flex: 1, minWidth: 0 },
    memberName: { color: theme.text, fontSize: 13, fontWeight: '900' },
    memberMeta: { marginTop: 2, color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    removeMemberBtn: {
      minHeight: 30,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeMemberText: { color: theme.danger, fontSize: 12, fontWeight: '900' },
    partnerForm: { gap: 8 },
    partnerModeRow: {
      minHeight: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      padding: 3,
      flexDirection: 'row',
      gap: 4,
    },
    partnerModeBtn: {
      flex: 1,
      minHeight: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    partnerModeBtnActive: { backgroundColor: theme.primary },
    partnerModeText: { color: theme.textMuted, fontSize: 13, fontWeight: '900' },
    partnerModeTextActive: { color: theme.primaryText },
    partnerStoreList: { gap: 8 },
    partnerStoreCard: {
      minHeight: 58,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    partnerStoreCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    partnerStoreInfo: { flex: 1, minWidth: 0, gap: 3 },
    partnerStoreName: { color: theme.text, fontSize: 13, fontWeight: '900' },
    partnerStoreMeta: { color: theme.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    readOnlyBox: {
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 6,
    },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarTitle: { color: theme.text, fontSize: 15, fontWeight: '900' },
    weekdayRow: { flexDirection: 'row' },
    weekdayText: { flex: 1, textAlign: 'center', color: theme.textMuted, fontSize: 11, fontWeight: '900' },
    calendarGrid: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: theme.border },
    calendarWeekRow: { flexDirection: 'row' },
    dayCell: {
      flex: 1,
      height: 40,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingVertical: 4,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    dayCellEmpty: { backgroundColor: theme.surfaceMuted },
    dayCellDraftRange: { backgroundColor: theme.primarySoft },
    dayCellDraftEdge: { borderColor: theme.primary, borderWidth: 2 },
    dayCellSelected: { backgroundColor: theme.primary },
    dayText: { color: theme.text, fontSize: 12, fontWeight: '900' },
    dayTextSelected: { color: theme.primaryText },
    dayMarkerRow: { flexDirection: 'row', gap: 3, minHeight: 5 },
    scheduleDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: theme.primary },
    reportDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: theme.danger },
    selectedDateBox: { borderRadius: 12, backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border, padding: 12, gap: 8 },
    timelineItem: { borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: 10, gap: 4 },
    timelineItemActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    timelineTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    timelineTitle: { color: theme.text, fontSize: 13, fontWeight: '900' },
    scheduleActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scheduleActionBtn: {
      minHeight: 28,
      borderRadius: 999,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleActionText: { color: theme.text, fontSize: 12, fontWeight: '900' },
    scheduleDeleteBtn: {
      minHeight: 28,
      borderRadius: 999,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.danger,
      paddingHorizontal: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleDeleteText: { color: theme.danger, fontSize: 12, fontWeight: '900' },
    rangePickerBox: {
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 10,
      gap: 8,
    },
    rangePickerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    rangeModeBtn: {
      minHeight: 36,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    rangeModeBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    rangeModeText: { color: theme.text, fontSize: 12, fontWeight: '900' },
    rangeModeTextActive: { color: theme.primaryText },
    visibilityToggle: {
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    visibilityToggleActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    visibilityText: { color: theme.textMuted, fontSize: 13, fontWeight: '900' },
    visibilityTextActive: { color: theme.primary },
    reportImageActions: { flexDirection: 'row', gap: 8 },
    previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    previewImageWrap: { width: 58, height: 58, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.surfaceMuted },
    previewImage: { width: '100%', height: '100%' },
    clearImageBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportCard: { borderRadius: 12, backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border, padding: 12, gap: 8 },
    reportCardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    reportHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reportDate: { color: theme.text, fontSize: 14, fontWeight: '900' },
    reportImageList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    reportImageChip: {
      minHeight: 32,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    reportImageText: { color: theme.primary, fontSize: 12, fontWeight: '900' },
  });
}
