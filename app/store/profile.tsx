import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { STORE_CATEGORY_SELECT_OPTIONS } from '../../lib/storeCategories';
import { supabase } from '../../lib/supabase';

export default function StoreProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [storeCategory, setStoreCategory] = useState('');
  const [customStoreCategory, setCustomStoreCategory] = useState('');
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

  const loadProfile = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile(data || null);
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
    setAcceptsInquiries(data?.store_accepts_inquiries !== false);
    setTodayAvailable(!!data?.store_today_available);
    setCardAvailable(!!data?.store_card_available);
    setCashReceiptAvailable(!!data?.store_cash_receipt_available);
    setTaxInvoiceAvailable(!!data?.store_tax_invoice_available);
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    if (!user) return;

    try {
      setSaving(true);
      setMessage('');
      const finalStoreCategory =
        storeCategory === '기타' ? customStoreCategory.trim() : storeCategory.trim();

      const { error } = await supabase
        .from('profiles')
        .update({
          store_category: finalStoreCategory || null,
          store_intro: intro.trim() || null,
          store_notice: notice.trim() || null,
          store_business_hours: businessHours.trim() || null,
          store_accepts_inquiries: acceptsInquiries,
          store_today_available: todayAvailable,
          store_card_available: cardAvailable,
          store_cash_receipt_available: cashReceiptAvailable,
          store_tax_invoice_available: taxInvoiceAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage('가게 프로필이 저장되었습니다.');
      Alert.alert('저장 완료', '가게 프로필이 저장되었습니다.');
    } finally {
      setSaving(false);
    }
  };

  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '가게 프로필' }} />

      <Text style={styles.title}>가게 프로필</Text>

      {!isVerifiedStore ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeDesc}>가게 프로필 관리는 가게 인증 완료 계정만 사용할 수 있습니다.</Text>
        </View>
      ) : (
        <>
          <View style={styles.storeSummary}>
            <Text style={styles.storeName}>{profile?.display_name || '가게'}</Text>
            <Text style={styles.storeCategory}>
              {storeCategory === '기타'
                ? customStoreCategory.trim() || '업종 미등록'
                : storeCategory || '업종 미등록'}
            </Text>
            <Text style={styles.storeMeta}>{profile?.store_address || '등록된 주소 없음'}</Text>
            <Text style={styles.storeMeta}>{profile?.phone || '등록된 전화번호 없음'}</Text>
          </View>

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
            style={[styles.input, styles.textarea]}
            value={notice}
            onChangeText={setNotice}
            placeholder="오늘 입고, 휴무, 배송 안내 등 공지를 입력해 주세요."
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>영업시간</Text>
          <TextInput
            style={styles.input}
            value={businessHours}
            onChangeText={setBusinessHours}
            placeholder="예: 평일 09:00-18:00, 토요일 09:00-13:00"
          />

          <View style={styles.optionBox}>
            <OptionRow label="문의 받기" value={acceptsInquiries} onValueChange={setAcceptsInquiries} />
            <OptionRow label="오늘 가능 표시" value={todayAvailable} onValueChange={setTodayAvailable} />
            <OptionRow label="카드 가능 표시" value={cardAvailable} onValueChange={setCardAvailable} />
            <OptionRow label="현금영수증 가능 표시" value={cashReceiptAvailable} onValueChange={setCashReceiptAvailable} />
            <OptionRow label="세금계산서 가능 표시" value={taxInvoiceAvailable} onValueChange={setTaxInvoiceAvailable} />
          </View>

          {message ? (
            <Text style={[styles.message, message.includes('저장') ? styles.success : styles.error]}>
              {message}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
            <Text style={styles.saveText}>{saving ? '저장 중...' : '저장하기'}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function OptionRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  noticeBox: {
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeDesc: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  storeSummary: {
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 4,
  },
  storeName: { color: '#111827', fontSize: 18, fontWeight: '900' },
  storeCategory: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
  },
  storeMeta: { color: '#6b7280', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  label: { color: '#111827', fontSize: 15, fontWeight: '900' },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  categoryChipText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: '#1d4ed8',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    color: '#111827',
    fontSize: 15,
  },
  textarea: { minHeight: 104 },
  optionBox: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
  },
  optionRow: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  optionLabel: { flex: 1, color: '#111827', fontSize: 15, fontWeight: '800' },
  message: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  success: { color: '#047857' },
  error: { color: '#dc2626' },
  saveBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
