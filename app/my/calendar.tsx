// 일정표 화면: 개인 일정, 견적 희망 일정, 현장 일정, 일일보고서를 한 캘린더에 합쳐 보여준다.
// 위젯 데이터와 같은 개념을 공유하므로 일정 타입/색상 변경 시 lib/calendarWidget.ts도 확인한다.
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
import {
  saveCalendarWidgetSnapshot,
  type CalendarWidgetSnapshot,
  type CalendarWidgetSnapshotEvent,
} from '../../lib/calendarWidget';
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

/**
 * 개인 일정 작성 폼 상태다.
 * sameDay가 true면 endDate는 startDate와 같은 날로 저장하고, false일 때만 종료일을 별도로 고른다.
 */
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

// 위젯과 앱 달력에서 일요일/공휴일만 빨간색으로 표시하기 위한 최소 휴일 데이터다.
// 토요일은 쉬는날 표시 요구에서 제외되어 별도 rest day로 처리하지 않는다.
const KOREAN_PUBLIC_HOLIDAYS_BY_YEAR: Record<number, { date: string; name: string }[]> = {
  2026: [
    { date: '2026-01-01', name: '신정' },
    { date: '2026-02-16', name: '설날 연휴' },
    { date: '2026-02-17', name: '설날' },
    { date: '2026-02-18', name: '설날 연휴' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-03-02', name: '삼일절 대체공휴일' },
    { date: '2026-05-01', name: '노동절' },
    { date: '2026-05-05', name: '어린이날' },
    { date: '2026-05-24', name: '부처님오신날' },
    { date: '2026-05-25', name: '부처님오신날 대체공휴일' },
    { date: '2026-06-03', name: '지방선거일' },
    { date: '2026-06-06', name: '현충일' },
    { date: '2026-07-17', name: '제헌절' },
    { date: '2026-08-15', name: '광복절' },
    { date: '2026-08-17', name: '광복절 대체공휴일' },
    { date: '2026-09-24', name: '추석 연휴' },
    { date: '2026-09-25', name: '추석' },
    { date: '2026-09-26', name: '추석 연휴' },
    { date: '2026-10-03', name: '개천절' },
    { date: '2026-10-05', name: '개천절 대체공휴일' },
    { date: '2026-10-09', name: '한글날' },
    { date: '2026-12-25', name: '기독탄신일' },
  ],
  2027: [
    { date: '2027-01-01', name: '신정' },
    { date: '2027-02-06', name: '설날 연휴' },
    { date: '2027-02-07', name: '설날' },
    { date: '2027-02-08', name: '설날 연휴' },
    { date: '2027-02-09', name: '설날 대체공휴일' },
    { date: '2027-03-01', name: '삼일절' },
    { date: '2027-05-01', name: '노동절' },
    { date: '2027-05-03', name: '노동절 대체공휴일' },
    { date: '2027-05-05', name: '어린이날' },
    { date: '2027-05-13', name: '부처님오신날' },
    { date: '2027-06-06', name: '현충일' },
    { date: '2027-07-17', name: '제헌절' },
    { date: '2027-07-19', name: '제헌절 대체공휴일' },
    { date: '2027-08-15', name: '광복절' },
    { date: '2027-08-16', name: '광복절 대체공휴일' },
    { date: '2027-09-14', name: '추석 연휴' },
    { date: '2027-09-15', name: '추석' },
    { date: '2027-09-16', name: '추석 연휴' },
    { date: '2027-10-03', name: '개천절' },
    { date: '2027-10-04', name: '개천절 대체공휴일' },
    { date: '2027-10-09', name: '한글날' },
    { date: '2027-10-11', name: '한글날 대체공휴일' },
    { date: '2027-12-25', name: '기독탄신일' },
    { date: '2027-12-27', name: '기독탄신일 대체공휴일' },
  ],
  2028: [
    { date: '2028-01-01', name: '신정' },
    { date: '2028-01-26', name: '설날 연휴' },
    { date: '2028-01-27', name: '설날' },
    { date: '2028-01-28', name: '설날 연휴' },
    { date: '2028-03-01', name: '삼일절' },
    { date: '2028-04-12', name: '국회의원 선거일' },
    { date: '2028-05-01', name: '노동절' },
    { date: '2028-05-02', name: '부처님오신날' },
    { date: '2028-05-05', name: '어린이날' },
    { date: '2028-06-06', name: '현충일' },
    { date: '2028-07-17', name: '제헌절' },
    { date: '2028-08-15', name: '광복절' },
    { date: '2028-10-02', name: '추석 연휴' },
    { date: '2028-10-03', name: '추석/개천절' },
    { date: '2028-10-04', name: '추석 연휴' },
    { date: '2028-10-05', name: '추석 대체공휴일' },
    { date: '2028-10-09', name: '한글날' },
    { date: '2028-12-25', name: '기독탄신일' },
  ],
  2029: [
    { date: '2029-01-01', name: '신정' },
    { date: '2029-02-12', name: '설날 연휴' },
    { date: '2029-02-13', name: '설날' },
    { date: '2029-02-14', name: '설날 연휴' },
    { date: '2029-03-01', name: '삼일절' },
    { date: '2029-05-01', name: '노동절' },
    { date: '2029-05-05', name: '어린이날' },
    { date: '2029-05-07', name: '어린이날 대체공휴일' },
    { date: '2029-05-20', name: '부처님오신날' },
    { date: '2029-05-21', name: '부처님오신날 대체공휴일' },
    { date: '2029-06-06', name: '현충일' },
    { date: '2029-07-17', name: '제헌절' },
    { date: '2029-08-15', name: '광복절' },
    { date: '2029-09-21', name: '추석 연휴' },
    { date: '2029-09-22', name: '추석' },
    { date: '2029-09-23', name: '추석 연휴' },
    { date: '2029-09-24', name: '추석 대체공휴일' },
    { date: '2029-10-03', name: '개천절' },
    { date: '2029-10-09', name: '한글날' },
    { date: '2029-12-25', name: '기독탄신일' },
  ],
  2030: [
    { date: '2030-01-01', name: '신정' },
    { date: '2030-02-02', name: '설날 연휴' },
    { date: '2030-02-03', name: '설날' },
    { date: '2030-02-04', name: '설날 연휴' },
    { date: '2030-02-05', name: '설날 대체공휴일' },
    { date: '2030-03-01', name: '삼일절' },
    { date: '2030-04-03', name: '대통령 선거일' },
    { date: '2030-05-01', name: '노동절' },
    { date: '2030-05-05', name: '어린이날' },
    { date: '2030-05-06', name: '어린이날 대체공휴일' },
    { date: '2030-05-09', name: '부처님오신날' },
    { date: '2030-06-06', name: '현충일' },
    { date: '2030-06-12', name: '지방선거일' },
    { date: '2030-07-17', name: '제헌절' },
    { date: '2030-08-15', name: '광복절' },
    { date: '2030-09-11', name: '추석 연휴' },
    { date: '2030-09-12', name: '추석' },
    { date: '2030-09-13', name: '추석 연휴' },
    { date: '2030-10-03', name: '개천절' },
    { date: '2030-10-09', name: '한글날' },
    { date: '2030-12-25', name: '기독탄신일' },
  ],
};

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

/**
 * 선택한 날짜가 포함된 주의 7일을 만든다.
 * week view와 날짜별 일정 묶음에서 같은 기준을 사용한다.
 */
function getWeekDates(selectedDate: string) {
  const base = parseYmd(selectedDate);
  const day = base.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - day + index);
    return formatYmd(date);
  });
}

/**
 * 날짜가 이벤트 기간 안에 들어가는지 확인한다.
 * 현장 일정과 개인 일정은 여러 날 범위일 수 있으므로 시작일과 종료일 사이를 포함한다.
 */
function dateInEvent(dateText: string, event: CalendarEvent) {
  const endDate = event.endDate || event.startDate;
  return dateText >= event.startDate && dateText <= endDate;
}

/**
 * 이벤트가 현재 달력 월과 겹치는지 확인한다.
 * 기간 일정이 이전 달에 시작해서 이번 달까지 이어지는 경우도 보여주기 위해 교차 여부를 본다.
 */
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

function getKoreanPublicHolidaysForMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const holidays = KOREAN_PUBLIC_HOLIDAYS_BY_YEAR[year] || [];

  return holidays.filter((holiday) => holiday.date.startsWith(month));
}

function isKoreanPublicHoliday(dateText?: string | null) {
  if (!dateText || !isValidYmd(dateText)) return false;
  const year = Number(dateText.slice(0, 4));
  const holidays = KOREAN_PUBLIC_HOLIDAYS_BY_YEAR[year] || [];

  return holidays.some((holiday) => holiday.date === dateText);
}

function isSundayDate(dateText?: string | null) {
  if (!dateText || !isValidYmd(dateText)) return false;
  return parseYmd(dateText).getDay() === 0;
}

function isRestDate(dateText?: string | null) {
  return isSundayDate(dateText) || isKoreanPublicHoliday(dateText);
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

/**
 * 위젯에 표시할 제목을 만든다.
 * 현장/견적 일정은 같은 작업명이 반복될 수 있어 고객명/지역/작업명을 함께 넣는다.
 */
function getCalendarEventWidgetTitle(event: CalendarEvent) {
  if (event.kind === 'personal') return event.title;
  return [event.customerName, event.location, event.title].filter(Boolean).join(' · ');
}

/**
 * 앱 내부 CalendarEvent를 네이티브 위젯 snapshot event로 변환한다.
 * 위젯은 JS 함수를 실행하지 못하므로 title/subtitle/timeText를 모두 문자열로 미리 계산해 넘긴다.
 */
function mapCalendarEventForWidget(event: CalendarEvent): CalendarWidgetSnapshotEvent {
  return {
    id: event.id,
    kind: event.kind,
    title: getCalendarEventWidgetTitle(event),
    subtitle: event.projectName || formatEventRange(event),
    projectName: event.projectName || '',
    workTitle: event.title || '',
    timeText: getEventTimeText(event),
    startDate: event.startDate,
    endDate: event.endDate || event.startDate,
    url: getCalendarEventDeepLink(event),
  };
}

/**
 * 홈 화면/잠금화면 위젯이 읽을 snapshot을 만든다.
 *
 * 현재 달에 걸친 이벤트는 달력 칸 표시용 `events`로 보내고,
 * 오늘 일정이 있으면 agenda에는 오늘 일정, 없으면 다가오는 일정을 보낸다.
 * iOS/Android 네이티브 위젯은 이 JSON만 읽으므로 여기서 잘라낸 데이터는 위젯에 보이지 않는다.
 */
function makeCalendarWidgetSnapshot(events: CalendarEvent[]): CalendarWidgetSnapshot {
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
    holidays: getKoreanPublicHolidaysForMonth(month),
  };
}

/**
 * 일일보고서 내부 내용을 읽을 수 있는지 판단한다.
 * 고객은 공개 보고서만 볼 수 있고, 가게 관계자/담당 직원/협력업체는 내부 보고서도 볼 수 있다.
 */
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

/**
 * 현장에 일일보고서를 작성할 수 있는지 판단한다.
 * 협력업체도 초대된 현장에서는 보고서 작성이 가능하지만, 일정 수정 권한과는 별개다.
 */
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

      // 현장 일정은 kind=project로 넣고, 현장명/고객명/지역을 함께 저장해
      // 여러 현장이 같은 작업명일 때도 달력과 위젯에서 구분되게 한다.
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

        // 일일보고서는 일정과 분리해서 kind=report로 표시한다.
        // 같은 날짜에 일정과 보고서가 모두 있으면 달력 칸 안에 각각 다른 색상으로 보인다.
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
  // 견적 희망 일정은 아직 현장으로 확정되기 전의 약속성 일정이다.
  // 가게 계정은 자기 가게로 들어온 문의만, 일반 사용자는 본인이 신청한 문의만 본다.
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
  // 개인 일정은 특정 가게/현장에 묶이지 않고 owner_user_id 기준으로만 보인다.
  // 위젯에는 개인 일정도 함께 들어가므로 업무 일정과 개인 일정이 한 달력에서 합쳐진다.
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

  // 현장 일정, 견적 희망일, 일일보고서, 개인 일정을 모두 CalendarEvent 하나의 배열로 합친다.
  // 렌더링과 위젯 저장은 이 통합 배열만 바라본다.
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

  // 위젯에서 날짜를 누르거나 deep link로 들어오면 해당 날짜가 선택된 상태로 달력을 연다.
  useEffect(() => {
    if (!routeDate || !isValidYmd(routeDate)) return;

    setSelectedDate(routeDate);
    setMonthDate(makeMonthDate(routeDate));
  }, [routeDate]);

  /**
   * 전체 일정표에 필요한 데이터를 조회하고 위젯 snapshot까지 갱신한다.
   *
   * 세 데이터 원천을 병렬로 읽는다.
   * - store_projects: 현장 일정과 일일보고서
   * - estimate_requests: 견적 희망 일정
   * - calendar_events: 사용자가 직접 넣은 개인 일정
   */
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
    ]);    if (personalResult.error) {      setMessage(
        personalResult.error.code === '42P01' || String(personalResult.error.message || '').includes('calendar_events')
          ? '개인 일정을 사용하려면 Supabase SQL에서 calendar_events.sql을 먼저 실행해 주세요.'
          : personalResult.error.message
      );
    }

    const nextEvents: CalendarEvent[] = [
      ...buildProjectEvents((projectResult.data || []) as any[], access, user.id),
      ...buildEstimateEvents((estimateResult.data || []) as any[], access, user.id),
      ...buildPersonalEvents(personalResult.error ? [] : (personalResult.data || [])),
    ].sort((a, b) => {
      const dateCompare = a.startDate.localeCompare(b.startDate);
      if (dateCompare !== 0) return dateCompare;
      return String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'));
    });

    setEvents(nextEvents);

    // 위젯은 앱의 최신 조회 결과를 그대로 저장소에서 읽는다.
    // 일정표를 새로고침하거나 포커스될 때마다 snapshot을 갱신해 홈 위젯이 최신 상태에 가까워지게 한다.
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

  // 월 달력은 7칸 단위 주 배열로 바꿔 렌더링한다.
  // 앞/뒤 빈칸도 cell로 넣어 요일 위치가 고정되게 한다.
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

  /**
   * 메인 달력에서 날짜를 선택한다.
   * 새 개인 일정을 아직 입력하지 않은 상태라면 선택한 날짜를 form 기본 시작일로 맞춘다.
   */
  const selectDate = (dateText: string) => {
    setSelectedDate(dateText);
    if (!editingPersonalId && !personalForm.title.trim()) {
      setPersonalForm((prev) => ({ ...prev, startDate: dateText, endDate: '' }));
    }
  };

  /**
   * 개인 일정 작성 모달을 초기 상태로 연다.
   * 현재 선택된 날짜를 시작일/종료일 기본값으로 사용해 날짜를 다시 고르지 않아도 되게 한다.
   */
  const openNewPersonalForm = () => {
    setEditingPersonalId(null);
    setPersonalForm(makeEmptyForm(selectedDate));
    setFormCalendarMonth(makeMonthDate(selectedDate));
    setPersonalDateRangeMode('start');
    setFormOpen(true);
  };

  /**
   * 기존 개인 일정을 수정 모드로 연다.
   * 업무 일정/견적/보고서는 이 화면에서 직접 수정하지 않고 각 상세 화면으로 이동한다.
   */
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

  /**
   * 개인 일정 모달을 닫고 draft를 초기화한다.
   * 시간 선택 모달도 같이 닫아 다른 일정 편집 상태가 남지 않게 한다.
   */
  const resetPersonalForm = () => {
    setEditingPersonalId(null);
    setPersonalForm(makeEmptyForm(selectedDate));
    setFormCalendarMonth(makeMonthDate(selectedDate));
    setPersonalDateRangeMode('start');
    setTimePickerTarget(null);
    setFormOpen(false);
  };

  /**
   * 당일 일정 여부를 전환한다.
   * 당일이면 종료일을 시작일과 강제로 맞추고, 기간 일정이면 종료일을 다시 선택하게 한다.
   */
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

  /**
   * 개인 일정 달력에서 시작일 또는 종료일을 선택한다.
   * 시작일이 종료일보다 뒤로 가면 종료일을 비워 잘못된 기간 저장을 막는다.
   */
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

  /**
   * 다이얼식 시간 선택 값을 form에 저장한다.
   * 비어 있는 시간은 "시간 없음"으로 처리되어 날짜 일정처럼 보인다.
   */
  const setPersonalTime = (target: TimePickerTarget, hour: string, minute: string) => {
    setPersonalForm((prev) => ({
      ...prev,
      [target]: `${hour}:${minute}`,
    }));
  };

  /**
   * 개인 일정의 시작/종료 시간을 제거한다.
   * 시간 선택 모달도 닫아 사용자가 삭제 결과를 바로 확인할 수 있게 한다.
   */
  const clearPersonalTime = (target: TimePickerTarget) => {
    setPersonalForm((prev) => ({
      ...prev,
      [target]: '',
    }));
    setTimePickerTarget(null);
  };

  /**
   * 개인 일정을 생성하거나 수정한다.
   *
   * owner_user_id는 실제 로그인 사용자 id로 저장한다. 가게 계정으로 로그인한 경우에도
   * 개인 일정은 가게 전체 공유 일정이 아니라 본인 전용 일정이므로 visibility를 private으로 둔다.
   */
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

  /**
   * 개인 일정을 삭제한다.
   * owner_user_id 조건을 함께 걸어 다른 사람의 개인 일정 row가 삭제되지 않게 한다.
   */
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

  /**
   * 일정 카드를 눌렀을 때 원본 업무 화면으로 이동한다.
   *
   * 현장 일정은 현장관리, 보고서는 현장관리의 보고서 상세,
   * 견적 일정은 견적관리로 보낸다. 개인 일정은 이 화면에서 바로 수정하므로 여기서는 이동하지 않는다.
   */
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

  /**
   * 일정 카드에서 바로 일일보고서 작성 화면으로 들어간다.
   * 현장 id만 있으면 현장관리 화면이 해당 현장을 열고 보고서 폼으로 스크롤한다.
   */
  const openReportWriter = (event: CalendarEvent) => {
    const projectId = event.projectId || event.raw?.project?.id;
    if (!projectId) return;

    router.push(`/store/projects?projectId=${projectId}&action=dailyReport&focus=form` as any);
  };

  /**
   * 일정 카드에 "보고서 작성" 버튼을 보여도 되는지 판단한다.
   * 권한 기준은 현장관리의 보고서 작성 권한과 맞춰야 한다.
   */
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
            {WEEKDAYS.map((day, index) => (
              <Text key={day} style={[styles.weekdayText, index === 0 && styles.restDayText]}>{day}</Text>
            ))}
          </View>
          {calendarWeeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
              {week.map((cell) => {
                const dateText = cell.dateText;
                const active = !!dateText && dateText === selectedDate;
                const isToday = !!dateText && dateText === today;
                const isRest = isRestDate(dateText);
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
                      active && isRest && styles.dayCellRestActive,
                    ]}
                    disabled={!dateText}
                    onPress={() => dateText && selectDate(dateText)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && styles.todayDayText,
                        isRest && styles.restDayText,
                        active && styles.dayTextActive,
                        active && isRest && styles.dayTextRestActive,
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
                  {WEEKDAYS.map((day, index) => (
                    <Text key={day} style={[styles.weekdayText, index === 0 && styles.restDayText]}>{day}</Text>
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
                      const isRest = isRestDate(dateText);

                      return (
                        <TouchableOpacity
                          key={cell.key}
                          style={[
                            styles.formDayCell,
                            !dateText && styles.emptyDayCell,
                            inRange && !active && styles.formDayCellInRange,
                            active && styles.formDayCellActive,
                            active && isRest && styles.dayCellRestActive,
                          ]}
                          disabled={!dateText}
                          onPress={() => dateText && selectPersonalFormDate(dateText)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.formDayText,
                              isRest && styles.restDayText,
                              active && styles.formDayTextActive,
                              active && isRest && styles.dayTextRestActive,
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
    dayCellRestActive: {
      backgroundColor: theme.danger,
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
    restDayText: {
      color: theme.danger,
    },
    dayTextActive: {
      color: theme.text,
    },
    dayTextRestActive: {
      color: '#ffffff',
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
