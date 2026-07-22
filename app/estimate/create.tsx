import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
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

export default function EstimateCreateScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    ESTIMATE_CATEGORIES[0],
  ]);
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [budget, setBudget] = useState('');
  const [preferredContact, setPreferredContact] = useState('앱 채팅');
  const [description, setDescription] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [selectedStoreCategory, setSelectedStoreCategory] = useState('전체');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

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

    if (error) {
      console.log('견적문의 가게 목록 조회 실패:', error);
      setStores([]);
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

    if (staffError) {
      console.log('견적문의 직원 목록 조회 실패:', staffError);
      setStaffMembers([]);
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

  const pickImages = async () => {
    const remain = 6 - imageUris.length;
    if (remain <= 0) {
      showAlert('사진 첨부', '사진은 최대 6장까지 첨부할 수 있습니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.8,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setImageUris((prev) => [
        ...prev,
        ...result.assets.map((asset) => asset.uri),
      ].slice(0, 6));
    }
  };

  const toggleCategory = (item: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(item)) {
        return prev.length === 1 ? prev : prev.filter((category) => category !== item);
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

  const uploadEstimateImage = async (requestId: number, uri: string, sortOrder: number) => {
    if (!user) return;

    const filePath = `${user.id}/${requestId}/${Date.now()}-${sortOrder}.jpg`;
    let uploadData: Blob | ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      uploadData = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      uploadData = decode(base64);
    }

    const { error: uploadError } = await supabase.storage
      .from('estimate-images')
      .upload(filePath, uploadData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase.from('estimate_request_images').insert({
      estimate_request_id: requestId,
      image_path: filePath,
      sort_order: sortOrder,
    });

    if (rowError) throw rowError;
  };

  const submitEstimate = async () => {
    if (submitting) return;

    if (!user) {
      router.push('/login?redirect=/estimate/create' as any);
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (selectedCategories.length === 0) {
      setMessage('필요한 공사 종류를 하나 이상 선택해 주세요.');
      return;
    }

    if (!trimmedTitle) {
      setMessage('문의 제목을 입력해 주세요.');
      return;
    }

    if (!trimmedDescription) {
      setMessage('상세 내용을 입력해 주세요.');
      return;
    }

    if (!isValidDateText(desiredDate)) {
      setMessage('희망 일정은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');

      const { data, error } = await supabase
        .from('estimate_requests')
        .insert({
          user_id: user.id,
          category: selectedCategoryText,
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
        setMessage(error.message);
        return;
      }

      const requestId = Number(data?.id);
      if (!requestId) {
        setMessage('견적문의 등록 결과를 받지 못했습니다.');
        return;
      }

      for (let i = 0; i < imageUris.length; i += 1) {
        await uploadEstimateImage(requestId, imageUris[i], i);
      }

      showAlert(
        '견적문의 등록 완료',
        selectedStoreId
          ? '선택한 가게에 견적문의가 전달됩니다.'
          : '선택한 가게가 없어 관리자 배정 또는 디자인위쇼 문의로 접수됩니다.'
      );
      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      console.log('견적문의 등록 실패:', error);
      setMessage(error?.message || '견적문의 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '견적문의' }} />

      <Text style={styles.title}>어떤 공사가 필요하세요?</Text>

      <View style={styles.categoryGrid}>
        {ESTIMATE_CATEGORIES.map((item) => {
          const active = selectedCategories.includes(item);

          return (
            <TouchableOpacity
              key={item}
              style={[styles.categoryBtn, active && styles.categoryBtnActive]}
              onPress={() => toggleCategory(item)}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
          })}
      </View>
      <Text style={styles.categoryHelp}>여러 공사를 함께 선택할 수 있습니다.</Text>

      <View style={styles.storeSelectSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>상담 받을 가게 선택</Text>
          {selectedStoreId ? (
            <TouchableOpacity onPress={() => setSelectedStoreId(null)}>
              <Text style={styles.clearStoreText}>선택 해제</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.storeSelectHelp}>
          원하는 가게를 선택하지 않으면 관리자가 배정하거나 디자인위쇼로 문의가 전달됩니다.
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
              const avatarUrl =
                store.avatar_path || store.avatar_url
                  ? getProfileImageUrl(store.avatar_path || store.avatar_url)
                  : null;

              return (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeCard, active && styles.storeCardActive]}
                  onPress={() => {
                    setSelectedStoreId(active ? null : store.id);
                    setSelectedStaffUserId(null);
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
              직원을 선택하지 않으면 가게 자체 문의로 접수되고, 가게에서 담당자를 배정할 수 있습니다. 매니저는 직접 문의 대상에서 제외됩니다.
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
      </View>

      <View style={styles.formSection}>
        <Text style={styles.label}>제목</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="예: 24평 아파트 욕실 리모델링 견적 문의"
        />

        <Text style={styles.label}>지역</Text>
        <TextInput
          style={styles.input}
          value={region}
          onChangeText={setRegion}
          placeholder="예: 서울 강동구 천호동"
        />

        <Text style={styles.label}>주소</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="상담에 필요한 범위까지만 입력해 주세요."
        />

        <Text style={styles.label}>희망 일정</Text>
        <TouchableOpacity
          style={styles.dateSelectBtn}
          onPress={() => setCalendarVisible((visible) => !visible)}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.dateSelectLabel}>
              {desiredDate || '날짜를 선택해 주세요'}
            </Text>
            <Text style={styles.dateSelectHelp}>달력에서 희망 일정을 선택합니다.</Text>
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
              {calendarDays.map((cell) => {
                const active = !!cell.dateText && cell.dateText === desiredDate;

                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[styles.dayCell, active && styles.dayCellActive]}
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

        <Text style={styles.label}>예산</Text>
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          placeholder="예: 500만원 내외, 상담 후 결정"
        />

        <Text style={styles.label}>연락 방법</Text>
        <TextInput
          style={styles.input}
          value={preferredContact}
          onChangeText={setPreferredContact}
          placeholder="예: 앱 채팅, 전화, 문자"
        />

        <Text style={styles.label}>상세 내용</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="공간 상태, 원하는 공사 범위, 필요한 자재, 참고사항을 적어주세요."
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.imageSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>사진/도면 첨부</Text>
          <TouchableOpacity style={styles.imageAddBtn} onPress={pickImages}>
            <Ionicons name="image-outline" size={17} color="#166534" />
            <Text style={styles.imageAddText}>추가</Text>
          </TouchableOpacity>
        </View>

        {imageUris.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
            {imageUris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.previewBox}>
                <Image source={{ uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setImageUris((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.imageHelp}>현장 사진이나 도면을 첨부하면 상담이 빨라집니다.</Text>
        )}
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submitEstimate}
        disabled={submitting}
      >
        <Text style={styles.submitText}>{submitting ? '등록 중...' : '등록하기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBtn: {
    borderRadius: 999,
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
  categoryHelp: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  storeSelectSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    padding: 14,
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
    borderRadius: 14,
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
  staffSelectBox: {
    borderRadius: 14,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
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
  label: { color: theme.text, fontSize: 14, fontWeight: '900' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    backgroundColor: theme.input,
  },
  textarea: { minHeight: 140, lineHeight: 21 },
  dateSelectBtn: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: theme.primarySoft,
    borderRadius: 14,
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  calendarTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
  imageAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  imageAddText: { color: theme.primary, fontSize: 13, fontWeight: '900' },
  imageRow: { gap: 10 },
  previewBox: {
    width: 92,
    height: 92,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSoft,
  },
  previewImage: { width: '100%', height: '100%' },
  removeImageBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageHelp: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorText: { color: theme.danger, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  submitBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: theme.primaryText, fontSize: 16, fontWeight: '900' },
});
}
