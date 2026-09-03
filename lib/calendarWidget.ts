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

export async function saveCalendarWidgetSnapshot(snapshot: CalendarWidgetSnapshot) {
  if (Platform.OS === 'web') return;
  if (!nativeCalendarWidget?.saveSnapshot) return;

  try {
    await nativeCalendarWidget.saveSnapshot(JSON.stringify(snapshot));
  } catch (error) {
    console.log('일정 위젯 저장 실패:', error);
  }
}
