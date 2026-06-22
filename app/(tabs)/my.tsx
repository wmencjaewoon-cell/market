import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getProfileImageUrl } from '../../lib/profileImage';
import { supabase } from '../../lib/supabase';
import { useTabRefresh } from '../../lib/tabRefresh';

export default function MyScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchProfile();
    }, [user])
  );

  const fetchProfile = async () => {
  if (!user) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.log('프로필 조회 실패:', error);
    return;
  }

  if (data) {
    setProfile(data);
    return;
  }

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email,
      display_name: user.email?.split('@')[0] || '사용자',
      user_type: 'personal',
      status: 'active',
      trust_status: 'normal',
      reports_count: 0,
    })
    .select()
    .single();

  if (createError) {
    console.log('프로필 자동 생성 실패:', createError);
    return;
  }

  setProfile(created);
};

  useTabRefresh('my', () => {
    void fetchProfile();
  });

  const profileImageUrl = getProfileImageUrl(profile?.avatar_path || profile?.avatar_url);
  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const publicPhone =
    isVerifiedStore && profile?.is_phone_public ? profile?.phone : null;

  if (!user) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>내정보</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/login' as any)}>
          <Text style={styles.btnText}>로그인하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

  return (
  <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileBox}>
        <View style={styles.avatar}>
          {profileImageUrl ? (
            <Image
              source={{ uri: profileImageUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarInitial}>
              {(profile?.display_name || '나').slice(0, 1)}
            </Text>
          )}
        </View>

        <Text style={styles.name}>{profile?.display_name || '이름 없음'}</Text>
        <Text style={styles.sub}>
          {isVerifiedStore ? '가게' : '개인'}
        </Text>

        {isVerifiedStore ? (
          <Text style={styles.verifiedText}>가게인증완료</Text>
        ) : null}

        {publicPhone ? <Text style={styles.sub}>{publicPhone}</Text> : null}

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push('/profile/edit' as any)}
        >
          <Text style={styles.editText}>프로필 수정</Text>
        </TouchableOpacity>

        <Text style={styles.sub}>
          상태: {profile?.status === 'active' ? '정상' : '이용 제한'}
        </Text>
      </View>

      <Section title="나의 거래">
        <MenuItem title="판매관리" onPress={() => router.push('/my/sales' as any)} />
        <MenuItem title="구매내역" onPress={() => router.push('/my/purchases' as any)} />
      </Section>

      <Section title="나의 관심">
        <MenuItem title="관심목록" onPress={() => router.push('/my/favorites' as any)} />
        <MenuItem title="키워드 알림 설정" onPress={() => router.push('/my/keywords' as any)} />
      </Section>

      <Section title="고객지원">
        <MenuItem title="공지사항" onPress={() => router.push('/support/notices' as any)} />
        <MenuItem title="고객센터" onPress={() => router.push('/support/help' as any)} />
      </Section>

      <Section title="설정">
        <MenuItem title="개인정보처리방침" onPress={() => router.push('/my/privacy' as any)} />
        <MenuItem title="이용약관" onPress={() => router.push('/my/terms' as any)} />
        <MenuItem title="운영정책" onPress={() => router.push('/my/operation-policy' as any)} />
        <MenuItem title="차단한 사용자" onPress={() => router.push('/my/blocked-users' as any)} />
        <MenuItem title="회원탈퇴" onPress={() => router.push('/my/delete-account' as any)} />
      </Section>

      {profile?.role === 'admin' ? (
        <Section title="관리자">
          <MenuItem title="관리자 화면" onPress={() => router.push('/admin' as any)} />
        </Section>
      ) : null}

      <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>
);
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBox}>{children}</View>
    </View>
  );
}

function MenuItem({ title, onPress }: any) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Text style={styles.menuText}>{title}</Text>
      <Text style={styles.arrow}>{'>'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  
  title: { fontSize: 26, fontWeight: '800', marginBottom: 16 },

  profileBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: '900',
    color: '#6b7280',
  },
  name: { fontSize: 20, fontWeight: '800' },
  sub: { color: '#6b7280', marginTop: 4 },
  verifiedText: {
    marginTop: 6,
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },
  editBtn: { marginTop: 10 },
  editText: { color: '#2563eb', fontWeight: '700' },
  safe: {
  flex: 1,
  backgroundColor: '#f9fafb',
},

container: {
  padding: 16,
  paddingBottom: 120,
},

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  sectionBox: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },

  menuItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  menuText: { fontSize: 15, fontWeight: '600' },
  arrow: { color: '#9ca3af' },

  logoutBtn: {
    marginTop: 20,
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '800' },

  btn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
