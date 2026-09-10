// 가게 프로필 관리 화면: 공개 프로필, 지도 좌표, 상세주소, 문의/공지/오늘가능 설정을 저장한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import StorePlanModal, { LocalAdStoreBadge, PremiumStoreBadge } from '../../components/StorePlanModal';
import { useAuth } from '../../contexts/AuthContext';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { STORE_CATEGORY_SELECT_OPTIONS } from '../../lib/storeCategories';
import {
  DEFAULT_STORE_LIMITS,
  getPlanLabel,
  getStoreSubscriptionLimits,
  type StoreSubscriptionLimits,
} from '../../lib/storeLimits';
import { getMyStoreAccessContext, type StoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';
import { emitTabRefresh } from '../../lib/tabRefresh';

/**
 * Expo Router route param은 환경에 따라 string 또는 string[]로 들어올 수 있다.
 * 지도 선택 화면에서 돌아오는 lat/lng/address를 항상 단일 문자열로 다루기 위해
 * 화면 초입에서 정규화한다.
 */
function getParamString(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 기본 주소와 상세주소를 공개 화면 표시용 문자열로 합친다.
 *
 * DB에는 지도에서 선택한 기본 주소(`store_address`)와 사용자가 직접 입력한
 * 상세주소(`store_detail_address`)를 분리 저장한다. 지도 검색/좌표에는 기본 주소가 중요하고,
 * 가게 프로필이나 목록 카드에서는 둘을 합친 주소가 필요하기 때문이다.
 */
function formatStoreAddress(address?: string | null, detailAddress?: string | null) {
  return [address, detailAddress]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(' ');
}

export default function StoreProfileScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    address?: string;
  }>();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // `profile`은 서버에 저장된 원본 가게 프로필이고, 아래 입력 state들은 저장 전 draft다.
  // 지도 선택 화면에서 돌아왔을 때 draft만 먼저 바꿔야 사용자가 저장 여부를 결정할 수 있다.
  const [profile, setProfile] = useState<any | null>(null);
  const [storeAccess, setStoreAccess] = useState<StoreAccessContext | null>(null);

  // 공개 프로필 기본 정보. 업종은 select 옵션에 없는 값이면 "기타 + 직접 입력"으로 분리한다.
  const [storeCategory, setStoreCategory] = useState('');
  const [customStoreCategory, setCustomStoreCategory] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [storePhone, setStorePhone] = useState('');

  // 지도 위치 정보. 기본 주소는 reverse geocode 결과, 상세주소는 수기 입력값이다.
  // 위도/경도는 지도탭 노출의 기준이므로 주소 문자열과 별도로 저장한다.
  const [storeAddress, setStoreAddress] = useState('');
  const [storeDetailAddress, setStoreDetailAddress] = useState('');
  const [storeLatitude, setStoreLatitude] = useState<number | null>(null);
  const [storeLongitude, setStoreLongitude] = useState<number | null>(null);

  // 가게 소개/공지/영업정보와 결제 가능 여부. 일부 기능은 구독 제한에 따라 저장값이 막힌다.
  const [intro, setIntro] = useState('');
  const [notice, setNotice] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [acceptsInquiries, setAcceptsInquiries] = useState(true);
  const [todayAvailable, setTodayAvailable] = useState(false);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [cashReceiptAvailable, setCashReceiptAvailable] = useState(false);
  const [taxInvoiceAvailable, setTaxInvoiceAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [storeLimits, setStoreLimits] = useState<StoreSubscriptionLimits>(DEFAULT_STORE_LIMITS);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  /**
   * 가게 프로필과 현재 구독 제한을 함께 불러온다.
   *
   * 대표 계정과 매니저 직원이 같은 화면을 쓰기 때문에, 먼저 `getMyStoreAccessContext`로
   * 실제 저장 대상인 `storeAccess.storeUserId`를 확정한다. 이후 모든 저장/RPC는
   * 로그인 사용자 id가 아니라 이 가게 id를 기준으로 실행해야 한다.
   */
  const loadProfile = useCallback(async () => {
    if (!user) return;

    const access = await getMyStoreAccessContext();
    setStoreAccess(access);

    if (!access.canManageStore || !access.storeProfile) {
      setProfile(null);
      setStoreLimits(DEFAULT_STORE_LIMITS);
      return;
    }

    const data = access.storeProfile;
    const limits = await getStoreSubscriptionLimits(access.storeUserId);
    // `/map-picker`에서 돌아온 값은 아직 저장된 값이 아니다.
    // 사용자가 "저장"을 누르기 전까지는 입력 draft로만 반영해서 취소 가능한 상태를 유지한다.
    const paramLat = getParamString(params.lat);
    const paramLng = getParamString(params.lng);
    const paramAddress = getParamString(params.address);
    const hasPickedLocation = Boolean(paramLat && paramLng);

    setProfile(data || null);
    setStoreLimits(limits);
    const savedCategory = data?.store_category || '';
    if (savedCategory && !STORE_CATEGORY_SELECT_OPTIONS.includes(savedCategory)) {
      setStoreCategory('기타');
      setCustomStoreCategory(savedCategory);
    } else {
      setStoreCategory(savedCategory);
      setCustomStoreCategory('');
    }
    setIntro(data?.store_intro || '');
    setNotice(data?.store_notice || '');
    setBusinessHours(data?.store_business_hours || '');
    setRepresentativeName(data?.representative_name || '');
    setStorePhone(data?.phone || '');
    setStoreAddress(paramAddress || data?.store_address || '');
    setStoreDetailAddress(data?.store_detail_address || '');
    if (!hasPickedLocation) {
      setStoreLatitude(data?.store_latitude ?? null);
      setStoreLongitude(data?.store_longitude ?? null);
    }
    setAcceptsInquiries(data?.store_accepts_inquiries !== false);
    setTodayAvailable(!!data?.store_today_available);
    setCardAvailable(!!data?.store_card_available);
    setCashReceiptAvailable(!!data?.store_cash_receipt_available);
    setTaxInvoiceAvailable(!!data?.store_tax_invoice_available);
  }, [params.address, params.lat, params.lng, user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /**
   * 지도 선택 결과를 즉시 draft state에 반영한다.
   *
   * `loadProfile`의 Supabase 조회가 늦게 끝나면 이전 저장값이 route param보다 나중에
   * 들어와서 방금 고른 좌표를 덮을 수 있다. 별도 effect로 lat/lng/address params를 감시해
   * 화면에 보이는 선택 위치가 항상 최신 navigation 결과를 따르게 한다.
   */
  useEffect(() => {
    const paramLat = Number(getParamString(params.lat));
    const paramLng = Number(getParamString(params.lng));
    const paramAddress = getParamString(params.address);

    if (!Number.isFinite(paramLat) || !Number.isFinite(paramLng)) return;

    setStoreLatitude(paramLat);
    setStoreLongitude(paramLng);
    if (paramAddress) {
      setStoreAddress(paramAddress);
    }
  }, [params.address, params.lat, params.lng]);

  /**
   * 입력한 가게 프로필을 Supabase RPC로 저장한다.
   *
   * 클라이언트는 화면 편의를 위해 스위치를 보여주지만 최종적으로 저장할 수 있는 값은
   * `storeLimits`를 기준으로 한 번 더 제한한다. 예를 들어 무료 플랜에서 공지나 오늘가능을
   * 켜둔 상태로 저장을 눌러도 서버에는 null/false가 넘어간다.
   */
  const saveProfile = async () => {
    if (!user || !storeAccess?.storeUserId) return;

    try {
      setSaving(true);
      setMessage('');
      const canSaveNotice = storeLimits.canStoreNotice;
      const canSaveTodayBadge = storeLimits.canTodayBadge;
      const finalStoreCategory =
        storeCategory === '기타' ? customStoreCategory.trim() : storeCategory.trim();

      const { data, error } = await supabase.rpc('update_store_profile_settings', {
        p_store_user_id: storeAccess.storeUserId,
        p_store_category: finalStoreCategory || null,
        p_representative_name: representativeName.trim() || null,
        p_phone: storePhone.trim() || null,
        p_store_address: storeAddress.trim() || null,
        p_store_detail_address: storeDetailAddress.trim() || null,
        p_store_latitude: storeLatitude,
        p_store_longitude: storeLongitude,
        p_store_intro: intro.trim() || null,
        p_store_notice: canSaveNotice ? notice.trim() || null : null,
        p_store_business_hours: businessHours.trim() || null,
        p_store_accepts_inquiries: acceptsInquiries,
        p_store_today_available: canSaveTodayBadge ? todayAvailable : false,
        p_store_card_available: cardAvailable,
        p_store_cash_receipt_available: cashReceiptAvailable,
        p_store_tax_invoice_available: taxInvoiceAvailable,
      });

      if (error) {
        setMessage(
          error.message.includes('store_detail_address') ||
          error.message.includes('p_store_detail_address') ||
          error.message.includes('function public.update_store_profile_settings')
            ? `${error.message}\n새 가게 위치 저장 SQL을 먼저 Supabase에 실행해 주세요.`
            : error.message
        );
        return;
      }

      setMessage('가게 프로필이 저장되었습니다.');
      if (data) {
        setProfile(data);
      }
      // 지도탭은 탭 전환 중에도 mounted 상태로 남을 수 있다.
      // 좌표/주소가 바뀐 뒤에는 tab refresh 이벤트를 보내 즉시 새 가게 위치를 다시 조회하게 한다.
      emitTabRefresh('map');
      Alert.alert('저장 완료', '가게 프로필이 저장되었습니다.');
    } finally {
      setSaving(false);
    }
  };

  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const canManageStore = !!storeAccess?.canManageStore;
  const canEditNotice = storeLimits.canStoreNotice;
  const canUseTodayBadge = storeLimits.canTodayBadge;
  const planLabel = getPlanLabel(storeLimits.plan);
  const storeDisplayAddress = formatStoreAddress(profile?.store_address, profile?.store_detail_address);
  const selectedDisplayAddress = formatStoreAddress(storeAddress, storeDetailAddress);
  const hasStoreLocation = storeLatitude != null && storeLongitude != null;

  /**
   * 가게 위치 선택 화면으로 이동한다.
   *
   * 이미 좌표가 있으면 그 위치에서 다시 열고, 아직 좌표가 없으면 현재 위치 사용을 요청한다.
   * 선택 결과는 `/store/profile` route params로 되돌아오며, 실제 DB 저장은 `saveProfile`에서만 한다.
   */
  const openStoreLocationPicker = () => {
    router.push({
      pathname: '/map-picker',
      params: {
        ...(hasStoreLocation
          ? {
              lat: String(storeLatitude),
              lng: String(storeLongitude),
              useCurrentLocation: 'false',
            }
          : { useCurrentLocation: 'true' }),
        returnTo: '/store/profile',
        title: '가게 위치 선택',
        desc: '지도에서 가게 위치를 누르거나 핀을 옮겨 주세요.',
        buttonText: '가게 위치로 적용',
      },
    } as any);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '가게 프로필' }} />

      <Text style={styles.title}>가게 프로필</Text>

      {!isVerifiedStore || !canManageStore ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeDesc}>가게 프로필 관리는 가게 인증 완료 계정만 사용할 수 있습니다.</Text>
        </View>
      ) : (
        <>
          <View style={styles.storeSummary}>
            <View style={styles.storeSummaryHeader}>
              <Text style={styles.storeName}>{profile?.display_name || '가게'}</Text>
              {storeLimits.isPremium ? (
                <PremiumStoreBadge
                  label="프리미엄 인증 완료"
                  onPress={() => setPlanModalOpen(true)}
                />
              ) : null}
              {storeLimits.hasLocalAd ? <LocalAdStoreBadge label="광고" /> : null}
            </View>
            <Text style={styles.storeCategory}>
              {storeCategory === '기타'
                ? customStoreCategory.trim() || '업종 미등록'
                : storeCategory || '업종 미등록'}
            </Text>
            <Text style={styles.storeMeta}>{storeDisplayAddress || '등록된 주소 없음'}</Text>
            <Text style={styles.storeMeta}>{profile?.phone || '등록된 전화번호 없음'}</Text>
          </View>

          <Text style={styles.label}>대표자명</Text>
          <TextInput
            style={styles.input}
            value={representativeName}
            onChangeText={setRepresentativeName}
            placeholder="대표자명을 입력해 주세요."
            maxLength={40}
          />

          <Text style={styles.label}>가게 전화번호</Text>
          <TextInput
            style={styles.input}
            value={storePhone}
            onChangeText={setStorePhone}
            placeholder="가게 전화번호를 입력해 주세요."
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>가게 주소</Text>
          <TextInput
            style={[styles.input, styles.addressInput]}
            value={storeAddress}
            onChangeText={setStoreAddress}
            placeholder="지도에서 선택한 기본주소가 들어갑니다."
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.locationPickerBtn} onPress={openStoreLocationPicker}>
            <Ionicons name="map-outline" size={18} color={theme.primaryText} />
            <Text style={styles.locationPickerBtnText}>
              {hasStoreLocation ? '지도에서 위치 다시 선택' : '지도에서 가게 위치 선택'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.locationStatus}>
            {hasStoreLocation
              ? `선택 위치 ${storeLatitude?.toFixed(6)}, ${storeLongitude?.toFixed(6)}`
              : '지도탭 노출을 위해 가게 위치를 선택해 주세요.'}
          </Text>

          <Text style={styles.label}>상세주소</Text>
          <TextInput
            style={styles.input}
            value={storeDetailAddress}
            onChangeText={setStoreDetailAddress}
            placeholder="예: 1층 101호, 상가동 B12"
            maxLength={80}
          />
          {selectedDisplayAddress ? (
            <Text style={styles.locationPreview}>저장될 주소: {selectedDisplayAddress}</Text>
          ) : null}

          <Text style={styles.label}>가게 종류</Text>
          <View style={styles.categoryWrap}>
            {STORE_CATEGORY_SELECT_OPTIONS.map((item) => {
              const active = storeCategory === item;

              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setStoreCategory(item)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      active && styles.categoryChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {storeCategory === '기타' ? (
            <TextInput
              style={styles.input}
              value={customStoreCategory}
              onChangeText={setCustomStoreCategory}
              placeholder="가게 종류를 직접 입력해 주세요."
              maxLength={20}
            />
          ) : null}

          <Text style={styles.label}>가게 소개</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={intro}
            onChangeText={setIntro}
            placeholder="가게 소개를 입력해 주세요."
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>가게 공지</Text>
          <TextInput
            style={[styles.input, styles.textarea, !canEditNotice && styles.disabledInput]}
            value={notice}
            onChangeText={canEditNotice ? setNotice : undefined}
            placeholder={
              canEditNotice
                ? '오늘 입고, 휴무, 배송 안내 등 공지를 입력해 주세요.'
                : '베이직 이상 플랜에서 가게 공지를 등록할 수 있습니다.'
            }
            editable={canEditNotice}
            multiline
            textAlignVertical="top"
          />
          {!canEditNotice ? (
            <Text style={styles.helperText}>현재 {planLabel} 플랜에서는 가게 공지가 노출되지 않습니다.</Text>
          ) : null}

          <Text style={styles.label}>영업시간</Text>
          <TextInput
            style={styles.input}
            value={businessHours}
            onChangeText={setBusinessHours}
            placeholder="예: 평일 09:00-18:00, 토요일 09:00-13:00"
          />

          <View style={styles.optionBox}>
            <OptionRow label="문의 받기" value={acceptsInquiries} onValueChange={setAcceptsInquiries} />
            <OptionRow
              label="오늘 가능 표시"
              value={canUseTodayBadge && todayAvailable}
              onValueChange={setTodayAvailable}
              disabled={!canUseTodayBadge}
            />
            <OptionRow label="카드 가능 표시" value={cardAvailable} onValueChange={setCardAvailable} />
            <OptionRow label="현금영수증 가능 표시" value={cashReceiptAvailable} onValueChange={setCashReceiptAvailable} />
            <OptionRow label="세금계산서 가능 표시" value={taxInvoiceAvailable} onValueChange={setTaxInvoiceAvailable} />
          </View>
          {!canUseTodayBadge ? (
            <Text style={styles.helperText}>
              오늘 가능 표시는 베이직 이상 또는 이벤트 프리미엄 적용 가게에서 사용할 수 있습니다.
            </Text>
          ) : null}

          {message ? (
            <Text style={[styles.message, message.includes('저장') ? styles.success : styles.error]}>
              {message}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
            <Text style={styles.saveText}>{saving ? '저장 중...' : '저장하기'}</Text>
          </TouchableOpacity>

          <StorePlanModal
            visible={planModalOpen}
            currentPlan={storeLimits.plan}
            hasLocalAd={storeLimits.hasLocalAd}
            onClose={() => setPlanModalOpen(false)}
          />
        </>
      )}
    </ScrollView>
  );
}

function OptionRow({
  label,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const switchTrackOff = theme.scheme === 'dark' ? theme.surfaceSoft : '#d1d5db';
  const switchThumb = disabled ? theme.textSubtle : '#ffffff';

  return (
    <View style={styles.optionRow}>
      <Text style={[styles.optionLabel, disabled && styles.optionLabelDisabled]}>{label}</Text>
      <View style={styles.switchSlot}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          style={styles.optionSwitch}
          trackColor={{ false: switchTrackOff, true: theme.primary }}
          thumbColor={switchThumb}
          ios_backgroundColor={switchTrackOff}
        />
      </View>
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  noticeBox: {
    borderRadius: 14,
    backgroundColor: theme.warningBg,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: theme.warningText, fontSize: 16, fontWeight: '900' },
  noticeDesc: { color: theme.warningText, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  storeSummary: {
    borderRadius: 14,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 4,
  },
  storeSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  storeName: { color: theme.text, fontSize: 18, fontWeight: '900' },
  storeCategory: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: theme.primarySoft,
    color: theme.primary,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
  },
  storeMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  label: { color: theme.text, fontSize: 15, fontWeight: '900' },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  categoryChipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: theme.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: theme.input,
    color: theme.text,
    fontSize: 15,
  },
  disabledInput: {
    opacity: 0.58,
  },
  helperText: {
    marginTop: -4,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  textarea: { minHeight: 104 },
  addressInput: { minHeight: 74 },
  locationPickerBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  locationPickerBtnText: {
    color: theme.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  locationStatus: {
    marginTop: -4,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  locationPreview: {
    marginTop: -4,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  optionBox: {
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
  },
  optionRow: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
  },
  optionLabel: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '800' },
  optionLabelDisabled: { color: theme.textMuted },
  switchSlot: {
    width: 56,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSwitch: {
    alignSelf: 'center',
    ...(Platform.OS === 'ios'
      ? { transform: [{ scaleX: 0.92 }, { scaleY: 0.92 }] }
      : { marginRight: -2 }),
  },
  message: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  success: { color: '#047857' },
  error: { color: theme.danger },
  saveBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: theme.primaryText, fontSize: 15, fontWeight: '900' },
});
}
