// 캘린더 위젯 브리지: 앱 일정 데이터를 iOS/Android 네이티브 위젯이 읽을 snapshot으로 전달한다.
import { NativeModules, Platform } from 'react-native';

export type CalendarWidgetSnapshotEvent = {
  id: string;
  kind: 'project' | 'estimate' | 'report' | 'personal';
  title: string;
  subtitle: string;
  projectName?: string;
  workTitle?: string;
  timeText: string;
  startDate: string;
  endDate: string;
  url: string;
};

export type CalendarWidgetSnapshotHoliday = {
  date: string;
  name: string;
};

export type CalendarWidgetSnapshot = {
  title: string;
  month: string;
  agendaTitle: string;
  updatedAt: string;
  events: CalendarWidgetSnapshotEvent[];
  agendaEvents: CalendarWidgetSnapshotEvent[];
  holidays: CalendarWidgetSnapshotHoliday[];
};

type CalendarWidgetNativeModule = {
  saveSnapshot?: (snapshotJson: string) => Promise<void>;
};

const nativeCalendarWidget = NativeModules.CalendarWidget as CalendarWidgetNativeModule | undefined;

/**
 * 앱에서 계산한 일정 snapshot을 네이티브 위젯 저장소로 넘긴다.
 *
 * iOS/Android 위젯은 React Native 상태나 Supabase에 직접 접근하지 않는다.
 * 앱이 일정표를 조회한 뒤 이 함수로 JSON snapshot을 저장하고, 네이티브 위젯은
 * 그 마지막 snapshot만 읽어서 홈 화면/잠금화면에 표시한다.
 *
 * 위젯에 새 필드를 추가할 때는 다음 세 곳을 같이 맞춰야 한다.
 * - 이 타입 정의
 * - snapshot을 만드는 일정표 화면
 * - iOS WidgetKit / Android AppWidget 렌더러
 */
export async function saveCalendarWidgetSnapshot(snapshot: CalendarWidgetSnapshot) {
  if (Platform.OS === 'web') return;
  if (!nativeCalendarWidget?.saveSnapshot) return;

  try {
    await nativeCalendarWidget.saveSnapshot(JSON.stringify(snapshot));
  } catch {  }
}
