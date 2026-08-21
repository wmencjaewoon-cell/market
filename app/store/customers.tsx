import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
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
import {
  DEFAULT_STORE_LIMITS,
  getPlanLabel,
  getStoreSubscriptionLimits,
  type StoreSubscriptionLimits,
} from '../../lib/storeLimits';
import { getMyStoreAccessContext, type StoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

type CustomerStatus =
  | 'new'
  | 'consulting'
  | 'estimating'
  | 'contracted'
  | 'construction'
  | 'completed'
  | 'on_hold'
  | 'closed';

type CustomerFilter = CustomerStatus | 'all';
type CustomerSource = 'visit' | 'phone' | 'referral' | 'manual' | 'other';

const STATUS_OPTIONS: { key: CustomerFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'new', label: '신규' },
  { key: 'consulting', label: '상담중' },
  { key: 'estimating', label: '견적작성' },
  { key: 'contracted', label: '계약' },
  { key: 'construction', label: '공사중' },
  { key: 'completed', label: '완료' },
  { key: 'on_hold', label: '보류' },
  { key: 'closed', label: '종료' },
];

const SOURCE_OPTIONS: { key: CustomerSource; label: string }[] = [
  { key: 'visit', label: '방문' },
  { key: 'phone', label: '전화' },
  { key: 'referral', label: '소개' },
  { key: 'manual', label: '직접등록' },
  { key: 'other', label: '기타' },
];

function getStatusLabel(status?: string | null) {
  return (
    STATUS_OPTIONS.find((item) => item.key === status)?.label ||
    STATUS_OPTIONS.find((item) => item.key === 'new')?.label ||
    '신규'
  );
}

function getSourceLabel(source?: string | null, customerType?: string | null) {
  if (source === 'estimate' || customerType === 'online') return '앱 견적문의';
  if (source === 'visit') return '방문';
  if (source === 'phone') return '전화';
  if (source === 'referral') return '소개';
  if (source === 'other') return '기타';
  return '직접등록';
}

function getCustomerTypeFromSource(source: CustomerSource) {
  if (source === 'manual') return 'offline';
  return source;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StoreCustomersScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [storeAccess, setStoreAccess] = useState<StoreAccessContext | null>(null);
  const [limits, setLimits] = useState<StoreSubscriptionLimits>(DEFAULT_STORE_LIMITS);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [estimateRows, setEstimateRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<CustomerFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState<CustomerSource>('visit');
  const [formStatus, setFormStatus] = useState<CustomerStatus>('new');
  const [assignedStaffUserId, setAssignedStaffUserId] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadCustomers = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const access = await getMyStoreAccessContext();
    setStoreAccess(access);

    if (!access.storeUserId) {
      setLimits(DEFAULT_STORE_LIMITS);
      setStaffMembers([]);
      setCustomers([]);
      setEstimateRows([]);
      setLoading(false);
      return;
    }

    const [nextLimits, staffResult] = await Promise.all([
      getStoreSubscriptionLimits(access.storeUserId),
      access.canManageStore
        ? supabase
            .from('store_staff_members')
            .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
            .eq('store_user_id', access.storeUserId)
            .eq('status', 'active')
            .eq('role', 'staff')
            .order('display_name', { ascending: true })
        : Promise.resolve({ data: access.membership ? [access.membership] : [], error: null }),
    ]);

    setLimits(nextLimits);
    setStaffMembers(staffResult.data || []);
    setAssignedStaffUserId(access.canManageStore ? null : access.currentUserId);

    let customerQuery = supabase
      .from('store_customers')
      .select('*')
      .eq('store_user_id', access.storeUserId)
      .order('last_activity_at', { ascending: false });

    if (nextLimits.estimateRecentLimit != null) {
      customerQuery = customerQuery.limit(nextLimits.estimateRecentLimit);
    }

    const { data: customerData, error: customerError } = await customerQuery;

    if (customerError) {
      console.log('고객 목록 조회 실패:', customerError);
      setMessage(customerError.message);
      setCustomers([]);
      setEstimateRows([]);
      setLoading(false);
      return;
    }

    const nextCustomers = customerData || [];
    setCustomers(nextCustomers);
    setMemoDrafts(
      Object.fromEntries(nextCustomers.map((item: any) => [item.id, item.memo || '']))
    );

    const customerIds = nextCustomers.map((item: any) => item.id).filter(Boolean);
    if (customerIds.length === 0) {
      setEstimateRows([]);
      setLoading(false);
      return;
    }

    const { data: estimateData, error: estimateError } = await supabase
      .from('estimate_requests')
      .select('id, customer_id, title, category, status, created_at')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false });

    if (estimateError) {
      console.log('고객 연결 견적문의 조회 실패:', estimateError);
      setEstimateRows([]);
    } else {
      setEstimateRows(estimateData || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const canUseCustomers = !!storeAccess?.storeUserId && (storeAccess.canManageStore || storeAccess.isStaff);
  const canAssignStaff = !!storeAccess?.canManageStore;
  const canCreateCustomer = !!storeAccess?.storeUserId && (storeAccess.canManageStore || storeAccess.isStaff);

  const estimatesByCustomer = useMemo(() => {
    return estimateRows.reduce<Record<string, any[]>>((acc, item) => {
      if (!item.customer_id) return acc;
      acc[item.customer_id] = [...(acc[item.customer_id] || []), item];
      return acc;
    }, {});
  }, [estimateRows]);

  const statusCounts = useMemo(() => {
    return customers.reduce<Record<string, number>>((acc, item) => {
      const status = item.status || 'new';
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return customers.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!keyword) return true;

      return [item.name, item.phone, item.address, item.memo, getSourceLabel(item.source, item.customer_type)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [customers, filter, search]);

  const getStaffName = (staffUserId?: string | null) => {
    if (!staffUserId) return '담당 미지정';
    const staff = staffMembers.find((item) => item.staff_user_id === staffUserId);
    if (!staff) return '담당 직원';
    return `${staff.display_name || '직원'}${staff.position ? ` · ${staff.position}` : ''}`;
  };

  const refreshCustomers = async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setSource('visit');
    setFormStatus('new');
    setAssignedStaffUserId(storeAccess?.canManageStore ? null : storeAccess?.currentUserId || null);
    setMemo('');
    setMessage('');
  };

  const createCustomer = async () => {
    if (creating || !storeAccess?.storeUserId) return;

    if (!canCreateCustomer) {
      setMessage('고객 등록 권한이 없습니다.');
      return;
    }

    if (!name.trim()) {
      setMessage('고객명을 입력해 주세요.');
      return;
    }

    const staffUserId = storeAccess.canManageStore
      ? assignedStaffUserId
      : storeAccess.currentUserId;

    try {
      setCreating(true);
      setMessage('');

      const { error } = await supabase.from('store_customers').insert({
        store_user_id: storeAccess.storeUserId,
        assigned_staff_user_id: staffUserId,
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        customer_type: getCustomerTypeFromSource(source),
        source,
        status: formStatus,
        memo: memo.trim() || null,
        last_activity_at: new Date().toISOString(),
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      resetForm();
      setShowForm(false);
      await loadCustomers();
    } catch (error: any) {
      setMessage(error?.message || '고객 등록 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const updateCustomerStatus = async (customerId: string, status: CustomerStatus) => {
    setSavingId(customerId);

    const { error } = await supabase
      .from('store_customers')
      .update({
        status,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    setSavingId(null);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    setCustomers((prev) =>
      prev.map((item) =>
        item.id === customerId
          ? { ...item, status, last_activity_at: new Date().toISOString() }
          : item
      )
    );
  };

  const assignStaff = async (customerId: string, staffUserId: string | null) => {
    if (!canAssignStaff) return;

    setSavingId(customerId);

    const { error } = await supabase
      .from('store_customers')
      .update({
        assigned_staff_user_id: staffUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    setSavingId(null);

    if (error) {
      Alert.alert('담당자 변경 실패', error.message);
      return;
    }

    setCustomers((prev) =>
      prev.map((item) =>
        item.id === customerId ? { ...item, assigned_staff_user_id: staffUserId } : item
      )
    );
  };

  const saveMemo = async (customerId: string) => {
    const nextMemo = memoDrafts[customerId] || '';
    setSavingId(customerId);

    const { error } = await supabase
      .from('store_customers')
      .update({
        memo: nextMemo.trim() || null,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    setSavingId(null);

    if (error) {
      Alert.alert('메모 저장 실패', error.message);
      return;
    }

    setCustomers((prev) =>
      prev.map((item) =>
        item.id === customerId
          ? { ...item, memo: nextMemo.trim() || null, last_activity_at: new Date().toISOString() }
          : item
      )
    );
  };

  const callCustomer = async (customer: any) => {
    const phoneNumber = String(customer.phone || '').replace(/[^\d+]/g, '');

    if (!phoneNumber) {
      Alert.alert('전화번호 없음', '등록된 전화번호가 없습니다.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phoneNumber}`);
    } catch (error: any) {
      Alert.alert('전화 연결 실패', error?.message || '전화 앱을 열 수 없습니다.');
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '고객관리' }} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.title}>고객관리</Text>
            <Text style={styles.desc}>온라인 문의와 전화·방문 고객을 한 곳에서 관리합니다.</Text>
          </View>
          {canCreateCustomer ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                setShowForm((visible) => !visible);
                setMessage('');
              }}
            >
              <Ionicons name={showForm ? 'close' : 'add'} size={18} color={theme.primaryText} />
              <Text style={styles.addBtnText}>{showForm ? '닫기' : '고객 등록'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!canUseCustomers ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>
            고객관리는 가게 인증 완료 계정 또는 활성 직원 계정만 사용할 수 있습니다.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshCustomers} tintColor={theme.primary} />
          }
        >
          <View style={styles.limitBox}>
            <Text style={styles.limitText}>
              현재 플랜 {getPlanLabel(limits.plan)} · 고객관리{' '}
              {limits.estimateRecentLimit == null
                ? '전체 기간'
                : `최근 ${limits.estimateRecentLimit}건`}
            </Text>
          </View>

          {showForm ? (
            <View style={styles.formBox}>
              <Text style={styles.formTitle}>오프라인 고객 등록</Text>

              <Text style={styles.label}>고객명</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="예: 김민수 고객"
                placeholderTextColor={theme.textSubtle}
              />

              <Text style={styles.label}>전화번호</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="010-0000-0000"
                placeholderTextColor={theme.textSubtle}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>주소</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="상담에 필요한 주소"
                placeholderTextColor={theme.textSubtle}
              />

              <Text style={styles.label}>유입 경로</Text>
              <View style={styles.chipRow}>
                {SOURCE_OPTIONS.map((item) => {
                  const active = source === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSource(item.key)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>상담 상태</Text>
              <View style={styles.chipRow}>
                {STATUS_OPTIONS.filter((item) => item.key !== 'all').map((item) => {
                  const active = formStatus === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setFormStatus(item.key as CustomerStatus)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {canAssignStaff ? (
                <>
                  <Text style={styles.label}>담당 직원</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, !assignedStaffUserId && styles.chipActive]}
                      onPress={() => setAssignedStaffUserId(null)}
                    >
                      <Text style={[styles.chipText, !assignedStaffUserId && styles.chipTextActive]}>
                        미지정
                      </Text>
                    </TouchableOpacity>
                    {staffMembers.map((staff) => {
                      const active = assignedStaffUserId === staff.staff_user_id;
                      return (
                        <TouchableOpacity
                          key={staff.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setAssignedStaffUserId(staff.staff_user_id)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {staff.display_name || '직원'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>메모</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={memo}
                onChangeText={setMemo}
                placeholder="상담 내용, 요청사항, 다음 연락 예정 등을 기록하세요"
                placeholderTextColor={theme.textSubtle}
                multiline
                textAlignVertical="top"
              />

              {message ? <Text style={styles.messageText}>{message}</Text> : null}

              <TouchableOpacity
                style={[styles.submitBtn, creating && styles.disabledBtn]}
                onPress={createCustomer}
                disabled={creating}
              >
                <Text style={styles.submitBtnText}>{creating ? '등록 중...' : '고객 등록'}</Text>
              </TouchableOpacity>
            </View>
          ) : message ? (
            <Text style={styles.messageText}>{message}</Text>
          ) : null}

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={theme.textSubtle} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="고객명, 전화번호, 주소, 메모 검색"
              placeholderTextColor={theme.textSubtle}
            />
          </View>

          <View style={styles.filterRow}>
            {STATUS_OPTIONS.map((item) => {
              const active = filter === item.key;
              const count = statusCounts[item.key] || 0;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label} {count ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : filteredCustomers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="person-add-outline" size={34} color={theme.textSubtle} />
              <Text style={styles.emptyTitle}>표시할 고객이 없습니다</Text>
              <Text style={styles.emptyText}>온라인 견적문의가 들어오거나 직접 고객을 등록하면 여기에 표시됩니다.</Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => {
              const customerEstimates = estimatesByCustomer[customer.id] || [];
              const isSaving = savingId === customer.id;

              return (
                <View key={customer.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Ionicons name="person-outline" size={24} color={theme.primary} />
                    </View>
                    <View style={styles.cardInfo}>
                      <View style={styles.badgeRow}>
                        <Text style={styles.sourceBadge}>
                          {getSourceLabel(customer.source, customer.customer_type)}
                        </Text>
                        <Text style={styles.statusBadge}>{getStatusLabel(customer.status)}</Text>
                      </View>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      <Text style={styles.metaText}>
                        {customer.phone || '전화번호 미등록'} · {getStaffName(customer.assigned_staff_user_id)}
                      </Text>
                      <Text style={styles.metaText}>
                        최근 활동 {formatDateTime(customer.last_activity_at)}
                      </Text>
                    </View>
                  </View>

                  {customer.address ? (
                    <Text style={styles.addressText}>주소: {customer.address}</Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => callCustomer(customer)}
                    >
                      <Ionicons name="call-outline" size={16} color={theme.primaryText} />
                      <Text style={styles.callBtnText}>전화</Text>
                    </TouchableOpacity>
                  </View>

                  {canAssignStaff ? (
                    <View style={styles.assignmentBox}>
                      <Text style={styles.assignmentTitle}>담당 직원</Text>
                      <View style={styles.chipRow}>
                        <TouchableOpacity
                          style={[
                            styles.assignmentChip,
                            !customer.assigned_staff_user_id && styles.assignmentChipActive,
                          ]}
                          onPress={() => assignStaff(customer.id, null)}
                          disabled={isSaving}
                        >
                          <Text
                            style={[
                              styles.assignmentChipText,
                              !customer.assigned_staff_user_id && styles.assignmentChipTextActive,
                            ]}
                          >
                            미지정
                          </Text>
                        </TouchableOpacity>
                        {staffMembers.map((staff) => {
                          const active = customer.assigned_staff_user_id === staff.staff_user_id;
                          return (
                            <TouchableOpacity
                              key={staff.id}
                              style={[styles.assignmentChip, active && styles.assignmentChipActive]}
                              onPress={() => assignStaff(customer.id, staff.staff_user_id)}
                              disabled={isSaving}
                            >
                              <Text
                                style={[
                                  styles.assignmentChipText,
                                  active && styles.assignmentChipTextActive,
                                ]}
                              >
                                {staff.display_name || '직원'}
                                {staff.position ? ` · ${staff.position}` : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.statusActions}>
                    {STATUS_OPTIONS.filter((item) => item.key !== 'all').map((item) => {
                      const active = customer.status === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[styles.statusActionBtn, active && styles.statusActionBtnActive]}
                          onPress={() => updateCustomerStatus(customer.id, item.key as CustomerStatus)}
                          disabled={isSaving}
                        >
                          <Text
                            style={[
                              styles.statusActionText,
                              active && styles.statusActionTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.memoBox}>
                    <Text style={styles.memoTitle}>상담 메모</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={memoDrafts[customer.id] || ''}
                      onChangeText={(value) =>
                        setMemoDrafts((prev) => ({ ...prev, [customer.id]: value }))
                      }
                      placeholder="상담 내용이나 다음 액션을 기록하세요"
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.memoSaveBtn, isSaving && styles.disabledBtn]}
                      onPress={() => saveMemo(customer.id)}
                      disabled={isSaving}
                    >
                      <Text style={styles.memoSaveText}>{isSaving ? '저장 중...' : '메모 저장'}</Text>
                    </TouchableOpacity>
                  </View>

                  {customerEstimates.length > 0 ? (
                    <View style={styles.estimateBox}>
                      <Text style={styles.estimateTitle}>연결된 견적문의</Text>
                      {customerEstimates.slice(0, 3).map((estimate) => (
                        <View key={estimate.id} style={styles.estimateRow}>
                          <Text style={styles.estimateText} numberOfLines={1}>
                            {estimate.title || '견적문의'}
                          </Text>
                          <Text style={styles.estimateMeta}>
                            {estimate.category || '공사'} · {formatDateTime(estimate.created_at)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.canvas },
    header: {
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      padding: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerTitleBox: { flex: 1, minWidth: 0, gap: 5 },
    title: { color: theme.text, fontSize: 24, fontWeight: '900' },
    desc: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    addBtn: {
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    addBtnText: { color: theme.primaryText, fontSize: 13, fontWeight: '900' },
    body: { flex: 1 },
    content: { padding: 16, paddingBottom: 48, gap: 14 },
    noticeBox: {
      margin: 16,
      borderRadius: 14,
      backgroundColor: theme.warningBg,
      borderWidth: 1,
      borderColor: theme.warningText,
      padding: 14,
      gap: 6,
    },
    noticeTitle: { color: theme.warningText, fontSize: 16, fontWeight: '900' },
    noticeText: { color: theme.warningText, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    limitBox: {
      borderRadius: 12,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    limitText: { color: theme.primary, fontSize: 13, fontWeight: '900' },
    formBox: {
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    formTitle: { color: theme.text, fontSize: 17, fontWeight: '900' },
    label: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '700',
    },
    textarea: { minHeight: 84, lineHeight: 20 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 11,
      paddingVertical: 7,
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    chipText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    chipTextActive: { color: theme.primaryText },
    messageText: { color: theme.danger, fontSize: 13, fontWeight: '800', lineHeight: 19 },
    submitBtn: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: { color: theme.primaryText, fontSize: 14, fontWeight: '900' },
    disabledBtn: { opacity: 0.55 },
    searchBox: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '700', paddingVertical: 0 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterBtn: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBtnActive: {
      backgroundColor: theme.text,
      borderColor: theme.text,
    },
    filterText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    filterTextActive: { color: theme.background },
    center: { paddingVertical: 72, alignItems: 'center', justifyContent: 'center' },
    emptyBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
    emptyText: { color: theme.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 19 },
    card: {
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    cardTop: { flexDirection: 'row', gap: 12 },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 14,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardInfo: { flex: 1, minWidth: 0 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    sourceBadge: {
      borderRadius: 999,
      backgroundColor: theme.surfaceMuted,
      color: theme.textMuted,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '900',
    },
    statusBadge: {
      borderRadius: 999,
      backgroundColor: theme.primarySoft,
      color: theme.primary,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '900',
    },
    customerName: { marginTop: 7, color: theme.text, fontSize: 17, fontWeight: '900', lineHeight: 23 },
    metaText: { marginTop: 4, color: theme.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    addressText: { color: theme.text, fontSize: 13, fontWeight: '800', lineHeight: 19 },
    actionRow: { flexDirection: 'row', gap: 8 },
    callBtn: {
      minHeight: 38,
      borderRadius: 10,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    callBtnText: { color: theme.primaryText, fontSize: 13, fontWeight: '900' },
    assignmentBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      padding: 12,
      gap: 8,
    },
    assignmentTitle: { color: theme.text, fontSize: 13, fontWeight: '900' },
    assignmentChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    assignmentChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    assignmentChipText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    assignmentChipTextActive: { color: theme.primary },
    statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusActionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: theme.surface,
    },
    statusActionBtnActive: {
      backgroundColor: theme.text,
      borderColor: theme.text,
    },
    statusActionText: { color: theme.textMuted, fontSize: 12, fontWeight: '900' },
    statusActionTextActive: { color: theme.background },
    memoBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      padding: 12,
      gap: 8,
    },
    memoTitle: { color: theme.text, fontSize: 13, fontWeight: '900' },
    memoSaveBtn: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: theme.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memoSaveText: { color: theme.background, fontSize: 13, fontWeight: '900' },
    estimateBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      padding: 12,
      gap: 8,
    },
    estimateTitle: { color: theme.text, fontSize: 13, fontWeight: '900' },
    estimateRow: {
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderSoft,
      padding: 10,
      gap: 3,
    },
    estimateText: { color: theme.text, fontSize: 13, fontWeight: '900' },
    estimateMeta: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  });
}
