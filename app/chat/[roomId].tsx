import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type GestureResponderEvent,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { markMessagesAsRead, sendMessage } from '../../lib/chat';
import { canStartChat, canUseApp } from '../../lib/guard';
import {
  InCallManager,
  isNativeCallSupported,
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  type MediaStream,
} from '../../lib/nativeCall';
import {
  clearChatPlaceSelection,
  consumeLatestChatPlaceSelection,
  subscribeChatPlaceSelection,
  type ChatPlaceSelection,
} from '../../lib/placeSelection';
import { checkProhibitedContent } from '../../lib/prohibited';
import { REPORT_REASONS } from '../../lib/reportReasons';
import { getSellerLevel, getSellerLevelTitle } from '../../lib/sellerLevel';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

type MessageRead = {
  id: string;
  message_id: number;
  user_id: string;
  read_at: string;
};

type ChatCallType = 'voice' | 'video';
type ChatCallStatus = 'ringing' | 'accepted' | 'declined' | 'canceled' | 'ended' | 'missed';

type ChatCallSession = {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string;
  call_type: ChatCallType;
  status: ChatCallStatus;
  offer: RTCSessionPayload | null;
  answer: RTCSessionPayload | null;
  caller_camera_off?: boolean | null;
  callee_camera_off?: boolean | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

type RTCSessionPayload = {
  type: string | null;
  sdp: string;
};

type RTCIceCandidatePayload = {
  candidate: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
};

type ChatCallIceCandidate = {
  id: number;
  call_id: string;
  user_id: string;
  candidate: RTCIceCandidatePayload;
  created_at: string;
};

type TradeReviewPreview = {
  id: number;
  sale_id: number | null;
  reviewer_id: string;
  target_user_id: string;
  sentiment: 'positive' | 'negative' | string | null;
  feedback_tags: string[] | null;
  comment: string | null;
  created_at: string | null;
};

type ChatUserProfile = {
  display_name: string | null;
  phone: string | null;
  is_phone_public: boolean | null;
  user_type?: 'store' | 'personal' | null;
  business_verified?: boolean | null;
  account?: string | null;
  trust_points?: number | null;
  trust_level?: number | null;
};

type RoomInfo = {
  id: string;
  listing_id: number | null;
  store_user_id?: string | null;
  room_type?: string | null;
  estimate_request_id?: number | null;
  estimate_quote_id?: number | null;
  project_id?: string | null;
  title?: string | null;
  workflow_status?: string | null;
  completed_at?: string | null;
  created_by: string;
  created_at: string;
  members?: {
    user_id: string;
  }[];
  listing: {
    id: number;
    category?: string | null;
    title: string;
    price_text: string | null;
    region: string | null;
    status?: string | null;
    author_id: string;
    buyer_id?: string | null;
    quantity_total?: number | null;
    quantity_remaining?: number | null;
    quantity_sold?: number | null;
    listing_images?: {
      id: number;
      image_path: string;
      sort_order: number | null;
    }[];
  } | null;
  sellerProfile?: ChatUserProfile | null;
  project?: {
    id: string;
    store_user_id?: string | null;
    assigned_staff_user_id?: string | null;
    name: string;
    status: string | null;
    address: string | null;
    start_date: string | null;
    end_date: string | null;
    project_members?: {
      id?: string | null;
      member_user_id: string | null;
      member_type?: string | null;
      role: string | null;
      company_name?: string | null;
      display_name?: string | null;
      phone?: string | null;
      invitation_status: string | null;
      created_at?: string | null;
    }[];
    project_schedules?: {
      id: string;
      title: string;
      start_date: string;
      end_date: string | null;
      status: string | null;
      memo?: string | null;
    }[];
    daily_reports?: {
      id: string;
      report_date: string;
      work_content: string;
      progress_percent: number | null;
      customer_visible: boolean | null;
      daily_report_images?: {
        id: string;
        image_path: string;
      }[];
    }[];
  } | null;
  estimateRequest?: {
    id: number;
    title: string | null;
    category: string | null;
    status: string | null;
    region: string | null;
    address: string | null;
    desired_date: string | null;
    applicant_name: string | null;
    applicant_phone: string | null;
  } | null;
};

type ChatParticipantItem = {
  userId: string;
  name: string;
  meta: string;
  projectMemberId: string | null;
  isOwner: boolean;
  isMe: boolean;
  canRemove: boolean;
};

function getProjectRoleLabel(role?: string | null) {
  switch (role) {
    case 'owner':
      return '방장';
    case 'manager':
      return '매니저';
    case 'employee':
      return '직원';
    case 'partner':
      return '협력업체';
    case 'customer':
      return '고객';
    case 'viewer':
      return '참여자';
    default:
      return '참여자';
  }
}

function getProjectInvitationStatusLabel(status?: string | null) {
  switch (status) {
    case 'accepted':
      return '참여중';
    case 'pending':
      return '초대중';
    case 'removed':
      return '내보냄';
    default:
      return '채팅 참여중';
  }
}

function getListingStockText(listing?: RoomInfo['listing']) {
  if (!listing) return '';

  const { total, remaining } = getListingQuantityInfo(listing);
  if (total <= 1) return '';

  return `남은 ${remaining}/${total}개`;
}

function getProjectStatusLabel(status?: string | null) {
  if (status === 'in_progress') return '진행중';
  if (status === 'completed') return '완료';
  if (status === 'on_hold') return '보류';
  if (status === 'canceled') return '취소';
  return '준비중';
}

function getProjectScheduleStatusLabel(status?: string | null) {
  if (status === 'in_progress') return '진행';
  if (status === 'done') return '완료';
  if (status === 'canceled') return '취소';
  return '예정';
}

function formatProjectDate(value?: string | null) {
  if (!value) return '미정';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function projectScheduleContainsDate(dateText: string, schedule: { start_date: string; end_date?: string | null }) {
  const endDate = schedule.end_date || schedule.start_date;
  return dateText >= schedule.start_date && dateText <= endDate;
}

const REVIEW_TAG_LABELS: Record<string, string> = {
  fast_response: '응답이 빨라요',
  kind: '친절해요',
  kept_promise: '약속을 잘 지켜요',
  accurate_item: '상품 설명이 정확해요',
  slow_response: '연락이 느렸어요',
  schedule_issue: '약속 시간이 맞지 않아요',
  item_mismatch: '상품 상태가 달랐어요',
  deal_canceled: '거래가 취소됐어요',
  other: '기타',
};

function getReviewTagLabel(tag: string) {
  return REVIEW_TAG_LABELS[tag] || tag;
}

function getReviewSummary(review: TradeReviewPreview) {
  const tags = Array.isArray(review.feedback_tags) ? review.feedback_tags : [];
  const tagText = tags.map(getReviewTagLabel).filter(Boolean).join(', ');
  if (tagText) return tagText;
  if (review.comment?.trim()) return review.comment.trim();
  return review.sentiment === 'negative' ? '아쉬웠어요' : '좋았어요';
}

function getListingQuantityInfo(listing?: RoomInfo['listing']) {
  const total = Math.max(1, Number(listing?.quantity_total ?? 1));
  const fallbackRemaining = listing?.status === 'done' ? 0 : total;
  const remaining = Math.max(0, Number(listing?.quantity_remaining ?? fallbackRemaining));
  const sold = Math.max(0, Number(listing?.quantity_sold ?? Math.max(0, total - remaining)));

  return {
    total,
    remaining,
    sold,
    isMultiQuantity: total > 1,
  };
}

function parseAppointmentDate(message: string) {
  if (!message.startsWith(APPOINTMENT_REQUEST_PREFIX)) return null;

  const raw = message.replace(APPOINTMENT_REQUEST_PREFIX, '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!match) return null;

  const date = new Date(`${match[1]}T${match[2]}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
}

function formatTimeInput(date: Date) {
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatAppointmentValue(date: Date) {
  return `${formatDateInput(date)} ${formatTimeInput(date)}`;
}

function getAppointmentDateFromTexts(dateText: string, timeText: string) {
  if (!dateText || !timeText) return null;

  const date = new Date(`${dateText}T${timeText}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastAppointmentTimeOption(dateText: string, timeText: string, nowMs: number) {
  const appointmentDate = getAppointmentDateFromTexts(dateText, timeText);
  return !appointmentDate || appointmentDate.getTime() <= nowMs;
}

function getDefaultAppointmentDate(nowMs = Date.now()) {
  const date = new Date(nowMs + 60 * 60 * 1000);
  const minutes = date.getMinutes();

  if (minutes === 0) {
    date.setSeconds(0, 0);
  } else if (minutes <= 30) {
    date.setMinutes(30, 0, 0);
  } else {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }

  if (date.getHours() < 9) {
    date.setHours(9, 0, 0, 0);
  } else if (date.getHours() > 22 || (date.getHours() === 22 && date.getMinutes() > 0)) {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  }

  return date;
}

function getAppointmentDateLabel(date: Date, nowMs = Date.now()) {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
}

function makeAppointmentCompletionPrompt(appointmentDate: Date) {
  return `${APPOINTMENT_COMPLETION_PROMPT_PREFIX}약속 시간: ${formatAppointmentValue(
    appointmentDate
  )}\n거래를 완료 하였나요?`;
}

function parseAppointmentCompletionDate(message: string) {
  if (
    !message.startsWith(APPOINTMENT_COMPLETION_PROMPT_PREFIX) &&
    !message.startsWith(APPOINTMENT_COMPLETION_RESPONSE_PREFIX)
  ) {
    return null;
  }

  const match = message.match(/약속 시간:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!match) return null;

  const date = new Date(`${match[1]}T${match[2]}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function showChatAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmBlockChatTarget() {
  const message = '상대방을 차단할까요?\n차단한 사용자는 내정보에서 해제할 수 있습니다.';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(message);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('차단하기', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '차단', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatTime(dateString?: string) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${ampm} ${hour12}:${minutes}`;
}

function getChatDateKey(dateString?: string) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString.slice(0, 10);

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
}

function formatChatDateDivider(dateString?: string) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString.slice(0, 10);

  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${
    weekdays[date.getDay()]
  }`;
}

function formatCallDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function getCallDurationSeconds(
  call?: Pick<ChatCallSession, 'answered_at'> | null,
  endedAtMs = Date.now()
) {
  if (!call?.answered_at) return 0;

  const startedAtMs = new Date(call.answered_at).getTime();

  if (Number.isNaN(startedAtMs)) return 0;

  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
}

function getCallTypeLabel(callType: ChatCallType) {
  return callType === 'video' ? '영상통화' : '보이스톡';
}

function getCallStatusMessage(
  callType: ChatCallType,
  status: ChatCallStatus,
  durationSeconds = 0
) {
  const label = getCallTypeLabel(callType);
  const durationText = durationSeconds > 0 ? ` · ${formatCallDuration(durationSeconds)}` : '';

  if (status === 'ringing') return `${CALL_STATUS_MESSAGE_PREFIX}${label} 요청`;
  if (status === 'accepted') return `${CALL_STATUS_MESSAGE_PREFIX}${label} 연결`;
  if (status === 'declined') return `${CALL_STATUS_MESSAGE_PREFIX}${label} 거절`;
  if (status === 'canceled') return `${CALL_STATUS_MESSAGE_PREFIX}${label} 취소`;
  if (status === 'ended') return `${CALL_STATUS_MESSAGE_PREFIX}${label} 종료${durationText}`;
  return `${CALL_STATUS_MESSAGE_PREFIX}${label} 부재중`;
}

const PAYMENT_REQUEST_PREFIX = '💸 송금 요청\n';
const PLACE_MESSAGE_PREFIX = '📍 약속 장소\n';
const LEGACY_PLACE_MESSAGE_PREFIX = '📍 거래 장소\n';
const PLACE_ADDRESS_PREFIX = '주소:';
const PLACE_COORDS_PREFIX = '좌표:';
const APPOINTMENT_REQUEST_PREFIX = '📅 약속 제안\n';
const APPOINTMENT_COMPLETION_PROMPT_PREFIX = '✅ 거래 완료 확인\n';
const APPOINTMENT_COMPLETION_RESPONSE_PREFIX = '✅ 거래 완료 응답\n';
const CALL_STATUS_MESSAGE_PREFIX = '📞 통화 상태\n';
const PAYMENT_REQUEST_KEYWORDS = ['송금 요청', '송금요청', '계좌번호'];
const HIGH_REPORT_WARNING_THRESHOLD = 3;
const APPOINTMENT_CHANGE_LOCK_MS = 5 * 60 * 1000;
const APPOINTMENT_AUTO_CHECK_INTERVAL_MS = 30 * 1000;
const CHAT_IMAGE_PICKER_QUALITY = 0.55;
const CHAT_IMAGE_BUCKET = 'chat-images';
const CHAT_IMAGE_THUMBNAIL_SIZE = 360;
const IMAGE_VIEWER_CLOSE_SWIPE_DISTANCE = 90;
const IMAGE_VIEWER_CLOSE_SWIPE_VELOCITY = 1.2;
const REPORT_WARNING_DISMISSED_PREFIX = 'chat-report-warning-dismissed';
const REPORT_WARNING_INITIAL_SHOWN_PREFIX = 'chat-report-warning-initial-shown';
const REPORT_WARNING_MESSAGE_SHOWN_PREFIX = 'chat-report-warning-message-shown';
const CALL_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type ChatImageItem = {
  url: string;
  thumbnailUrl: string;
};

type PlaceMessagePayload = {
  address: string;
  latitude: number;
  longitude: number;
};

function makePlaceMessage(address: string, latitude: string | number, longitude: string | number) {
  return `${PLACE_MESSAGE_PREFIX}${PLACE_ADDRESS_PREFIX} ${address.trim()}\n${PLACE_COORDS_PREFIX} ${latitude},${longitude}`;
}

function parsePlaceMessage(message: string): PlaceMessagePayload | null {
  if (!message.startsWith(PLACE_MESSAGE_PREFIX) && !message.startsWith(LEGACY_PLACE_MESSAGE_PREFIX)) {
    return null;
  }

  const lines = message.split('\n').map((line) => line.trim()).filter(Boolean);
  const addressLine = lines.find((line) => line.startsWith(PLACE_ADDRESS_PREFIX));
  const coordsLine = lines.find((line) => line.startsWith(PLACE_COORDS_PREFIX));
  const latitudeLine = lines.find((line) => line.startsWith('위도:'));
  const longitudeLine = lines.find((line) => line.startsWith('경도:'));

  const address = addressLine
    ? addressLine.slice(PLACE_ADDRESS_PREFIX.length).trim()
    : '약속장소';

  let latitude = Number.NaN;
  let longitude = Number.NaN;

  if (coordsLine) {
    const coords = coordsLine.slice(PLACE_COORDS_PREFIX.length).split(',');
    latitude = Number(coords[0]?.trim());
    longitude = Number(coords[1]?.trim());
  } else if (latitudeLine && longitudeLine) {
    latitude = Number(latitudeLine.slice('위도:'.length).trim());
    longitude = Number(longitudeLine.slice('경도:'.length).trim());
  }

  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { address, latitude, longitude };
}

function getChatImageUploadInfo(asset: ImagePicker.ImagePickerAsset) {
  const rawMimeType = asset.mimeType?.toLowerCase() || '';
  const fileName = asset.fileName?.toLowerCase() || asset.uri.toLowerCase();

  if (rawMimeType.includes('png') || fileName.endsWith('.png')) {
    return { ext: 'png', contentType: 'image/png' };
  }

  if (rawMimeType.includes('webp') || fileName.endsWith('.webp')) {
    return { ext: 'webp', contentType: 'image/webp' };
  }

  return { ext: 'jpg', contentType: 'image/jpeg' };
}

async function prepareChatImageForUpload(asset: ImagePicker.ImagePickerAsset) {
  const { ext, contentType } = getChatImageUploadInfo(asset);

  return {
    uri: asset.uri,
    base64: asset.base64 ?? null,
    file: asset.file,
    ext,
    contentType,
  };
}

function getChatImageStoragePath(url: string) {
  const cleanUrl = url.split('?')[0];
  const markers = [
    `/storage/v1/object/public/${CHAT_IMAGE_BUCKET}/`,
    `/storage/v1/render/image/public/${CHAT_IMAGE_BUCKET}/`,
  ];

  const marker = markers.find((item) => cleanUrl.includes(item));
  if (!marker) return null;

  const path = cleanUrl.slice(cleanUrl.indexOf(marker) + marker.length);

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function makeChatImageThumbnailUrl(url: string) {
  const path = getChatImageStoragePath(url);
  if (!path) return url;

  const { data } = supabase.storage.from(CHAT_IMAGE_BUCKET).getPublicUrl(path, {
    transform: {
      width: CHAT_IMAGE_THUMBNAIL_SIZE,
      height: CHAT_IMAGE_THUMBNAIL_SIZE,
      resize: 'cover',
      quality: 65,
      format: 'origin',
    },
  });

  return data.publicUrl;
}

function normalizeChatImageItem(value: unknown): ChatImageItem | null {
  const image =
    typeof value === 'string'
      ? { url: value, thumbnailUrl: makeChatImageThumbnailUrl(value) }
      : value &&
        typeof value === 'object' &&
        'url' in value &&
        typeof value.url === 'string'
        ? {
          url: value.url,
          thumbnailUrl:
            'thumbnailUrl' in value && typeof value.thumbnailUrl === 'string'
              ? value.thumbnailUrl
              : makeChatImageThumbnailUrl(value.url),
        }
        : null;

  if (!image?.url) return null;
  return image;
}

function makeImageMessage(urls: string[]) {
  return `📷 이미지묶음\n${JSON.stringify(urls)}`;
}

function parseImageMessage(message: string): ChatImageItem[] {
  if (message.startsWith('📷 이미지묶음\n')) {
    try {
      const json = message.replace('📷 이미지묶음\n', '');
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => normalizeChatImageItem(item))
        .filter((item): item is ChatImageItem => Boolean(item));
    } catch {
      return [];
    }
  }

  if (message.startsWith('📷 이미지\n')) {
    const image = normalizeChatImageItem(message.replace('📷 이미지\n', ''));
    return image ? [image] : [];
  }

  return [];
}

function ChatThumbnailImage({ image }: { image: ChatImageItem }) {
  const [useOriginal, setUseOriginal] = useState(false);
  const uri = useOriginal ? image.url : image.thumbnailUrl;

  return (
    <Image
      source={{ uri }}
      style={styles.gridImage}
      resizeMode="cover"
      resizeMethod="resize"
      fadeDuration={0}
      progressiveRenderingEnabled
      onError={(e) => {
        if (!useOriginal && image.thumbnailUrl !== image.url) {
          setUseOriginal(true);
          return;
        }

        console.log('채팅 썸네일 로드 실패:', {
          uri,
          error: e.nativeEvent.error,
        });
      }}
    />
  );
}

function ZoomableChatImage({
  uri,
  onClose,
  onPrev,
  onNext,
}: {
  uri: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
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

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
        return;
      }

      scale.value = withTiming(2.5);
      savedScale.value = 2.5;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;

        translateX.value = Math.max(-maxX, Math.min(maxX, savedX.value + e.translationX));
        translateY.value = Math.max(-maxY, Math.min(maxY, savedY.value + e.translationY));
        return;
      }

      dismissY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (scale.value > 1.05) {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        return;
      }

      const shouldClose =
        e.translationY > IMAGE_VIEWER_CLOSE_SWIPE_DISTANCE ||
        (e.translationY > 40 &&
          e.velocityY > IMAGE_VIEWER_CLOSE_SWIPE_VELOCITY * 1000);

      if (shouldClose) {
        dismissY.value = withTiming(SCREEN_HEIGHT, { duration: 140 }, (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        });
        return;
      }

      dismissY.value = withSpring(0, {
        damping: 18,
        stiffness: 220,
      });

      if (e.translationX < -70) {
        runOnJS(onNext)();
      }

      if (e.translationX > 70) {
        runOnJS(onPrev)();
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View collapsable={false} style={styles.zoomGestureBox}>
        <Reanimated.Image
          source={{ uri }}
          style={[styles.fullImage, animatedStyle]}
          resizeMode="contain"
          resizeMethod="resize"
          onError={(e) => console.log('큰 이미지 로드 실패:', e.nativeEvent)}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

export default function ChatRoomScreen() {
  const { roomId, lat, lng, address, returnTo } = useLocalSearchParams<{
    roomId: string;
    lat?: string;
    lng?: string;
    address?: string;
    returnTo?: string;
  }>();

  const { user } = useAuth();
  const theme = useAppTheme();
  const isDarkMode = theme.scheme === 'dark';
  const backIconColor = isDarkMode ? '#fff' : theme.text;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const messageInputRef = useRef<TextInput>(null);
  const messageTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const messageTouchMovedRef = useRef(false);
  const initialReportWarningRunningRef = useRef(false);
  const appointmentCompletionPromptRunningRef = useRef(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sentPlaceKeysRef = useRef<Set<string>>(new Set());
  const processedIceCandidateIdsRef = useRef<Set<number>>(new Set());
  const queuedIceCandidatesRef = useRef<ChatCallIceCandidate[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);


  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [reads, setReads] = useState<MessageRead[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportContent, setReportContent] = useState('');
  const [reportTargetName, setReportTargetName] = useState('');

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [participantActionLoadingId, setParticipantActionLoadingId] = useState<string | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);

  const [chatTargetProfile, setChatTargetProfile] = useState<ChatUserProfile | null>(null);
  const [participantProfileMap, setParticipantProfileMap] = useState<Record<string, ChatUserProfile>>({});
  const [chatTargetRating, setChatTargetRating] = useState<{ avg: number | null; count: number }>({
    avg: null,
    count: 0,
  });
  const [chatTargetReportCount, setChatTargetReportCount] = useState(0);

  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentStep, setAppointmentStep] = useState<'date' | 'time'>('date');
  const [selectedDateText, setSelectedDateText] = useState('');
  const [selectedTimeText, setSelectedTimeText] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [saleCompleteModalOpen, setSaleCompleteModalOpen] = useState(false);
  const [saleQuantityText, setSaleQuantityText] = useState('1');
  const [saleCompleting, setSaleCompleting] = useState(false);
  const [pendingReviewTargetId, setPendingReviewTargetId] = useState<string | null>(null);
  const [reviewOnlySaleId, setReviewOnlySaleId] = useState<number | null>(null);
  const [counterpartReview, setCounterpartReview] = useState<TradeReviewPreview | null>(null);
  const [myReciprocalReview, setMyReciprocalReview] = useState<TradeReviewPreview | null>(null);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountText, setAccountText] = useState('');
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [currentCall, setCurrentCall] = useState<ChatCallSession | null>(null);
  const [callActionLoading, setCallActionLoading] = useState(false);
  const callActionLockRef = useRef(false);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  const [callDurationText, setCallDurationText] = useState('00:00');
  const [callMicMuted, setCallMicMuted] = useState(false);
  const [callSpeakerOn, setCallSpeakerOn] = useState(false);
  const [callCameraOff, setCallCameraOff] = useState(false);
  const [callFacingMode, setCallFacingMode] = useState<'user' | 'environment'>('user');
  const [selectedProjectDate, setSelectedProjectDate] = useState(() => formatDateInput(new Date()));
  const [workPanelCollapsed, setWorkPanelCollapsed] = useState(false);

  const listing = roomInfo?.listing;
  const isProjectRoom =
    !!roomInfo?.project || !!roomInfo?.project_id || roomInfo?.room_type === 'project';
  const estimateRequest = roomInfo?.estimateRequest || null;
  const isEstimateRoom =
    !isProjectRoom &&
    (!!estimateRequest || !!roomInfo?.estimate_request_id || roomInfo?.room_type === 'estimate');
  const isWorkChatRoom = isProjectRoom || isEstimateRoom;
  const isCompletedWorkChat = roomInfo?.workflow_status === 'completed';
  const project = useMemo(
    () =>
      roomInfo?.project ||
      (isProjectRoom
        ? {
            id: roomInfo?.project_id || '',
            store_user_id: null,
            assigned_staff_user_id: null,
            name: roomInfo?.title || '현장 채팅',
            status: isCompletedWorkChat ? 'completed' : null,
            address: null,
            start_date: null,
            end_date: null,
            project_members: [],
            project_schedules: [],
            daily_reports: [],
          }
        : null),
    [isCompletedWorkChat, isProjectRoom, roomInfo?.project, roomInfo?.project_id, roomInfo?.title]
  );
  const currentListingId = listing?.id ?? null;
  const currentListingAuthorId = listing?.author_id ?? null;
  const listingQuantityInfo = useMemo(() => getListingQuantityInfo(listing), [listing]);
  const isShareListing = listing?.category === 'share';
  const todayProjectDate = formatDateInput(new Date());
  const canReadInternalProjectReports = useMemo(() => {
    if (!project || !user?.id) return false;

    if (project.store_user_id === user.id || project.assigned_staff_user_id === user.id) {
      return true;
    }

    return (project.project_members || []).some((member) => (
      member.member_user_id === user.id &&
      member.invitation_status === 'accepted' &&
      ['owner', 'manager', 'employee', 'partner'].includes(member.role || '')
    ));
  }, [project, user?.id]);
  const canWriteProjectReports = canReadInternalProjectReports;
  const visibleProjectReports = useMemo(() => {
    return (project?.daily_reports || []).filter(
      (report) => canReadInternalProjectReports || !!report.customer_visible
    );
  }, [canReadInternalProjectReports, project?.daily_reports]);
  const canManageChatParticipants = useMemo(() => {
    if (!project || !user?.id) return false;

    if (project.store_user_id === user.id) return true;

    return (project.project_members || []).some((member) => (
      member.member_user_id === user.id &&
      member.invitation_status !== 'removed' &&
      ['owner', 'manager'].includes(member.role || '')
    ));
  }, [project, user?.id]);
  const chatParticipants = useMemo<ChatParticipantItem[]>(() => {
    const roomMemberIds = Array.from(
      new Set(
        (roomInfo?.members || [])
          .map((member) => member.user_id)
          .filter((memberId): memberId is string => !!memberId)
      )
    );

    const activeProjectMemberByUser = new Map(
      (project?.project_members || [])
        .filter((member) => !!member.member_user_id && member.invitation_status !== 'removed')
        .map((member) => [member.member_user_id as string, member])
    );
    const removedProjectMemberIds = new Set(
      (project?.project_members || [])
        .filter((member) => !!member.member_user_id && member.invitation_status === 'removed')
        .map((member) => member.member_user_id as string)
    );

    return roomMemberIds
      .filter((memberId) => !removedProjectMemberIds.has(memberId))
      .map((memberId) => {
        const member = activeProjectMemberByUser.get(memberId);
        const profile = participantProfileMap[memberId];
        const name =
          member?.company_name ||
          member?.display_name ||
          profile?.display_name ||
          (memberId === user?.id ? '나' : '참여자');
        const roleLabel = getProjectRoleLabel(member?.role);
        const statusLabel = getProjectInvitationStatusLabel(member?.invitation_status);
        const phone = member?.phone || profile?.phone || null;
        const isOwner =
          memberId === project?.store_user_id ||
          memberId === roomInfo?.created_by ||
          member?.role === 'owner';

        return {
          userId: memberId,
          name,
          meta: [roleLabel, statusLabel, phone].filter(Boolean).join(' · '),
          projectMemberId: member?.id || null,
          isOwner,
          isMe: memberId === user?.id,
          canRemove: canManageChatParticipants && memberId !== user?.id && !isOwner,
        };
      });
  }, [
    canManageChatParticipants,
    participantProfileMap,
    project?.project_members,
    project?.store_user_id,
    roomInfo?.created_by,
    roomInfo?.members,
    user?.id,
  ]);
  const chatParticipantCount = roomInfo ? chatParticipants.length : 0;
  const shouldShowSenderNames = isWorkChatRoom || chatParticipantCount > 2;
  const selectedProjectSchedules = useMemo(() => {
    if (!project?.project_schedules) return [];

    return [...project.project_schedules]
      .filter((schedule) => projectScheduleContainsDate(selectedProjectDate, schedule))
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  }, [project?.project_schedules, selectedProjectDate]);
  const selectedProjectScheduleTitle =
    selectedProjectDate === todayProjectDate
      ? '오늘 일정'
      : `${formatProjectDate(selectedProjectDate)} 일정`;
  const projectCalendarDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const value = formatDateInput(date);
      return {
        value,
        day: date.getDate(),
        label: date.toLocaleDateString('ko-KR', { weekday: 'short' }),
        hasSchedule: (project?.project_schedules || []).some((schedule) =>
          projectScheduleContainsDate(value, schedule)
        ),
        hasReport: visibleProjectReports.some((report) => report.report_date === value),
      };
    });
  }, [project?.project_schedules, visibleProjectReports]);
  const latestProjectReport = visibleProjectReports[0] || null;
  const latestAppointment = useMemo(() => {
    const appointmentMessages = messages
      .map((message) => {
        const date = parseAppointmentDate(message.message);
        return date ? { message, date } : null;
      })
      .filter((item): item is { message: ChatMessage; date: Date } => Boolean(item))
      .sort(
        (a, b) =>
          new Date(b.message.created_at).getTime() -
          new Date(a.message.created_at).getTime()
      );

    return appointmentMessages[0] ?? null;
  }, [messages]);
  const latestAppointmentDate = latestAppointment?.date ?? null;
  const latestAppointmentTimestamp = latestAppointmentDate?.getTime() ?? null;
  const appointmentMsUntilStart = latestAppointmentTimestamp
    ? latestAppointmentTimestamp - nowMs
    : null;
  const appointmentChangeLocked =
    appointmentMsUntilStart !== null &&
    appointmentMsUntilStart > 0 &&
    appointmentMsUntilStart <= APPOINTMENT_CHANGE_LOCK_MS;
  const appointmentDateOptions = useMemo(() => {
    const baseDate = new Date(nowMs);
    baseDate.setHours(0, 0, 0, 0);

    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + index);

      return {
        value: formatDateInput(date),
        label: getAppointmentDateLabel(date, nowMs),
      };
    });
  }, [nowMs]);
  const appointmentTimeOptions = useMemo(() => {
    const options: string[] = [];

    for (let hour = 9; hour <= 22; hour += 1) {
      options.push(`${padDatePart(hour)}:00`);
      if (hour < 22) {
        options.push(`${padDatePart(hour)}:30`);
      }
    }

    return options;
  }, []);
  const availableAppointmentTimeOptions = useMemo(
    () =>
      appointmentTimeOptions.filter(
        (timeOption) => !isPastAppointmentTimeOption(selectedDateText, timeOption, nowMs)
      ),
    [appointmentTimeOptions, nowMs, selectedDateText]
  );

  useEffect(() => {
    if (!appointmentModalOpen || appointmentStep !== 'time') return;

    if (availableAppointmentTimeOptions.length === 0) {
      if (selectedTimeText) setSelectedTimeText('');
      return;
    }

    if (!availableAppointmentTimeOptions.includes(selectedTimeText)) {
      setSelectedTimeText(availableAppointmentTimeOptions[0]);
    }
  }, [
    appointmentModalOpen,
    appointmentStep,
    availableAppointmentTimeOptions,
    selectedTimeText,
  ]);

  const hasAppointmentCompletionPromptForDate = useCallback(
    (appointmentDate: Date, sourceMessages = messages) => {
      const appointmentValue = formatAppointmentValue(appointmentDate);

      return sourceMessages.some((message) => {
        const promptDate = parseAppointmentCompletionDate(message.message);
        if (!message.message.startsWith(APPOINTMENT_COMPLETION_PROMPT_PREFIX) || !promptDate) {
          return false;
        }

        return formatAppointmentValue(promptDate) === appointmentValue;
      });
    },
    [messages]
  );

  const hasAppointmentCompletionResponseForDate = useCallback(
    (appointmentDate: Date, sourceMessages = messages, responderId?: string | null) => {
      const appointmentValue = formatAppointmentValue(appointmentDate);

      return sourceMessages.some((message) => {
        if (responderId && message.sender_id !== responderId) {
          return false;
        }

        const responseDate = parseAppointmentCompletionDate(message.message);
        if (!message.message.startsWith(APPOINTMENT_COMPLETION_RESPONSE_PREFIX) || !responseDate) {
          return false;
        }

        return formatAppointmentValue(responseDate) === appointmentValue;
      });
    },
    [messages]
  );

  const closeImageViewer = useCallback(() => {
    setImageViewerOpen(false);
    setSelectedImageUrls([]);
    setSelectedImageIndex(0);
  }, []);

  const goPrevImage = useCallback(() => {
    setSelectedImageIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goNextImage = useCallback(() => {
    setSelectedImageIndex((prev) => Math.min(selectedImageUrls.length - 1, prev + 1));
  }, [selectedImageUrls.length]);

  const targetUserId = isWorkChatRoom
    ? null
    : roomInfo?.members?.find((m) => m.user_id !== user?.id)?.user_id ||
      (user?.id === listing?.author_id ? listing?.buyer_id : listing?.author_id);
  const incomingCall =
    currentCall?.status === 'ringing' && currentCall.callee_id === user?.id ? currentCall : null;
  const outgoingCall =
    currentCall?.status === 'ringing' && currentCall.caller_id === user?.id ? currentCall : null;
  const activeCall = currentCall?.status === 'accepted' ? currentCall : null;

  const visibleCall = incomingCall || outgoingCall || activeCall;
  const controllableCall = activeCall || outgoingCall || incomingCall;
  const remoteCameraOff =
    visibleCall?.call_type === 'video' && visibleCall.caller_id === user?.id
      ? !!visibleCall.callee_camera_off
      : visibleCall?.call_type === 'video' && visibleCall?.callee_id === user?.id
        ? !!visibleCall.caller_camera_off
        : false;
  const visibleCallLabel = visibleCall ? getCallTypeLabel(visibleCall.call_type) : '';
  const visibleCallTitle = incomingCall
    ? `${visibleCallLabel} 수신`
    : outgoingCall
      ? `${visibleCallLabel} 발신 중`
      : `${visibleCallLabel} 연결됨`;
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const dismissChatKeyboard = useCallback(() => {
    Keyboard.dismiss();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
  }, []);

  const prepareChatNavigation = useCallback(() => {
    dismissChatKeyboard();
    setScreenFocused(false);
  }, [dismissChatKeyboard]);

  const handleMessageListTouchStart = useCallback((event: GestureResponderEvent) => {
    messageTouchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    messageTouchMovedRef.current = false;
  }, []);

  const handleMessageListTouchMove = useCallback((event: GestureResponderEvent) => {
    const start = messageTouchStartRef.current;
    if (!start) return;

    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);

    if (dx > 8 || dy > 8) {
      messageTouchMovedRef.current = true;
    }
  }, []);

  const handleMessageListTouchEnd = useCallback(() => {
    if (keyboardVisible && !messageTouchMovedRef.current) {
      dismissChatKeyboard();
    }

    messageTouchStartRef.current = null;
    messageTouchMovedRef.current = false;
  }, [dismissChatKeyboard, keyboardVisible]);

  const handleMessageListTouchCancel = useCallback(() => {
    messageTouchStartRef.current = null;
    messageTouchMovedRef.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);

      return () => {
        setScreenFocused(false);
        dismissChatKeyboard();
      };
    }, [dismissChatKeyboard])
  );

  const handleBackPress = useCallback(() => {
    prepareChatNavigation();

    if (returnTarget === 'chatList') {
      router.replace('/(tabs)/chat' as any);
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/chat' as any);
  }, [prepareChatNavigation, returnTarget]);

  const edgeBackSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS === 'ios')
        .activeOffsetX(18)
        .failOffsetY([-18, 18])
        .onEnd((event) => {
          if (event.translationX > 72 || event.velocityX > 650) {
            runOnJS(handleBackPress)();
          }
        }),
    [handleBackPress]
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBackPress();
        return true;
      });

      return () => {
        subscription.remove();
      };
    }, [handleBackPress])
  );


  const goToChatTargetProfile = () => {
    if (project?.id) {
      goToProjectManagement();
      return;
    }

    if (isEstimateRoom && (estimateRequest?.id || roomInfo?.estimate_request_id)) {
      prepareChatNavigation();
      router.push({
        pathname: '/store/estimates',
        params: { requestId: String(estimateRequest?.id || roomInfo?.estimate_request_id) },
      } as any);
      return;
    }

    if (!targetUserId) return;
    prepareChatNavigation();
    router.push(`/(tabs)/home/user/${targetUserId}` as any);
  };

  const goToProjectManagement = (reportId?: string | null) => {
    if (!project?.id) return;
    prepareChatNavigation();
    router.push({
      pathname: '/store/projects',
      params: {
        projectId: project.id,
        returnTo: 'chat',
        ...(reportId ? { reportId } : {}),
      },
    } as any);
  };

  const goToProjectDailyReport = () => {
    if (!project?.id) return;
    prepareChatNavigation();
    router.push({
      pathname: '/store/projects',
      params: {
        projectId: project.id,
        returnTo: 'chat',
        action: 'dailyReport',
        focus: String(Date.now()),
      },
    } as any);
  };

  const isCallParticipant = useCallback(
    (call?: ChatCallSession | null) =>
      !!call && (call.caller_id === user?.id || call.callee_id === user?.id),
    [user?.id]
  );

  const fetchActiveCall = useCallback(async () => {
    if (!roomId || !user) return;

    const { data, error } = await supabase
      .from('chat_call_sessions')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['ringing', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      if (!String(error.message || '').includes('chat_call_sessions')) {
        console.log('통화 세션 조회 실패:', error);
      }
      return;
    }

    const latestCall = ((data || [])[0] || null) as ChatCallSession | null;
    setCurrentCall(isCallParticipant(latestCall) ? latestCall : null);
  }, [roomId, user, isCallParticipant]);

  // 통화 연결음/벨소리 종료
  const stopCallSound = useCallback(() => {
    try {
      const manager = InCallManager as any;

      if (typeof manager.stopRingback === 'function') {
        manager.stopRingback();
      }

      if (typeof manager.stopRingtone === 'function') {
        manager.stopRingtone();
      }
    } catch (error) {
      console.log('통화 연결음/벨소리 종료 실패:', error);
    }
  }, []);

  // 통화 연결 정리
  const cleanupCallMedia = useCallback(() => {
    stopCallSound();

    try {
      peerConnectionRef.current?.close();
    } catch (error) {
      console.log('통화 연결 정리 실패:', error);
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());

    peerConnectionRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteDescriptionSetRef.current = false;
    queuedIceCandidatesRef.current = [];
    processedIceCandidateIdsRef.current = new Set();
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setCallStartedAtMs(null);
    setCallDurationText('00:00');
    setCallMicMuted(false);
    setCallSpeakerOn(false);
    setCallCameraOff(false);
    setCallFacingMode('user');

    try {
      InCallManager.stop();
    } catch (error) {
      console.log('통화 오디오 매니저 종료 실패:', error);
    }
  }, [stopCallSound]);

  // 통화용 로컬 미디어 스트림 가져오기
  const getLocalCallStream = useCallback(
    async (callType: ChatCallType) => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !callMicMuted;
        });

        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = !callCameraOff;
        });

        return localStreamRef.current;
      }

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video:
          callType === 'video'
            ? {
              facingMode: callFacingMode,
              width: 720,
              height: 1280,
              frameRate: 30,
            }
            : false,
      });

      stream.getAudioTracks().forEach((track) => {
        track.enabled = !callMicMuted;
      });

      stream.getVideoTracks().forEach((track) => {
        track.enabled = !callCameraOff;
      });

      localStreamRef.current = stream;
      setLocalCallStream(stream);

      return stream;
    },
    [callMicMuted, callCameraOff, callFacingMode]
  );

  // ICE 후보 저장
  const insertIceCandidate = useCallback(
    async (callId: string, candidate: RTCIceCandidatePayload) => {
      if (!user) return;

      const { error } = await supabase.from('chat_call_ice_candidates').insert({
        call_id: callId,
        user_id: user.id,
        candidate,
      });

      if (error) {
        console.log('ICE 후보 저장 실패:', error);
      }
    },
    [user]
  );

  // 대기 중인 ICE 후보 적용
  const flushQueuedIceCandidates = useCallback(async () => {
    if (!peerConnectionRef.current || !remoteDescriptionSetRef.current) return;

    const queued = queuedIceCandidatesRef.current;
    queuedIceCandidatesRef.current = [];

    for (const item of queued) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(item.candidate));
      } catch (error) {
        console.log('대기 ICE 후보 적용 실패:', error);
      }
    }
  }, []);


  // 원격 ICE 후보 적용
  const addRemoteIceCandidate = useCallback(
    async (candidateRow: ChatCallIceCandidate) => {
      if (!user || candidateRow.user_id === user.id) return;
      if (processedIceCandidateIdsRef.current.has(candidateRow.id)) return;

      processedIceCandidateIdsRef.current.add(candidateRow.id);

      if (!peerConnectionRef.current || !remoteDescriptionSetRef.current) {
        queuedIceCandidatesRef.current.push(candidateRow);
        return;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidateRow.candidate)
        );
      } catch (error) {
        console.log('원격 ICE 후보 적용 실패:', error);
      }
    },
    [user]
  );

  // 통화 연결음/벨소리 시작
  const startCallSound = useCallback(
    (call: ChatCallSession) => {
      try {
        const manager = InCallManager as any;

        if (call.status !== 'ringing') return;

        if (call.caller_id === user?.id) {
          if (typeof manager.startRingback === 'function') {
            manager.startRingback();
          }
          return;
        }

        if (call.callee_id === user?.id) {
          if (typeof manager.startRingtone === 'function') {
            manager.startRingtone();
          }
        }
      } catch (error) {
        console.log('통화 연결음/벨소리 시작 실패:', error);
      }
    },
    [user?.id]
  );



  // 통화용 PeerConnection 생성
  const createCallPeerConnection = useCallback(
    (callId: string, stream: MediaStream) => {
      const peer = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      (peer as any).onicecandidate = (event: any) => {
        if (!event.candidate) return;

        const candidate = typeof event.candidate.toJSON === 'function'
          ? event.candidate.toJSON()
          : event.candidate;

        void insertIceCandidate(callId, candidate);
      };

      (peer as any).ontrack = (event: any) => {
        const [remoteStream] = event.streams || [];
        if (!remoteStream) return;

        remoteStreamRef.current = remoteStream;
        setRemoteCallStream(remoteStream);
      };

      peerConnectionRef.current = peer;
      return peer;
    },
    [insertIceCandidate]
  );

  // ICE 후보 조회 및 적용
  const fetchAndApplyIceCandidates = useCallback(
    async (callId: string) => {
      const { data, error } = await supabase
        .from('chat_call_ice_candidates')
        .select('*')
        .eq('call_id', callId)
        .order('created_at', { ascending: true });

      if (error) {
        console.log('ICE 후보 조회 실패:', error);
        return;
      }

      for (const candidate of (data || []) as ChatCallIceCandidate[]) {
        await addRemoteIceCandidate(candidate);
      }
    },
    [addRemoteIceCandidate]
  );

  // 채팅방 정보, 메시지, 읽음 상태 등 초기 데이터 조회 및 실시간 구독 설정
  useEffect(() => {
    if (!roomId) return;

    setMessagesLoaded(false);
    initialReportWarningRunningRef.current = false;

    supabase.getChannels().forEach((channel) => {
      if (
        channel.topic.includes(`chat-messages:${roomId}`) ||
        channel.topic.includes(`chat-reads:${roomId}`)
      ) {
        supabase.removeChannel(channel);
      }
    });

    fetchRoomInfo();
    fetchMessages();
    fetchReads();
    void (async () => {
      await markAsReadSafe();
      await fetchReads();
    })();
    fetchMuteState();

    const messageChannel = supabase
      .channel(`chat-messages:${roomId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMsg.id);
            if (exists) return prev;
            return [...prev, newMsg];
          });

          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 350);

          if (newMsg.sender_id !== user?.id) {
            await maybeShowIncomingTradeWarning(newMsg);
            await markAsReadSafe();
            await fetchReads();
          }
        }
      )
      .subscribe();

    const readChannel = supabase
      .channel(`chat-reads:${roomId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_reads',
        },
        () => fetchReads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(readChannel);
    };
  }, [roomId, user?.id]);

  // 통화 시작 시각 및 통화 시간 표시 업데이트
  useEffect(() => {
    if (!activeCall) {
      setCallStartedAtMs(null);
      setCallDurationText('00:00');
      return;
    }

    const startedAt =
      activeCall.answered_at && !Number.isNaN(new Date(activeCall.answered_at).getTime())
        ? new Date(activeCall.answered_at).getTime()
        : Date.now();

    setCallStartedAtMs(startedAt);
    setCallDurationText(formatCallDuration(Math.floor((Date.now() - startedAt) / 1000)));

    const intervalId = setInterval(() => {
      setCallDurationText(formatCallDuration(Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeCall?.id, activeCall?.answered_at]);

  // 영상통화 수신 시 미리보기용 로컬 스트림 준비
  useEffect(() => {
    if (!incomingCall) return;
    if (incomingCall.call_type !== 'video') return;
    if (localStreamRef.current) return;

    let cancelled = false;

    const preparePreview = async () => {
      try {
        const hasPermission = await ensureCallDevicePermissions('video');
        if (!hasPermission || cancelled) return;

        await getLocalCallStream('video');
      } catch (error) {
        console.log('영상통화 수신 미리보기 준비 실패:', error);
      }
    };

    void preparePreview();

    return () => {
      cancelled = true;
    };
  }, [incomingCall?.id]);

  // 통화 세션 상태 변경 구독 및 처리
  useEffect(() => {
    if (!roomId || !user) return;

    void fetchActiveCall();

    const callChannel = supabase
      .channel(`chat-calls:${roomId}:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_call_sessions',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const call = payload.new as ChatCallSession | null;

          if (!isCallParticipant(call)) return;

          if (call?.status === 'ringing' || call?.status === 'accepted') {
            setCurrentCall(call);
            return;
          }

          cleanupCallMedia();
          setCurrentCall((prev) => (prev?.id === call?.id ? null : prev));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(callChannel);
    };
  }, [roomId, user, fetchActiveCall, isCallParticipant, cleanupCallMedia]);

  // 통화 종료 시 미디어 정리
  useEffect(() => {
    return () => {
      cleanupCallMedia();
    };
  }, [cleanupCallMedia]);

  // ICE 후보 실시간 구독 및 적용
  useEffect(() => {
    if (!currentCall?.id || !user) return;

    void fetchAndApplyIceCandidates(currentCall.id);

    const candidateChannel = supabase
      .channel(`chat-call-ice:${currentCall.id}:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_call_ice_candidates',
          filter: `call_id=eq.${currentCall.id}`,
        },
        (payload) => {
          void addRemoteIceCandidate(payload.new as ChatCallIceCandidate);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(candidateChannel);
    };
  }, [currentCall?.id, user, fetchAndApplyIceCandidates, addRemoteIceCandidate]);

  // 통화 수락 시 원격 SDP 적용
  useEffect(() => {
    if (
      !currentCall ||
      currentCall.status !== 'accepted' ||
      currentCall.caller_id !== user?.id ||
      !currentCall.answer ||
      !peerConnectionRef.current ||
      remoteDescriptionSetRef.current
    ) {
      return;
    }

    const applyAnswer = async () => {
      try {
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(currentCall.answer as RTCSessionPayload)
        );
        remoteDescriptionSetRef.current = true;
        await flushQueuedIceCandidates();
      } catch (error) {
        console.log('통화 answer 적용 실패:', error);
        Alert.alert('통화 연결 실패', '상대방 응답을 연결하지 못했습니다.');
      }
    };

    void applyAnswer();
  }, [
    currentCall?.id,
    currentCall?.status,
    currentCall?.answer,
    currentCall?.caller_id,
    user?.id,
    flushQueuedIceCandidates,
  ]);

  // 초기 거래완료 확인 메시지 전송 경고 표시
  useEffect(() => {
    if (!messagesLoaded || !targetUserId || !roomId) return;
    maybeShowInitialRoomReportWarning();
  }, [messagesLoaded, targetUserId, roomId, messages.length]);

  // 통화 오디오 매니저 시작 및 종료
  useEffect(() => {
    if (!visibleCall) return;

    const mediaType = visibleCall.call_type === 'video' ? 'video' : 'audio';

    try {
      InCallManager.start({ media: mediaType });
      InCallManager.setMicrophoneMute(callMicMuted);

      startCallSound(visibleCall);

      setTimeout(() => {
        applyCallSpeakerMode(callSpeakerOn);
      }, 300);
    } catch (error) {
      console.log('통화 오디오 매니저 시작 실패:', error);
    }

    return () => {
      try {
        stopCallSound();

        const manager = InCallManager as any;

        if (typeof manager.setForceSpeakerphoneOn === 'function') {
          manager.setForceSpeakerphoneOn(null);
        }

        InCallManager.stop();
      } catch (error) {
        console.log('통화 오디오 매니저 종료 실패:', error);
      }
    };
  }, [visibleCall?.id, startCallSound, stopCallSound]);
  // 통화 시작 시 연결음/벨소리 종료
  useEffect(() => {
    if (activeCall) {
      stopCallSound();
    }
  }, [activeCall?.id, stopCallSound]);

  // 통화 중 마이크 음소거 상태 적용
  useEffect(() => {
    if (!visibleCall) return;

    try {
      InCallManager.setMicrophoneMute(callMicMuted);
    } catch (error) {
      console.log('마이크 상태 변경 실패:', error);
    }
  }, [visibleCall?.id, callMicMuted]);

  // 통화 중 스피커 모드 적용
  useEffect(() => {
    if (!visibleCall) return;

    applyCallSpeakerMode(callSpeakerOn);
  }, [visibleCall?.id, callSpeakerOn]);

  // 거래완료 확인 메시지 자동 전송
  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, APPOINTMENT_AUTO_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setWorkPanelCollapsed(false);
  }, [roomId]);

  // 거래완료 확인 메시지 자동 전송
  useEffect(() => {
    if (!roomId || !messagesLoaded || !latestAppointmentTimestamp) return;
    if (latestAppointmentTimestamp > nowMs) return;

    const appointmentDate = new Date(latestAppointmentTimestamp);

    if (hasAppointmentCompletionPromptForDate(appointmentDate)) return;
    if (appointmentCompletionPromptRunningRef.current) return;

    let cancelled = false;
    appointmentCompletionPromptRunningRef.current = true;

    const sendCompletionPromptIfNeeded = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, room_id, sender_id, message, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.log('거래완료 확인 메시지 조회 실패:', error);
          return;
        }

        const currentMessages = (data || []) as ChatMessage[];

        if (hasAppointmentCompletionPromptForDate(appointmentDate, currentMessages)) {
          return;
        }

        await sendMessage(roomId, makeAppointmentCompletionPrompt(appointmentDate), {
          skipProhibitedCheck: true,
        });
      } catch (error) {
        console.log('거래완료 확인 메시지 전송 실패:', error);
      } finally {
        appointmentCompletionPromptRunningRef.current = false;
      }
    };

    sendCompletionPromptIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [
    roomId,
    messagesLoaded,
    latestAppointmentTimestamp,
    nowMs,
    messages.length,
    hasAppointmentCompletionPromptForDate,
  ]);

  // 키보드 높이 및 표시 상태 관리
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  // 장소 전송 처리
  useEffect(() => {
    if (!roomId || !lat || !lng) return;

    const placeAddress = String(address || '').trim();
    if (!placeAddress) {
      showChatAlert('장소 전송 실패', '선택한 장소의 주소를 확인하지 못했습니다.');
      router.setParams({ lat: '', lng: '', address: '' } as any);
      return;
    }

    const placeKey = `${roomId}:${lat}:${lng}:${placeAddress}`;
    if (sentPlaceKeysRef.current.has(placeKey)) return;
    sentPlaceKeysRef.current.add(placeKey);

    sendMessage(roomId, makePlaceMessage(placeAddress, lat, lng), {
      skipProhibitedCheck: true,
    })
      .then(() => {
        router.setParams({ lat: '', lng: '', address: '' } as any);
      })
      .catch((e: any) => {
        router.setParams({ lat: '', lng: '', address: '' } as any);
        showChatAlert('장소 전송 실패', e?.message || '거래 장소를 전송하지 못했습니다.');
      });
  }, [roomId, lat, lng, address]);

  // 선택한 장소 전송 처리
  const sendSelectedPlace = useCallback(
    (selection: ChatPlaceSelection) => {
      if (!roomId || selection.roomId !== roomId) return;

      const placeAddress = selection.address.trim();
      if (!placeAddress) {
        clearChatPlaceSelection(selection.id);
        showChatAlert('장소 전송 실패', '선택한 장소의 주소를 확인하지 못했습니다.');
        return;
      }

      const placeKey = `${selection.id}:${roomId}`;
      if (sentPlaceKeysRef.current.has(placeKey)) return;
      sentPlaceKeysRef.current.add(placeKey);
      clearChatPlaceSelection(selection.id);

      sendMessage(
        roomId,
        makePlaceMessage(placeAddress, selection.latitude, selection.longitude),
        {
          skipProhibitedCheck: true,
        }
      ).catch((e: any) => {
        showChatAlert('장소 전송 실패', e?.message || '약속장소를 전송하지 못했습니다.');
      });
    },
    [roomId]
  );

  // 선택한 장소 전송 처리 구독
  useEffect(() => {
    if (!roomId) return;

    const pendingSelection = consumeLatestChatPlaceSelection(roomId);
    if (pendingSelection) {
      sendSelectedPlace(pendingSelection);
    }

    return subscribeChatPlaceSelection(sendSelectedPlace);
  }, [roomId, sendSelectedPlace]);

  // 상대방 프로필, 평점, 신고수 조회
  useEffect(() => {
    if (!targetUserId) {
      setChatTargetProfile(null);
      setChatTargetRating({ avg: null, count: 0 });
      setChatTargetReportCount(0);
      return;
    }

    setChatTargetProfile(null);
    setChatTargetRating({ avg: null, count: 0 });
    setChatTargetReportCount(0);
    fetchChatTargetProfile(targetUserId);
    fetchUserRating(targetUserId);
    fetchUserReportCount(targetUserId);
  }, [targetUserId]);

  // 이미지 메시지 썸네일 미리 불러오기 (안드로이드 전용)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const thumbnailUrls = new Set<string>();

    messages.forEach((message) => {
      parseImageMessage(message.message).forEach((image) => {
        thumbnailUrls.add(image.thumbnailUrl);
      });
    });

    Array.from(thumbnailUrls)
      .slice(-60)
      .forEach((uri) => {
        Image.prefetch(uri).catch(() => undefined);
      });
  }, [messages]);


  // 상대방 프로필 조회
  const mergeParticipantProfiles = useCallback((profiles: any[]) => {
    setParticipantProfileMap((prev) => {
      const next = { ...prev };

      profiles.forEach((profile) => {
        if (!profile?.id) return;

        next[profile.id] = {
          display_name: profile.display_name,
          phone: profile.phone,
          is_phone_public: profile.is_phone_public ?? null,
          user_type: profile.user_type,
          business_verified: profile.business_verified,
          account: profile.account,
          trust_points: profile.trust_points,
          trust_level: profile.trust_level,
        };
      });

      return next;
    });
  }, []);

  const fetchProfilesForUserIds = useCallback(
    async (userIds: string[]) => {
      const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
      if (uniqueUserIds.length === 0) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, phone, is_phone_public, user_type, business_verified, account, trust_points, trust_level')
        .in('id', uniqueUserIds);

      if (error) {
        console.log('채팅 사용자 프로필 조회 실패:', error);
        return;
      }

      mergeParticipantProfiles(data || []);
    },
    [mergeParticipantProfiles]
  );

  const fetchChatTargetProfile = async (targetId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, phone, is_phone_public, user_type, business_verified, account, trust_points, trust_level')
      .eq('id', targetId)
      .maybeSingle();

    if (error) {
      console.log('상대방 프로필 조회 실패:', error);
      setChatTargetProfile(null);
      return;
    }

    setChatTargetProfile((data || null) as ChatUserProfile | null);
  };

  // 상대방 평점 조회
  const fetchUserRating = async (targetId: string) => {
    const { count, error } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', targetId);

    if (error) {
      setChatTargetRating({ avg: null, count: 0 });
      return;
    }

    setChatTargetRating({ avg: null, count: count || 0 });
  };

  // 상대방 신고수 조회
  const fetchUserReportCount = async (targetId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('reports_count')
      .eq('id', targetId)
      .maybeSingle();

    if (profileError) {
      console.log('상대방 신고수 프로필 조회 실패:', profileError);
    }

    let reportCount = Number(profile?.reports_count ?? 0);

    const { count, error: reportCountError } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', targetId);

    if (reportCountError) {
      console.log('상대방 신고수 조회 실패:', reportCountError);
    } else if (typeof count === 'number') {
      reportCount = Math.max(reportCount, count);
    }

    setChatTargetReportCount(reportCount);
  };

  // 채팅방 정보 조회
  const fetchRoomInfo = async () => {
    if (!roomId) return;

    const { data, error } = await supabase
      .from('chat_rooms')
      .select(`
    id,
    listing_id,
    store_user_id,
    room_type,
    estimate_request_id,
    estimate_quote_id,
    project_id,
    title,
    workflow_status,
    completed_at,
    created_by,
    created_at,
    chat_room_members (
      user_id
    ),
    store_projects (
      id,
      store_user_id,
      assigned_staff_user_id,
      name,
      status,
      address,
      start_date,
      end_date,
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
        status,
        memo
      ),
      daily_reports (
        id,
        report_date,
        work_content,
        progress_percent,
        customer_visible,
        daily_report_images (
          id,
          image_path
        )
      )
    ),
    estimate_requests (
      id,
      title,
      category,
      status,
      region,
      address,
      desired_date,
      applicant_name,
      applicant_phone
    ),
    listings (
          id,
          category,
          title,
          price_text,
          region,
          status,
          author_id,
          buyer_id,
          quantity_total,
          quantity_remaining,
          quantity_sold,
          listing_images (
            id,
            image_path,
            sort_order
          ),
          profiles!listings_author_id_fkey (
            display_name,
            phone,
            is_phone_public,
            user_type,
            business_verified,
            account
          )
        )
      `)
      .eq('id', roomId)
      .single();

    if (error) {
      console.log('채팅방 정보 조회 실패:', error);
      return;
    }

    const listingData: any = data?.listings;
    const projectData: any = data?.store_projects;
    const estimateRequestData: any = data?.estimate_requests;
    const roomMemberIds = Array.from(
      new Set(
        (data?.chat_room_members || [])
          .map((member: any) => member.user_id)
          .filter(Boolean)
      )
    ) as string[];

    const sortedImages = [...(listingData?.listing_images || [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const sortedSchedules = [...(projectData?.project_schedules || [])].sort(
      (a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date))
    );
    const sortedReports = [...(projectData?.daily_reports || [])].sort(
      (a: any, b: any) => String(b.report_date).localeCompare(String(a.report_date))
    );

    if (roomMemberIds.length > 0) {
      const { data: participantProfiles, error: participantProfileError } = await supabase
        .from('profiles')
        .select('id, display_name, phone, is_phone_public, user_type, business_verified, account, trust_points, trust_level')
        .in('id', roomMemberIds);

      if (participantProfileError) {
        console.log('채팅 참여자 프로필 조회 실패:', participantProfileError);
        setParticipantProfileMap({});
      } else {
        mergeParticipantProfiles(participantProfiles || []);
      }
    }

    setRoomInfo({
      ...data,
      members: data?.chat_room_members || [],
      listing: listingData ? { ...listingData, listing_images: sortedImages } : null,
      project: projectData
        ? {
            ...projectData,
            project_schedules: sortedSchedules,
            daily_reports: sortedReports,
          }
        : null,
      estimateRequest: estimateRequestData || null,
      sellerProfile: listingData?.profiles
        ? {
          display_name: listingData.profiles.display_name,
          phone: listingData.profiles.phone,
          is_phone_public: listingData.profiles.is_phone_public,
          user_type: listingData.profiles.user_type,
          business_verified: listingData.profiles.business_verified,
          account: listingData.profiles.account,
        }
        : null,
    } as RoomInfo);

  };

  // 채팅방 음소거 상태 조회
  const fetchMuteState = async () => {
    if (!user || !roomId) return;

    const { data } = await supabase
      .from('chat_room_settings')
      .select('muted')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    setIsMuted(data?.muted ?? false);
  };

  // 채팅방 정보 및 음소거 상태 초기 조회
  useFocusEffect(
    useCallback(() => {
      if (!roomId) return;

      fetchRoomInfo();
      fetchMuteState();
    }, [roomId, user?.id])
  );

  // 신고 경고 관련 정보 조회
  const fetchReportRisk = async (targetId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, reports_count')
      .eq('id', targetId)
      .maybeSingle();

    if (profileError) {
      console.log('신고 경고 프로필 조회 실패:', profileError);
    }

    let reportCount = Number(profile?.reports_count ?? 0);

    const { count, error: reportCountError } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', targetId);

    if (reportCountError) {
      console.log('신고 경고 신고횟수 조회 실패:', reportCountError);
    } else if (typeof count === 'number') {
      reportCount = Math.max(reportCount, count);
    }

    return {
      displayName: profile?.display_name || '상대방',
      reportCount,
    };
  };

  // 신고 경고 표시 상태 키 생성
  const getReportWarningDismissedKey = (targetId: string) => {
    if (!user || !roomId) return null;
    return `${REPORT_WARNING_DISMISSED_PREFIX}:${user.id}:${roomId}:${targetId}`;
  };

  // 초기 신고 경고 표시 상태 키 생성
  const getInitialReportWarningShownKey = (targetId: string) => {
    if (!user || !roomId) return null;
    return `${REPORT_WARNING_INITIAL_SHOWN_PREFIX}:${user.id}:${roomId}:${targetId}`;
  };

  // 메시지별 신고 경고 표시 상태 키 생성
  const getMessageReportWarningShownKey = (messageId: string) => {
    if (!user || !roomId) return null;
    return `${REPORT_WARNING_MESSAGE_SHOWN_PREFIX}:${user.id}:${roomId}:${messageId}`;
  };

  // 신고 경고 숨김 상태 조회
  const isReportWarningDismissedForRoom = async (targetId: string) => {
    const key = getReportWarningDismissedKey(targetId);
    if (!key) return false;

    try {
      return (await AsyncStorage.getItem(key)) === '1';
    } catch (error) {
      console.log('거래 주의 숨김 상태 조회 실패:', error);
      return false;
    }
  };

  // 신고 경고 숨김 상태 저장
  const dismissReportWarningForRoom = async (targetId: string) => {
    const key = getReportWarningDismissedKey(targetId);
    if (!key) return;

    try {
      await AsyncStorage.setItem(key, '1');
    } catch (error) {
      console.log('거래 주의 숨김 상태 저장 실패:', error);
    }
  };

  // 초기 거래 주의 표시 상태 조회
  const isInitialReportWarningShownForRoom = async (targetId: string) => {
    const key = getInitialReportWarningShownKey(targetId);
    if (!key) return false;

    try {
      return (await AsyncStorage.getItem(key)) === '1';
    } catch (error) {
      console.log('초기 거래 주의 표시 상태 조회 실패:', error);
      return false;
    }
  };

  // 초기 거래 주의 표시 상태 저장
  const markInitialReportWarningShownForRoom = async (targetId: string) => {
    const key = getInitialReportWarningShownKey(targetId);
    if (!key) return;

    try {
      await AsyncStorage.setItem(key, '1');
    } catch (error) {
      console.log('초기 거래 주의 표시 상태 저장 실패:', error);
    }
  };

  // 메시지별 거래 주의 표시 상태 조회
  const isMessageReportWarningShown = async (messageId: string) => {
    const key = getMessageReportWarningShownKey(messageId);
    if (!key) return false;

    try {
      return (await AsyncStorage.getItem(key)) === '1';
    } catch (error) {
      console.log('메시지 거래 주의 표시 상태 조회 실패:', error);
      return false;
    }
  };

  // 메시지별 거래 주의 표시 상태 저장
  const markMessageReportWarningShown = async (messageId: string) => {
    const key = getMessageReportWarningShownKey(messageId);
    if (!key) return;

    try {
      await AsyncStorage.setItem(key, '1');
    } catch (error) {
      console.log('메시지 거래 주의 표시 상태 저장 실패:', error);
    }
  };

  // 거래 주의 관련 메시지 판단
  const isPaymentRequestRelatedMessage = (message: string) => {
    return (
      message.startsWith(PAYMENT_REQUEST_PREFIX) ||
      PAYMENT_REQUEST_KEYWORDS.some((keyword) => message.includes(keyword))
    );
  };

  // 약속 요청 관련 메시지 판단
  const isAppointmentRequestRelatedMessage = (message: string) => {
    return message.startsWith(APPOINTMENT_REQUEST_PREFIX);
  };

  // 거래 주의 관련 메시지 판단
  const isTradeWarningRelatedMessage = (message: string) => {
    return (
      isPaymentRequestRelatedMessage(message) ||
      isAppointmentRequestRelatedMessage(message)
    );
  };

  // 거래 주의 경고 표시
  const showHighReportWarning = async (targetId: string, onConfirm?: () => void) => {
    if (!user || targetId === user.id) return false;

    const dismissed = await isReportWarningDismissedForRoom(targetId);
    if (dismissed) {
      return false;
    }

    const { displayName, reportCount } = await fetchReportRisk(targetId);

    if (reportCount < HIGH_REPORT_WARNING_THRESHOLD) {
      return false;
    }

    const warningMessage = `${displayName}님은 신고가 ${reportCount}회 접수된 계정입니다.\n약속이나 송금 전 거래 내용을 다시 확인해 주세요.`;

    if (Platform.OS === 'web') {
      window.alert(warningMessage);

      const shouldDismiss = window.confirm(
        '이 채팅방에서 이 거래 주의 경고를 다시 보지 않으시겠어요?'
      );

      if (shouldDismiss) {
        await dismissReportWarningForRoom(targetId);
      }

      onConfirm?.();
      return true;
    }

    Alert.alert(
      '거래 주의',
      warningMessage,
      [
        {
          text: '확인',
          onPress: onConfirm,
        },
        {
          text: '다시 보지 않기',
          onPress: () => {
            void dismissReportWarningForRoom(targetId);
            onConfirm?.();
          },
        },
      ]
    );

    return true;
  };

  // 메시지 수신 시 거래 주의 경고 표시
  const maybeShowIncomingTradeWarning = async (message: ChatMessage) => {
    if (
      !user ||
      message.sender_id === user.id ||
      !isTradeWarningRelatedMessage(message.message)
    ) {
      return;
    }

    const messageWarningShown = await isMessageReportWarningShown(String(message.id));
    if (messageWarningShown) return;

    const warningShown = await showHighReportWarning(message.sender_id);

    if (warningShown) {
      await markMessageReportWarningShown(String(message.id));
    }
  };

  // 초기 거래 주의 경고 표시
  const showInitialRoomReportWarning = async (targetId: string, onConfirm?: () => void) => {
    const initialWarningShown = await isInitialReportWarningShownForRoom(targetId);
    if (initialWarningShown) return false;

    const warningShown = await showHighReportWarning(targetId, onConfirm);

    if (warningShown) {
      await markInitialReportWarningShownForRoom(targetId);
    }

    return warningShown;
  };

  // 초기 거래 주의 경고 표시 여부 판단 및 표시
  const maybeShowInitialRoomReportWarning = async () => {
    if (!targetUserId || targetUserId === user?.id) return;
    if (initialReportWarningRunningRef.current) return;

    const firstMessage = messages[0];
    const shouldCheckInitialWarning =
      messages.length === 0 ||
      (messages.length === 1 && !isTradeWarningRelatedMessage(firstMessage.message));

    if (!shouldCheckInitialWarning) return;

    initialReportWarningRunningRef.current = true;

    try {
      await showInitialRoomReportWarning(targetUserId);
    } finally {
      initialReportWarningRunningRef.current = false;
    }
  };

  // 메시지 조회
  const fetchMessages = async () => {
    if (!roomId) return;

    setMessagesLoaded(false);

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('메시지 조회 실패:', error);
      setMessagesLoaded(true);
      return;
    }

    const loadedMessages = (data || []) as ChatMessage[];
    setMessages(loadedMessages);
    setMessagesLoaded(true);
    void fetchProfilesForUserIds(loadedMessages.map((message) => message.sender_id));

    const latestTradeWarningMessage = [...loadedMessages]
      .reverse()
      .find(
        (message) =>
          message.sender_id !== user?.id &&
          isTradeWarningRelatedMessage(message.message)
      );

    if (latestTradeWarningMessage) {
      await maybeShowIncomingTradeWarning(latestTradeWarningMessage);
    }

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 120);
  };

  // 메시지 읽음 조회
  const fetchReads = async () => {
    if (!roomId) return;

    const { data: msgs, error: msgErr } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('room_id', roomId);

    if (msgErr || !msgs || msgs.length === 0) {
      setReads([]);
      return;
    }

    const ids = msgs.map((m) => m.id);

    const { data, error } = await supabase
      .from('chat_message_reads')
      .select('*')
      .in('message_id', ids);

    if (error) {
      console.log('읽음 조회 실패:', error);
      return;
    }

    setReads((data || []) as MessageRead[]);
  };

  // 메시지 읽음 처리
  const markAsReadSafe = async () => {
    try {
      if (!roomId) return;
      await markMessagesAsRead(roomId);
    } catch (e) {
      console.log('읽음 처리 실패:', e);
    }
  };

  // 메시지 전송 처리
  const sendTextMessage = async (messageText: string) => {
  if (!roomId || sending || !user) return;

  const blockedKeyword = checkProhibitedContent(messageText);

  if (blockedKeyword) {
    showChatAlert(
      '전송 차단',
      `"${blockedKeyword}" 관련 판매금지 물품이나 내용은 채팅으로 보낼 수 없습니다.`
    );
    return;
  }

  try {
    setSending(true);

    // 입력창은 바로 비우기
    setText('');

    // DB에만 저장
    // 화면 표시는 Supabase realtime INSERT 구독에서 자동으로 들어오게 둠
    await sendMessage(roomId, messageText);

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  } catch (e) {
    console.log('메시지 전송 실패:', e);

    showChatAlert(
      '메시지 전송 실패',
      e instanceof Error ? e.message : '메시지를 보내지 못했습니다.'
    );

    // 실패했을 때 입력값 복구
    setText(messageText);
  } finally {
    setSending(false);
  }
};


// 메시지 전송 버튼 처리
  const onSend = async () => {
    if (!roomId || !text.trim() || sending) return;

    const messageText = text.trim();

    if (targetUserId && messages.length === 0) {
      const warningShown = await showInitialRoomReportWarning(targetUserId, () => {
        void sendTextMessage(messageText);
      });

      if (warningShown) return;
    }

    await sendTextMessage(messageText);
  };

  // 이미지 업로드 처리
  const uploadChatImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!roomId || !user) return null;

    let prepared: Awaited<ReturnType<typeof prepareChatImageForUpload>>;

    try {
      prepared = await prepareChatImageForUpload(asset);
    } catch (error) {
      console.log('채팅 이미지 변환 실패:', error);
      Alert.alert('오류', '사진을 전송하기 좋은 크기로 변환하지 못했습니다.');
      return null;
    }

    const { ext, contentType } = prepared;
    const filePath = `${roomId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    let fileData: Blob | ArrayBuffer;

    try {
      if (Platform.OS === 'web') {
        let blob: Blob;

        if (prepared.file) {
          blob = prepared.file;
        } else {
          const response = await fetch(prepared.uri);
          blob = await response.blob();
        }

        if (blob.size === 0) {
          throw new Error('선택한 사진 파일이 비어 있습니다.');
        }

        fileData = blob;
      } else {
        const base64 =
          prepared.base64 ||
          (await FileSystem.readAsStringAsync(prepared.uri, {
            encoding: 'base64',
          }));

        if (!base64) {
          throw new Error('사진 데이터를 읽지 못했습니다.');
        }

        const decoded = decode(base64);

        if (decoded.byteLength === 0) {
          throw new Error('선택한 사진 파일이 비어 있습니다.');
        }

        fileData = decoded;
      }
    } catch (error) {
      console.log('채팅 이미지 읽기 실패:', error);
      Alert.alert('오류', '사진 데이터를 읽지 못했습니다.');
      return null;
    }

    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(filePath, fileData, {
        contentType,
      });

    if (uploadError) {
      console.log('채팅 이미지 업로드 실패:', uploadError);
      Alert.alert('오류', '사진을 업로드하지 못했습니다.');
      return null;
    }

    const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // 채팅방 관련 이미지 URL
  const productImageUrl = useMemo(() => {
    const path = roomInfo?.listing?.listing_images?.[0]?.image_path;
    if (!path) return null;
    const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
    return data.publicUrl;
  }, [roomInfo?.listing?.listing_images]);

  // 채팅방 관련 정보
  const chatTargetName =
    roomInfo?.title ||
    project?.name ||
    (isEstimateRoom ? estimateRequest?.title || '견적 채팅' : null) ||
    chatTargetProfile?.display_name ||
    (targetUserId === listing?.author_id ? roomInfo?.sellerProfile?.display_name : null) ||
    '상대방';

  const chatTargetReviewText =
    chatTargetRating.count > 0
      ? `LV.${getSellerLevel(chatTargetProfile, chatTargetRating.count * 100)} ${getSellerLevelTitle(
        getSellerLevel(chatTargetProfile, chatTargetRating.count * 100)
      )} · 후기 ${chatTargetRating.count}개`
      : '후기 0개';
  const chatTargetSub = project
    ? `${isCompletedWorkChat ? '완료 · ' : ''}현장 채팅 · 참여자 ${chatParticipantCount}명`
    : isEstimateRoom
      ? `${isCompletedWorkChat ? '완료 · ' : ''}견적 채팅 · 참여자 ${chatParticipantCount}명`
    : `${chatTargetReviewText} · 신고 ${chatTargetReportCount}개`;
  const canStorePhoneCall =
    chatTargetProfile?.user_type === 'store' &&
    !!chatTargetProfile?.business_verified &&
    !!chatTargetProfile?.is_phone_public &&
    !!chatTargetProfile?.phone;

    // 전화 걸기 처리
  const openPhone = async () => {
    if (!targetUserId) {
      Alert.alert('전화하기', '전화할 상대를 찾을 수 없습니다.');
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name, phone, is_phone_public, user_type, business_verified')
        .eq('id', targetUserId)
        .maybeSingle();

      if (error) {
        console.log('전화번호 조회 실패:', error);
        Alert.alert('전화하기', '전화번호를 확인하지 못했습니다.');
        return;
      }

      const publicPhone =
        profile?.user_type === 'store' && profile?.business_verified && profile?.is_phone_public
          ? profile.phone
          : null;
      const phoneNumber = String(publicPhone || '').replace(/[^0-9+]/g, '');

      if (!phoneNumber) {
        Alert.alert(
          '전화하기',
          `${profile?.display_name || '상대방'}님이 전화번호를 등록하지 않았거나 공개하지 않았습니다.`
        );
        return;
      }

      const url = `tel:${phoneNumber}`;
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('전화하기', '이 기기에서는 전화 앱을 열 수 없습니다.');
        return;
      }

      await Linking.openURL(url);
    } catch (e) {
      console.log('전화 앱 열기 실패:', e);
      Alert.alert('오류', '전화 앱을 열지 못했습니다.');
    }
  };

  // 통화 권한 확인 및 요청
  const ensureCallDevicePermissions = async (callType: ChatCallType) => {
    if (!isNativeCallSupported) {
      Alert.alert(
        getCallTypeLabel(callType),
        '웹에서는 앱 내 보이스톡/영상통화를 지원하지 않습니다. 모바일 앱에서 이용해 주세요.'
      );
      return false;
    }

    if (Platform.OS !== 'android') {
      return true;
    }

    const requiredPermissions: Parameters<typeof PermissionsAndroid.requestMultiple>[0] = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ...(callType === 'video' ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
    ];

    if (Number(Platform.Version) >= 31) {
      requiredPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }

    const result = await PermissionsAndroid.requestMultiple(requiredPermissions);
    const denied = requiredPermissions.some(
      (permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED
    );

    if (denied) {
      Alert.alert(
        '권한 필요',
        callType === 'video'
          ? '영상통화를 사용하려면 마이크와 카메라 권한을 허용해 주세요.'
          : '보이스톡을 사용하려면 마이크 권한을 허용해 주세요.'
      );
      return false;
    }

    return true;
  };

  // 통화 상태 메시지 전송
  const sendCallStatusMessage = async (
    call: Pick<ChatCallSession, 'call_type' | 'answered_at'>,
    status: ChatCallStatus,
    endedAtMs = Date.now()
  ) => {
    if (!roomId) return;

    const durationSeconds =
      status === 'ended' ? getCallDurationSeconds(call, endedAtMs) : 0;

    try {
      await sendMessage(
        roomId,
        getCallStatusMessage(call.call_type, status, durationSeconds),
        {
          skipProhibitedCheck: true,
        }
      );
    } catch (error) {
      console.log('통화 상태 메시지 전송 실패:', error);
    }
  };

  // 통화 시작 처리
  const startInAppCall = async (callType: ChatCallType) => {
  if (callActionLockRef.current) return;
  callActionLockRef.current = true;

  try {
    if (!roomId || !user || !targetUserId) return;

    if (callActionLoading) return;

    if (!isNativeCallSupported) {
      setCallMenuOpen(false);
      Alert.alert(
        getCallTypeLabel(callType),
        '웹에서는 앱 내 보이스톡/영상통화를 지원하지 않습니다. 모바일 앱에서 이용해 주세요.'
      );
      return;
    }

    if (currentCall?.status === 'ringing' || currentCall?.status === 'accepted') {
      Alert.alert('통화', '이미 진행 중인 통화가 있습니다.');
      return;
    }

    setCallActionLoading(true);
    setCallMenuOpen(false);
    setCallSpeakerOn(false);
    setCallMicMuted(false);
    setCallCameraOff(false);
    setCallFacingMode('user');

    const guard = await canStartChat();

    if (!guard.ok) {
      Alert.alert('통화 제한', guard.reason || '현재 통화를 걸 수 없습니다.');
      return;
    }

    const hasPermission = await ensureCallDevicePermissions(callType);
    if (!hasPermission) return;

    const { data, error } = await supabase
      .from('chat_call_sessions')
      .insert({
        room_id: roomId,
        caller_id: user.id,
        callee_id: targetUserId,
        call_type: callType,
        status: 'ringing',
      })
      .select('*')
      .single();

    if (error) {
      console.log('통화 요청 생성 실패:', error);
      Alert.alert(
        '통화 요청 실패',
        error.message.includes('chat_call_sessions')
          ? 'Supabase에 chat_calls.sql을 먼저 적용해 주세요.'
          : '통화 요청을 보내지 못했습니다.'
      );
      return;
    }

    const call = data as ChatCallSession;

    
    // 먼저 발신 화면 표시
    setCurrentCall(call);
    setCallMenuOpen(false);

    const stream = await getLocalCallStream(callType);

    const peer = createCallPeerConnection(call.id, stream);
    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === 'video',
    });

    await peer.setLocalDescription(offer);

    const offerPayload =
      typeof offer.toJSON === 'function'
        ? offer.toJSON()
        : { type: offer.type, sdp: offer.sdp };

    const { data: callWithOffer, error: offerError } = await supabase
      .from('chat_call_sessions')
      .update({ offer: offerPayload })
      .eq('id', call.id)
      .select('*')
      .single();

    if (offerError) {
      console.log('통화 offer 저장 실패:', offerError);
      cleanupCallMedia();
      Alert.alert('통화 요청 실패', '통화 연결 정보를 저장하지 못했습니다.');
      return;
    }

    setCurrentCall(callWithOffer as ChatCallSession);

    // 통화 상태 메시지는 기다리지 않음
    void sendCallStatusMessage(call, 'ringing');
  } finally {
    setCallActionLoading(false);
    callActionLockRef.current = false;
  }
};

// 통화 상태 변경 처리
  const updateCallStatus = async (call: ChatCallSession, status: ChatCallStatus) => {
    if (!call || callActionLoading) return;

    const endedAtMs = Date.now();
    const nowIso = new Date(endedAtMs).toISOString();
    const values: Partial<ChatCallSession> = { status };

    if (['declined', 'canceled', 'ended', 'missed'].includes(status)) {
      values.ended_at = nowIso;
    }

    try {
      setCallActionLoading(true);

      if (status === 'accepted') {
        if (!isNativeCallSupported) {
          Alert.alert(
            getCallTypeLabel(call.call_type),
            '웹에서는 앱 내 보이스톡/영상통화를 지원하지 않습니다. 모바일 앱에서 이용해 주세요.'
          );
          return;
        }

        // setCallSpeakerOn(false);
        // setCallMicMuted(false);
        // setCallCameraOff(false);
        // setCallFacingMode('user');
        const hasPermission = await ensureCallDevicePermissions(call.call_type);
        if (!hasPermission) return;

        const { data: latestData, error: latestError } = await supabase
          .from('chat_call_sessions')
          .select('*')
          .eq('id', call.id)
          .single();

        if (latestError) {
          console.log('통화 offer 조회 실패:', latestError);
          Alert.alert('통화 연결 실패', '통화 요청 정보를 확인하지 못했습니다.');
          return;
        }

        const latestCall = latestData as ChatCallSession;

        if (!latestCall.offer) {
          Alert.alert('통화 연결 준비 중', '상대방 통화 연결 정보를 아직 받지 못했습니다. 잠시 후 다시 받아 주세요.');
          return;
        }

        const stream = await getLocalCallStream(latestCall.call_type);
        const peer = createCallPeerConnection(latestCall.id, stream);

        await peer.setRemoteDescription(new RTCSessionDescription(latestCall.offer));
        remoteDescriptionSetRef.current = true;
        await flushQueuedIceCandidates();

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        const answerPayload =
          typeof answer.toJSON === 'function'
            ? answer.toJSON()
            : { type: answer.type, sdp: answer.sdp };

        values.answered_at = nowIso;
        values.answer = answerPayload;
      }

      const { data, error } = await supabase
        .from('chat_call_sessions')
        .update(values)
        .eq('id', call.id)
        .select('*')
        .single();

      if (error) {
        console.log('통화 상태 변경 실패:', error);
        Alert.alert('통화', '통화 상태를 변경하지 못했습니다.');
        return;
      }

      const updatedCall = data as ChatCallSession;
      await sendCallStatusMessage(updatedCall, status, endedAtMs);

      if (status === 'accepted') {
        setCurrentCall(updatedCall);
        await fetchAndApplyIceCandidates(updatedCall.id);
        return;
      }

      cleanupCallMedia();
      setCurrentCall(null);
    } finally {
      setCallActionLoading(false);
    }
  };

  // 통화 마이크 음소거 토글
  const toggleCallMic = async () => {
    const nextMuted = !callMicMuted;

    if (!localStreamRef.current && visibleCall) {
      try {
        await getLocalCallStream(visibleCall.call_type);
      } catch (error) {
        console.log('마이크 제어용 스트림 준비 실패:', error);
      }
    }

    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setCallMicMuted(nextMuted);

    try {
      InCallManager.setMicrophoneMute(nextMuted);
    } catch (error) {
      console.log('마이크 음소거 변경 실패:', error);
    }
  };

  // 통화 카메라 전환
  const switchCallCamera = async () => {
    if (!visibleCall || visibleCall.call_type !== 'video') return;

    if (!localStreamRef.current) {
      try {
        await getLocalCallStream('video');
      } catch (error) {
        console.log('카메라 전환용 스트림 준비 실패:', error);
        Alert.alert('카메라 전환', '카메라를 준비하지 못했습니다.');
        return;
      }
    }

    const videoTrack = localStreamRef.current?.getVideoTracks()[0];

    if (!videoTrack) {
      Alert.alert('카메라 전환', '전환할 카메라가 없습니다.');
      return;
    }

    const switchCamera = (videoTrack as any)._switchCamera;

    if (typeof switchCamera === 'function') {
      switchCamera.call(videoTrack);
      setCallFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
      return;
    }

    Alert.alert('카메라 전환', '이 기기에서는 카메라 전환을 지원하지 않습니다.');
  };

  // 통화 카메라 꺼짐 상태 동기화
  const syncCallCameraOffState = useCallback(
    async (cameraOff: boolean) => {
      const call = visibleCall;

      if (!call || !user || call.call_type !== 'video') return;

      const column =
        call.caller_id === user.id
          ? 'caller_camera_off'
          : call.callee_id === user.id
            ? 'callee_camera_off'
            : null;

      if (!column) return;

      setCurrentCall((prev) =>
        prev?.id === call.id ? { ...prev, [column]: cameraOff } : prev
      );

      const { error } = await supabase
        .from('chat_call_sessions')
        .update({ [column]: cameraOff })
        .eq('id', call.id);

      if (error) {
        console.log('카메라 꺼짐 상태 저장 실패:', error);
      }
    },
    [user, visibleCall]
  );

  // 통화 카메라 토글
  const toggleCallCamera = async () => {
    if (!visibleCall || visibleCall.call_type !== 'video') return;

    if (!localStreamRef.current) {
      try {
        await getLocalCallStream('video');
      } catch (error) {
        console.log('카메라 제어용 스트림 준비 실패:', error);
        Alert.alert('카메라', '카메라를 준비하지 못했습니다.');
        return;
      }
    }

    const nextCameraOff = !callCameraOff;
    const nextTrackEnabled = !nextCameraOff;

    localStreamRef.current?.getVideoTracks().forEach((track) => {
      const setEnabled = (track as any)._setEnabled;

      try {
        if (typeof setEnabled === 'function') {
          setEnabled.call(track, nextTrackEnabled);
        }

        track.enabled = nextTrackEnabled;
      } catch (error) {
        console.log('카메라 상태 변경 실패:', error);
        try {
          track.enabled = nextTrackEnabled;
        } catch (fallbackError) {
          console.log('카메라 상태 재변경 실패:', fallbackError);
        }
      }
    });

    setCallCameraOff(nextCameraOff);
    void syncCallCameraOffState(nextCameraOff);
  };

  // 통화 스피커 모드 적용
  const applyCallSpeakerMode = (speakerOn: boolean) => {
    try {
      const manager = InCallManager as any;
      const route = speakerOn ? 'SPEAKER_PHONE' : 'BLUETOOTH';

      if (typeof manager.setForceSpeakerphoneOn === 'function') {
        manager.setForceSpeakerphoneOn(speakerOn);
      }

      InCallManager.setSpeakerphoneOn(speakerOn);

      if (typeof manager.chooseAudioRoute === 'function') {
        manager.chooseAudioRoute(route).catch((error: unknown) => {
          console.log('통화 오디오 라우트 변경 실패:', error);
        });
      }

      console.log('통화 스피커 라우팅 변경:', speakerOn ? 'speaker' : 'bluetooth/earpiece');
    } catch (error) {
      console.log('스피커폰 변경 실패:', error);
    }
  };

  // 통화 스피커 모드 토글
  const toggleCallSpeaker = () => {
    setCallSpeakerOn((prev) => {
      const nextSpeakerOn = !prev;
      applyCallSpeakerMode(nextSpeakerOn);
      return nextSpeakerOn;
    });
  };

  // 이미지 선택 처리
  const handleAlbum = async () => {
    setPlusMenuOpen(false);

    const guard = await canStartChat();

    if (!guard.ok) {
      showChatAlert('채팅 제한', guard.reason || '채팅 이용이 제한되어 있습니다.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('권한 필요', '앨범 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: CHAT_IMAGE_PICKER_QUALITY,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    const urls: string[] = [];

    for (const asset of result.assets) {
      const url = await uploadChatImage(asset);
      if (url) urls.push(url);
    }

    if (urls.length > 0 && roomId) {
      try {
        await sendMessage(roomId, makeImageMessage(urls), {
          skipProhibitedCheck: true,
        });
      } catch (e: any) {
        showChatAlert('사진 전송 실패', e?.message || '사진 메시지를 보내지 못했습니다.');
      }
    }
  };

  // 카메라 촬영 처리
  const handleCamera = async () => {
    setPlusMenuOpen(false);

    const guard = await canStartChat();

    if (!guard.ok) {
      showChatAlert('채팅 제한', guard.reason || '채팅 이용이 제한되어 있습니다.');
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('권한 필요', '카메라 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: CHAT_IMAGE_PICKER_QUALITY,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    const url = await uploadChatImage(result.assets[0]);

    if (url && roomId) {
      try {
        await sendMessage(roomId, makeImageMessage([url]), {
          skipProhibitedCheck: true,
        });
      } catch (e: any) {
        showChatAlert('사진 전송 실패', e?.message || '사진 메시지를 보내지 못했습니다.');
      }
    }
  };

  // 장소 선택 처리
  const handlePlace = () => {
    setPlusMenuOpen(false);
    prepareChatNavigation();
    router.push({
      pathname: '/map-picker',
      params: {
        returnTo: `/chat/${roomId}`,
        mode: 'chat-place',
        chatRoomId: roomId,
        title: '약속장소 선택',
        desc: '핀을 옮겨서 채팅방에 보낼 약속장소를 선택해 주세요.',
        buttonText: '이 위치로 선택',
      },
    } as any);
  };

  // 약속 날짜와 시간 선택 처리
  const getSelectedAppointmentDate = (dateText = selectedDateText, timeText = selectedTimeText) => {
    return getAppointmentDateFromTexts(dateText, timeText);
  };

  // 약속 변경 가능 여부 판단
  const openAppointmentForm = () => {
    if (appointmentChangeLocked) {
      showChatAlert(
        '약속 변경 불가',
        '약속 시간 5분 전부터는 날짜나 시간을 변경할 수 없습니다.'
      );
      return;
    }

    const defaultDate =
      latestAppointmentDate && latestAppointmentDate.getTime() > nowMs
        ? latestAppointmentDate
        : getDefaultAppointmentDate(nowMs);
    setSelectedDateText(formatDateInput(defaultDate));
    setSelectedTimeText(formatTimeInput(defaultDate));
    setAppointmentStep('date');
    setAppointmentModalOpen(true);
  };

  // 약속 전송 처리
  const submitAppointment = async () => {
    if (!roomId) return;

    if (appointmentChangeLocked) {
      showChatAlert(
        '약속 변경 불가',
        '약속 시간 5분 전부터는 날짜나 시간을 변경할 수 없습니다.'
      );
      setAppointmentModalOpen(false);
      return;
    }

    const appointmentDate = getSelectedAppointmentDate();

    if (!appointmentDate) {
      showChatAlert('약속 선택', '약속 날짜와 시간을 선택해 주세요.');
      return;
    }

    if (appointmentDate.getTime() <= Date.now()) {
      showChatAlert('약속 선택', '현재 시간 이후로 약속을 선택해 주세요.');
      return;
    }

    try {
      await sendMessage(
        roomId,
        `${APPOINTMENT_REQUEST_PREFIX}${formatAppointmentValue(appointmentDate)}`,
        { skipProhibitedCheck: true }
      );
    } catch (e: any) {
      showChatAlert('약속 전송 실패', e?.message || '약속 메시지를 보내지 못했습니다.');
      return;
    }

    setAppointmentModalOpen(false);
  };

  // 약속 모달 열기 처리
  const openAppointmentModal = async () => {
    setPlusMenuOpen(false);

    if (targetUserId) {
      const warningShown = await showHighReportWarning(targetUserId, openAppointmentForm);
      if (warningShown) return;
    }

    openAppointmentForm();
  };

  // 약속 선택 처리
  const handleSchedule = () => openAppointmentModal();
  const handlePromise = () => openAppointmentModal();

  // 플러스 메뉴 열기 처리
  const openPlusMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['취소', '앨범', '카메라', '장소', '약속'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleAlbum();
          if (buttonIndex === 2) handleCamera();
          if (buttonIndex === 3) handlePlace();
          if (buttonIndex === 4) handleSchedule();
        }
      );
      return;
    }

    setPlusMenuOpen(true);
  };

  // 송금 요청 처리
  const openPaymentRequestForm = () => {
    setAccountText(roomInfo?.sellerProfile?.account || '');
    setAccountModalOpen(true);
  };

  // 송금 요청 처리
  const handlePaymentRequest = async () => {
    if (targetUserId) {
      const warningShown = await showHighReportWarning(targetUserId, openPaymentRequestForm);
      if (warningShown) return;
    }

    openPaymentRequestForm();
  };

  // 송금 요청 전송 처리
  const submitPaymentRequest = async () => {
    if (!user || !roomId) return;

    const account = accountText.trim();

    if (!account) {
      Alert.alert('계좌번호 입력', '은행명과 계좌번호를 입력해 주세요.');
      return;
    }

    const guard = await canStartChat();

    if (!guard.ok) {
      Alert.alert('채팅 제한', guard.reason || '채팅 이용이 제한되어 있습니다.');
      return;
    }

    const { error } = await supabase.from('profiles').update({ account }).eq('id', user.id);

    if (error) {
      console.log('계좌 저장 실패:', error);
      Alert.alert('오류', '계좌번호를 저장하지 못했습니다.');
      return;
    }

    try {
      await sendMessage(roomId, `${PAYMENT_REQUEST_PREFIX}${account}`, {
        skipProhibitedCheck: true,
      });
    } catch (e: any) {
      Alert.alert('송금 요청 실패', e?.message || '송금 요청 메시지를 보내지 못했습니다.');
      return;
    }

    setAccountModalOpen(false);
  };

  // 판매 후기 작성 대상자 ID 결정
  const getReviewTargetId = () => {
    if (!listing || !user) return null;

    if (listing.author_id === user.id) {
      return targetUserId || listing.buyer_id || null;
    }

    return listing.author_id;
  };

  // 판매 후기 작성 페이지로 이동
  const goToReviewCreate = (reviewTargetId: string, saleId?: number | null) => {
    if (!listing) return;

    prepareChatNavigation();
    router.push({
      pathname: '/review/create',
      params: {
        listingId: String(listing.id),
        targetUserId: reviewTargetId,
        ...(roomId ? { roomId: String(roomId) } : {}),
        ...(saleId ? { saleId: String(saleId) } : {}),
      },
    } as any);
  };

  // 판매 기록 조회
  const fetchLatestSaleForBuyer = useCallback(async (buyerId: string) => {
    if (!currentListingId || !roomId) return null;

    const { data, error } = await supabase
      .from('listing_sales')
      .select('id, created_at')
      .eq('listing_id', currentListingId)
      .eq('buyer_id', buyerId)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log('판매 기록 확인 실패:', error);
      return null;
    }

    return data as { id: number; created_at: string } | null;
  }, [currentListingId, roomId]);

  // 판매 후기 작성 여부 확인
  const hasReviewForSale = async (reviewTargetId: string, saleId: number) => {
    if (!user) return false;

    const { data, error } = await supabase
      .from('reviews')
      .select('id')
      .eq('sale_id', saleId)
      .eq('reviewer_id', user.id)
      .eq('target_user_id', reviewTargetId)
      .maybeSingle();

    if (error) {
      console.log('판매 후기 확인 실패:', error);
      return false;
    }

    return Boolean(data);
  };

  // 판매 후기 미리보기 조회
  const fetchTradeReviewPreview = useCallback(async () => {
    if (!currentListingId || !currentListingAuthorId || !roomId || !user?.id || !targetUserId) {
      setCounterpartReview(null);
      setMyReciprocalReview(null);
      return;
    }

    const buyerId = currentListingAuthorId === user.id ? targetUserId : user.id;
    const latestSale = await fetchLatestSaleForBuyer(buyerId);

    if (!latestSale) {
      setCounterpartReview(null);
      setMyReciprocalReview(null);
      return;
    }

    const reviewSelect =
      'id, sale_id, reviewer_id, target_user_id, sentiment, feedback_tags, comment, created_at';

    const [{ data: otherReview, error: otherError }, { data: myReview, error: myError }] =
      await Promise.all([
        supabase
          .from('reviews')
          .select(reviewSelect)
          .eq('sale_id', latestSale.id)
          .eq('reviewer_id', targetUserId)
          .eq('target_user_id', user.id)
          .maybeSingle(),
        supabase
          .from('reviews')
          .select(reviewSelect)
          .eq('sale_id', latestSale.id)
          .eq('reviewer_id', user.id)
          .eq('target_user_id', targetUserId)
          .maybeSingle(),
      ]);

    if (otherError) {
      console.log('상대 후기 조회 실패:', otherError);
    }

    if (myError) {
      console.log('내 후기 조회 실패:', myError);
    }

    setCounterpartReview((otherReview || null) as TradeReviewPreview | null);
    setMyReciprocalReview((myReview || null) as TradeReviewPreview | null);
  }, [
    currentListingAuthorId,
    currentListingId,
    fetchLatestSaleForBuyer,
    roomId,
    targetUserId,
    user?.id,
  ]);

  // 판매 후기 미리보기 조회
  useFocusEffect(
    useCallback(() => {
      void fetchTradeReviewPreview();
    }, [fetchTradeReviewPreview])
  );

  // 판매 완료 모달 열기
  const openSaleCompleteModal = (reviewTargetId: string, fallbackSaleId?: number | null) => {
    setPendingReviewTargetId(reviewTargetId);
    setReviewOnlySaleId(fallbackSaleId ?? null);
    setSaleQuantityText('1');
    setSaleCompleteModalOpen(true);
  };

  // 판매 완료 모달 닫기
  const closeSaleCompleteModal = () => {
    if (saleCompleting) return;

    setSaleCompleteModalOpen(false);
    setPendingReviewTargetId(null);
    setReviewOnlySaleId(null);
    setSaleQuantityText('1');
  };

  // 판매 완료 처리 후 후기 작성 페이지로 이동
  const handleAdditionalPurchaseConfirm = (reviewTargetId: string) => {
    if (listingQuantityInfo.remaining < 1) {
      showChatAlert('재고 없음', '남은 수량이 없어 추가 판매 처리할 수 없습니다.');
      return;
    }

    openSaleCompleteModal(reviewTargetId);
  };

  // 이미 후기 작성 완료 후 추가 구매 여부 확인
  const showAdditionalPurchaseConfirm = (reviewTargetId: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm('이미 후기 작성 완료\n추가 구매를 하셨나요?');
      if (ok) handleAdditionalPurchaseConfirm(reviewTargetId);
      return;
    }

    Alert.alert('이미 후기 작성 완료', '추가 구매를 하셨나요?', [
      { text: '아니오', style: 'cancel' },
      {
        text: '예',
        onPress: () => handleAdditionalPurchaseConfirm(reviewTargetId),
      },
    ]);
  };

  // 판매 완료 처리 후 후기 작성 페이지로 이동
  const handleReview = async () => {
    if (!user?.id) {
      showChatAlert('후기 보내기', '로그인이 필요합니다.');
      return;
    }

    const reviewTargetId = getReviewTargetId();

    if (!listing || !reviewTargetId) {
      showChatAlert('후기 보내기', '거래완료 후 후기를 남길 수 있습니다.');
      return;
    }

    if (listing.author_id !== user?.id) {
      const latestSale = await fetchLatestSaleForBuyer(user.id);

      if (!latestSale) {
        showChatAlert('후기 보내기', '판매자가 거래완료 처리를 한 뒤 후기를 남길 수 있습니다.');
        return;
      }

      if (await hasReviewForSale(reviewTargetId, latestSale.id)) {
        showChatAlert(
          '이미 후기 작성 완료',
          '추가 구매를 했다면 판매자가 추가 구매 판매 처리를 한 뒤 새 후기를 남길 수 있습니다.'
        );
        return;
      }

      goToReviewCreate(reviewTargetId, latestSale.id);
      return;
    }

    if (latestAppointmentDate && latestAppointmentDate.getTime() > Date.now()) {
      showChatAlert('후기 보내기', '약속 시간이 지난 뒤 거래완료와 후기를 진행할 수 있습니다.');
      return;
    }

    const latestSale = await fetchLatestSaleForBuyer(reviewTargetId);

    if (latestSale && !(await hasReviewForSale(reviewTargetId, latestSale.id))) {
      goToReviewCreate(reviewTargetId, latestSale.id);
      return;
    }

    if (
      latestSale &&
      (await hasReviewForSale(reviewTargetId, latestSale.id))
    ) {
      showAdditionalPurchaseConfirm(reviewTargetId);
      return;
    }

    if (listingQuantityInfo.remaining < 1) {
      showChatAlert(
        '남은 수량 없음',
        `남은 수량이 없어 ${isShareListing ? '나눔완료' : '판매'} 처리할 수 없습니다.`
      );
      return;
    }

    openSaleCompleteModal(reviewTargetId);
  };

  // 판매 완료 처리 후 후기 작성 페이지로 이동 (헤더 메뉴용)
  const handleHeaderReview = () => {
    setHeaderMenuOpen(false);
    setTimeout(() => {
      handleReview();
    }, 250);
  };

  // 판매 완료 처리 후 후기 작성 페이지로 이동 (모달용)
  const completeSaleAndGoToReview = async () => {
    if (!listing || !user || !roomId || !pendingReviewTargetId || saleCompleting) return;

    const blockedKeyword = checkProhibitedContent(
      listing.title,
      listing.price_text,
      listing.region
    );

    if (blockedKeyword) {
      Alert.alert(
        isShareListing ? '나눔 처리 차단' : '판매 처리 차단',
        `"${blockedKeyword}" 관련 판매금지 물품은 ${isShareListing ? '나눔완료' : '판매'} 처리할 수 없습니다.`
      );
      return;
    }

    const saleQuantity = Number(saleQuantityText);
    const quantityLabel = isShareListing ? '나눔 수량' : '판매 수량';

    if (!Number.isInteger(saleQuantity) || saleQuantity < 1) {
      Alert.alert(quantityLabel, `${isShareListing ? '나눔한' : '판매한'} 수량을 1개 이상 입력해 주세요.`);
      return;
    }

    if (saleQuantity > listingQuantityInfo.remaining) {
      Alert.alert(quantityLabel, `남은 수량은 ${listingQuantityInfo.remaining}개입니다.`);
      return;
    }

    try {
      setSaleCompleting(true);

      const { data, error } = await supabase.rpc('complete_listing_sale', {
        p_listing_id: listing.id,
        p_buyer_id: pendingReviewTargetId,
        p_quantity: saleQuantity,
        p_room_id: roomId,
      });

      if (error) {
        console.log(`채팅 ${isShareListing ? '나눔' : '판매'} 처리 실패:`, error);
        Alert.alert('오류', `${isShareListing ? '나눔완료' : '거래완료'} 처리에 실패했습니다.`);
        return;
      }

      setRoomInfo((prev) =>
        prev?.listing
          ? {
            ...prev,
            listing: {
              ...prev.listing,
              ...(data || {}),
              listing_images: prev.listing.listing_images,
            },
          }
          : prev
      );

      const reviewTargetId = pendingReviewTargetId;
      const latestSale = await fetchLatestSaleForBuyer(reviewTargetId);
      setSaleCompleteModalOpen(false);
      setPendingReviewTargetId(null);
      setReviewOnlySaleId(null);
      setSaleQuantityText('1');
      goToReviewCreate(reviewTargetId, latestSale?.id ?? null);
    } finally {
      setSaleCompleting(false);
    }
  };

  // 상대방 차단 처리
  const handleBlock = async () => {
    setHeaderMenuOpen(false);

    if (!user || !targetUserId) {
      Alert.alert('차단하기', '차단할 상대를 찾을 수 없습니다.');
      return;
    }

    if (targetUserId === user.id) {
      Alert.alert('차단하기', '본인은 차단할 수 없습니다.');
      return;
    }

    const ok = await confirmBlockChatTarget();
    if (!ok) return;

    const { error } = await supabase.from('user_blocks').upsert(
      {
        blocker_id: user.id,
        blocked_id: targetUserId,
      },
      {
        onConflict: 'blocker_id,blocked_id',
      }
    );

    if (error) {
      console.log('차단 실패:', error);
      Alert.alert(
        '오류',
        error.message.includes('user_blocks')
          ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
          : '차단하지 못했습니다.'
      );
      return;
    }

    Alert.alert('차단 완료', '상대방을 차단했습니다.');
  };


  // 신고 대상 닉네임 조회
  const fetchReportTargetName = async (targetId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', targetId)
      .maybeSingle();

    if (error) {
      console.log('신고 대상 닉네임 조회 실패:', error);
      return '상대방';
    }

    return data?.display_name || '상대방';
  };


  // 신고 처리
  const handleReport = () => {
    setHeaderMenuOpen(false);

    setTimeout(async () => {
      if (!user || !targetUserId) {
        Alert.alert('신고하기', '신고할 상대를 찾을 수 없습니다.');
        return;
      }

      if (targetUserId === user.id) {
        Alert.alert('신고하기', '본인은 신고할 수 없습니다.');
        return;
      }

      const name = await fetchReportTargetName(targetUserId);

      setReportTargetName(name);
      setReportReason('');
      setReportContent('');
      setReportModalOpen(true);
    }, 300);
  };


  // 신고 접수 처리
  const submitReport = async () => {
    if (!user || !targetUserId) return;

    if (!reportReason) {
      Alert.alert('신고 항목 선택', '신고 항목을 선택해 주세요.');
      return;
    }

    const guard = await canUseApp();

    if (!guard.ok) {
      Alert.alert('신고 제한', guard.reason || '현재 신고를 접수할 수 없습니다.');
      return;
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      target_user_id: targetUserId,
      room_id: roomId,
      listing_id: listing?.id ?? null,
      reason: reportReason,
      content: reportContent.trim(),
    });

    if (error) {
      console.log('신고 실패:', error);
      Alert.alert('오류', '신고를 접수하지 못했습니다.');
      return;
    }

    setReportModalOpen(false);
    await fetchUserReportCount(targetUserId);
    Alert.alert('신고 접수 완료', '신고가 접수되었습니다.');
  };


  // 사기 이력 조회
  const handleFraudHistory = async () => {
    setHeaderMenuOpen(false);

    const url = 'https://thecheat.co.kr/rb/?mod=_search';

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('오류', '사이트를 열 수 없습니다.');
      return;
    }

    await Linking.openURL(url);
  };


  // 채팅방 알림 설정 처리
  const handleMute = async () => {
    setHeaderMenuOpen(false);

    if (!user || !roomId) return;

    const nextMuted = !isMuted;

    const { error } = await supabase.from('chat_room_settings').upsert(
      {
        room_id: roomId,
        user_id: user.id,
        muted: nextMuted,
      },
      {
        onConflict: 'room_id,user_id',
      }
    );

    if (error) {
      console.log('알림 설정 실패:', error);
      Alert.alert('오류', '알림 설정을 변경하지 못했습니다.');
      return;
    }

    setIsMuted(nextMuted);

    Alert.alert(
      '알림 설정',
      nextMuted ? '알림을 껐습니다.' : '알림을 켰습니다.'
    );
  };

  const openParticipantModal = () => {
    setHeaderMenuOpen(false);
    setParticipantModalOpen(true);
  };

  const handleRemoveParticipant = (participant: ChatParticipantItem) => {
    if (!roomId || !project || !participant.canRemove) return;

    Alert.alert(
      '참여자 내보내기',
      `${participant.name}님을 이 현장 채팅에서 내보낼까요?\n기존 채팅 기록은 삭제되지 않습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '내보내기',
          style: 'destructive',
          onPress: async () => {
            setParticipantActionLoadingId(participant.userId);

            try {
              let handledByProjectChatRpc = false;
              const { error: projectChatRpcError } = await supabase.rpc(
                'remove_project_chat_participant',
                {
                  p_room_id: roomId,
                  p_member_user_id: participant.userId,
                  p_project_member_id: participant.projectMemberId,
                }
              );

              if (projectChatRpcError) {
                const functionMissing =
                  projectChatRpcError.code === 'PGRST202' ||
                  projectChatRpcError.message?.includes('Could not find the function');

                if (!functionMissing) {
                  throw projectChatRpcError;
                }
              } else {
                handledByProjectChatRpc = true;
              }

              if (!handledByProjectChatRpc) {
                if (participant.projectMemberId) {
                  const { error: projectMemberError } = await supabase.rpc('remove_project_member', {
                    p_member_id: participant.projectMemberId,
                  });

                  if (projectMemberError) {
                    throw projectMemberError;
                  }
                }

                const { error: chatMemberError } = await supabase
                  .from('chat_room_members')
                  .delete()
                  .match({
                    room_id: roomId,
                    user_id: participant.userId,
                  });

                if (chatMemberError) {
                  throw chatMemberError;
                }
              }

              setRoomInfo((prev) =>
                prev
                  ? {
                      ...prev,
                      members: (prev.members || []).filter(
                        (member) => member.user_id !== participant.userId
                      ),
                      project: prev.project
                        ? {
                            ...prev.project,
                            project_members: (prev.project.project_members || []).map((member) =>
                              member.id === participant.projectMemberId
                                ? { ...member, invitation_status: 'removed' }
                                : member
                            ),
                          }
                        : prev.project,
                    }
                  : prev
              );
              await fetchRoomInfo();
              Alert.alert('참여자 내보내기', '참여자를 내보냈습니다.');
            } catch (error: any) {
              console.log('채팅 참여자 내보내기 실패:', error);
              Alert.alert(
                '참여자 내보내기 실패',
                error?.message || '참여자를 내보내지 못했습니다.'
              );
            } finally {
              setParticipantActionLoadingId(null);
            }
          },
        },
      ]
    );
  };


  // 채팅방 나가기 처리
  const handleExitRoom = () => {
    setHeaderMenuOpen(false);

    Alert.alert('채팅방 나가기', '채팅방을 나가시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: async () => {
          if (!user || !roomId) return;

          const { error } = await supabase.from('chat_room_members').delete().match({
            room_id: roomId,
            user_id: user.id,
          });

          if (error) {
            console.log('채팅방 나가기 실패:', error);
            Alert.alert('오류', '채팅방을 나가지 못했습니다.');
            return;
          }

          prepareChatNavigation();
          router.replace('/(tabs)/chat' as any);
        },
      },
    ]);
  };

  const handleSearchInChat = () => {
    setHeaderMenuOpen(false);
    Alert.alert('검색하기', '채팅방 내 메시지 검색 기능을 추가하면 됩니다.');
  };



  const getUnreadCount = (messageId: string, senderId: string) => {
    if (!user) return 0;

    const roomMemberIds = new Set(
      (roomInfo?.members || [])
        .map((member) => member.user_id)
        .filter((memberId): memberId is string => !!memberId)
    );
    const activeParticipantIds = new Set(chatParticipants.map((participant) => participant.userId));
    const participantIds = activeParticipantIds.size > 0 ? activeParticipantIds : roomMemberIds;
    const recipientIds = new Set([...participantIds].filter((memberId) => memberId !== senderId));

    if (recipientIds.size === 0) {
      return 0;
    }

    const readUserIds = new Set(
      reads
        .filter((read) => String(read.message_id) === String(messageId))
        .map((read) => read.user_id)
        .filter((readerId) => recipientIds.has(readerId))
    );

    return Math.max(recipientIds.size - readUserIds.size, 0);
  };

  const handleAppointmentCompletionAnswer = async (
    completed: boolean,
    appointmentDate: Date
  ) => {
    if (!roomId) return;

    if (hasAppointmentCompletionResponseForDate(appointmentDate, messages, user?.id)) {
      showChatAlert('응답 완료', '이미 이 약속에 대한 응답이 완료되었습니다.');
      return;
    }

    const appointmentValue = formatAppointmentValue(appointmentDate);

    try {
      await sendMessage(
        roomId,
        `${APPOINTMENT_COMPLETION_RESPONSE_PREFIX}${completed ? '예' : '아니요'
        }\n약속 시간: ${appointmentValue}\n${completed ? '거래가 완료되었습니다.' : '거래가 아직 완료되지 않았습니다.'
        }`,
        { skipProhibitedCheck: true }
      );
    } catch (e: any) {
      showChatAlert('응답 전송 실패', e?.message || '거래 완료 응답을 보내지 못했습니다.');
      return;
    }

    if (completed) {
      setTimeout(() => {
        handleReview();
      }, 250);
    }
  };

  const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  const normalizeUrl = (url: string) => {
    return url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `https://${url}`;
  };

  const confirmAndOpenUrl = async (rawUrl: string) => {
    const url = normalizeUrl(rawUrl);

    const openUrl = async () => {
      try {
        const supported = await Linking.canOpenURL(url);

        if (!supported) {
          showChatAlert('링크 열기 실패', '이 링크를 열 수 없습니다.');
          return;
        }

        await Linking.openURL(url);
      } catch (error) {
        console.log('링크 열기 실패:', error);
        showChatAlert('링크 열기 실패', '링크를 여는 중 오류가 발생했습니다.');
      }
    };

    const warningMessage =
      `외부 링크로 이동합니다.\n\n${url}\n\n` +
      '사기, 피싱, 개인정보 탈취 위험이 있을 수 있으니 신뢰할 수 있는 링크인지 확인해 주세요.';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(warningMessage);
      if (ok) {
        await openUrl();
      }
      return;
    }

    Alert.alert('외부 링크 주의', warningMessage, [
      { text: '취소', style: 'cancel' },
      {
        text: '열기',
        style: 'destructive',
        onPress: () => {
          void openUrl();
        },
      },
    ]);
  };

  const openPlaceMessageMap = (place: PlaceMessagePayload) => {
    prepareChatNavigation();
    router.push({
      pathname: '/trade-map',
      params: {
        lat: String(place.latitude),
        lng: String(place.longitude),
        region: place.address,
        title: '약속장소',
      },
    } as any);
  };

  const renderMessageTextWithLinks = (message: string, isMine: boolean) => {
    const parts = message.split(URL_REGEX);

    return (
      <Text style={[styles.messageText, isMine && styles.myMessageText]}>
        {parts.map((part, index) => {
          const isUrl = URL_REGEX.test(part);
          URL_REGEX.lastIndex = 0;

          if (!isUrl) {
            return part;
          }

          return (
            <Text
              key={`${part}-${index}`}
              style={[
                styles.linkText,
                isMine && styles.myLinkText,
              ]}
              onPress={() => {
                void confirmAndOpenUrl(part);
              }}
            >
              {part}
            </Text>
          );
        })}
      </Text>
    );
  };

  const getMessageSenderName = useCallback(
    (senderId: string) => {
      const projectMember =
        (project?.project_members || []).find(
          (member) => member.member_user_id === senderId && member.invitation_status !== 'removed'
        ) ||
        (project?.project_members || []).find((member) => member.member_user_id === senderId);
      const profile = participantProfileMap[senderId];
      const displayName =
        projectMember?.display_name?.trim() ||
        profile?.display_name?.trim() ||
        '';
      const companyName = projectMember?.company_name?.trim() || '';

      if (displayName && companyName && displayName !== companyName) {
        return `${displayName} · ${companyName}`;
      }

      return displayName || companyName || '참여자';
    },
    [participantProfileMap, project?.project_members]
  );

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMine = item.sender_id === user?.id;
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const currentDateKey = getChatDateKey(item.created_at);
    const previousDateKey = previousMessage ? getChatDateKey(previousMessage.created_at) : '';
    const showDateDivider = !previousMessage || currentDateKey !== previousDateKey;
    const groupedWithPrevious =
      previousMessage?.sender_id === item.sender_id && currentDateKey === previousDateKey;
    const showSenderName = shouldShowSenderNames && !isMine && !groupedWithPrevious;
    const unreadCount = getUnreadCount(item.id, item.sender_id);

    const imageItems = parseImageMessage(item.message);
    const isImageMessage = imageItems.length > 0;
    const placeMessage = parsePlaceMessage(item.message);
    const appointmentCompletionDate = item.message.startsWith(
      APPOINTMENT_COMPLETION_PROMPT_PREFIX
    )
      ? parseAppointmentCompletionDate(item.message)
      : null;
    const isAppointmentCompletionPrompt = Boolean(appointmentCompletionDate);
    const appointmentCompletionAnswered = appointmentCompletionDate
      ? hasAppointmentCompletionResponseForDate(appointmentCompletionDate, messages, user?.id)
      : false;

    return (
      <>
        {showDateDivider ? (
          <View style={[styles.dateDividerWrap, index === 0 && styles.firstDateDividerWrap]}>
            <View style={[styles.dateDividerPill, isDarkMode && styles.dateDividerPillDark]}>
              <Text style={[styles.dateDividerText, isDarkMode && styles.dateDividerTextDark]}>
                {formatChatDateDivider(item.created_at)}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.messageRow,
            showDateDivider && styles.messageRowAfterDate,
            groupedWithPrevious && styles.groupedMessageRow,
            isMine ? styles.myRow : styles.otherRow,
          ]}
        >
          {showSenderName ? (
            <Text
              style={[styles.senderName, isDarkMode && styles.senderNameDark]}
              numberOfLines={1}
            >
              {getMessageSenderName(item.sender_id)}
            </Text>
          ) : null}
          <View
            style={[
              styles.bubble,
              isMine ? styles.myBubble : styles.otherBubble,
              isImageMessage && styles.imageBubble,
            ]}
          >
            {isAppointmentCompletionPrompt && appointmentCompletionDate ? (
              <View>
                <Text style={[styles.messageText, isMine && styles.myMessageText]}>
                  {item.message}
                </Text>

                {appointmentCompletionAnswered ? (
                  <Text
                    style={[
                      styles.completionAnsweredText,
                      isMine && styles.myCompletionAnsweredText,
                    ]}
                  >
                    응답 완료
                  </Text>
                ) : (
                  <View style={styles.completionActions}>
                    <TouchableOpacity
                      style={styles.completionYesBtn}
                      onPress={() => handleAppointmentCompletionAnswer(true, appointmentCompletionDate)}
                    >
                      <Text style={styles.completionYesText}>예</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.completionNoBtn}
                      onPress={() => handleAppointmentCompletionAnswer(false, appointmentCompletionDate)}
                    >
                      <Text style={styles.completionNoText}>아니요</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : placeMessage ? (
              <TouchableOpacity
                style={styles.placeMessageCard}
                onPress={() => openPlaceMessageMap(placeMessage)}
              >
                <View style={styles.placeMessageHeader}>
                  <Ionicons
                    name="location"
                    size={18}
                    color={isMine ? '#bbf7d0' : '#166534'}
                  />
                  <Text style={[styles.placeMessageTitle, isMine && styles.myPlaceMessageTitle]}>
                    약속장소
                  </Text>
                </View>
                <Text
                  style={[styles.placeMessageAddress, isMine && styles.myPlaceMessageAddress]}
                  numberOfLines={2}
                >
                  {placeMessage.address}
                </Text>
                <Text style={[styles.placeMessageHint, isMine && styles.myPlaceMessageHint]}>
                  지도에서 보기
                </Text>
              </TouchableOpacity>
            ) : isImageMessage ? (
              <TouchableOpacity
                onPress={() => {
                  const imageUrls = imageItems.map((image) => image.url);
                  console.log('이미지 URL:', imageUrls);
                  setSelectedImageUrls(imageUrls);
                  setSelectedImageIndex(0);
                  setImageViewerOpen(true);
                }}
              >
                <View
                  style={[
                    styles.imageGrid,
                    imageItems.length === 1 && styles.singleImageGrid,
                  ]}
                >
                  {imageItems.slice(0, 4).map((image, index) => (
                    <View
                      key={`${image.url}-${index}`}
                      style={[
                        styles.gridImageWrap,
                        imageItems.length === 1 && styles.singleImageWrap,
                      ]}
                    >
                      <ChatThumbnailImage image={image} />

                      {index === 3 && imageItems.length > 4 ? (
                        <View style={styles.moreImageOverlay}>
                          <Text style={styles.moreImageText}>
                            +{imageItems.length - 4}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ) : (
              renderMessageTextWithLinks(item.message, isMine)
            )}
          </View>

          <View style={styles.metaRow}>
            {unreadCount > 0 ? (
              <Text style={styles.unreadText}>{unreadCount}</Text>
            ) : null}
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      </>
    );
  };

  const chatInputBlockedByOverlay =
    accountModalOpen ||
    appointmentModalOpen ||
    callMenuOpen ||
    headerMenuOpen ||
    imageViewerOpen ||
    participantModalOpen ||
    plusMenuOpen ||
    reportModalOpen ||
    saleCompleteModalOpen ||
    Boolean(visibleCall);
  const chatInputVisible = screenFocused && !chatInputBlockedByOverlay;
  const chatKeyboardVisible = chatInputVisible && keyboardVisible;
  const inputBottomPadding = chatKeyboardVisible ? 6 : Math.max(insets.bottom, 6);
  const inputRowEstimatedHeight = 56 + inputBottomPadding;
  const inputOverlayBottom = chatKeyboardVisible ? keyboardHeight : 0;
  const listViewportBottomInset =
    Platform.OS === 'ios' && chatInputVisible
      ? inputRowEstimatedHeight + (chatKeyboardVisible ? keyboardHeight : 0)
      : 0;
  const listBottomPadding = 18;

  const workPanelCollapseDock = (
    <View style={styles.projectCollapseDock}>
      <TouchableOpacity
        style={[styles.projectCollapseFloatBtn, isDarkMode && styles.projectCollapseFloatBtnDark]}
        onPress={() => setWorkPanelCollapsed((prev) => !prev)}
        activeOpacity={0.86}
      >
        <Ionicons
          name={workPanelCollapsed ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={isDarkMode ? '#fff' : '#111827'}
        />
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    if (!chatKeyboardVisible) return;

    const frameId = requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    const timeoutIds = [80, 220, 420].map((delay) =>
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, delay)
    );

    return () => {
      cancelAnimationFrame(frameId);
      timeoutIds.forEach(clearTimeout);
    };
  }, [chatKeyboardVisible, keyboardHeight, listViewportBottomInset]);

  const chatInputRow = (
    <View
      style={[
        styles.inputRow,
        isDarkMode && styles.inputRowDark,
        {
          paddingBottom: inputBottomPadding,
        },
      ]}
      pointerEvents="auto"
      collapsable={false}
    >
      <Pressable
        style={({ pressed }) => [
          styles.plusBtn,
          isDarkMode && styles.plusBtnDark,
          pressed && styles.controlPressed,
        ]}
        onPress={() => {
          openPlusMenu();
        }}
        hitSlop={10}
      >
        <Ionicons name="add" size={24} color={isDarkMode ? '#fff' : '#111827'} />
      </Pressable>

      <Pressable
        style={styles.inputPressTarget}
        onPress={() => {
          messageInputRef.current?.focus();
        }}
      >
        <TextInput
          ref={messageInputRef}
          style={[styles.input, isDarkMode && styles.inputDark]}
          placeholder="메시지를 입력하세요"
          placeholderTextColor={isDarkMode ? '#9ca3af' : '#6b7280'}
          selectionColor="#166534"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          blurOnSubmit={false}
          onFocus={() => {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          }}
        />
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.sendBtn,
          sending && styles.sendBtnDisabled,
          pressed && !sending && styles.controlPressed,
        ]}
        onPress={() => {
          void onSend();
        }}
        disabled={sending}
        hitSlop={10}
      >
        <Text style={styles.sendBtnText}>{sending ? '전송중' : '전송'}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, isDarkMode && styles.screenDark]} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={24} color={backIconColor} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerCenter} onPress={goToChatTargetProfile}>
          <Text style={[styles.headerName, isDarkMode && styles.headerNameDark]} numberOfLines={1}>
            {chatTargetName}
          </Text>
          <Text style={[styles.headerSub, isDarkMode && styles.headerSubDark]} numberOfLines={1}>
            {chatTargetSub}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {isMuted ? (
            <View style={styles.mutedIconWrap}>
              <Ionicons name="notifications-off-outline" size={18} color="#6b7280" />
            </View>
          ) : null}

          {targetUserId ? (
            <TouchableOpacity style={styles.headerBtn} onPress={() => setCallMenuOpen(true)}>
              <Ionicons name="call-outline" size={20} color={backIconColor} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.headerBtn} onPress={() => setHeaderMenuOpen(true)}>
            <Ionicons name="ellipsis-vertical" size={20} color={backIconColor} />
          </TouchableOpacity>
        </View>
      </View>

      {listing ? (
        <View>
          <TouchableOpacity
            style={styles.productCard}
            onPress={() => {
              prepareChatNavigation();
              router.push(`/(tabs)/home/post/${listing.id}` as any);
            }}
          >
            <View style={styles.productThumbWrap}>
              {productImageUrl ? (
                <Image source={{ uri: productImageUrl }} style={styles.productThumb} />
              ) : (
                <View style={styles.productThumbPlaceholder}>
                  <Ionicons name="image-outline" size={20} color="#9ca3af" />
                </View>
              )}
            </View>

            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={1}>
                {listing.title}
              </Text>
              <Text style={styles.productMeta} numberOfLines={1}>
                {[listing.region, getListingStockText(listing)].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.productPrice} numberOfLines={1}>
                {listing.price_text || '가격 문의'}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>

          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.quickActionBtn} onPress={handlePromise}>
              <Text style={styles.quickActionText}>약속잡기</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionBtn} onPress={handlePaymentRequest}>
              <Text style={styles.quickActionText}>송금요청</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionBtn} onPress={handleReview}>
              <Text style={styles.quickActionText}>후기 보내기</Text>
            </TouchableOpacity>
          </View>

          {counterpartReview ? (
            <View style={styles.reviewPreviewCard}>
              <View style={styles.reviewPreviewHeader}>
                <View style={styles.reviewPreviewTitleRow}>
                  <Ionicons
                    name={myReciprocalReview ? 'chatbubbles-outline' : 'lock-closed-outline'}
                    size={16}
                    color={myReciprocalReview ? '#166534' : '#6b7280'}
                  />
                  <Text style={styles.reviewPreviewTitle}>상대가 남긴 후기</Text>
                </View>
                <Text
                  style={[
                    styles.reviewPreviewBadge,
                    myReciprocalReview && styles.reviewPreviewBadgeOpen,
                  ]}
                >
                  {myReciprocalReview ? '전체 공개' : '1줄 미리보기'}
                </Text>
              </View>

              <Text
                style={styles.reviewPreviewSummary}
                numberOfLines={myReciprocalReview ? undefined : 1}
              >
                {getReviewSummary(counterpartReview)}
              </Text>

              {myReciprocalReview && counterpartReview.comment?.trim() ? (
                <Text style={styles.reviewPreviewComment}>
                  {counterpartReview.comment.trim()}
                </Text>
              ) : null}

              {!myReciprocalReview ? (
                <View style={styles.reviewPreviewLockRow}>
                  <Text style={styles.reviewPreviewHint}>
                    나도 후기를 남기면 전체 후기를 볼 수 있어요.
                  </Text>
                  <TouchableOpacity
                    style={styles.reviewPreviewAction}
                    onPress={() => {
                      if (!targetUserId) return;
                      goToReviewCreate(targetUserId, counterpartReview.sale_id);
                    }}
                  >
                    <Text style={styles.reviewPreviewActionText}>후기 남기기</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {project ? (
        <>
        <View style={[styles.projectPanel, workPanelCollapsed && styles.projectPanelCollapsed]}>
          <View style={styles.projectPanelHeader}>
            <View style={styles.projectPanelTitleBox}>
              <View style={styles.projectBadgeRow}>
                <Text style={styles.projectBadge}>현장</Text>
                <Text style={styles.projectStatusBadge}>
                  {getProjectStatusLabel(isCompletedWorkChat ? 'completed' : project.status)}
                </Text>
              </View>
              <Text style={styles.projectPanelTitle} numberOfLines={1}>
                {roomInfo?.title || project.name}
              </Text>
              {!workPanelCollapsed ? (
                <Text style={styles.projectPanelMeta} numberOfLines={1}>
                  {project.address || '주소 미입력'} · {formatProjectDate(project.start_date)} ~ {formatProjectDate(project.end_date)}
                </Text>
              ) : null}
            </View>
            <View style={styles.projectPanelActions}>
              {!workPanelCollapsed ? (
                <TouchableOpacity style={styles.projectOpenBtn} onPress={() => goToProjectManagement()}>
                  <Text style={styles.projectOpenText}>현장관리</Text>
                </TouchableOpacity>
              ) : null}
              {canWriteProjectReports ? (
                !workPanelCollapsed ? (
                  <TouchableOpacity style={styles.projectOpenBtn} onPress={goToProjectDailyReport}>
                    <Text style={styles.projectOpenText}>일일보고서</Text>
                  </TouchableOpacity>
                ) : null
              ) : null}
            </View>
          </View>

          {!workPanelCollapsed ? (
            <>
              <View style={styles.projectCalendarStrip}>
                {projectCalendarDays.map((day) => {
                  const active = day.value === selectedProjectDate;

                  return (
                    <TouchableOpacity
                      key={day.value}
                      style={[styles.projectCalendarDay, active && styles.projectCalendarDayActive]}
                      onPress={() => setSelectedProjectDate(day.value)}
                    >
                      <Text style={[styles.projectCalendarWeekday, active && styles.projectCalendarWeekdayActive]}>
                        {day.label}
                      </Text>
                      <Text style={[styles.projectCalendarDate, active && styles.projectCalendarDateActive]}>
                        {day.day}
                      </Text>
                      <View style={styles.projectCalendarDots}>
                        {day.hasSchedule ? <View style={styles.projectScheduleDot} /> : null}
                        {day.hasReport ? <View style={styles.projectReportDot} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.projectPanelGrid}>
                <View style={styles.projectPanelItem}>
                  <Text style={styles.projectPanelLabel}>{selectedProjectScheduleTitle}</Text>
                  {selectedProjectSchedules.length === 0 ? (
                    <Text style={styles.projectPanelValue}>등록된 일정 없음</Text>
                  ) : (
                    selectedProjectSchedules.map((schedule) => (
                      <Text key={schedule.id} style={styles.projectPanelValue} numberOfLines={1}>
                        {schedule.title} · {getProjectScheduleStatusLabel(schedule.status)}
                        {schedule.memo ? ` · ${schedule.memo}` : ''}
                      </Text>
                    ))
                  )}
                </View>
                <TouchableOpacity
                  style={styles.projectPanelItem}
                  onPress={() => latestProjectReport && goToProjectManagement(latestProjectReport.id)}
                  disabled={!latestProjectReport}
                  activeOpacity={0.86}
                >
                  <Text style={styles.projectPanelLabel}>최근 보고서</Text>
                  {latestProjectReport ? (
                    <>
                      <Text style={styles.projectPanelValue}>{latestProjectReport.report_date}</Text>
                      <Text style={styles.projectPanelValue} numberOfLines={1}>
                        진행률 {latestProjectReport.progress_percent || 0}% · 사진 {(latestProjectReport.daily_report_images || []).length}장
                      </Text>
                      <Text style={styles.projectPanelValue} numberOfLines={1}>
                        {latestProjectReport.work_content}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.projectPanelValue}>작성된 보고서 없음</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
        {workPanelCollapseDock}
        </>
      ) : null}

      {!project && isEstimateRoom ? (
        <>
        <View style={[styles.projectPanel, workPanelCollapsed && styles.projectPanelCollapsed]}>
          <View style={styles.projectPanelHeader}>
            <View style={styles.projectPanelTitleBox}>
              <View style={styles.projectBadgeRow}>
                <Text style={styles.projectBadge}>견적</Text>
                <Text style={styles.projectStatusBadge}>
                  {isCompletedWorkChat ? '완료' : '상담중'}
                </Text>
              </View>
              <Text style={styles.projectPanelTitle} numberOfLines={1}>
                {roomInfo?.title || estimateRequest?.title || '견적 채팅'}
              </Text>
              {!workPanelCollapsed ? (
                <Text style={styles.projectPanelMeta} numberOfLines={1}>
                  {estimateRequest?.address || estimateRequest?.region || '주소 미입력'} · 희망 일정 {estimateRequest?.desired_date || '미정'}
                </Text>
              ) : null}
            </View>
            <View style={styles.projectPanelActions}>
              {!workPanelCollapsed ? (
                <TouchableOpacity style={styles.projectOpenBtn} onPress={goToChatTargetProfile}>
                  <Text style={styles.projectOpenText}>견적관리</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
        {workPanelCollapseDock}
        </>
      ) : null}

      <View
        style={[
          styles.messageListLayer,
          {
            marginBottom: listViewportBottomInset,
          },
        ]}
        collapsable={false}
        onTouchStart={handleMessageListTouchStart}
        onTouchMove={handleMessageListTouchMove}
        onTouchEnd={handleMessageListTouchEnd}
        onTouchCancel={handleMessageListTouchCancel}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onLayout={() => {
            if (!keyboardVisible) return;
            requestAnimationFrame(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            });
          }}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom: listBottomPadding,
            },
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>아직 메시지가 없어요.</Text>
            </View>
          }
        />
      </View>

      {chatInputVisible ? (
        Platform.OS === 'ios' ? (
        <FullWindowOverlay>
          <View style={styles.inputWindowLayer} pointerEvents="box-none">
            <View
              style={[
                styles.inputOverlayPosition,
                {
                  bottom: inputOverlayBottom,
                },
              ]}
              pointerEvents="box-none"
            >
              {chatInputRow}
            </View>
          </View>
        </FullWindowOverlay>
        ) : (
          chatInputRow
        )
      ) : null}

      {Platform.OS === 'ios' ? (
        <GestureDetector gesture={edgeBackSwipeGesture}>
          <Reanimated.View style={styles.edgeBackSwipeZone} />
        </GestureDetector>
      ) : null}

      <Modal visible={callMenuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setCallMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomMenuBox}>
                {canStorePhoneCall ? (
                  <TouchableOpacity
                    style={styles.callMenuItem}
                    onPress={() => {
                      setCallMenuOpen(false);
                      void openPhone();
                    }}
                  >
                    <View style={styles.callMenuIcon}>
                      <Ionicons name="call-outline" size={20} color="#166534" />
                    </View>
                    <View style={styles.callMenuTextBox}>
                      <Text style={styles.menuText}>가게 전화</Text>
                      <Text style={styles.callMenuSubText}>전화 앱으로 연결</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.callMenuItem}
                  onPress={() => startInAppCall('voice')}
                  disabled={callActionLoading}
                >
                  <View style={styles.callMenuIcon}>
                    <Ionicons name="mic-outline" size={20} color="#111827" />
                  </View>
                  <View style={styles.callMenuTextBox}>
                    <Text style={styles.menuText}>보이스톡</Text>
                    <Text style={styles.callMenuSubText}>상대방이 받아야 연결</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.callMenuItem}
                  onPress={() => startInAppCall('video')}
                  disabled={callActionLoading}
                >
                  <View style={styles.callMenuIcon}>
                    <Ionicons name="videocam-outline" size={20} color="#111827" />
                  </View>
                  <View style={styles.callMenuTextBox}>
                    <Text style={styles.menuText}>영상통화</Text>
                    <Text style={styles.callMenuSubText}>상대방이 받아야 연결</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryModalBtn}
                  onPress={() => setCallMenuOpen(false)}
                >
                  <Text style={styles.secondaryModalBtnText}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={!!visibleCall} transparent animationType="fade">
        <View style={styles.callScreenOverlay}>
          {visibleCall?.call_type === 'video' ? (
            <View style={styles.videoCallStage}>
              {remoteCallStream && !remoteCameraOff ? (
                <RTCView
                  streamURL={remoteCallStream.toURL()}
                  style={styles.videoRemoteFull}
                  objectFit="cover"
                />
              ) : (
                <View style={[styles.videoWaitingBox, remoteCameraOff ? styles.videoRemoteOffBox : null]}>
                  <Ionicons
                    name={remoteCameraOff ? 'videocam-off-outline' : 'videocam-outline'}
                    size={54}
                    color="#fff"
                  />
                  <Text style={styles.videoWaitingText}>
                    {remoteCameraOff
                      ? '상대방 카메라 꺼짐'
                      : incomingCall
                        ? '영상통화 수신 중'
                        : outgoingCall
                          ? '상대방 응답 대기 중'
                          : '상대방 영상 대기 중'}
                  </Text>
                </View>
              )}

              {localCallStream ? (
                callCameraOff ? (
                  <View style={styles.videoLocalOffPreview}>
                    <Ionicons name="videocam-off-outline" size={24} color="#fff" />
                  </View>
                ) : (
                  <RTCView
                    streamURL={localCallStream.toURL()}
                    style={styles.videoLocalPreview}
                    objectFit="cover"
                    mirror={callFacingMode === 'user'}
                  />
                )
              ) : null}
            </View>
          ) : (
            <View style={styles.voiceCallStage}>
              <View style={styles.voiceAvatar}>
                <Ionicons name="person" size={64} color="#fff" />
              </View>
            </View>
          )}

          <View style={styles.callTopInfo}>
            <Text style={styles.callTopTitle}>{visibleCallTitle}</Text>
            <Text style={styles.callTopName}>{chatTargetName}</Text>
            <Text style={styles.callTimerText}>
              {activeCall ? callDurationText : outgoingCall ? '연결 대기 중...' : incomingCall ? '전화가 왔습니다' : ''}
            </Text>
          </View>

          {incomingCall ? (
            <View style={styles.incomingCallActions}>
              <TouchableOpacity
                style={[styles.bigCallCircleBtn, styles.callDeclineBtn]}
                onPress={() => updateCallStatus(incomingCall, 'declined')}
                disabled={callActionLoading}
              >
                <Ionicons name="call" size={30} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bigCallCircleBtn, styles.callAcceptBtn]}
                onPress={() => updateCallStatus(incomingCall, 'accepted')}
                disabled={callActionLoading}
              >
                <Ionicons name="call" size={30} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          {controllableCall ? (
            <View
              style={[
                styles.callControlPanel,
                incomingCall && styles.incomingCallControlPanel,
              ]}
            >
              <TouchableOpacity style={styles.callControlBtn} onPress={toggleCallMic}>
                <Ionicons
                  name={callMicMuted ? 'mic-off-outline' : 'mic-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.callControlText}>
                  {callMicMuted ? '마이크 켜기' : '마이크 끄기'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.callControlBtn} onPress={toggleCallSpeaker}>
                <Ionicons
                  name={callSpeakerOn ? 'volume-high-outline' : 'volume-low-outline'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.callControlText}>
                  {callSpeakerOn ? '한뼘통화 끄기' : '한뼘통화'}
                </Text>
              </TouchableOpacity>

              {controllableCall.call_type === 'video' ? (
                <>
                  <TouchableOpacity style={styles.callControlBtn} onPress={toggleCallCamera}>
                    <Ionicons
                      name={callCameraOff ? 'videocam-off-outline' : 'videocam-outline'}
                      size={24}
                      color="#fff"
                    />
                    <Text style={styles.callControlText}>
                      {callCameraOff ? '카메라 켜기' : '카메라 끄기'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.callControlBtn} onPress={switchCallCamera}>
                    <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
                    <Text style={styles.callControlText}>카메라 전환</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {!incomingCall ? (
                <TouchableOpacity
                  style={[styles.callControlBtn, styles.endCallControlBtn]}
                  onPress={() => {
                    if (activeCall) {
                      updateCallStatus(activeCall, 'ended');
                    } else if (outgoingCall) {
                      updateCallStatus(outgoingCall, 'canceled');
                    }
                  }}
                  disabled={callActionLoading}
                >
                  <Ionicons name="call" size={26} color="#fff" />
                  <Text style={styles.callControlText}>{activeCall ? '종료' : '취소'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={appointmentModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAppointmentModalOpen(false)}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable
            style={styles.modalBackdropPressTarget}
            onPress={() => setAppointmentModalOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.centerModalKeyboard}
            pointerEvents="box-none"
          >
            <View style={styles.centerFormModalBox}>
              <Text style={styles.modalTitle}>
                {appointmentStep === 'date' ? '약속 날짜 선택' : '약속 시간 선택'}
              </Text>

              {appointmentStep === 'date' ? (
                <>
                  <Text style={styles.modalDesc}>
                    약속 시간 5분 전까지는 다시 약속잡기를 눌러 날짜와 시간을 바꿀 수 있습니다.
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.appointmentDateOptions}
                  >
                    {appointmentDateOptions.map((option) => {
                      const selected = selectedDateText === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.appointmentDateBtn,
                            selected && styles.appointmentDateBtnActive,
                          ]}
                          onPress={() => setSelectedDateText(option.value)}
                        >
                          <Text
                            style={[
                              styles.appointmentDateLabel,
                              selected && styles.appointmentDateTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={[
                              styles.appointmentDateValue,
                              selected && styles.appointmentDateTextActive,
                            ]}
                          >
                            {option.value}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.primaryModalBtn}
                    onPress={() => {
                      if (!selectedDateText.trim()) {
                        Alert.alert('날짜 선택', '날짜를 선택해 주세요.');
                        return;
                      }
                      setAppointmentStep('time');
                    }}
                  >
                    <Text style={styles.primaryModalBtnText}>시간 선택하기</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.modalDesc}>
                    선택한 날짜: {selectedDateText}
                  </Text>

                  {availableAppointmentTimeOptions.length === 0 ? (
                    <View style={styles.appointmentEmptyBox}>
                      <Text style={styles.appointmentEmptyText}>
                        이 날짜에는 선택 가능한 시간이 없습니다. 다른 날짜를 선택해 주세요.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.appointmentTimeScroll}
                      contentContainerStyle={styles.appointmentTimeOptions}
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {availableAppointmentTimeOptions.map((timeOption) => {
                        const selected = selectedTimeText === timeOption;

                        return (
                          <TouchableOpacity
                            key={timeOption}
                            style={[
                              styles.appointmentTimeBtn,
                              selected && styles.appointmentTimeBtnActive,
                            ]}
                            onPress={() => setSelectedTimeText(timeOption)}
                          >
                            <Text
                              style={[
                                styles.appointmentTimeText,
                                selected && styles.appointmentTimeTextActive,
                              ]}
                            >
                              {timeOption}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.primaryModalBtn,
                      availableAppointmentTimeOptions.length === 0 && styles.sendBtnDisabled,
                    ]}
                    onPress={submitAppointment}
                    disabled={availableAppointmentTimeOptions.length === 0}
                  >
                    <Text style={styles.primaryModalBtnText}>
                      {latestAppointmentDate ? '약속 변경 보내기' : '약속 보내기'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.secondaryModalBtn}
                onPress={() => {
                  if (appointmentStep === 'time') {
                    setAppointmentStep('date');
                    return;
                  }
                  setAppointmentModalOpen(false);
                }}
              >
                <Text style={styles.secondaryModalBtnText}>
                  {appointmentStep === 'time' ? '날짜 다시 입력' : '취소'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        visible={saleCompleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSaleCompleteModal}
      >
        <View style={styles.centerModalOverlay}>
          <Pressable style={styles.modalBackdropPressTarget} onPress={closeSaleCompleteModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.centerModalKeyboard}
            pointerEvents="box-none"
          >
            <View style={styles.formModalBox}>
              <Text style={styles.modalTitle}>
                {isShareListing ? '나눔 수량 선택' : '판매 수량 선택'}
              </Text>
              <Text style={styles.modalDesc}>
                {isShareListing ? '나눔한' : '거래한'} 수량을 입력하면 남은 수량이 차감됩니다.
              </Text>

              <Text style={styles.stockSummaryText}>
                남은 수량 {listingQuantityInfo.remaining}개 / 전체 {listingQuantityInfo.total}개
              </Text>

              <TextInput
                style={styles.accountInput}
                placeholder="1"
                value={saleQuantityText}
                keyboardType="number-pad"
                onChangeText={(value) => {
                  const onlyNumber = value.replace(/[^0-9]/g, '');
                  setSaleQuantityText(onlyNumber);
                }}
              />

              <TouchableOpacity
                style={[styles.primaryModalBtn, saleCompleting && styles.sendBtnDisabled]}
                onPress={completeSaleAndGoToReview}
                disabled={saleCompleting}
              >
                <Text style={styles.primaryModalBtnText}>
                  {saleCompleting
                    ? '처리 중...'
                    : `${isShareListing ? '나눔완료' : '거래완료'}하고 후기 남기기`}
                </Text>
              </TouchableOpacity>

              {reviewOnlySaleId ? (
                <TouchableOpacity
                  style={styles.secondaryModalBtn}
                  onPress={() => {
                    if (saleCompleting || !pendingReviewTargetId) return;

                    const reviewTargetId = pendingReviewTargetId;
                    const saleId = reviewOnlySaleId;

                    setSaleCompleteModalOpen(false);
                    setPendingReviewTargetId(null);
                    setReviewOnlySaleId(null);
                    setSaleQuantityText('1');
                    goToReviewCreate(reviewTargetId, saleId);
                  }}
                >
                  <Text style={styles.secondaryModalBtnText}>기존 거래 후기만 남기기</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.secondaryModalBtn}
                onPress={closeSaleCompleteModal}
              >
                <Text style={styles.secondaryModalBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        visible={imageViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={closeImageViewer}
      >
        <GestureHandlerRootView style={styles.imageViewerRoot}>
          <View style={styles.imageViewerOverlay}>
            <TouchableOpacity
              style={styles.imageViewerBack}
              onPress={closeImageViewer}
            >
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imageViewerClose}
              onPress={closeImageViewer}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>

            {Platform.OS === 'web' ? (
              <FlatList
                data={selectedImageUrls}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `${item}-${index}`}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                onMomentumScrollEnd={(e) => {
                  const width = e.nativeEvent.layoutMeasurement.width;
                  const index = Math.round(e.nativeEvent.contentOffset.x / width);
                  setSelectedImageIndex(index);
                }}
                renderItem={({ item }) => (
                  <View style={styles.fullImagePage}>
                    <Image
                      source={{ uri: item }}
                      style={styles.fullImage}
                      resizeMode="contain"
                      resizeMethod="resize"
                      onError={(e) => console.log('큰 이미지 로드 실패:', e.nativeEvent)}
                    />
                  </View>
                )}
              />
            ) : selectedImageUrls[selectedImageIndex] ? (
              <View style={styles.fullImagePage}>
                <ZoomableChatImage
                  key={`${selectedImageUrls[selectedImageIndex]}-${selectedImageIndex}`}
                  uri={selectedImageUrls[selectedImageIndex]}
                  onClose={closeImageViewer}
                  onPrev={goPrevImage}
                  onNext={goNextImage}
                />
              </View>
            ) : null}

            {selectedImageUrls.length > 1 ? (
              <Text style={styles.imageCountText}>
                {selectedImageIndex + 1} / {selectedImageUrls.length}
              </Text>
            ) : null}
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* 송금요청 모달 */}
      <Modal visible={accountModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setAccountModalOpen(false)}>
          <View
            style={[
              styles.modalOverlay,
              {
                paddingBottom:
                  Platform.OS === 'android'
                    ? Math.max(insets.bottom, 34)
                    : Math.max(insets.bottom, 16),
              },
            ]}
          >
            <TouchableWithoutFeedback>
              <View style={styles.formModalBox}>
                <Text style={styles.modalTitle}>송금요청</Text>
                <Text style={styles.modalDesc}>
                  은행명과 계좌번호를 입력하면 채팅방에 송금요청 메시지로 전송됩니다.
                </Text>

                <TextInput
                  style={styles.accountInput}
                  placeholder="예: 카카오뱅크 3333-00-0000000 홍길동"
                  value={accountText}
                  onChangeText={setAccountText}
                />

                <TouchableOpacity style={styles.primaryModalBtn} onPress={submitPaymentRequest}>
                  <Text style={styles.primaryModalBtnText}>저장하고 전송</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryModalBtn}
                  onPress={() => setAccountModalOpen(false)}
                >
                  <Text style={styles.secondaryModalBtnText}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 플러스 버튼 메뉴 */}
      <Modal visible={plusMenuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setPlusMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomMenuBox}>
                <TouchableOpacity style={styles.menuItem} onPress={handleAlbum}>
                  <Text style={styles.menuText}>앨범</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleCamera}>
                  <Text style={styles.menuText}>카메라</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handlePlace}>
                  <Text style={styles.menuText}>장소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleSchedule}>
                  <Text style={styles.menuText}>약속 선택</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 헤더 메뉴 */}
      <Modal visible={headerMenuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setHeaderMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.headerMenuBox}>
                {isProjectRoom ? (
                  <TouchableOpacity style={styles.menuItem} onPress={openParticipantModal}>
                    <Text style={styles.menuText}>참여자 보기</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.menuItem} onPress={handleHeaderReview}>
                  <Text style={styles.menuText}>후기 보내기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
                  <Text style={styles.menuText}>차단하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Text style={[styles.menuText, styles.warnText]}>신고하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleFraudHistory}>
                  <Text style={styles.menuText}>사기 이력 조회하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleMute}>
                  <View style={styles.menuRow}>
                    <Text style={styles.menuText}>
                      {isMuted ? '알림 켜기' : '알림 끄기'}
                    </Text>

                    {isMuted ? (
                      <Ionicons name="notifications-off-outline" size={18} color="#6b7280" />
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleExitRoom}>
                  <Text style={[styles.menuText, styles.warnText]}>채팅방 나가기</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 참여자 보기 모달 */}
      <Modal
        visible={participantModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setParticipantModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setParticipantModalOpen(false)}>
          <View style={styles.centerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.participantModalBox, isDarkMode && styles.participantModalBoxDark]}>
                <View style={styles.participantModalHeader}>
                  <Text style={[styles.modalTitle, isDarkMode && styles.participantModalTitleDark]}>
                    참여자 {chatParticipants.length}명
                  </Text>
                  <TouchableOpacity
                    style={styles.participantCloseBtn}
                    onPress={() => setParticipantModalOpen(false)}
                  >
                    <Ionicons name="close" size={20} color={isDarkMode ? '#fff' : '#111827'} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.modalDesc, isDarkMode && styles.participantModalDescDark]}>
                  내보내도 기존 채팅 기록은 삭제되지 않습니다.
                </Text>

                <ScrollView
                  style={styles.participantList}
                  contentContainerStyle={styles.participantListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {chatParticipants.length === 0 ? (
                    <Text style={[styles.participantEmptyText, isDarkMode && styles.participantMetaTextDark]}>
                      참여자를 찾지 못했습니다.
                    </Text>
                  ) : (
                    chatParticipants.map((participant) => {
                      const removing = participantActionLoadingId === participant.userId;

                      return (
                        <View
                          key={participant.userId}
                          style={[
                            styles.participantRow,
                            isDarkMode && styles.participantRowDark,
                          ]}
                        >
                          <View style={styles.participantAvatar}>
                            <Text style={styles.participantAvatarText}>
                              {participant.name.trim().slice(0, 1) || '?'}
                            </Text>
                          </View>

                          <View style={styles.participantInfo}>
                            <View style={styles.participantNameRow}>
                              <Text
                                style={[
                                  styles.participantName,
                                  isDarkMode && styles.participantNameDark,
                                ]}
                                numberOfLines={1}
                              >
                                {participant.name}
                                {participant.isMe ? ' (나)' : ''}
                              </Text>
                              {participant.isOwner ? (
                                <Text style={styles.participantOwnerBadge}>방장</Text>
                              ) : null}
                            </View>
                            <Text
                              style={[
                                styles.participantMetaText,
                                isDarkMode && styles.participantMetaTextDark,
                              ]}
                              numberOfLines={1}
                            >
                              {participant.meta}
                            </Text>
                          </View>

                          {participant.canRemove ? (
                            <TouchableOpacity
                              style={[
                                styles.participantRemoveBtn,
                                removing && styles.participantRemoveBtnDisabled,
                              ]}
                              onPress={() => handleRemoveParticipant(participant)}
                              disabled={removing}
                            >
                              <Text style={styles.participantRemoveText}>
                                {removing ? '처리중' : '내보내기'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* 신고하기 모달 */}
      <Modal visible={reportModalOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setReportModalOpen(false)}>
          <View style={styles.centerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.formModalBox}>
                <Text style={styles.modalTitle}>신고하기</Text>

                <Text style={styles.modalDesc}>
                  신고 항목을 선택하고 내용을 작성해 주세요.
                </Text>

                <Text style={styles.reportTargetText}>
                  신고 대상: {reportTargetName}
                </Text>

                <View style={styles.reportReasonWrap}>
                  {REPORT_REASONS.map((reason) => {
                    const selected = reportReason === reason;

                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reportReasonBtn,
                          selected && styles.reportReasonBtnActive,
                        ]}
                        onPress={() => setReportReason(reason)}
                      >
                        <Text
                          style={[
                            styles.reportReasonText,
                            selected && styles.reportReasonTextActive,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.reportInput}
                  placeholder="신고 내용을 자세히 적어주세요."
                  value={reportContent}
                  onChangeText={setReportContent}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity style={styles.primaryModalBtn} onPress={submitReport}>
                  <Text style={styles.primaryModalBtnText}>신고 접수하기</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryModalBtn}
                  onPress={() => setReportModalOpen(false)}
                >
                  <Text style={styles.secondaryModalBtnText}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  screenDark: {
    // backgroundColor: '#000',
  },
  flex: { flex: 1 },
  messageListLayer: {
    flex: 1,
    zIndex: 0,
    elevation: 0,
  },

  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  headerDark: {
    borderBottomColor: '#1f2937',
    // backgroundColor: '#000',
  },
  reportTargetText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  headerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    maxWidth: 180,
  },
  headerNameDark: {
    color: '#fff',
  },

  headerSub: {
    marginTop: 2,
    fontSize: 11,
    color: '#9ca3af',
    maxWidth: 180,
  },
  headerSubDark: {
    color: '#d1d5db',
  },



  headerRight: {
    flexDirection: 'row',
    gap: 6,
  },

  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    padding: 20,
  },

  modalBackdropPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },

  mutedIconWrap: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  centerModalKeyboard: {
    width: '100%',
  },

  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },

  imageViewerRoot: {
    flex: 1,
  },

  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },

  imageViewerBack: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },

  fullImagePage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  zoomGestureBox: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  reportReasonWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  reportReasonBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },

  reportReasonBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  reportReasonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },

  reportReasonTextActive: {
    color: '#fff',
  },

  reportInput: {
    marginTop: 14,
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },

  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.85,
  },

  centerFormModalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageBubble: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },

  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },

  projectPanel: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },

  projectPanelCollapsed: {
    paddingVertical: 9,
    gap: 0,
  },

  projectPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  projectPanelTitleBox: {
    flex: 1,
    minWidth: 0,
  },

  projectPanelActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },

  projectCollapseDock: {
    height: 28,
    marginTop: -14,
    paddingRight: 16,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },

  projectCollapseFloatBtn: {
    width: 30,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  projectCollapseFloatBtnDark: {
    backgroundColor: 'rgba(17,24,39,0.74)',
    borderColor: 'rgba(75,85,99,0.78)',
  },

  projectBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  projectBadge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#166534',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '900',
  },

  projectStatusBadge: {
    borderRadius: 999,
    backgroundColor: '#111827',
    color: '#fff',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '900',
  },

  projectPanelTitle: {
    marginTop: 7,
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },

  projectPanelMeta: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },

  projectOpenBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: '#166534',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  projectOpenText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },

  projectPanelGrid: {
    flexDirection: 'row',
    gap: 8,
  },

  projectCalendarStrip: {
    flexDirection: 'row',
    gap: 3,
  },

  projectCalendarDay: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 1,
  },

  projectCalendarDayActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },

  projectCalendarWeekday: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '900',
  },

  projectCalendarWeekdayActive: {
    color: '#fff',
  },

  projectCalendarDate: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },

  projectCalendarDateActive: {
    color: '#fff',
  },

  projectCalendarDots: {
    minHeight: 6,
    flexDirection: 'row',
    gap: 3,
  },

  projectScheduleDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#166534',
  },

  projectReportDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#dc2626',
  },

  projectPanelItem: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    gap: 4,
  },

  projectPanelLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '900',
  },

  projectPanelValue: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },

  incomingCallControlPanel: {
    bottom: 170,
  },

  imageGrid: {
    width: 200,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  singleImageGrid: {
    width: 160,
  },

  singleImageWrap: {
    width: 160,
    height: 160,
  },

  gridImageWrap: {
    width: 98,
    height: 98,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },

  gridImage: {
    width: '100%',
    height: '100%',
  },

  linkText: {
    color: '#166534',
    textDecorationLine: 'underline',
    fontWeight: '800',
  },

  myLinkText: {
    color: '#dcfce7',
    textDecorationLine: 'underline',
    fontWeight: '800',
  },

  moreImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  moreImageText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },




  imageCountText: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  callScreenOverlay: {
    flex: 1,
    backgroundColor: '#020617',
  },

  voiceCallStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },

  voiceAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },

  videoCallStage: {
    flex: 1,
    backgroundColor: '#000',
  },

  videoRemoteFull: {
    width: '100%',
    height: '100%',
  },

  videoWaitingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },

  videoRemoteOffBox: {
    backgroundColor: '#000',
  },

  videoWaitingText: {
    marginTop: 14,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  videoLocalPreview: {
    position: 'absolute',
    top: 90,
    right: 18,
    width: 108,
    height: 156,
    borderRadius: 18,
    backgroundColor: '#374151',
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },

  videoLocalOffPreview: {
    position: 'absolute',
    top: 90,
    right: 18,
    width: 108,
    height: 156,
    borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callTopInfo: {
    position: 'absolute',
    top: 54,
    left: 20,
    right: 20,
    alignItems: 'center',
  },

  callTopTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },

  callTopName: {
    marginTop: 8,
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '800',
  },

  callTimerText: {
    marginTop: 8,
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '800',
  },

  incomingCallActions: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 70,
  },

  bigCallCircleBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  callControlPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 26,
    borderRadius: 24,
    backgroundColor: 'rgba(15,23,42,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },

  callControlBtn: {
    width: 92,
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },

  callControlText: {
    marginTop: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },

  endCallControlBtn: {
    backgroundColor: '#ef4444',
  },






  productThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },

  productThumb: {
    width: '100%',
    height: '100%',
  },

  productThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  productInfo: {
    flex: 1,
  },

  productTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  productMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },

  productPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },

  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },

  quickActionBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },

  reviewPreviewCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },

  reviewPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  reviewPreviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },

  reviewPreviewTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },

  reviewPreviewBadge: {
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
    color: '#6b7280',
  },

  reviewPreviewBadgeOpen: {
    backgroundColor: '#ecfdf5',
    color: '#166534',
  },

  reviewPreviewSummary: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 20,
  },

  reviewPreviewComment: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#4b5563',
  },

  reviewPreviewLockRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  reviewPreviewHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },

  reviewPreviewAction: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  reviewPreviewActionText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
  },

  list: {
    padding: 16,
    paddingTop: 6,
  },

  messageRow: {
    maxWidth: '78%',
    marginTop: 10,
  },

  messageRowAfterDate: {
    marginTop: 6,
  },

  groupedMessageRow: {
    marginTop: 3,
  },

  dateDividerWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 6,
  },

  firstDateDividerWrap: {
    marginTop: 2,
  },

  dateDividerPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.07)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  dateDividerPillDark: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  dateDividerText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },

  dateDividerTextDark: {
    color: '#f3f4f6',
  },

  myRow: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },

  otherRow: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },

  senderName: {
    maxWidth: 230,
    marginBottom: 4,
    marginLeft: 4,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },

  senderNameDark: {
    color: '#d1d5db',
  },

  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  myBubble: {
    backgroundColor: '#166534',
    borderBottomRightRadius: 6,
  },

  otherBubble: {
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 6,
  },

  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },

  myMessageText: {
    color: '#fff',
  },

  placeMessageCard: {
    minWidth: 190,
    maxWidth: 240,
  },

  placeMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  placeMessageTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },

  myPlaceMessageTitle: {
    color: '#fff',
  },

  placeMessageAddress: {
    marginTop: 8,
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },

  myPlaceMessageAddress: {
    color: '#fff',
  },

  placeMessageHint: {
    marginTop: 8,
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
  },

  myPlaceMessageHint: {
    color: '#dcfce7',
  },

  completionActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  completionYesBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#111827',
    paddingVertical: 10,
    alignItems: 'center',
  },

  completionNoBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 10,
    alignItems: 'center',
  },

  completionYesText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },

  completionNoText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },

  completionAnsweredText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },

  myCompletionAnsweredText: {
    color: '#dcfce7',
  },

  chatImage: {
    width: 190,
    height: 190,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },

  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  unreadText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '800',
  },

  timeText: {
    fontSize: 11,
    color: '#9ca3af',
  },

  emptyBox: {
    marginTop: 40,
    alignItems: 'center',
  },

  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },

  inputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'flex-end',
  },

  inputRowDark: {
    borderTopColor: 'transparent',
    backgroundColor: 'transparent',
  },

  inputWindowLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  inputOverlayPosition: {
    position: 'absolute',
    left: 0,
    right: 0,
  },

  edgeBackSwipeZone: {
    position: 'absolute',
    left: 0,
    top: 56,
    bottom: 0,
    width: 26,
    zIndex: 40,
  },

  plusBtn: {
    width: 42,
    height: 46,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  plusBtnDark: {
    borderColor: '#374151',
    backgroundColor: '#111827',
  },

  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    color: '#111827',
  },

  inputPressTarget: {
    flex: 1,
  },

  inputDark: {
    borderColor: '#374151',
    backgroundColor: '#111827',
    color: '#fff',
  },

  sendBtn: {
    backgroundColor: '#166534',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sendBtnDisabled: {
    opacity: 0.6,
  },

  controlPressed: {
    opacity: 0.72,
  },

  sendBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'android' ? 34 : 16,
  },

  bottomMenuBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 8,
    marginBottom: Platform.OS === 'android' ? 36 : 0,
  },

  formModalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },

  participantModalBox: {
    width: '100%',
    maxHeight: '76%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },

  participantModalBoxDark: {
    backgroundColor: '#111827',
  },

  participantModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  participantModalTitleDark: {
    color: '#fff',
  },

  participantModalDescDark: {
    color: '#9ca3af',
  },

  participantCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  participantList: {
    marginTop: 14,
  },

  participantListContent: {
    gap: 10,
    paddingBottom: 2,
  },

  participantRow: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  participantRowDark: {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
  },

  participantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  participantAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  participantInfo: {
    flex: 1,
    minWidth: 0,
  },

  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  participantName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },

  participantNameDark: {
    color: '#fff',
  },

  participantOwnerBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: '#166534',
    fontSize: 10,
    fontWeight: '900',
  },

  participantMetaText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },

  participantMetaTextDark: {
    color: '#d1d5db',
  },

  participantEmptyText: {
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },

  participantRemoveBtn: {
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
  },

  participantRemoveBtnDisabled: {
    opacity: 0.5,
  },

  participantRemoveText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '900',
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  modalDesc: {
    marginTop: 8,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },

  stockSummaryText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },

  appointmentDateOptions: {
    gap: 8,
    paddingTop: 14,
    paddingBottom: 2,
  },

  appointmentDateBtn: {
    minWidth: 108,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  appointmentDateBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  appointmentDateLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  appointmentDateValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },

  appointmentDateTextActive: {
    color: '#fff',
  },

  appointmentTimeScroll: {
    marginTop: 14,
    maxHeight: 230,
  },

  appointmentTimeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 2,
  },

  appointmentEmptyBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 18,
  },

  appointmentEmptyText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },

  appointmentTimeBtn: {
    width: '30.8%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 11,
    alignItems: 'center',
  },

  appointmentTimeBtnActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },

  appointmentTimeBtnDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.55,
  },

  appointmentTimeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  appointmentTimeTextActive: {
    color: '#fff',
  },

  appointmentTimeTextDisabled: {
    color: '#9ca3af',
  },

  accountInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },

  primaryModalBtn: {
    marginTop: 14,
    backgroundColor: '#166534',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },

  primaryModalBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  secondaryModalBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },

  secondaryModalBtnText: {
    color: '#6b7280',
    fontWeight: '700',
  },

  callMenuItem: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  callMenuIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callMenuTextBox: {
    flex: 1,
  },

  callMenuSubText: {
    marginTop: 3,
    fontSize: 12,
    color: '#6b7280',
  },

  callModalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    width: '100%',
  },

  callAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callModalTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },

  callModalName: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },

  remoteVideo: {
    marginTop: 18,
    width: '100%',
    height: 340,
    borderRadius: 18,
    backgroundColor: '#111827',
    overflow: 'hidden',
  },

  localVideo: {
    position: 'absolute',
    right: 34,
    bottom: 92,
    width: 92,
    height: 130,
    borderRadius: 14,
    backgroundColor: '#374151',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },

  hiddenRtcView: {
    width: 1,
    height: 1,
    opacity: 0,
  },

  callActionRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 34,
  },

  callCircleBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },

  callDeclineBtn: {
    backgroundColor: '#ef4444',
    transform: [{ rotate: '135deg' }],
  },

  callAcceptBtn: {
    backgroundColor: '#16a34a',
  },

  callWideDangerBtn: {
    minWidth: 180,
    backgroundColor: '#ef4444',
  },

  headerMenuBox: {
    position: 'absolute',
    top: 64,
    right: 12,
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },

  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  warnText: {
    color: '#dc2626',
  },
});
