import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getMyStoreAccessContext, type StoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

type CreatedStaffCredential = {
  loginId: string;
  password: string;
};

async function getEdgeFunctionErrorMessage(error: any) {
  const fallback = error?.message || '직원 계정 생성 중 오류가 발생했습니다.';
  const response = error?.context;

  if (!response || typeof response.clone !== 'function') {
    return fallback;
  }

  try {
    const body = await response.clone().json();
    return body?.error || body?.message || fallback;
  } catch {
    try {
      const text = await response.clone().text();
      return text || fallback;
    } catch {
      return fallback;
    }
  }
}

export default function StoreStaffScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [storeAccess, setStoreAccess] = useState<StoreAccessContext | null>(null);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editRole, setEditRole] = useState<'staff' | 'manager'>('staff');
  const [createdCredential, setCreatedCredential] =
    useState<CreatedStaffCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadStaff = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const access = await getMyStoreAccessContext();
    setStoreAccess(access);
    const profileData = access.storeProfile;

    setProfile(profileData || null);

    if (!access.canManageStore || !access.storeUserId) {
      setStaffRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('store_staff_members')
      .select('*')
      .eq('store_user_id', access.storeUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('직원 목록 조회 실패:', error);
      setMessage(error.message);
      setStaffRows([]);
    } else {
      setStaffRows(data || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const canManageStore =
    !!storeAccess?.canManageStore &&
    profile?.user_type === 'store' &&
    !!profile?.business_verified &&
    profile?.status !== 'blocked';

  const activeStaff = useMemo(
    () => staffRows.filter((item) => item.status === 'active'),
    [staffRows]
  );
  const inactiveStaff = useMemo(
    () => staffRows.filter((item) => item.status === 'inactive'),
    [staffRows]
  );

  const createStaff = async () => {
    if (creating) return;

    if (!displayName.trim()) {
      setMessage('직원 이름을 입력해 주세요.');
      return;
    }

    if (!storeAccess?.canManageStore || !storeAccess.storeUserId) {
      setMessage('직원 생성 권한이 없습니다.');
      return;
    }

    try {
      setCreating(true);
      setMessage('');
      setCreatedCredential(null);

      const { data, error } = await supabase.functions.invoke('create-store-staff', {
        body: {
          displayName: displayName.trim(),
          phone: phone.trim() || null,
          position: position.trim() || null,
          role,
          storeUserId: storeAccess?.storeUserId,
        },
      });

      if (error) {
        const errorMessage = await getEdgeFunctionErrorMessage(error);
        setMessage(
          errorMessage.includes('Function not found')
            ? 'create-store-staff Edge Function을 먼저 배포해 주세요.'
            : errorMessage
        );
        return;
      }

      if (data?.error) {
        setMessage(data.error);
        return;
      }

      setCreatedCredential({
        loginId: data.loginId,
        password: data.password,
      });
      setDisplayName('');
      setPhone('');
      setPosition('');
      setRole('staff');
      await loadStaff();
    } catch (error: any) {
      setMessage(error?.message || '직원 계정 생성 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const startEditStaff = (item: any) => {
    setEditingId(item.id);
    setEditDisplayName(item.display_name || '');
    setEditPhone(item.phone || '');
    setEditPosition(item.position || '');
    setEditRole(item.role === 'manager' ? 'manager' : 'staff');
    setMessage('');
  };

  const cancelEditStaff = () => {
    setEditingId(null);
    setEditDisplayName('');
    setEditPhone('');
    setEditPosition('');
    setEditRole('staff');
  };

  const saveStaffEdit = async () => {
    if (!editingId || updatingId) return;

    if (!editDisplayName.trim()) {
      setMessage('직원 이름을 입력해 주세요.');
      return;
    }

    setUpdatingId(editingId);
    setMessage('');

    const { error } = await supabase.rpc('update_store_staff_member', {
      p_staff_member_id: editingId,
      p_display_name: editDisplayName.trim(),
      p_phone: editPhone.trim() || null,
      p_position: editPosition.trim() || null,
      p_role: editRole,
    });

    setUpdatingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    cancelEditStaff();
    await loadStaff();
  };

  const deactivateStaff = async (item: any) => {
    Alert.alert(
      '직원 비활성화',
      `${item.display_name || item.staff_login_id} 계정을 퇴사 처리할까요? 이력은 유지되고 로그인/업무 접근만 막힙니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '비활성화',
          style: 'destructive',
          onPress: async () => {
            setDeactivatingId(item.id);

            const { error } = await supabase.rpc('deactivate_store_staff_member', {
              p_staff_member_id: item.id,
            });

            setDeactivatingId(null);

            if (error) {
              setMessage(error.message);
              return;
            }

            await loadStaff();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '직원 관리' }} />

      <Text style={styles.title}>직원 관리</Text>
      <Text style={styles.desc}>
        직원 계정은 비활성화되어도 견적, 상담, 채팅 이력이 삭제되지 않습니다.
      </Text>

      {!canManageStore ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>직원 관리는 가게 인증 완료 계정 또는 가게 매니저만 사용할 수 있습니다.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>직원 계정 생성</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="직원 이름 또는 닉네임"
            />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="직원 전화번호"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={position}
              onChangeText={setPosition}
              placeholder="직책 예: 현장팀장, 상담실장, 배송담당"
              maxLength={30}
            />

            <RoleSelector value={role} onChange={setRole} />

            <TouchableOpacity
              style={[styles.primaryBtn, creating && styles.disabledBtn]}
              onPress={createStaff}
              disabled={creating}
            >
              <Text style={styles.primaryText}>{creating ? '생성 중...' : '직원 생성'}</Text>
            </TouchableOpacity>
          </View>

          {createdCredential ? (
            <View style={styles.credentialBox}>
              <Text style={styles.credentialTitle}>직원에게 전달할 로그인 정보</Text>
              <Text style={styles.credentialText}>아이디: {createdCredential.loginId}</Text>
              <Text style={styles.credentialText}>임시 비밀번호: {createdCredential.password}</Text>
              <Text style={styles.credentialHelp}>
                이 비밀번호는 다시 확인할 수 없습니다. 직원에게 전달한 뒤 첫 로그인 후
                내정보에서 비밀번호를 변경하고 프로필에서 닉네임과 전화번호를 확인하게 해주세요.
              </Text>
            </View>
          ) : null}

          {message ? <Text style={styles.messageText}>{message}</Text> : null}

          <StaffSection
            title={`활성 직원 ${activeStaff.length}명`}
            rows={activeStaff}
            loading={loading}
            deactivatingId={deactivatingId}
            editingId={editingId}
            editDisplayName={editDisplayName}
            editPhone={editPhone}
            editPosition={editPosition}
            editRole={editRole}
            updatingId={updatingId}
            onStartEdit={startEditStaff}
            onCancelEdit={cancelEditStaff}
            onSaveEdit={saveStaffEdit}
            setEditDisplayName={setEditDisplayName}
            setEditPhone={setEditPhone}
            setEditPosition={setEditPosition}
            setEditRole={setEditRole}
            onDeactivate={deactivateStaff}
          />

          <StaffSection
            title={`퇴사/비활성 직원 ${inactiveStaff.length}명`}
            rows={inactiveStaff}
            loading={loading}
            readonly
          />
        </>
      )}
    </ScrollView>
  );
}

function StaffSection({
  title,
  rows,
  loading,
  readonly,
  deactivatingId,
  editingId,
  editDisplayName,
  editPhone,
  editPosition,
  editRole,
  updatingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  setEditDisplayName,
  setEditPhone,
  setEditPosition,
  setEditRole,
  onDeactivate,
}: {
  title: string;
  rows: any[];
  loading: boolean;
  readonly?: boolean;
  deactivatingId?: string | null;
  editingId?: string | null;
  editDisplayName?: string;
  editPhone?: string;
  editPosition?: string;
  editRole?: 'staff' | 'manager';
  updatingId?: string | null;
  onStartEdit?: (item: any) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  setEditDisplayName?: (value: string) => void;
  setEditPhone?: (value: string) => void;
  setEditPosition?: (value: string) => void;
  setEditRole?: (value: 'staff' | 'manager') => void;
  onDeactivate?: (item: any) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {loading ? <Text style={styles.emptyText}>불러오는 중...</Text> : null}
      {!loading && rows.length === 0 ? (
        <Text style={styles.emptyText}>표시할 직원이 없습니다.</Text>
      ) : null}
      {rows.map((item) => {
        const isEditing = editingId === item.id && !readonly;

        if (isEditing) {
          return (
            <View key={item.id} style={styles.editCard}>
              <Text style={styles.editTitle}>직원 정보 수정</Text>
              <TextInput
                style={styles.input}
                value={editDisplayName || ''}
                onChangeText={setEditDisplayName}
                placeholder="직원 이름 또는 닉네임"
              />
              <TextInput
                style={styles.input}
                value={editPhone || ''}
                onChangeText={setEditPhone}
                placeholder="직원 전화번호"
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.input}
                value={editPosition || ''}
                onChangeText={setEditPosition}
                placeholder="직책 예: 현장팀장, 상담실장, 배송담당"
                maxLength={30}
              />
              <RoleSelector value={editRole || 'staff'} onChange={setEditRole || (() => {})} />
              <Text style={styles.roleHelp}>
                매니저는 가게 관리 권한만 가지며, 고객이 견적문의나 문의 담당자로 직접 선택할 수 없습니다.
              </Text>
              <View style={styles.editActionRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancelEdit}>
                  <Text style={styles.cancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveEditBtn, updatingId === item.id && styles.disabledBtn]}
                  onPress={onSaveEdit}
                  disabled={updatingId === item.id}
                >
                  <Text style={styles.saveEditText}>
                    {updatingId === item.id ? '저장 중' : '저장'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }

        return (
          <View key={item.id} style={styles.staffCard}>
            <View style={styles.staffIcon}>
              <Ionicons name="person-outline" size={20} color="#166534" />
            </View>
            <View style={styles.staffInfo}>
              <Text style={styles.staffName}>{item.display_name || '직원'}</Text>
              <Text style={styles.staffMeta}>{item.staff_login_id}</Text>
              <Text style={styles.staffMeta}>
                {(item.position || (item.role === 'manager' ? '가게 관리' : '담당 직원'))}
                {' · '}
                {item.role === 'manager' ? '매니저' : '직원'}
              </Text>
              <Text style={styles.staffMeta}>{item.phone || '전화번호 미등록'}</Text>
              {item.role === 'manager' && item.status === 'active' ? (
                <Text style={styles.managerHelp}>직접 문의 배정 제외</Text>
              ) : null}
              {item.status === 'inactive' ? (
                <Text style={styles.inactiveText}>
                  비활성화 {item.left_at ? new Date(item.left_at).toLocaleDateString() : ''}
                </Text>
              ) : null}
            </View>
            {!readonly && onStartEdit ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => onStartEdit(item)}
                disabled={deactivatingId === item.id}
              >
                <Text style={styles.editText}>수정</Text>
              </TouchableOpacity>
            ) : null}
            {!readonly && onDeactivate ? (
              <TouchableOpacity
                style={styles.deactivateBtn}
                onPress={() => onDeactivate(item)}
                disabled={deactivatingId === item.id}
              >
                <Text style={styles.deactivateText}>
                  {deactivatingId === item.id ? '처리 중' : '퇴사'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function RoleSelector({
  value,
  onChange,
}: {
  value: 'staff' | 'manager';
  onChange: (value: 'staff' | 'manager') => void;
}) {
  return (
    <View style={styles.roleRow}>
      {[
        { key: 'staff' as const, label: '직원' },
        { key: 'manager' as const, label: '매니저' },
      ].map((item) => {
        const active = value === item.key;

        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.roleBtn, active && styles.roleBtnActive]}
            onPress={() => onChange(item.key)}
          >
            <Text style={[styles.roleText, active && styles.roleTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  desc: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  noticeBox: {
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 10,
  },
  cardTitle: { color: '#111827', fontSize: 17, fontWeight: '900' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
    backgroundColor: '#fff',
  },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 11,
    alignItems: 'center',
  },
  roleBtnActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#166534',
  },
  roleText: { color: '#374151', fontSize: 14, fontWeight: '900' },
  roleTextActive: { color: '#14532d' },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  credentialBox: {
    borderRadius: 16,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 14,
    gap: 6,
  },
  credentialTitle: { color: '#047857', fontSize: 15, fontWeight: '900' },
  credentialText: { color: '#064e3b', fontSize: 14, fontWeight: '900' },
  credentialHelp: { color: '#047857', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  messageText: { color: '#dc2626', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { color: '#111827', fontSize: 17, fontWeight: '900' },
  emptyText: { color: '#6b7280', fontSize: 13, fontWeight: '700' },
  staffCard: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  staffIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffInfo: { flex: 1, minWidth: 0 },
  staffName: { color: '#111827', fontSize: 15, fontWeight: '900' },
  staffMeta: { marginTop: 3, color: '#6b7280', fontSize: 12, fontWeight: '700' },
  managerHelp: { marginTop: 4, color: '#166534', fontSize: 12, fontWeight: '900' },
  inactiveText: { marginTop: 4, color: '#b45309', fontSize: 12, fontWeight: '900' },
  editCard: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    gap: 10,
  },
  editTitle: { color: '#111827', fontSize: 15, fontWeight: '900' },
  roleHelp: { color: '#6b7280', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  editActionRow: { flexDirection: 'row', gap: 8 },
  editBtn: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editText: { color: '#166534', fontSize: 12, fontWeight: '900' },
  deactivateBtn: {
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deactivateText: { color: '#dc2626', fontSize: 12, fontWeight: '900' },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cancelText: { color: '#374151', fontSize: 14, fontWeight: '900' },
  saveEditBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
