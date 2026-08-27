import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { saveCalendarWidgetSnapshot } from '../../lib/calendarWidget';
import { getMyStoreAccessContext, type StoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

type CalendarFilter = 'all' | 'project' | 'estimate' | 'report' | 'personal';
type CalendarViewMode = 'month' | 'week' | 'day';
type CalendarEventKind = 'project' | 'estimate' | 'report' | 'personal';

type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  projectName?: string | null;
  customerName?: string | null;
  location?: string | null;
  memo?: string | null;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  projectId?: string | null;
  reportId?: string | null;
  estimateRequestId?: number | null;
  raw?: any;
};

type PersonalEventForm = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  memo: string;
  sameDay: boolean;
};

type PersonalDateRangeMode = 'start' | 'end';
type TimePickerTarget = 'startTime' | 'endTime';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const FILTERS: { key: CalendarFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'project', label: '현장' },
  { key: 'estimate', label: '견적' },
  { key: 'report', label: '보고서' },
  { key: 'personal', label: '개인' },
];
const VIEW_MODES: { key: CalendarViewMode; label: string }[] = [
  { key: 'month', label: '월' },
  { key: 'week', label: '주' },
  { key: 'day', label: '일' },
];
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayYmd() {
  return formatYmd(new Date());
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

function isValidTime(value: string) {
  if (!value.trim()) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function parseYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function moveMonth(date: Date, diff: number) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
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

function getWeekDates(selectedDate: string) {
  const base = parseYmd(selectedDate);
  const day = base.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - day + index);
    return formatYmd(date);
  });
}

function dateInEvent(dateText: string, event: CalendarEvent) {
  const endDate = event.endDate || event.startDate;
  return dateText >= event.startDate && dateText <= endDate;
}

function eventIntersectsMonth(event: CalendarEvent, monthDate: Date) {
  const start = formatYmd(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const end = formatYmd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
  return event.startDate <= end && (event.endDate || event.startDate) >= start;
}

function formatDateLabel(value: string) {
  if (!isValidYmd(value)) return value;
  return parseYmd(value).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatShortDate(value?: string | null) {
  if (!value || !isValidYmd(value)) return value || '미정';
  return parseYmd(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatEventRange(event: CalendarEvent) {
  const start = formatShortDate(event.startDate);
  const end = event.endDate && event.endDate !== event.startDate ? formatShortDate(event.endDate) : '';
  const dateText = end ? `${start} ~ ${end}` : start;
  const timeText = [formatTime(event.startTime), formatTime(event.endTime)].filter(Boolean).join('-');
  return timeText ? `${dateText} · ${timeText}` : dateText;
}

function getEventTimeText(event: CalendarEvent) {
  const timeText = [formatTime(event.startTime), formatTime(event.endTime)].filter(Boolean).join('-');
  if (timeText) return timeText;
  return getEventKindLabel(event.kind);
}

function formatTime(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function normalizeSearchText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function compactLocation(value?: string | null) {
  const text = String(value || '').trim();
  if (!text) return '';

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  if (parts.length >= 2) return parts.slice(0, 2).join(' ');
  return text;
}

function getEventKindLabel(kind: CalendarEventKind) {
  if (kind === 'project') return '현장';
  if (kind === 'estimate') return '견적';
  if (kind === 'report') return '보고서';
  return '개인';
}

function getScheduleStatusLabel(status?: string | null) {
  if (status === 'in_progress') return '진행';
  if (status === 'done') return '완료';
  if (status === 'canceled') return '취소';
  return '예정';
}

function getCalendarEventDeepLink(event: CalendarEvent) {
  return `interiormarket://my/calendar?date=${event.startDate}`;
}

function getCalendarEventWidgetTitle(event: CalendarEvent) {
  if (event.kind === 'personal') return event.title;
  return [event.customerName, event.location, event.title].filter(Boolean).join(' · ');
}

function mapCalendarEventForWidget(event: CalendarEvent) {
  return {
    id: event.id,
    kind: event.kind,
    title: getCalendarEventWidgetTitle(event),
    subtitle: event.projectName || formatEventRange(event),
    timeText: getEventTimeText(event),
    startDate: event.startDate,
    endDate: event.endDate || event.startDate,
    url: getCalendarEventDeepLink(event),
  };
}

function makeCalendarWidgetSnapshot(events: CalendarEvent[]) {
  const today = getTodayYmd();
  const monthStart = formatYmd(new Date(parseYmd(today).getFullYear(), parseYmd(today).getMonth(), 1));
  const monthEnd = formatYmd(new Date(parseYmd(today).getFullYear(), parseYmd(today).getMonth() + 1, 0));
  const month = today.slice(0, 7);
  const title = parseYmd(today).toLocaleDateString('ko-KR', {
    month: 'long',
  });
  const todayEvents = events.filter((event) => dateInEvent(today, event));
  const upcomingEvents = events.filter((event) => (event.endDate || event.startDate) >= today);
  const monthEvents = events.filter((event) => (
    event.startDate <= monthEnd && (event.endDate || event.startDate) >= monthStart
  ));
  const agendaEvents = (todayEvents.length > 0 ? todayEvents : upcomingEvents).slice(0, 6);

  return {
    title: `${title} 일정표`,
    month,
    agendaTitle: todayEvents.length > 0 ? '오늘 일정' : '다가오는 일정',
    updatedAt: new Date().toISOString(),
    events: monthEvents.slice(0, 120).map(mapCalendarEventForWidget),
    agendaEvents: agendaEvents.map(mapCalendarEventForWidget),
  };
}

function canReadInternalReports(project: any, access: StoreAccessContext | null, userId?: string | null) {
  if (!project || !userId) return false;

  if (project.store_user_id === userId || project.assigned_staff_user_id === userId) return true;

  if (access?.canManageStore && project.store_user_id === access.storeUserId) return true;

  return (project.project_members || []).some((member: any) => (
    member.member_user_id === userId &&
    member.invitation_status === 'accepted' &&
    ['owner', 'manager', 'employee', 'partner'].includes(member.role)
  ));
}

function canWriteProject(project: any, access: StoreAccessContext | null, userId?: string | null) {
  if (!project || !userId) return false;

  if (project.store_user_id === userId || project.assigned_staff_user_id === userId) return true;

  if (access?.canManageStore && project.store_user_id === access.storeUserId) return true;

  return (project.project_members || []).some((member: any) => (
    member.member_user_id === userId &&
    member.invitation_status === 'accepted' &&
    ['owner', 'manager', 'employee', 'partner'].includes(member.role)
  ));
}

function getProjectCustomerName(project: any) {
  return (
    project?.store_customers?.name ||
    project?.estimate_requests?.applicant_name ||
    project?.name ||
    '고객 미지정'
  );
}

function getProjectLocation(project: any) {
  return (
    project?.address ||
    project?.store_customers?.address ||
    project?.estimate_requests?.address ||
    project?.estimate_requests?.region ||
    ''
  );
}

function buildProjectEvents(projects: any[], access: StoreAccessContext | null, userId?: string | null) {
  const events: CalendarEvent[] = [];

  projects.forEach((project) => {
    const customerName = getProjectCustomerName(project);
    const location = compactLocation(getProjectLocation(project));
    const projectName = project.name || project.estimate_requests?.title || '현장';

    (project.project_schedules || []).forEach((schedule: any) => {
      if (!schedule.start_date || !isValidYmd(schedule.start_date)) return;

      events.push({
        id: `project-${schedule.id}`,
        kind: 'project',
        title: schedule.title || projectName,
        projectName,
        customerName,
        location,
        memo: schedule.memo,
        startDate: schedule.start_date,
        endDate: schedule.end_date || schedule.start_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        status: schedule.status,
        projectId: project.id,
        raw: { project, schedule },
      });
    });

    const canReadInternal = canReadInternalReports(project, access, userId);
    (project.daily_reports || [])
      .filter((report: any) => canReadInternal || !!report.customer_visible)
      .forEach((report: any) => {
        if (!report.report_date || !isValidYmd(report.report_date)) return;

        events.push({
          id: `report-${report.id}`,
          kind: 'report',
          title: report.work_content || '일일보고서',
          projectName,
          customerName,
          location,
          memo: report.memo || report.issues,
          startDate: report.report_date,
          endDate: report.report_date,
          status: report.customer_visible ? 'customer' : 'internal',
          projectId: project.id,
          reportId: String(report.id),
          raw: { project, report },
        });
      });
  });

  return events;
}

function buildEstimateEvents(
  requests: any[],
  access: StoreAccessContext | null,
  userId?: string | null
): CalendarEvent[] {
  return requests
    .filter((item) => {
      if (!item.desired_date || !isValidYmd(item.desired_date)) return false;
      if (access?.storeUserId) {
        return (
          item.assigned_store_user_id === access.storeUserId ||
          item.preferred_store_user_id === access.storeUserId ||
          item.assigned_staff_user_id === userId ||
          item.preferred_staff_user_id === userId
        );
      }
      return item.user_id === userId;
    })
    .map((item) => ({
      id: `estimate-${item.id}`,
      kind: 'estimate' as const,
      title: item.title || item.category || '견적문의',
      customerName: item.applicant_name || '신청자 미입력',
      location: compactLocation(item.address || item.region),
      memo: item.preferred_contact ? `연락방법 ${item.preferred_contact}` : null,
      startDate: item.desired_date,
      endDate: item.desired_date,
      status: item.status,
      estimateRequestId: Number(item.id),
      raw: item,
    }));
}

function buildPersonalEvents(rows: any[]): CalendarEvent[] {
  return rows
    .filter((item) => item.start_date && isValidYmd(item.start_date))
    .map((item) => ({
      id: `personal-${item.id}`,
      kind: 'personal' as const,
      title: item.title || '개인 일정',
      memo: item.memo,
      startDate: item.start_date,
      endDate: item.end_date || item.start_date,
      startTime: item.start_time,
      endTime: item.end_time,
      status: item.status,
      raw: item,
    }));
}

function makeEmptyForm(dateText: string): PersonalEventForm {
  return {
    title: '',
    startDate: dateText,
    endDate: dateText,
    startTime: '',
    endTime: '',
    memo: '',
    sameDay: true,
  };
}

function makeMonthDate(dateText: string) {
  const date = isValidYmd(dateText) ? parseYmd(dateText) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getTimeParts(value?: string | null) {
  const formatted = formatTime(value);
  if (!formatted) {
    return { hour: '09', minute: '00' };
  }

  const [hour = '09', minute = '00'] = formatted.split(':');
  return {
    hour: hour.padStart(2, '0'),
    minute: minute.padStart(2, '0'),
  };
}

function showCalendarAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmCalendarAction(title: string, message: string) {
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

export default function CalendarScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = getTodayYmd();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [storeAccess, setStoreAccess] = useState<StoreAccessContext | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPersonalId, setEditingPersonalId] = useState<string | null>(null);
  const [personalForm, setPersonalForm] = useState<PersonalEventForm>(() => makeEmptyForm(today));
  const [formCalendarMonth, setFormCalendarMonth] = useState(() => makeMonthDate(today));
  const [personalDateRangeMode, setPersonalDateRangeMode] = useState<PersonalDateRangeMode>('start');
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const routeDate = Array.isArray(params.date) ? params.date[0] : params.date;

  useEffect(() => {
    if (!routeDate || !isValidYmd(routeDate)) return;

    setSelectedDate(routeDate);
    setMonthDate(makeMonthDate(routeDate));
  }, [routeDate]);

  const loadCalendar = useCallback(async () => {
    if (!user?.id) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setMessage('');
    setLoading(true);

    const access = await getMyStoreAccessContext();
    setStoreAccess(access);

    const calendarClient = supabase as any;

    const [projectResult, estimateResult, personalResult] = await Promise.all([
      supabase
        .from('store_projects')
        .select(`
          id,
          name,
          store_user_id,
          assigned_staff_user_id,
          estimate_request_id,
          estimate_quote_id,
          address,
          start_date,
          end_date,
          status,
          work_summary,
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
            region
          ),
          project_members (
            id,
            member_user_id,
            role,
            invitation_status
          ),
          project_schedules (
            id,
            title,
            start_date,
            end_date,
            start_time,
            end_time,
            status,
            memo
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
            daily_report_images (
              id,
              image_path
            )
          )
        `)
        .order('updated_at', { ascending: false })
        .limit(200),
      supabase
        .from('estimate_requests')
        .select(
          'id, user_id, title, category, status, region, address, desired_date, preferred_contact, applicant_name, applicant_phone, preferred_store_user_id, assigned_store_user_id, preferred_staff_user_id, assigned_staff_user_id'
        )
        .neq('status', 'hidden')
        .not('desired_date', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200),
      calendarClient
        .from('calendar_events')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('start_date', { ascending: true })
        .limit(500),
    ]);

    if (projectResult.error) {
      console.log('전체 일정 현장 조회 실패:', projectResult.error);
    }

    if (estimateResult.error) {
      console.log('전체 일정 견적 조회 실패:', estimateResult.error);
    }

    if (personalResult.error) {
      console.log('개인 일정 조회 실패:', personalResult.error);
      setMessage(
        personalResult.error.code === '42P01' || String(personalResult.error.message || '').includes('calendar_events')
          ? '개인 일정을 사용하려면 Supabase SQL에서 calendar_events.sql을 먼저 실행해 주세요.'
          : personalResult.error.message
      );
    }

    const nextEvents = [
      ...buildProjectEvents((projectResult.data || []) as any[], access, user.id),
      ...buildEstimateEvents((estimateResult.data || []) as any[], access, user.id),
      ...buildPersonalEvents(personalResult.error ? [] : (personalResult.data || [])),
    ].sort((a, b) => {
      const dateCompare = a.startDate.localeCompare(b.startDate);
      if (dateCompare !== 0) return dateCompare;
      return String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'));
    });

    setEvents(nextEvents);
    void saveCalendarWidgetSnapshot(makeCalendarWidgetSnapshot(nextEvents));
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadCalendar();
    }, [loadCalendar])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCalendar();
    setRefreshing(false);
  };

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = normalizeSearchText(keyword);

    return events.filter((event) => {
      if (filter !== 'all' && event.kind !== filter) return false;
      if (!eventIntersectsMonth(event, monthDate)) return false;
      if (!normalizedKeyword) return true;

      return [
        event.title,
        event.projectName,
        event.customerName,
        event.location,
        event.memo,
      ].some((value) => normalizeSearchText(value).includes(normalizedKeyword));
    });
  }, [events, filter, keyword, monthDate]);

  const monthCells = useMemo(() => getMonthCells(monthDate), [monthDate]);
  const calendarWeeks = useMemo(() => {
    const weeks: typeof monthCells[] = [];
    for (let index = 0; index < monthCells.length; index += 7) {
      weeks.push(monthCells.slice(index, index + 7));
    }
    return weeks;
  }, [monthCells]);
  const formMonthCells = useMemo(() => getMonthCells(formCalendarMonth), [formCalendarMonth]);
  const formCalendarWeeks = useMemo(() => {
    const weeks: typeof formMonthCells[] = [];
    for (let index = 0; index < formMonthCells.length; index += 7) {
      weeks.push(formMonthCells.slice(index, index + 7));
    }
    return weeks;
  }, [formMonthCells]);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const selectedDateEvents = useMemo(() => {
    return filteredEvents.filter((event) => dateInEvent(selectedDate, event));
  }, [filteredEvents, selectedDate]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'day') return [selectedDate];
    if (viewMode === 'week') return weekDates;
    return [];
  }, [selectedDate, viewMode, weekDates]);
  const groupedVisibleEvents = useMemo(() => {
    return visibleDates.map((dateText) => ({
      dateText,
      events: filteredEvents.filter((event) => dateInEvent(dateText, event)),
    }));
  }, [filteredEvents, visibleDates]);
  const timePickerValue = timePickerTarget ? personalForm[timePickerTarget] : '';
  const timePickerParts = getTimeParts(timePickerValue);

  const goToToday = () => {
    const nextDate = parseYmd(today);
    setSelectedDate(today);
    setMonthDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    if (!editingPersonalId) {
      setPersonalForm((prev) => ({ ...prev, startDate: today, endDate: '' }));
    }
  };

  const selectDate = (dateText: string) => {
    setSelectedDate(dateText);
    if (!editingPersonalId && !personalForm.title.trim()) {
      setPersonalForm((prev) => ({ ...prev, startDate: dateText, endDate: '' }));
    }
  };

  const openNewPersonalForm = () => {
    setEditingPersonalId(null);
    setPersonalForm(makeEmptyForm(selectedDate));
    setFormCalendarMonth(makeMonthDate(selectedDate));
    setPersonalDateRangeMode('start');
    setFormOpen(true);
  };

  const startEditPersonal = (event: CalendarEvent) => {
    const row = event.raw || {};
    setEditingPersonalId(String(row.id));
    setPersonalForm({
      title: row.title || event.title || '',
      startDate: row.start_date || event.startDate,
      endDate: row.end_date || event.endDate || row.start_date || event.startDate,
      startTime: formatTime(row.start_time || event.startTime),
      endTime: formatTime(row.end_time || event.endTime),
      memo: row.memo || '',
      sameDay: !row.end_date || row.end_date === (row.start_date || event.startDate),
    });
    setFormCalendarMonth(makeMonthDate(row.start_date || event.startDate));
    setPersonalDateRangeMode('start');
    setFormOpen(true);
  };

  const resetPersonalForm = () => {
    setEditingPersonalId(null);
    setPersonalForm(makeEmptyForm(selectedDate));
    setFormCalendarMonth(makeMonthDate(selectedDate));
    setPersonalDateRangeMode('start');
    setTimePickerTarget(null);
    setFormOpen(false);
  };

  const toggleSameDay = () => {
    setPersonalForm((prev) => {
      const nextSameDay = !prev.sameDay;
      return {
        ...prev,
        sameDay: nextSameDay,
        endDate: nextSameDay ? prev.startDate : prev.endDate === prev.startDate ? '' : prev.endDate,
      };
    });
    setPersonalDateRangeMode('start');
  };

  const selectPersonalFormDate = (dateText: string) => {
    setPersonalForm((prev) => {
      if (prev.sameDay) {
        return {
          ...prev,
          startDate: dateText,
          endDate: dateText,
        };
      }

      if (personalDateRangeMode === 'start') {
        return {
          ...prev,
          startDate: dateText,
          endDate: prev.endDate && prev.endDate >= dateText ? prev.endDate : '',
        };
      }

      if (dateText < prev.startDate) {
        return {
          ...prev,
          startDate: dateText,
          endDate: '',
        };
      }

      return {
        ...prev,
        endDate: dateText,
      };
    });

    if (!personalForm.sameDay) {
      setPersonalDateRangeMode((prev) => (prev === 'start' ? 'end' : 'start'));
    }
  };

  const setPersonalTime = (target: TimePickerTarget, hour: string, minute: string) => {
    setPersonalForm((prev) => ({
      ...prev,
      [target]: `${hour}:${minute}`,
    }));
  };

  const clearPersonalTime = (target: TimePickerTarget) => {
    setPersonalForm((prev) => ({
      ...prev,
      [target]: '',
    }));
    setTimePickerTarget(null);
  };

  const savePersonalEvent = async () => {
    if (!user?.id || saving) return;

    const title = personalForm.title.trim();
    const startDate = personalForm.startDate.trim();
    const endDate = personalForm.endDate.trim();
    const startTime = personalForm.startTime.trim();
    const endTime = personalForm.endTime.trim();

    if (!title) {
      showCalendarAlert('개인 일정', '일정 제목을 입력해 주세요.');
      return;
    }

    if (!isValidYmd(startDate)) {
      showCalendarAlert('개인 일정', '시작일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (!personalForm.sameDay && !endDate) {
      showCalendarAlert('개인 일정', '기간 일정은 종료일을 선택해 주세요.');
      return;
    }

    if (endDate && !isValidYmd(endDate)) {
      showCalendarAlert('개인 일정', '종료일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    if (endDate && endDate < startDate) {
      showCalendarAlert('개인 일정', '종료일은 시작일 이후로 입력해 주세요.');
      return;
    }

    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      showCalendarAlert('개인 일정', '시간은 HH:mm 형식으로 입력해 주세요.');
      return;
    }

    const payload = {
      owner_user_id: user.id,
      store_user_id: storeAccess?.storeUserId || null,
      event_type: 'personal',
      visibility: 'private',
      title,
      memo: personalForm.memo.trim() || null,
      start_date: startDate,
      end_date: endDate || null,
      start_time: startTime || null,
      end_time: endTime || null,
      status: 'scheduled',
      created_by: user.id,
    };
    const calendarClient = supabase as any;

    setSaving(true);

    const result = editingPersonalId
      ? await calendarClient
          .from('calendar_events')
          .update(payload)
          .eq('id', editingPersonalId)
          .eq('owner_user_id', user.id)
      : await calendarClient.from('calendar_events').insert(payload);

    setSaving(false);

    if (result.error) {
      showCalendarAlert(editingPersonalId ? '개인 일정 수정 실패' : '개인 일정 저장 실패', result.error.message);
      return;
    }

    resetPersonalForm();
    await loadCalendar();
  };

  const deletePersonalEvent = async (event: CalendarEvent) => {
    if (!user?.id || event.kind !== 'personal') return;

    const rowId = event.raw?.id;
    if (!rowId) return;

    const ok = await confirmCalendarAction('개인 일정 삭제', `"${event.title}" 일정을 삭제할까요?`);
    if (!ok) return;

    const calendarClient = supabase as any;
    const { error } = await calendarClient
      .from('calendar_events')
      .delete()
      .eq('id', rowId)
      .eq('owner_user_id', user.id);

    if (error) {
      showCalendarAlert('개인 일정 삭제 실패', error.message);
      return;
    }

    await loadCalendar();
  };

  const openEvent = (event: CalendarEvent) => {
    if (event.kind === 'project' && event.projectId) {
      router.push(`/store/projects?projectId=${event.projectId}` as any);
      return;
    }

    if (event.kind === 'report' && event.projectId && event.reportId) {
      router.push(`/store/projects?projectId=${event.projectId}&reportId=${event.reportId}` as any);
      return;
    }

    if (event.kind === 'estimate' && event.estimateRequestId && storeAccess?.storeUserId) {
      router.push(`/store/estimates?requestId=${event.estimateRequestId}` as any);
    }
  };

  const openReportWriter = (event: CalendarEvent) => {
    const projectId = event.projectId || event.raw?.project?.id;
    if (!projectId) return;

    router.push(`/store/projects?projectId=${projectId}&action=dailyReport&focus=form` as any);
  };

  const canAddReportForEvent = (event: CalendarEvent) => {
    const project = event.raw?.project;
    return canWriteProject(project, storeAccess, user?.id);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: '일정표' }} />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>로그인이 필요합니다.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/login?redirect=/my/calendar' as any)}>
            <Text style={styles.primaryText}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '일정표' }} />
      <Modal
        visible={!!timePickerTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setTimePickerTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.timePickerSheet}>
            <View style={styles.formHeader}>
              <Text style={styles.sectionTitle}>
                {timePickerTarget === 'startTime' ? '시작 시간' : '종료 시간'}
              </Text>
              <TouchableOpacity onPress={() => setTimePickerTarget(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.selectedTimeBox}>
              <Text style={styles.selectedTimeText}>
                {timePickerTarget ? personalForm[timePickerTarget] || '시간 없음' : ''}
              </Text>
            </View>

            {timePickerTarget ? (
              <View style={styles.timeDialRow}>
                <ScrollView style={styles.timeDialColumn} contentContainerStyle={styles.timeDialContent}>
                  {HOURS.map((hour) => {
                    const active = timePickerParts.hour === hour;
                    return (
                      <TouchableOpacity
                        key={hour}
                        style={[styles.timeDialItem, active && styles.timeDialItemActive]}
                        onPress={() => setPersonalTime(timePickerTarget, hour, timePickerParts.minute)}
                      >
                        <Text style={[styles.timeDialText, active && styles.timeDialTextActive]}>
                          {hour}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.timeColon}>:</Text>

                <ScrollView style={styles.timeDialColumn} contentContainerStyle={styles.timeDialContent}>
                  {MINUTES.map((minute) => {
                    const active = timePickerParts.minute === minute;
                    return (
                      <TouchableOpacity
                        key={minute}
                        style={[styles.timeDialItem, active && styles.timeDialItemActive]}
                        onPress={() => setPersonalTime(timePickerTarget, timePickerParts.hour, minute)}
                      >
                        <Text style={[styles.timeDialText, active && styles.timeDialTextActive]}>
                          {minute}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.modalActionRow}>
              {timePickerTarget ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => clearPersonalTime(timePickerTarget)}
                >
                  <Text style={styles.secondaryText}>시간 없음</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setTimePickerTarget(null)}>
                <Text style={styles.primaryText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>일정표</Text>
            <Text style={styles.desc}>
              {storeAccess?.storeUserId ? '업무 일정과 개인 일정을 함께 봅니다.' : '내 견적, 현장, 개인 일정을 봅니다.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
            <Text style={styles.todayText}>오늘</Text>
          </TouchableOpacity>
        </View>

        {/* <View style={styles.segmentRow}>
          {VIEW_MODES.map((item) => {
            const active = viewMode === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setViewMode(item.key)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View> */}

        <View style={styles.monthHeader}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setMonthDate((prev) => moveMonth(prev, -1))}
          >
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {monthDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
          </Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setMonthDate((prev) => moveMonth(prev, 1))}
          >
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterScrollBox}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="현장명, 고객명, 지역, 작업명 검색"
          placeholderTextColor={theme.textSubtle}
        />

        <View style={styles.calendarBox}>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>{day}</Text>
            ))}
          </View>
          {calendarWeeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
              {week.map((cell) => {
                const dateText = cell.dateText;
                const active = !!dateText && dateText === selectedDate;
                const isToday = !!dateText && dateText === today;
                const dayEvents = dateText
                  ? filteredEvents.filter((event) => dateInEvent(dateText, event)).slice(0, 4)
                  : [];

                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[
                      styles.dayCell,
                      !dateText && styles.emptyDayCell,
                      active && styles.dayCellActive,
                    ]}
                    disabled={!dateText}
                    onPress={() => dateText && selectDate(dateText)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && styles.todayDayText,
                        active && styles.dayTextActive,
                      ]}
                    >
                      {cell.day || ''}
                    </Text>
                    <View style={styles.dayDots}>
                      {dayEvents.map((event) => (
                        <View
                          key={`${dateText}-${event.id}`}
                          style={[styles.eventDot, styles[`${event.kind}Dot`]]}
                        />
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {message ? <Text style={styles.messageText}>{message}</Text> : null}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={openNewPersonalForm}>
            <Ionicons name="add" size={18} color={theme.primaryText} />
            <Text style={styles.primaryText}>개인 일정</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={theme.text} />
            <Text style={styles.secondaryText}>새로고침</Text>
          </TouchableOpacity>
        </View>

        {formOpen ? (
          <View style={styles.formBox}>
            <View style={styles.formHeader}>
              <Text style={styles.sectionTitle}>{editingPersonalId ? '개인 일정 수정' : '개인 일정 추가'}</Text>
              <TouchableOpacity onPress={resetPersonalForm} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={personalForm.title}
              onChangeText={(text) => setPersonalForm((prev) => ({ ...prev, title: text }))}
              placeholder="일정 제목"
              placeholderTextColor={theme.textSubtle}
            />

            <View style={styles.formSubsection}>
              <View style={styles.dateSummaryRow}>
                <TouchableOpacity
                  style={[
                    styles.dateSummaryBtn,
                    personalDateRangeMode === 'start' && styles.dateSummaryBtnActive,
                  ]}
                  onPress={() => setPersonalDateRangeMode('start')}
                >
                  <Text style={styles.dateSummaryLabel}>시작일</Text>
                  <Text style={styles.dateSummaryValue}>{formatShortDate(personalForm.startDate)}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dateSummaryBtn,
                    !personalForm.sameDay &&
                      personalDateRangeMode === 'end' &&
                      styles.dateSummaryBtnActive,
                    personalForm.sameDay && styles.disabled,
                  ]}
                  onPress={() => {
                    if (!personalForm.sameDay) setPersonalDateRangeMode('end');
                  }}
                  disabled={personalForm.sameDay}
                >
                  <Text style={styles.dateSummaryLabel}>종료일</Text>
                  <Text style={styles.dateSummaryValue}>
                    {personalForm.sameDay
                      ? '당일'
                      : personalForm.endDate
                        ? formatShortDate(personalForm.endDate)
                        : '선택'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.checkboxRow} onPress={toggleSameDay} activeOpacity={0.85}>
                <View style={[styles.checkbox, personalForm.sameDay && styles.checkboxActive]}>
                  {personalForm.sameDay ? (
                    <Ionicons name="checkmark" size={16} color={theme.primaryText} />
                  ) : null}
                </View>
                <Text style={styles.checkboxText}>당일 일정</Text>
              </TouchableOpacity>

              <View style={styles.formCalendarHeader}>
                <TouchableOpacity
                  style={styles.smallIconBtn}
                  onPress={() => setFormCalendarMonth((prev) => moveMonth(prev, -1))}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.formCalendarTitle}>
                  {formCalendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
                </Text>
                <TouchableOpacity
                  style={styles.smallIconBtn}
                  onPress={() => setFormCalendarMonth((prev) => moveMonth(prev, 1))}
                >
                  <Ionicons name="chevron-forward" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.formCalendarBox}>
                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map((day) => (
                    <Text key={day} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>
                {formCalendarWeeks.map((week, weekIndex) => (
                  <View key={`form-week-${weekIndex}`} style={styles.calendarWeek}>
                    {week.map((cell) => {
                      const dateText = cell.dateText;
                      const isStart = !!dateText && dateText === personalForm.startDate;
                      const isEnd = !!dateText && dateText === personalForm.endDate;
                      const rangeEnd = personalForm.endDate || personalForm.startDate;
                      const inRange = !!dateText && dateText >= personalForm.startDate && dateText <= rangeEnd;
                      const active = isStart || (!personalForm.sameDay && isEnd);

                      return (
                        <TouchableOpacity
                          key={cell.key}
                          style={[
                            styles.formDayCell,
                            !dateText && styles.emptyDayCell,
                            inRange && !active && styles.formDayCellInRange,
                            active && styles.formDayCellActive,
                          ]}
                          disabled={!dateText}
                          onPress={() => dateText && selectPersonalFormDate(dateText)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.formDayText,
                              active && styles.formDayTextActive,
                            ]}
                          >
                            {cell.day || ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.timeButtonRow}>
              <TouchableOpacity
                style={styles.timeSelectBtn}
                onPress={() => setTimePickerTarget('startTime')}
              >
                <Text style={styles.dateSummaryLabel}>시작 시간</Text>
                <Text style={styles.dateSummaryValue}>{personalForm.startTime || '없음'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timeSelectBtn}
                onPress={() => setTimePickerTarget('endTime')}
              >
                <Text style={styles.dateSummaryLabel}>종료 시간</Text>
                <Text style={styles.dateSummaryValue}>{personalForm.endTime || '없음'}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={personalForm.memo}
              onChangeText={(text) => setPersonalForm((prev) => ({ ...prev, memo: text }))}
              placeholder="메모"
              placeholderTextColor={theme.textSubtle}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={[styles.primaryBtn, saving && styles.disabled]} onPress={savePersonalEvent} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? '저장 중...' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : viewMode === 'month' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{formatDateLabel(selectedDate)} 일정</Text>
            {selectedDateEvents.length === 0 ? (
              <Text style={styles.emptyText}>선택한 날짜에 표시할 일정이 없습니다.</Text>
            ) : (
              selectedDateEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  theme={theme}
                  styles={styles}
                  onOpen={() => openEvent(event)}
                  onWriteReport={() => openReportWriter(event)}
                  onEditPersonal={() => startEditPersonal(event)}
                  onDeletePersonal={() => deletePersonalEvent(event)}
                  canWriteReport={canAddReportForEvent(event)}
                />
              ))
            )}
          </View>
        ) : (
          groupedVisibleEvents.map((group) => (
            <View key={group.dateText} style={styles.section}>
              <Text style={styles.sectionTitle}>{formatDateLabel(group.dateText)}</Text>
              {group.events.length === 0 ? (
                <Text style={styles.emptyText}>표시할 일정이 없습니다.</Text>
              ) : (
                group.events.map((event) => (
                  <EventCard
                    key={`${group.dateText}-${event.id}`}
                    event={event}
                    theme={theme}
                    styles={styles}
                    onOpen={() => openEvent(event)}
                    onWriteReport={() => openReportWriter(event)}
                    onEditPersonal={() => startEditPersonal(event)}
                    onDeletePersonal={() => deletePersonalEvent(event)}
                    canWriteReport={canAddReportForEvent(event)}
                  />
                ))
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventCard({
  event,
  theme,
  styles,
  onOpen,
  onWriteReport,
  onEditPersonal,
  onDeletePersonal,
  canWriteReport,
}: {
  event: CalendarEvent;
  theme: AppPalette;
  styles: ReturnType<typeof createStyles>;
  onOpen: () => void;
  onWriteReport: () => void;
  onEditPersonal: () => void;
  onDeletePersonal: () => void;
  canWriteReport: boolean;
}) {
  const titleParts =
    event.kind === 'personal'
      ? [event.title]
      : [event.customerName, event.location, event.title].filter(Boolean);
  const title = titleParts.join(' · ');
  const canOpen = event.kind !== 'personal' && (event.projectId || event.estimateRequestId);

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventHeader}>
        <View style={[styles.eventTypeStripe, styles[`${event.kind}Stripe`]]} />
        <View style={styles.eventMain}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventTitle} numberOfLines={2}>{title}</Text>
            <Text style={[styles.eventBadge, styles[`${event.kind}Badge`]]}>
              {getEventKindLabel(event.kind)}
            </Text>
          </View>
          {event.projectName && event.projectName !== event.customerName ? (
            <Text style={styles.eventMeta} numberOfLines={1}>현장 {event.projectName}</Text>
          ) : null}
          <Text style={styles.eventMeta}>
            {formatEventRange(event)}
            {event.kind === 'project' ? ` · ${getScheduleStatusLabel(event.status)}` : ''}
            {event.kind === 'report' ? ` · ${event.status === 'customer' ? '고객 공개' : '내부'}` : ''}
          </Text>
          {event.memo ? <Text style={styles.eventMemo} numberOfLines={2}>{event.memo}</Text> : null}
        </View>
      </View>

      <View style={styles.cardActionRow}>
        {canOpen ? (
          <TouchableOpacity style={styles.smallBtn} onPress={onOpen}>
            <Ionicons
              name={event.kind === 'estimate' ? 'document-text-outline' : 'business-outline'}
              size={15}
              color={theme.text}
            />
            <Text style={styles.smallBtnText}>
              {event.kind === 'estimate' ? '견적 보기' : event.kind === 'report' ? '보고서 보기' : '현장 보기'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {event.projectId && canWriteReport ? (
          <TouchableOpacity style={styles.smallBtn} onPress={onWriteReport}>
            <Ionicons name="create-outline" size={15} color={theme.text} />
            <Text style={styles.smallBtnText}>보고서 작성</Text>
          </TouchableOpacity>
        ) : null}

        {event.kind === 'personal' ? (
          <>
            <TouchableOpacity style={styles.smallBtn} onPress={onEditPersonal}>
              <Ionicons name="pencil-outline" size={15} color={theme.text} />
              <Text style={styles.smallBtnText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={onDeletePersonal}>
              <Ionicons name="trash-outline" size={15} color={theme.danger} />
              <Text style={styles.deleteBtnText}>삭제</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      paddingBottom: 120,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    title: {
      color: theme.text,
      fontSize: 25,
      fontWeight: '900',
    },
    desc: {
      marginTop: 4,
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    todayBtn: {
      borderRadius: 8,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    todayText: {
      color: theme.primaryText,
      fontWeight: '900',
      fontSize: 13,
    },
    segmentRow: {
      flexDirection: 'row',
      borderRadius: 8,
      backgroundColor: theme.surfaceMuted,
      padding: 4,
      marginBottom: 12,
    },
    segmentBtn: {
      flex: 1,
      minHeight: 36,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentBtnActive: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    segmentText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    segmentTextActive: {
      color: theme.text,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
    },
    filterScrollBox: {
      marginHorizontal: -16,
      marginBottom: 10,
    },
    filterRow: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.text,
      borderColor: theme.text,
    },
    filterChipText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    filterChipTextActive: {
      color: theme.background,
    },
    searchInput: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.text,
      paddingHorizontal: 12,
      fontSize: 14,
      marginBottom: 12,
    },
    calendarBox: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      backgroundColor: theme.surface,
    },
    weekdayRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surfaceMuted,
    },
    weekdayText: {
      flex: 1,
      paddingVertical: 9,
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    calendarWeek: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSoft,
    },
    dayCell: {
      flex: 1,
      minHeight: 56,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRightWidth: 1,
      borderRightColor: theme.borderSoft,
    },
    emptyDayCell: {
      backgroundColor: theme.surfaceMuted,
    },
    dayCellActive: {
      backgroundColor: theme.primarySoft,
    },
    dayText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    todayDayText: {
      color: theme.primary,
      fontWeight: '900',
    },
    dayTextActive: {
      color: theme.text,
    },
    dayDots: {
      minHeight: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 2,
    },
    eventDot: {
      width: 5,
      height: 5,
      borderRadius: 999,
    },
    projectDot: {
      backgroundColor: '#166534',
    },
    estimateDot: {
      backgroundColor: '#b45309',
    },
    reportDot: {
      backgroundColor: '#0e7490',
    },
    personalDot: {
      backgroundColor: '#7c3aed',
    },
    messageText: {
      marginTop: 10,
      color: theme.warningText,
      backgroundColor: theme.warningBg,
      borderRadius: 8,
      padding: 10,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 18,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      marginBottom: 14,
    },
    primaryBtn: {
      minHeight: 42,
      borderRadius: 8,
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    primaryText: {
      color: theme.primaryText,
      fontSize: 14,
      fontWeight: '900',
    },
    secondaryBtn: {
      minHeight: 42,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    secondaryText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    formBox: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 14,
      marginBottom: 16,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    closeBtn: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      marginTop: 10,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    inputHalf: {
      flex: 1,
    },
    formSubsection: {
      marginTop: 12,
      gap: 10,
    },
    dateSummaryRow: {
      flexDirection: 'row',
      gap: 8,
    },
    dateSummaryBtn: {
      flex: 1,
      minHeight: 58,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 9,
      justifyContent: 'center',
    },
    dateSummaryBtnActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    dateSummaryLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    dateSummaryValue: {
      marginTop: 4,
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    checkboxRow: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    checkboxText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    formCalendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    smallIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formCalendarTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    formCalendarBox: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      backgroundColor: theme.surface,
    },
    formDayCell: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: theme.borderSoft,
    },
    formDayCellInRange: {
      backgroundColor: theme.primarySoft,
    },
    formDayCellActive: {
      backgroundColor: theme.primary,
    },
    formDayText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    formDayTextActive: {
      color: theme.primaryText,
      fontWeight: '900',
    },
    timeButtonRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    timeSelectBtn: {
      flex: 1,
      minHeight: 58,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 9,
      justifyContent: 'center',
    },
    textarea: {
      minHeight: 92,
    },
    section: {
      marginTop: 8,
      gap: 10,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    emptyText: {
      borderRadius: 8,
      backgroundColor: theme.surfaceMuted,
      color: theme.textMuted,
      padding: 14,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 12,
    },
    centerBox: {
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    eventCard: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
    },
    eventHeader: {
      flexDirection: 'row',
      gap: 10,
    },
    eventTypeStripe: {
      width: 4,
      borderRadius: 999,
    },
    projectStripe: {
      backgroundColor: '#166534',
    },
    estimateStripe: {
      backgroundColor: '#b45309',
    },
    reportStripe: {
      backgroundColor: '#0e7490',
    },
    personalStripe: {
      backgroundColor: '#7c3aed',
    },
    eventMain: {
      flex: 1,
    },
    eventTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    eventTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
      lineHeight: 20,
    },
    eventBadge: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '900',
    },
    projectBadge: {
      backgroundColor: theme.primarySoft,
      color: theme.primary,
    },
    estimateBadge: {
      backgroundColor: theme.scheme === 'dark' ? 'rgba(180,83,9,0.24)' : '#fff7ed',
      color: theme.scheme === 'dark' ? '#fdba74' : '#9a3412',
    },
    reportBadge: {
      backgroundColor: theme.scheme === 'dark' ? 'rgba(14,116,144,0.24)' : '#ecfeff',
      color: theme.scheme === 'dark' ? '#67e8f9' : '#0e7490',
    },
    personalBadge: {
      backgroundColor: theme.scheme === 'dark' ? 'rgba(124,58,237,0.24)' : '#f3e8ff',
      color: theme.scheme === 'dark' ? '#ddd6fe' : '#6d28d9',
    },
    eventMeta: {
      marginTop: 4,
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    eventMemo: {
      marginTop: 8,
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
    },
    cardActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
      marginLeft: 14,
    },
    smallBtn: {
      minHeight: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    smallBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
    },
    deleteBtn: {
      minHeight: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    deleteBtnText: {
      color: theme.danger,
      fontSize: 12,
      fontWeight: '900',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    timePickerSheet: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '84%',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 14,
    },
    selectedTimeBox: {
      minHeight: 50,
      borderRadius: 8,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      marginBottom: 12,
    },
    selectedTimeText: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '900',
    },
    timeDialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 230,
    },
    timeDialColumn: {
      flex: 1,
      maxHeight: 230,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
    },
    timeDialContent: {
      padding: 8,
      gap: 6,
    },
    timeDialItem: {
      minHeight: 38,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeDialItemActive: {
      backgroundColor: theme.primary,
    },
    timeDialText: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
    },
    timeDialTextActive: {
      color: theme.primaryText,
    },
    timeColon: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '900',
    },
    modalActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 14,
    },
    disabled: {
      opacity: 0.6,
    },
  });
}
