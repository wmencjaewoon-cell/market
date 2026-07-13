import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type CustomerStatus =
  | 'new'
  | 'consulting'
  | 'estimating'
  | 'contracted'
  | 'construction'
  | 'completed'
  | 'closed';

type EstimateFilter = CustomerStatus | 'all';

const STATUS_OPTIONS: { key: EstimateFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'new', label: '신규 문의' },
  { key: 'consulting', label: '상담중' },
  { key: 'estimating', label: '견적중' },
  { key: 'contracted', label: '계약완료' },
  { key: 'construction', label: '공사중' },
  { key: 'completed', label: '완료' },
  { key: 'closed', label: '종료' },
];

function getStatusLabel(status: CustomerStatus) {
  return STATUS_OPTIONS.find((item) => item.key === status)?.label || '신규 문의';
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9]/g, '')) || 0;
}

function formatAmount(value?: number | null) {
  const numberValue = Number(value || 0);
  if (!numberValue) return '';
  return numberValue.toLocaleString('ko-KR');
}

export default function StoreEstimatesScreen() {
  const { user } = useAuth();
  const [effectiveStoreId, setEffectiveStoreId] = useState<string | null>(null);
  const [isStoreOwner, setIsStoreOwner] = useState(false);
  const [activeStaffMembership, setActiveStaffMembership] = useState<any | null>(null);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [statusRows, setStatusRows] = useState<Record<number, any>>({});
  const [quoteRows, setQuoteRows] = useState<Record<number, any>>({});
  const [quoteDrafts, setQuoteDrafts] = useState<Record<number, any>>({});
  const [filter, setFilter] = useState<EstimateFilter>('new');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadEstimates = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, user_type, business_verified, status')
      .eq('id', user.id)
      .maybeSingle();

    const verifiedOwner =
      profileData?.user_type === 'store' &&
      !!profileData?.business_verified &&
      profileData?.status !== 'blocked';
    let nextEffectiveStoreId = verifiedOwner ? user.id : null;
    let nextStaffMembership: any | null = null;

    if (!verifiedOwner) {
      const { data: staffData } = await supabase
        .from('store_staff_members')
        .select('*')
        .eq('staff_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      nextStaffMembership = staffData || null;
      nextEffectiveStoreId = staffData?.store_user_id || null;
    }

    setIsStoreOwner(verifiedOwner);
    setActiveStaffMembership(nextStaffMembership);
    setEffectiveStoreId(nextEffectiveStoreId);

    if (!nextEffectiveStoreId) {
      setRequests([]);
      setStatusRows({});
      setQuoteRows({});
      setQuoteDrafts({});
      setStaffMembers([]);
      setLoading(false);
      return;
    }

    if (verifiedOwner) {
      const { data: staffData } = await supabase
        .from('store_staff_members')
        .select('id, store_user_id, staff_user_id, display_name, phone, role, status')
        .eq('store_user_id', nextEffectiveStoreId)
        .eq('status', 'active')
        .order('display_name', { ascending: true });

      setStaffMembers(staffData || []);
    } else {
      setStaffMembers(nextStaffMembership ? [nextStaffMembership] : []);
    }

    const { data: requestData, error } = await supabase
      .from('estimate_requests')
      .select(`
        *,
        profiles!estimate_requests_user_id_fkey (
          display_name,
          email,
          phone
        ),
        estimate_request_images (
          id,
          image_path,
          sort_order
        )
      `)
      .neq('status', 'hidden')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.log('견적문의 조회 실패:', error);
      setRequests([]);
      setLoading(false);
      return;
    }

    const nextRequests = (requestData || []).map((item: any) => ({
      ...item,
      estimate_request_images: [...(item.estimate_request_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    setRequests(nextRequests);

    const requestIds = nextRequests.map((item: any) => Number(item.id));

    if (requestIds.length === 0) {
      setStatusRows({});
      setQuoteRows({});
      setQuoteDrafts({});
      setLoading(false);
      return;
    }

    const [statusResult, quoteResult] = await Promise.all([
      supabase
        .from('estimate_request_store_statuses')
        .select('*')
        .eq('store_user_id', nextEffectiveStoreId)
        .in('estimate_request_id', requestIds),
      supabase
        .from('estimate_quotes')
        .select('*')
        .eq('store_user_id', nextEffectiveStoreId)
        .in('estimate_request_id', requestIds),
    ]);

    const nextStatuses = Object.fromEntries(
      (statusResult.data || []).map((item: any) => [Number(item.estimate_request_id), item])
    );
    const nextQuotes = Object.fromEntries(
      (quoteResult.data || []).map((item: any) => [Number(item.estimate_request_id), item])
    );

    setStatusRows(nextStatuses);
    setQuoteRows(nextQuotes);
    setQuoteDrafts(
      Object.fromEntries(
        requestIds.map((requestId) => {
          const quote = nextQuotes[requestId];
          return [
            requestId,
            {
              laborCost: formatAmount(quote?.labor_cost),
              materialCost: formatAmount(quote?.material_cost),
              additionalCost: formatAmount(quote?.additional_cost),
              depositAmount: formatAmount(quote?.deposit_amount),
              progressAmount: formatAmount(quote?.progress_amount),
              finalAmount: formatAmount(quote?.final_amount),
              additionalWork: quote?.additional_work || '',
              memo: quote?.memo || '',
              pdfUrl: quote?.pdf_url || '',
            },
          ];
        })
      )
    );

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadEstimates();
  }, [loadEstimates]);

  const canUseEstimates =
    isStoreOwner || (!!activeStaffMembership && !!effectiveStoreId);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requests;

    return requests.filter((item) => {
      const status = statusRows[Number(item.id)]?.status || 'new';
      return status === filter;
    });
  }, [filter, requests, statusRows]);

  const statusCounts = useMemo(() => {
    return requests.reduce<Record<string, number>>((acc, item) => {
      const status = statusRows[Number(item.id)]?.status || 'new';
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});
  }, [requests, statusRows]);

  const updateCustomerStatus = async (requestId: number, status: CustomerStatus) => {
    if (!user || !effectiveStoreId) return;

    setSavingId(requestId);

    const current = statusRows[requestId];
    const { data, error } = await supabase
      .from('estimate_request_store_statuses')
      .upsert(
        {
          id: current?.id,
          estimate_request_id: requestId,
          store_user_id: effectiveStoreId,
          status,
          memo: current?.memo || null,
          last_contacted_at:
            status === 'consulting' || status === 'estimating'
              ? new Date().toISOString()
              : current?.last_contacted_at || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'estimate_request_id,store_user_id' }
      )
      .select()
      .single();

    setSavingId(null);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    setStatusRows((prev) => ({
      ...prev,
      [requestId]: data,
    }));
  };

  const saveQuote = async (requestId: number) => {
    if (!user || !effectiveStoreId) return;

    const draft = quoteDrafts[requestId] || {};
    const laborCost = parseAmount(draft.laborCost || '');
    const materialCost = parseAmount(draft.materialCost || '');
    const additionalCost = parseAmount(draft.additionalCost || '');
    const totalAmount = laborCost + materialCost + additionalCost;

    setSavingId(requestId);

    const { data, error } = await supabase
      .from('estimate_quotes')
      .upsert(
        {
          id: quoteRows[requestId]?.id,
          estimate_request_id: requestId,
          store_user_id: effectiveStoreId,
          title: '견적서',
          status: 'draft',
          labor_cost: laborCost,
          material_cost: materialCost,
          additional_cost: additionalCost,
          total_amount: totalAmount,
          deposit_amount: parseAmount(draft.depositAmount || ''),
          progress_amount: parseAmount(draft.progressAmount || ''),
          final_amount: parseAmount(draft.finalAmount || ''),
          additional_work: draft.additionalWork?.trim() || null,
          memo: draft.memo?.trim() || null,
          pdf_url: draft.pdfUrl?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'estimate_request_id,store_user_id' }
      )
      .select()
      .single();

    setSavingId(null);

    if (error) {
      Alert.alert('견적 저장 실패', error.message);
      return;
    }

    setQuoteRows((prev) => ({
      ...prev,
      [requestId]: data,
    }));

    await updateCustomerStatus(requestId, 'estimating');
    Alert.alert('견적 저장', '견적 내용이 저장되었습니다.');
  };

  const updateQuoteDraft = (requestId: number, key: string, value: string) => {
    setQuoteDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        [key]: value,
      },
    }));
  };

  const assignStaff = async (requestId: number, staffUserId: string | null) => {
    if (!isStoreOwner) return;

    setSavingId(requestId);

    const { error } = await supabase
      .from('estimate_requests')
      .update({
        assigned_staff_user_id: staffUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    setSavingId(null);

    if (error) {
      Alert.alert('담당자 배정 실패', error.message);
      return;
    }

    await loadEstimates();
  };

  const getEstimateImageUrl = (path?: string | null) => {
    if (!path) return null;
    return supabase.storage.from('estimate-images').getPublicUrl(path).data.publicUrl;
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '견적/고객관리' }} />

      <View style={styles.header}>
        <Text style={styles.title}>견적/고객관리</Text>
        <Text style={styles.desc}>신규 문의부터 공사 완료까지 업체별로 상태를 관리합니다.</Text>
      </View>

      {!canUseEstimates ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>
            견적문의 열람과 고객관리는 가게 인증 완료 계정 또는 활성 직원 계정만 사용할 수 있습니다.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.filterRow}>
            {STATUS_OPTIONS.map((option) => {
              const active = filter === option.key;
              const count = statusCounts[option.key] || 0;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(option.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {option.label} {count ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listContent}>
              {filteredRequests.length === 0 ? (
                <Text style={styles.emptyText}>표시할 견적문의가 없습니다.</Text>
              ) : (
                filteredRequests.map((item) => {
                  const requestId = Number(item.id);
                  const currentStatus = (statusRows[requestId]?.status || 'new') as CustomerStatus;
                  const draft = quoteDrafts[requestId] || {};
                  const firstImage = item.estimate_request_images?.[0];
                  const imageUrl = getEstimateImageUrl(firstImage?.image_path);
                  const totalAmount =
                    parseAmount(draft.laborCost || '') +
                    parseAmount(draft.materialCost || '') +
                    parseAmount(draft.additionalCost || '');

                  return (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.cardTop}>
                        <View style={styles.thumb}>
                          {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.thumbImage} />
                          ) : (
                            <Ionicons name="construct-outline" size={26} color="#9ca3af" />
                          )}
                        </View>

                        <View style={styles.cardInfo}>
                          <View style={styles.badgeRow}>
                            <Text style={styles.categoryBadge}>{item.category}</Text>
                            <Text style={styles.statusBadge}>{getStatusLabel(currentStatus)}</Text>
                          </View>
                          <Text style={styles.requestTitle}>{item.title}</Text>
                          <Text style={styles.metaText}>
                            {item.region || '지역 미입력'} · {item.budget || '예산 미입력'}
                          </Text>
                          <Text style={styles.metaText}>
                            희망 일정 {item.desired_date || '미정'} · {item.preferred_contact || '연락 방법 미입력'}
                          </Text>
                        </View>
                      </View>

                      {item.address ? <Text style={styles.addressText}>주소: {item.address}</Text> : null}
                      <Text style={styles.bodyText}>{item.description || '상세 내용 없음'}</Text>

                      {isStoreOwner ? (
                        <View style={styles.assignmentBox}>
                          <Text style={styles.assignmentTitle}>담당 직원 배정</Text>
                          <View style={styles.assignmentRow}>
                            <TouchableOpacity
                              style={[
                                styles.assignmentChip,
                                !item.assigned_staff_user_id && styles.assignmentChipActive,
                              ]}
                              onPress={() => assignStaff(requestId, null)}
                              disabled={savingId === requestId}
                            >
                              <Text
                                style={[
                                  styles.assignmentChipText,
                                  !item.assigned_staff_user_id &&
                                    styles.assignmentChipTextActive,
                                ]}
                              >
                                가게 본계정
                              </Text>
                            </TouchableOpacity>
                            {staffMembers.map((staff) => {
                              const active = item.assigned_staff_user_id === staff.staff_user_id;

                              return (
                                <TouchableOpacity
                                  key={staff.id}
                                  style={[
                                    styles.assignmentChip,
                                    active && styles.assignmentChipActive,
                                  ]}
                                  onPress={() => assignStaff(requestId, staff.staff_user_id)}
                                  disabled={savingId === requestId}
                                >
                                  <Text
                                    style={[
                                      styles.assignmentChipText,
                                      active && styles.assignmentChipTextActive,
                                    ]}
                                  >
                                    {staff.display_name || '직원'}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ) : activeStaffMembership ? (
                        <View style={styles.assignmentBox}>
                          <Text style={styles.assignmentTitle}>내 담당 문의</Text>
                          <Text style={styles.metaText}>
                            {activeStaffMembership.display_name || '직원'} 계정으로 배정된 문의입니다.
                          </Text>
                        </View>
                      ) : null}

                      <View style={styles.statusActions}>
                        {STATUS_OPTIONS.filter((option) => option.key !== 'all').map((option) => (
                          <TouchableOpacity
                            key={option.key}
                            style={[
                              styles.statusActionBtn,
                              currentStatus === option.key && styles.statusActionBtnActive,
                            ]}
                            onPress={() => updateCustomerStatus(requestId, option.key as CustomerStatus)}
                            disabled={savingId === requestId}
                          >
                            <Text
                              style={[
                                styles.statusActionText,
                                currentStatus === option.key && styles.statusActionTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={styles.quoteBox}>
                        <Text style={styles.quoteTitle}>견적서 작성</Text>
                        <View style={styles.amountGrid}>
                          <QuoteInput
                            label="시공비"
                            value={draft.laborCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'laborCost', value)}
                          />
                          <QuoteInput
                            label="자재비"
                            value={draft.materialCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'materialCost', value)}
                          />
                          <QuoteInput
                            label="추가공사"
                            value={draft.additionalCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'additionalCost', value)}
                          />
                          <View style={styles.totalBox}>
                            <Text style={styles.totalLabel}>합계</Text>
                            <Text style={styles.totalValue}>{totalAmount.toLocaleString()}원</Text>
                          </View>
                        </View>

                        <View style={styles.amountGrid}>
                          <QuoteInput
                            label="계약금"
                            value={draft.depositAmount || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'depositAmount', value)}
                          />
                          <QuoteInput
                            label="중도금"
                            value={draft.progressAmount || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'progressAmount', value)}
                          />
                          <QuoteInput
                            label="잔금"
                            value={draft.finalAmount || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'finalAmount', value)}
                          />
                        </View>

                        <TextInput
                          style={[styles.input, styles.textarea]}
                          value={draft.additionalWork || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'additionalWork', value)}
                          placeholder="추가공사 내역"
                          multiline
                          textAlignVertical="top"
                        />
                        <TextInput
                          style={[styles.input, styles.textarea]}
                          value={draft.memo || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'memo', value)}
                          placeholder="상담 메모"
                          multiline
                          textAlignVertical="top"
                        />
                        <TextInput
                          style={styles.input}
                          value={draft.pdfUrl || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'pdfUrl', value)}
                          placeholder="PDF 공유 링크"
                          autoCapitalize="none"
                        />

                        <TouchableOpacity
                          style={[styles.saveBtn, savingId === requestId && styles.saveBtnDisabled]}
                          onPress={() => saveQuote(requestId)}
                          disabled={savingId === requestId}
                        >
                          <Text style={styles.saveText}>
                            {savingId === requestId ? '저장 중...' : '견적 저장'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function QuoteInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.amountInputBox}>
      <Text style={styles.amountLabel}>{label}</Text>
      <TextInput
        style={styles.amountInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        keyboardType="number-pad"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 16, gap: 6, backgroundColor: '#fff' },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  desc: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  noticeBox: {
    margin: 16,
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  filterBtn: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 16, paddingBottom: 48, gap: 14 },
  emptyText: { color: '#6b7280', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 60 },
  card: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryBadge: {
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  requestTitle: { marginTop: 7, color: '#111827', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  metaText: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  addressText: { color: '#374151', fontSize: 13, fontWeight: '800', lineHeight: 19 },
  bodyText: { color: '#374151', fontSize: 14, lineHeight: 21 },
  assignmentBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 12,
    gap: 8,
  },
  assignmentTitle: { color: '#111827', fontSize: 13, fontWeight: '900' },
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assignmentChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  assignmentChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  assignmentChipText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  assignmentChipTextActive: { color: '#1d4ed8' },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusActionBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  statusActionText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  statusActionTextActive: { color: '#fff' },
  quoteBox: {
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 10,
  },
  quoteTitle: { color: '#111827', fontSize: 15, fontWeight: '900' },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountInputBox: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 10,
    gap: 5,
  },
  amountLabel: { color: '#6b7280', fontSize: 11, fontWeight: '900' },
  amountInput: { color: '#111827', fontSize: 14, fontWeight: '900', paddingVertical: 0 },
  totalBox: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: '#111827',
    padding: 10,
    gap: 5,
  },
  totalLabel: { color: '#d1d5db', fontSize: 11, fontWeight: '900' },
  totalValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
  textarea: { minHeight: 76, lineHeight: 20 },
  saveBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
