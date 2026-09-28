// 견적문의 작성 화면: 사용자가 가게를 선택해 신청자 정보, 주소, 희망 일정, 사진/영상을 제출한다.
// 한 가게당 중복 문의 제한과 알림 발송 흐름을 수정할 때 이 파일을 확인한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import VideoAttachment from '../../components/VideoAttachment';
import AsServiceHeader from '../../components/AsServiceHeader';
import AsInquiryNavigation from '../../components/AsInquiryNavigation';
import { useAppTheme } from '../../hooks/use-app-theme';
import { SIMPLE_AS_MODE } from '../../lib/appMode';
import { getAsPalette, type AsPalette } from '../../lib/asAppearance';
import { AS_CATEGORIES, AS_SYMPTOMS, buildAsInquiryText, getInitialAsCategory } from '../../lib/asInquiry';
import { getMediaFormat } from '../../lib/mediaAttachments';
import { removeUploadedMedia, uploadMediaAsset, validateMediaAsset } from '../../lib/mediaUpload';
import { getProfileImageUrl } from '../../lib/profileImage';
import { fetchMyRegions, fetchMyRegionSettings } from '../../lib/region';
import { getStoreCategoryLabel, STORE_CATEGORY_OPTIONS } from '../../lib/storeCategories';
import { supabase } from '../../lib/supabase';

const ESTIMATE_CATEGORIES = [
  '전체 인테리어',
  '도배',
  '장판',
  '욕실',
  '주방',
  '타일',
  '필름',
  '전기/조명',
  '철거',
  '목공',
  '가구제작',
  '상가공사',
  '부분수리',
  '유지보수',
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

function isValidDateText(value: string) {
  if (!value.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;

  const date = new Date(`${value.trim()}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function formatDateYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string) {
  if (!isValidDateText(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { key: string; day: number | null; dateText: string | null }[] = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ key: `empty-${i}`, day: null, dateText: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      dateText: formatDateYmd(new Date(year, month, day)),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${cells.length}`, day: null, dateText: null });
  }

  return cells;
}

export default function EstimateCreateScreen({ isTab = false }: { isTab?: boolean }) {
  const { user } = useAuth();
  // 탭과 딥링크 모두 계정이 바뀌면 이전 신청자의 초안/첨부를 제거한다.
  return <EstimateCreateForm key={user?.id || 'guest'} isTab={isTab} />;
}

function EstimateCreateForm({ isTab }: { isTab: boolean }) {
  const { user } = useAuth();
  const { category } = useLocalSearchParams<{ category?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const base = useAppTheme();
  const theme = useMemo(() => SIMPLE_AS_MODE ? getAsPalette(base) : { ...getAsPalette(base), ...base }, [base]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const requestCategories = SIMPLE_AS_MODE ? AS_CATEGORIES : ESTIMATE_CATEGORIES;
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => [
    SIMPLE_AS_MODE ? getInitialAsCategory(category) : requestCategories[0],
  ]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [storeSelectionOpen, setStoreSelectionOpen] = useState(!SIMPLE_AS_MODE);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [categorySelectionOpen, setCategorySelectionOpen] = useState(!SIMPLE_AS_MODE);
  const [addressEditing, setAddressEditing] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const descriptionInput = useRef<TextInput>(null);
  const maxAttachments = SIMPLE_AS_MODE ? 5 : 6;
  const requestedCategory = getInitialAsCategory(category);
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [applicantName, setApplicantName] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [budget] = useState('');
  const [preferredContact] = useState('앱 채팅');
  const [description, setDescription] = useState('');
  const [mediaAssets, setMediaAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [createdRequestId, setCreatedRequestId] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const uploadedCount = useRef(0);
  const submitLock = useRef(false);
  const pickerLock = useRef(false);
  const [stores, setStores] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [activeStoreRequestIds, setActiveStoreRequestIds] = useState<Record<string, number>>({});
  const [selectedStoreCategory, setSelectedStoreCategory] = useState('전체');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (SIMPLE_AS_MODE && !createdRequestId) setSelectedCategories([requestedCategory]);
  }, [createdRequestId, requestedCategory]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    const loadDefaultRegion = async () => {
      const [regions, settings] = await Promise.all([
        fetchMyRegions(),
        fetchMyRegionSettings(),
      ]);
      const activeRegion =
        regions.find((item: any) => item.id === settings?.active_region_id) || regions[0];

      if (activeRegion?.region_name) {
        setRegion(activeRegion.region_name);
      }
    };

    void loadDefaultRegion();
    void loadStores();
  }, []);

  const loadActiveStoreRequests = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('estimate_requests')
      .select(`
        id,
        preferred_store_user_id,
        assigned_store_user_id,
        status,
        estimate_request_store_statuses (
          store_user_id,
          status
        )
      `)
      .eq('user_id', user.id)
      .neq('status', 'closed')
      .neq('status', 'hidden')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {      setActiveStoreRequestIds({});
      return;
    }

    const nextMap = (data || []).reduce<Record<string, number>>((acc, item: any) => {
      const storeId = item.assigned_store_user_id || item.preferred_store_user_id;
      if (!storeId || acc[storeId]) return acc;

      const storeStatus = (item.estimate_request_store_statuses || []).find(
        (row: any) => row.store_user_id === storeId
      )?.status;

      if (storeStatus === 'completed' || storeStatus === 'closed') return acc;

      acc[storeId] = Number(item.id);
      return acc;
    }, {});

    setActiveStoreRequestIds(nextMap);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setActiveStoreRequestIds({});
      return;
    }

    void loadActiveStoreRequests();
  }, [loadActiveStoreRequests, user]);

  useEffect(() => {
    if (selectedStoreId && activeStoreRequestIds[selectedStoreId]) {
      setSelectedStoreId(null);
      setSelectedStaffUserId(null);
    }
  }, [activeStoreRequestIds, selectedStoreId]);

  const loadStores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        avatar_path,
        avatar_url,
        store_category,
        store_address,
        store_intro,
        store_accepts_inquiries,
        business_verified,
        user_type
      `)
      .eq('user_type', 'store')
      .eq('business_verified', true)
      .neq('store_accepts_inquiries', false)
      .order('display_name', { ascending: true })
      .limit(50);

    if (error) {      setStores([]);
      return;
    }

    const nextStores = data || [];
    setStores(nextStores);

    const storeIds = nextStores.map((store: any) => store.id).filter(Boolean);
    if (storeIds.length === 0) {
      setStaffMembers([]);
      return;
    }

    const { data: staffData, error: staffError } = await supabase
      .from('store_staff_members')
      .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
      .eq('status', 'active')
      .eq('role', 'staff')
      .in('store_user_id', storeIds)
      .order('display_name', { ascending: true });

    if (staffError) {      setStaffMembers([]);
      return;
    }

    setStaffMembers(staffData || []);
  };

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      const categoryLabel = getStoreCategoryLabel(store.store_category);
      if (selectedStoreCategory === '전체') return true;
      if (selectedStoreCategory === '기타') {
        return categoryLabel === '기타' || !STORE_CATEGORY_OPTIONS.includes(categoryLabel);
      }
      return categoryLabel === selectedStoreCategory;
    });
  }, [selectedStoreCategory, stores]);

  const selectedStoreStaff = useMemo(() => {
    if (!selectedStoreId) return [];
    return staffMembers.filter((staff) => staff.store_user_id === selectedStoreId);
  }, [selectedStoreId, staffMembers]);

  const calendarDays = useMemo(() => getMonthDays(calendarMonth), [calendarMonth]);
  const calendarWeeks = useMemo(() => {
    const weeks: typeof calendarDays[] = [];

    for (let index = 0; index < calendarDays.length; index += 7) {
      weeks.push(calendarDays.slice(index, index + 7));
    }

    return weeks;
  }, [calendarDays]);

  const calendarTitle = useMemo(() => {
    return calendarMonth.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
    });
  }, [calendarMonth]);

  const selectedCategoryText = selectedCategories.join(', ');

  useEffect(() => {
    if (!selectedStoreId) {
      setSelectedStaffUserId(null);
      return;
    }

    if (
      selectedStaffUserId &&
      !selectedStoreStaff.some((staff) => staff.staff_user_id === selectedStaffUserId)
    ) {
      setSelectedStaffUserId(null);
    }
  }, [selectedStaffUserId, selectedStoreId, selectedStoreStaff]);

  const pickMedia = async (kind: 'images' | 'videos' | 'all' = 'all', camera = false) => {
    if (pickerLock.current || submitLock.current || createdRequestId) return;
    const remain = maxAttachments - mediaAssets.length;
    if (remain <= 0) {
      showAlert('첨부파일', `사진과 영상은 합쳐서 최대 ${maxAttachments}개까지 첨부할 수 있습니다.`);
      return;
    }
    pickerLock.current = true;
    setPickingMedia(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showAlert('카메라 권한 필요', '기기 설정에서 카메라 권한을 허용하거나 앨범에서 첨부해 주세요.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: kind === 'all' ? ['images', 'videos'] : [kind],
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = camera ? await ImagePicker.launchCameraAsync({
        ...options,
        videoMaxDuration: 10,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      }) : await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: remain,
      });
      if (result.canceled) return;
      const assets = result.assets.slice(0, remain);
      for (const asset of assets) await validateMediaAsset(asset);
      setPreviewIndex(mediaAssets.length);
      setMediaAssets((prev) => [...prev, ...assets].slice(0, maxAttachments));
    } catch (error: any) {
      showAlert('첨부파일 선택 실패', error?.message || '사진이나 영상을 다시 선택해 주세요.');
    } finally {
      pickerLock.current = false;
      setPickingMedia(false);
    }
  };

  const chooseMedia = (kind: 'images' | 'videos') => {
    if (pickerLock.current || submitLock.current || createdRequestId) return;
    if (Platform.OS === 'web') {
      void pickMedia(kind);
      return;
    }
    Alert.alert(kind === 'images' ? '사진 첨부' : '영상 첨부', undefined, [
      { text: kind === 'images' ? '사진 촬영' : '10초 영상 촬영', onPress: () => void pickMedia(kind, true) },
      { text: '앨범에서 선택', onPress: () => void pickMedia(kind) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const toggleCategory = (item: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(item)) {
        return prev.length === 1 ? prev : prev.filter((category) => category !== item);
      }

      // 기본 분류와 구체적인 수리 분야가 함께 남지 않도록 한다.
      if (SIMPLE_AS_MODE) {
        return item === '간단 AS' ? [item] : [...prev.filter((value) => value !== '간단 AS'), item];
      }
      return [...prev, item];
    });
  };

  const moveCalendarMonth = (diff: number) => {
    setCalendarMonth((current) => {
      return new Date(current.getFullYear(), current.getMonth() + diff, 1);
    });
  };

  const selectDesiredDate = (dateText: string) => {
    setDesiredDate(dateText);
    const parsed = parseYmd(dateText);
    if (parsed) {
      setCalendarMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    setCalendarVisible(false);
  };

  const uploadEstimateMedia = async (requestId: number, asset: ImagePicker.ImagePickerAsset, sortOrder: number) => {
    if (!user) return;
    const uploaded = await uploadMediaAsset('estimate-images', `${user.id}/${requestId}/${Date.now()}-${sortOrder}`, asset);
    const { error: rowError } = await supabase.from('estimate_request_images').insert({
      estimate_request_id: requestId,
      image_path: uploaded.path,
      sort_order: sortOrder,
    });
    if (rowError) {
      await removeUploadedMedia('estimate-images', [uploaded.path]);
      throw rowError;
    }
  };

  const sendEstimateNotification = async (requestId: number) => {
    try {
      await supabase.functions.invoke('send-estimate-request-notification', {
        body: { requestId },
      });    } catch {    }
  };

  const submitEstimate = async () => {
    if (submitLock.current || pickerLock.current) return;

    if (!user) {
      router.push('/login?redirect=/estimate/create' as any);
      return;
    }

    const inquiryText = SIMPLE_AS_MODE ? buildAsInquiryText({
      title, description, categories: selectedCategories, symptoms: selectedSymptoms, attachmentCount: mediaAssets.length,
    }) : { title: title.trim(), description: description.trim() };
    const trimmedTitle = inquiryText.title;
    const trimmedDescription = inquiryText.description;
    const trimmedApplicantName = applicantName.trim();
    const trimmedApplicantPhone = applicantPhone.trim();
    const phoneDigits = trimmedApplicantPhone.replace(/[^\d]/g, '');

    if (selectedCategories.length === 0) {
      setMessage('필요한 공사 종류를 하나 이상 선택해 주세요.');
      return;
    }

    if (!trimmedApplicantName) {
      setMessage('신청자 이름을 입력해 주세요.');
      return;
    }

    if (!trimmedApplicantPhone) {
      setMessage('신청자 전화번호를 입력해 주세요.');
      return;
    }

    if (phoneDigits.length < 8) {
      setMessage('연락 가능한 전화번호를 입력해 주세요.');
      return;
    }

    if (!createdRequestId && selectedStoreId && activeStoreRequestIds[selectedStoreId]) {
      setMessage(
        SIMPLE_AS_MODE
          ? '이미 이 가게에 진행 중인 문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
          : '이미 이 가게에 진행 중인 견적문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
      );
      return;
    }

    if (!trimmedTitle) {
      setMessage('문의 제목을 입력해 주세요.');
      return;
    }

    if (!trimmedDescription) {
      setMessage(SIMPLE_AS_MODE ? '사진·영상, 증상 선택, 상세 내용 중 하나 이상을 남겨 주세요.' : '상세 내용을 입력해 주세요.');
      return;
    }

    if (!isValidDateText(desiredDate)) {
      setMessage('희망 일정은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    submitLock.current = true;
    Keyboard.dismiss();
    let requestId = createdRequestId;
    let newlyCreatedId: number | null = null;
    try {
      setSubmitting(true);
      setMessage('');
      for (const asset of mediaAssets.slice(uploadedCount.current)) await validateMediaAsset(asset);
      if (!requestId) {
        const { data, error } = await supabase
          .from('estimate_requests')
          .insert({
            user_id: user.id,
            category: selectedCategoryText,
            applicant_name: trimmedApplicantName,
            applicant_phone: trimmedApplicantPhone,
            region: region.trim() || null,
            address: address.trim() || null,
            budget: budget.trim() || null,
            desired_date: desiredDate.trim() || null,
            preferred_contact: preferredContact.trim() || null,
            preferred_store_user_id: selectedStoreId,
            assigned_store_user_id: selectedStoreId,
            preferred_staff_user_id: selectedStaffUserId,
            assigned_staff_user_id: selectedStaffUserId,
            routing_status: selectedStoreId ? 'store_selected' : 'admin_pending',
            fallback_destination: selectedStoreId ? 'selected_store' : 'designwish',
            title: trimmedTitle,
            description: trimmedDescription,
            status: 'open',
          })
          .select('id')
          .single();

        if (error) {
          setMessage(
            error.message.includes('이미 이 가게에 진행 중인 견적문의')
              ? SIMPLE_AS_MODE
                ? '이미 이 가게에 진행 중인 문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
                : '이미 이 가게에 진행 중인 견적문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
              : error.message
          );
          await loadActiveStoreRequests();
          return;
        }

        requestId = Number(data?.id);
        if (!requestId) {
          setMessage('견적문의 등록 결과를 받지 못했습니다.');
          return;
        }
        setCreatedRequestId(requestId);
        newlyCreatedId = requestId;
      }
      // 문의 원본은 한 번만 생성한다. 실패 후 재시도하면 아직 연결되지 않은 첨부부터 이어간다.
      for (let i = uploadedCount.current; i < mediaAssets.length; i += 1) {
        setUploadLabel(`첨부 업로드 중 ${i + 1}/${mediaAssets.length}`);
        await uploadEstimateMedia(requestId, mediaAssets[i], i);
        uploadedCount.current = i + 1;
      }

      showAlert(
        SIMPLE_AS_MODE ? 'AS 문의 등록 완료' : '견적문의 등록 완료',
        selectedStoreId
          ? SIMPLE_AS_MODE
            ? '선택한 가게에 문의가 전달됩니다.'
            : '선택한 가게에 견적문의가 전달됩니다.'
          : SIMPLE_AS_MODE
            ? '관리자가 확인한 뒤 직접 해결 방법 안내 또는 업체 연결을 진행합니다.'
            : '선택한 가게가 없어 관리자 배정 또는 디자인위쇼 문의로 접수됩니다.'
      );
      // 탭은 화면이 유지되므로 성공한 문의를 초기화한다. 업로드 실패 때는 초안을 보존한다.
      setTitle('');
      setDescription('');
      setSelectedSymptoms([]);
      setApplicantName('');
      setApplicantPhone('');
      setAddress('');
      setAddressEditing(false);
      setDesiredDate('');
      setCalendarVisible(false);
      setMediaAssets([]);
      setPreviewIndex(0);
      setCreatedRequestId(null);
      setSelectedStoreId(null);
      setSelectedStaffUserId(null);
      setStoreSelectionOpen(!SIMPLE_AS_MODE);
      uploadedCount.current = 0;
      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      setMessage(requestId
        ? `문의는 접수되었지만 첨부파일을 모두 저장하지 못했습니다. 첨부 재시도를 눌러 주세요. ${error?.message || ''}`
        : error?.message || '견적문의 등록 중 오류가 발생했습니다.');
    } finally {
      if (newlyCreatedId) await sendEstimateNotification(newlyCreatedId);
      submitLock.current = false;
      setUploadLabel('');
      setSubmitting(false);
    }
  };

  const activeMediaIndex = Math.min(previewIndex, Math.max(0, mediaAssets.length - 1));
  const activeMedia = mediaAssets[activeMediaIndex];
  const mediaSection = (
    <View style={styles.imageSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.inline}><Ionicons name="images" size={20} color={theme.primary} /><Text style={styles.sectionTitle}>고장 현장 담기</Text></View>
        <Text style={styles.counter}>{mediaAssets.length}/{maxAttachments}</Text>
      </View>
      <View style={styles.uploadRow}>
        <TouchableOpacity style={styles.uploadButton} accessibilityRole="button" accessibilityLabel="사진 촬영 또는 선택" onPress={() => chooseMedia('images')} disabled={pickingMedia || mediaAssets.length >= maxAttachments}>
          <View style={styles.uploadIcon}><Ionicons name="camera" size={28} color={theme.primary} /></View>
          <Text style={styles.uploadTitle}>사진 촬영 / 선택</Text>
          <Text style={styles.uploadDetail}>최대 {maxAttachments}개 첨부</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.uploadButton} accessibilityRole="button" accessibilityLabel="영상 촬영 또는 선택" onPress={() => chooseMedia('videos')} disabled={pickingMedia || mediaAssets.length >= maxAttachments}>
          <View style={[styles.uploadIcon, { backgroundColor: theme.accentSoft }]}><Ionicons name="videocam" size={28} color={theme.accentText} /></View>
          <Text style={styles.uploadTitle}>{Platform.OS === 'web' ? '영상 선택' : '10초 영상 촬영'}</Text>
          <Text style={styles.uploadDetail}>물새는 소리 · 모터음</Text>
        </TouchableOpacity>
      </View>
      {pickingMedia ? <View style={styles.mediaLoading}><ActivityIndicator color={theme.primary} /><Text style={styles.imageHelp}>첨부파일 확인 중...</Text></View> : null}
      {activeMedia ? (
        <View style={styles.uploadedSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.inline}><Ionicons name="checkmark-circle-outline" size={18} color={theme.primary} /><Text style={styles.label}>첨부한 현장 ({activeMediaIndex + 1}/{mediaAssets.length})</Text></View>
            <Text style={styles.attachmentStatus}>상담 시 전달</Text>
          </View>
          <View style={styles.largePreview}>
            {getMediaFormat(activeMedia).kind === 'video'
              ? <VideoAttachment uri={activeMedia.uri} name={activeMedia.fileName || '첨부영상'} duration={activeMedia.duration} compact />
              : <Image source={{ uri: activeMedia.uri }} style={styles.previewImage} resizeMode="contain" accessibilityLabel={`첨부사진 ${activeMediaIndex + 1}`} />}
            <TouchableOpacity style={styles.removeImageBtn} accessibilityRole="button" accessibilityLabel={`첨부파일 ${activeMediaIndex + 1} 삭제`} onPress={() => {
              setMediaAssets((previous) => previous.filter((_, index) => index !== activeMediaIndex));
              setPreviewIndex((previous) => Math.max(0, previous - 1));
            }}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          </View>
          {mediaAssets.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
            {mediaAssets.map((asset, index) => <TouchableOpacity key={`${asset.uri}-${index}`} style={[styles.previewThumb, index === activeMediaIndex && { borderColor: theme.primary }]} accessibilityRole="button" accessibilityLabel={`첨부파일 ${index + 1} 보기`} accessibilityState={{ selected: index === activeMediaIndex }} onPress={() => setPreviewIndex(index)}>
              {getMediaFormat(asset).kind === 'video' ? <Ionicons name="play-circle" size={28} color={theme.primary} /> : <Image source={{ uri: asset.uri }} style={styles.previewImage} />}
            </TouchableOpacity>)}
          </ScrollView> : null}
          <Text style={styles.imageHelp}>사진과 영상은 상담 담당자가 확인합니다.</Text>
        </View>
      ) : null}
      <Text style={styles.imageHelp}>{mediaAssets.length >= maxAttachments ? `최대 ${maxAttachments}개 첨부됨 · 삭제 후 다른 파일을 추가할 수 있어요` : '사진 10MB · 영상 30MB 이하'}</Text>
    </View>
  );

  const descriptionField = (
    <View style={styles.formSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.label}>{SIMPLE_AS_MODE ? '자세한 증상 설명 (선택)' : '상세 내용'}</Text>
        {SIMPLE_AS_MODE ? <Text style={styles.counter}>{description.length}/300</Text> : null}
      </View>
      <TextInput
        ref={descriptionInput}
        style={[styles.input, styles.textarea]}
        accessibilityLabel="상세 내용"
        value={description}
        onChangeText={setDescription}
        placeholder={SIMPLE_AS_MODE ? '언제부터, 어떤 문제가 생겼나요?' : '공간 상태, 원하는 공사 범위, 필요한 자재, 참고사항을 적어주세요.'}
        placeholderTextColor={theme.textMuted}
        maxLength={SIMPLE_AS_MODE ? 300 : undefined}
        multiline
        textAlignVertical="top"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={SIMPLE_AS_MODE ? ['top'] : []}>
    {!isTab ? <Stack.Screen options={{ title: SIMPLE_AS_MODE ? 'AS 문의' : '견적문의', headerShown: !SIMPLE_AS_MODE }} /> : null}
    {SIMPLE_AS_MODE ? <AsServiceHeader back={!isTab} /> : null}
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 32 + (SIMPLE_AS_MODE ? 0 : insets.bottom) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      <View style={{ gap: 18 }} pointerEvents={submitting || createdRequestId ? 'none' : 'auto'}>
      <View style={styles.intro}>
        {SIMPLE_AS_MODE ? <View style={styles.introBadge}><View style={styles.introDot} /><Text style={styles.eyebrow}>사진·영상으로 간편 접수</Text></View> : null}
        <Text style={styles.title}>
          {SIMPLE_AS_MODE ? '어디가 고장났나요?\n사진만 올려주세요' : '어떤 공사가 필요하세요?'}
        </Text>
        {SIMPLE_AS_MODE ? <Text style={styles.introDescription}>고장 난 곳을 사진·영상으로 보여주세요.{ '\n' }상담과 업체 연결을 도와드려요.</Text> : null}
      </View>

      {SIMPLE_AS_MODE ? mediaSection : null}
      {SIMPLE_AS_MODE ? <View style={styles.voiceBand}>
        <View style={styles.voiceIcon}><Ionicons name="mic" size={24} color="#341100" /></View>
        <View style={styles.flex}><Text style={styles.label}>말로 설명하고 싶으세요?</Text><Text style={styles.imageHelp}>영상에 목소리도 함께 담아주세요</Text></View>
        <TouchableOpacity style={styles.voiceButton} accessibilityRole="button" onPress={() => chooseMedia('videos')}><Text style={styles.voiceButtonText}>영상 첨부</Text></TouchableOpacity>
      </View> : null}

      <TouchableOpacity style={styles.categoryToggle} accessibilityRole="button" accessibilityLabel="수리 분야 변경" accessibilityState={{ expanded: categorySelectionOpen }} aria-expanded={categorySelectionOpen} onPress={() => setCategorySelectionOpen((value) => !value)}>
        <Text style={styles.label}>{SIMPLE_AS_MODE ? '수리 분야' : '공사 종류'}</Text>
        <Text style={styles.categorySummary}>{selectedCategoryText}</Text>
        <Ionicons name={categorySelectionOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary} />
      </TouchableOpacity>

      {categorySelectionOpen ? <>
      <View style={styles.categoryGrid}>
        {requestCategories.map((item) => {
          const active = selectedCategories.includes(item);

          return (
            <TouchableOpacity
              key={item}
              style={[styles.categoryBtn, active && styles.categoryBtnActive]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              aria-checked={active}
              onPress={() => toggleCategory(item)}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
          })}
      </View>
      <Text style={styles.categoryHelp}>
        {SIMPLE_AS_MODE
          ? '문제에 가까운 항목을 선택해 주세요. 여러 항목을 함께 선택할 수 있습니다.'
          : '여러 공사를 함께 선택할 수 있습니다.'}
      </Text>
      </> : null}

      {SIMPLE_AS_MODE ? (
        <View style={styles.symptomSection}>
          <View style={styles.inline}><Ionicons name="hand-left-outline" size={20} color={theme.primary} /><Text style={styles.sectionTitle}>자주 발생하는 대표 증상</Text></View>
          <View style={styles.categoryGrid}>
            {AS_SYMPTOMS.map((symptom) => {
              const selected = selectedSymptoms.includes(symptom);
              return (
                <TouchableOpacity
                  key={symptom}
                  style={[styles.symptom, selected && styles.symptomSelected]}
                  accessibilityRole="checkbox"
                  accessibilityLabel={symptom}
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  onPress={() => setSelectedSymptoms((previous) => selected ? previous.filter((value) => value !== symptom) : [...previous, symptom])}
                >
                  <Ionicons name={symptom === '물이 새요' ? 'water-outline' : symptom === '전기가 안 들어와요' ? 'flash-outline' : symptom === '문이 잘 안 닫혀요' ? 'key-outline' : symptom === '소음·진동이 나요' ? 'volume-high-outline' : 'build-outline'} size={17} color={selected ? '#fff' : theme.primary} />
                  <Text style={[styles.symptomText, selected && { color: '#fff' }]}>{symptom}</Text>
                  {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.symptom} accessibilityRole="button" onPress={() => descriptionInput.current?.focus()}><Ionicons name="pencil-outline" size={17} color={theme.primary} /><Text style={styles.symptomText}>직접 입력할게요</Text></TouchableOpacity>
          </View>
          {descriptionField}
        </View>
      ) : null}

      <View style={styles.formSection}>
        {SIMPLE_AS_MODE ? <Text style={styles.formHeading}>연락받을 정보</Text> : null}
        <Text style={styles.label}>신청자 이름 (필수)</Text>
        <TextInput
          style={styles.input}
          value={applicantName}
          onChangeText={setApplicantName}
          placeholder="예: 홍길동"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="신청자 이름, 필수"
          autoCapitalize="none"
        />

        <Text style={styles.label}>신청자 전화번호 (필수)</Text>
        <TextInput
          style={styles.input}
          value={applicantPhone}
          onChangeText={setApplicantPhone}
          placeholder="예: 010-1234-5678"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="신청자 전화번호, 필수"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <Text style={styles.fieldHelp}>
          입력한 연락처는 관리자와 담당 가게의 상담에 사용됩니다.
        </Text>

        <Text style={styles.label}>{SIMPLE_AS_MODE ? '문의 제목 (선택)' : '제목'}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="문의 제목"
          placeholder={
            SIMPLE_AS_MODE
              ? `${selectedCategories.join(' · ')} 문의`
              : '예: 24평 아파트 욕실 리모델링 견적 문의'
          }
        />

        {/* <Text style={styles.label}>지역</Text>
        <TextInput
          style={styles.input}
          value={region}
          onChangeText={setRegion}
          placeholder="예: 서울 강동구 천호동"
        /> */}

        <TouchableOpacity style={styles.addressSummary} accessibilityRole="button" accessibilityLabel="방문 희망 주소 변경" onPress={() => setAddressEditing((value) => !value)}>
          <View style={styles.addressIcon}><Ionicons name="home-outline" size={22} color={theme.primary} /></View>
          <View style={styles.flex}><Text style={styles.imageHelp}>방문 희망 주소</Text><Text style={styles.label}>{address || '주소를 입력해 주세요 (선택)'}</Text></View>
          <Text style={styles.linkText}>{addressEditing ? '접기' : '변경'}</Text>
        </TouchableOpacity>
        {addressEditing || !SIMPLE_AS_MODE ? <>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="상담에 필요한 범위까지만 입력해 주세요."
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="주소"
        />
        <TouchableOpacity style={styles.addressDone} accessibilityRole="button" onPress={() => { setAddressEditing(false); Keyboard.dismiss(); }}><Text style={styles.linkText}>주소 적용</Text></TouchableOpacity>
        </> : null}

        <Text style={styles.label}>희망 일정</Text>
        <TouchableOpacity
          style={styles.dateSelectBtn}
          onPress={() => setCalendarVisible((visible) => !visible)}
          activeOpacity={0.8}
        >
          <View style={styles.dateSelectTextBox}>
            <Text style={styles.dateSelectLabel}>
              {desiredDate || '날짜를 선택해 주세요'}
            </Text>
            <Text style={styles.dateSelectHelp}>
              {SIMPLE_AS_MODE ? '방문이 가능한 희망일을 선택합니다.' : '달력에서 희망 일정을 선택합니다.'}
            </Text>
          </View>
          <Ionicons name="calendar-outline" size={22} color={theme.primary} />
        </TouchableOpacity>

        {calendarVisible ? (
          <View style={styles.calendarBox}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => moveCalendarMonth(-1)}
              >
                <Ionicons name="chevron-back" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{calendarTitle}</Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => moveCalendarMonth(1)}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((day) => (
                <Text key={day} style={styles.weekdayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {calendarWeeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.dayRow}>
                  {week.map((cell) => {
                    const active = !!cell.dateText && cell.dateText === desiredDate;

                    return (
                      <TouchableOpacity
                        key={cell.key}
                        style={[
                          styles.dayCell,
                          !cell.dateText && styles.dayCellEmpty,
                          active && styles.dayCellActive,
                        ]}
                        disabled={!cell.dateText}
                        onPress={() => cell.dateText && selectDesiredDate(cell.dateText)}
                      >
                        <Text style={[styles.dayText, active && styles.dayTextActive]}>
                          {cell.day || ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.calendarQuickRow}>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={() => selectDesiredDate(formatDateYmd(new Date()))}
              >
                <Text style={styles.quickDateText}>오늘</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={() => selectDesiredDate(formatDateYmd(new Date(Date.now() + 86400000)))}
              >
                <Text style={styles.quickDateText}>내일</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={() => {
                  setDesiredDate('');
                  setCalendarVisible(false);
                }}
              >
                <Text style={styles.quickDateText}>미정</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* <Text style={styles.label}>예산</Text>
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          placeholder={SIMPLE_AS_MODE ? '예: 상담 후 결정, 10만원 내외' : '예: 500만원 내외, 상담 후 결정'}
        /> */}

        {/* <Text style={styles.label}>연락 방법</Text>
        <TextInput
          style={styles.input}
          value={preferredContact}
          onChangeText={setPreferredContact}
          placeholder="예: 앱 채팅, 전화, 문자"
        /> */}

        {!SIMPLE_AS_MODE ? descriptionField : null}
      </View>

      {!SIMPLE_AS_MODE ? mediaSection : null}

      <View style={styles.storeSelectSection}>
        <TouchableOpacity
          style={styles.storeToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: storeSelectionOpen }}
          aria-expanded={storeSelectionOpen}
          onPress={() => setStoreSelectionOpen((value) => !value)}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.sectionTitle}>상담 받을 가게 (선택)</Text>
            <Text style={styles.storeSelectHelp}>{selectedStoreId ? stores.find((store) => store.id === selectedStoreId)?.display_name || '가게 선택됨' : '가게를 모르면 관리자가 연결해 드려요'}</Text>
          </View>
          <Ionicons name={storeSelectionOpen ? 'chevron-up' : 'chevron-down'} size={22} color={theme.text} />
        </TouchableOpacity>
        {storeSelectionOpen ? <>
          {selectedStoreId ? (
            <TouchableOpacity style={styles.clearStoreButton} accessibilityRole="button" onPress={() => setSelectedStoreId(null)}>
              <Text style={styles.clearStoreText}>선택 해제</Text>
            </TouchableOpacity>
          ) : null}
        <Text style={styles.storeSelectHelp}>
          {SIMPLE_AS_MODE
            ? '가게를 선택하지 않아도 접수할 수 있습니다. 관리자가 확인 후 직접 해결 안내 또는 업체 연결을 도와드립니다.'
            : '원하는 가게를 선택하지 않으면 관리자가 배정하거나 디자인위쇼로 문의가 전달됩니다.'}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storeCategoryRow}
        >
          {STORE_CATEGORY_OPTIONS.map((item) => {
            const active = selectedStoreCategory === item;

            return (
              <TouchableOpacity
                key={item}
                style={[styles.storeCategoryChip, active && styles.storeCategoryChipActive]}
                onPress={() => setSelectedStoreCategory(item)}
              >
                <Text
                  style={[
                    styles.storeCategoryText,
                    active && styles.storeCategoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filteredStores.length === 0 ? (
          <Text style={styles.storeEmptyText}>선택할 수 있는 가게가 없습니다.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storeCardRow}
          >
            {filteredStores.map((store) => {
              const active = selectedStoreId === store.id;
              const alreadyRequested = Boolean(activeStoreRequestIds[store.id]);
              const avatarUrl =
                store.avatar_path || store.avatar_url
                  ? getProfileImageUrl(store.avatar_path || store.avatar_url)
                  : null;

              return (
                <TouchableOpacity
                  key={store.id}
                  style={[
                    styles.storeCard,
                    active && styles.storeCardActive,
                    alreadyRequested && styles.storeCardLocked,
                  ]}
                  onPress={() => {
                    if (alreadyRequested) {
                      setMessage(
                        SIMPLE_AS_MODE
                          ? '이미 이 가게에 진행 중인 문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
                          : '이미 이 가게에 진행 중인 견적문의가 있습니다. 기존 문의가 종료된 뒤 새로 신청할 수 있습니다.'
                      );
                      return;
                    }

                    setSelectedStoreId(active ? null : store.id);
                    setSelectedStaffUserId(null);
                    setMessage('');
                  }}
                >
                  <View style={styles.storeAvatar}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.storeAvatarImage} />
                    ) : (
                      <Ionicons name="storefront-outline" size={24} color="#6b7280" />
                    )}
                  </View>
                  <Text style={styles.storeName} numberOfLines={1}>
                    {store.display_name || '인증 가게'}
                  </Text>
                  <Text style={styles.storeCategoryLabel} numberOfLines={1}>
                    {getStoreCategoryLabel(store.store_category)}
                  </Text>
                  <Text style={styles.storeAddress} numberOfLines={2}>
                    {store.store_address || '주소 미등록'}
                  </Text>
                  {active ? (
                    <View style={styles.selectedBadge}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                      <Text style={styles.selectedBadgeText}>선택됨</Text>
                    </View>
                  ) : alreadyRequested ? (
                    <View style={styles.requestedBadge}>
                      <Ionicons name="document-text-outline" size={13} color={theme.text} />
                      <Text style={styles.requestedBadgeText}>신청됨</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {selectedStoreId ? (
          <View style={styles.staffSelectBox}>
            <Text style={styles.staffSelectTitle}>담당 직원 선택</Text>
            <Text style={styles.storeSelectHelp}>
              {SIMPLE_AS_MODE
                ? '직원을 선택하지 않으면 가게로 접수되고, 가게에서 담당자를 배정할 수 있습니다.'
                : '직원을 선택하지 않으면 가게 자체 문의로 접수되고, 가게에서 담당자를 배정할 수 있습니다. 매니저는 직접 문의 대상에서 제외됩니다.'}
            </Text>
            <TouchableOpacity
              style={[
                styles.staffChip,
                !selectedStaffUserId && styles.staffChipActive,
              ]}
              onPress={() => setSelectedStaffUserId(null)}
            >
              <Text
                style={[
                  styles.staffChipText,
                  !selectedStaffUserId && styles.staffChipTextActive,
                ]}
              >
                가게 자체로 문의
              </Text>
            </TouchableOpacity>

            {selectedStoreStaff.length > 0 ? (
              <View style={styles.staffWrap}>
                {selectedStoreStaff.map((staff) => {
                  const active = selectedStaffUserId === staff.staff_user_id;

                  return (
                    <TouchableOpacity
                      key={staff.id}
                      style={[styles.staffChip, active && styles.staffChipActive]}
                      onPress={() => setSelectedStaffUserId(staff.staff_user_id)}
                    >
                      <Text
                        style={[
                          styles.staffChipText,
                          active && styles.staffChipTextActive,
                        ]}
                      >
                        {staff.display_name || '직원'}
                        {staff.position ? ` · ${staff.position}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.storeEmptyText}>등록된 활성 직원이 없습니다.</Text>
            )}
          </View>
        ) : null}
        </> : null}
      </View>

      </View>
      {message ? <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">{message}</Text> : null}

      {SIMPLE_AS_MODE ? <View style={styles.careNote}>
        <View style={styles.inline}><Ionicons name="shield-checkmark-outline" size={21} color={theme.primary} /><Text style={styles.careTitle}>상담부터 차근차근 도와드려요</Text></View>
        <Text style={styles.imageHelp}>담당자가 접수 내용을 확인하고 상담을 진행합니다. 방문 일정과 비용은 상담 후 가게와 협의해 주세요.</Text>
      </View> : null}

      <TouchableOpacity
        style={[styles.submitBtn, (submitting || pickingMedia) && styles.submitBtnDisabled]}
        onPress={submitEstimate}
        disabled={submitting || pickingMedia}
        accessibilityRole="button"
      >
        <Ionicons name="send-outline" size={21} color="#fff" />
        <Text style={styles.submitText}>
          {submitting ? uploadLabel || '등록 중...' : createdRequestId ? '첨부 재시도' : SIMPLE_AS_MODE ? '견적 및 상담 요청하기' : '등록하기'}
        </Text>
      </TouchableOpacity>
      {SIMPLE_AS_MODE ? <View style={styles.privacyLine}><Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} /><Text style={styles.submitHelp}>입력한 연락처는 관리자와 담당 가게의 상담에 사용됩니다.</Text></View> : null}
    </ScrollView>
    {SIMPLE_AS_MODE && !isTab && !keyboardVisible ? <AsInquiryNavigation /> : null}
    </SafeAreaView>
  );
}

function createStyles(theme: AsPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 20, paddingBottom: 48, gap: 24, width: '100%', maxWidth: 680, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  intro: { gap: 10, paddingBottom: 4 },
  introBadge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primarySoft },
  introDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },
  eyebrow: { color: theme.accentText, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  title: { color: theme.text, fontSize: 26, lineHeight: 36, fontWeight: '800', letterSpacing: 0 },
  introDescription: { color: theme.textMuted, fontSize: 15, lineHeight: 24 },
  counter: { color: theme.textMuted, fontSize: 12 },
  uploadRow: { flexDirection: 'row', gap: 12 },
  uploadButton: { flex: 1, minWidth: 0, minHeight: 142, borderRadius: 8, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.surface, boxShadow: '0px 2px 8px rgba(30,41,59,0.06)' },
  uploadIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  uploadDetail: { color: theme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  mediaLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symptomSection: { gap: 16, paddingVertical: 4 },
  symptom: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, minHeight: 44, borderRadius: 24, maxWidth: '100%', backgroundColor: theme.surface, boxShadow: '0px 1px 5px rgba(30,41,59,0.05)' },
  symptomSelected: { backgroundColor: theme.action },
  symptomText: { color: theme.text, fontSize: 13, lineHeight: 20, flexShrink: 1 },
  formHeading: { color: theme.text, fontSize: 18, fontWeight: '800', paddingBottom: 8 },
  storeToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  submitHelp: { color: theme.textMuted, fontSize: 12, lineHeight: 20, textAlign: 'center', flexShrink: 1 },
  categoryToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categorySummary: { flex: 1, textAlign: 'right', color: theme.primary, fontSize: 13, lineHeight: 20 },
  uploadedSection: { gap: 12, paddingVertical: 8 },
  attachmentStatus: { color: theme.positive, fontSize: 12, fontWeight: '600' },
  largePreview: { width: '100%', aspectRatio: 1.8, minHeight: 176, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surfaceSoft },
  previewThumb: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
  voiceBand: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surfaceSoft, paddingVertical: 16, paddingHorizontal: 12, marginHorizontal: -20 },
  voiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  voiceButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', backgroundColor: theme.surface },
  voiceButtonText: { fontSize: 12, fontWeight: '700', color: theme.text },
  addressSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, marginVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
  addressIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primarySoft, justifyContent: 'center', alignItems: 'center' },
  addressDone: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' },
  linkText: { color: theme.primary, fontSize: 13, fontWeight: '700' },
  careNote: { gap: 8, padding: 16, marginHorizontal: -20, backgroundColor: theme.surfaceMuted },
  careTitle: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: theme.primary, flexShrink: 1 },
  privacyLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  categoryText: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
  categoryTextActive: { color: theme.primaryText },
  categoryHelp: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontWeight: '400' },
  storeSelectSection: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 12,
    gap: 10,
  },
  storeSelectHelp: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  clearStoreText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  clearStoreButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  storeCategoryRow: {
    gap: 8,
    paddingRight: 4,
  },
  storeCategoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  storeCategoryChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  storeCategoryText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '900',
  },
  storeCategoryTextActive: {
    color: theme.primary,
  },
  storeEmptyText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  storeCardRow: {
    gap: 10,
    paddingRight: 4,
  },
  storeCard: {
    width: 172,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    padding: 12,
    gap: 6,
  },
  storeCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  storeCardLocked: {
    opacity: 0.72,
  },
  storeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storeAvatarImage: { width: '100%', height: '100%' },
  storeName: { color: theme.text, fontSize: 14, fontWeight: '900' },
  storeCategoryLabel: { color: theme.primary, fontSize: 12, fontWeight: '900' },
  storeAddress: { color: theme.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  selectedBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  selectedBadgeText: { color: theme.primaryText, fontSize: 11, fontWeight: '900' },
  requestedBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: theme.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  requestedBadgeText: { color: theme.text, fontSize: 11, fontWeight: '900' },
  staffSelectBox: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 12,
    gap: 8,
  },
  staffSelectTitle: { color: theme.text, fontSize: 14, fontWeight: '900' },
  staffWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  staffChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  staffChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  staffChipText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  staffChipTextActive: {
    color: theme.primary,
  },
  formSection: { gap: 10 },
  label: { color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  fieldHelp: {
    marginTop: -4,
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    backgroundColor: theme.input,
  },
  textarea: { minHeight: 112, lineHeight: 22 },
  dateSelectBtn: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: theme.primarySoft,
    borderRadius: 8,
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateSelectTextBox: {
    flex: 1,
    minWidth: 0,
  },
  dateSelectLabel: { color: theme.text, fontSize: 15, fontWeight: '900' },
  dateSelectHelp: { marginTop: 3, color: theme.primary, fontSize: 12, fontWeight: '700' },
  calendarBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    padding: 12,
    gap: 10,
  },
  calendarHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  dayGrid: {
    gap: 4,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  dayCellEmpty: {
    opacity: 0,
  },
  dayCellActive: { backgroundColor: theme.primary },
  dayText: { color: theme.text, fontSize: 14, fontWeight: '800' },
  dayTextActive: { color: theme.primaryText },
  calendarQuickRow: { flexDirection: 'row', gap: 8 },
  quickDateBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDateText: { color: theme.text, fontSize: 13, fontWeight: '900' },
  imageSection: {
    paddingBottom: 8,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: { color: theme.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  imageRow: { gap: 10 },
  previewBox: {
    width: 112,
    height: 112,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSoft,
  },
  previewImage: { width: '100%', height: '100%' },
  removeImageBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageHelp: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontWeight: '400' },
  errorText: { color: theme.danger, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  submitBtn: {
    minHeight: 56,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.action,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, lineHeight: 24, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
});
}
