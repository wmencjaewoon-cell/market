import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getProfileImageUrl } from '../../lib/profileImage';
import {
  getSellerLevel,
  getSellerLevelStyle,
  getSellerLevelTitle,
  getSellerPoints,
} from '../../lib/sellerLevel';
import { supabase } from '../../lib/supabase';
import { useTabRefresh } from '../../lib/tabRefresh';

const COMPANY_INFO_ROWS = [
  ['상호', '(주)우명건축'],
  ['대표자', '장기승'],
  ['사업자등록번호', '292-81-03793'],
  // ['통신판매업 신고번호', '제2023-서울금천-00001호'],
  ['주소', '부산광역시 기장군 기장읍 기장해안로 98, 3층 318호 (오시리아스퀘어)'],
  ['전화번호', '051-723-0624'],
  ['서비스명', '인테리어마켓'],
  ['문의 이메일', 'wmenc.jaewoon@gmail.com'],
  ['웹사이트', 'https://interior-market.wmenc.co.kr','https://wmenc.co.kr'],
];

export default function MyScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
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
        trust_points: 0,
        trust_level: 1,
        seller_level_style: 'clean',
        reports_count: 0,
      })
      .select()
      .single();

    if (createError) {
      console.log('프로필 자동 생성 실패:', createError);
      return;
    }

    setProfile(created);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    fetchProfile();
  }, [fetchProfile, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchProfile();
    }, [fetchProfile, user])
  );

  useTabRefresh('my', () => {
    void fetchProfile();
  });

  const handleSignOut = async () => {
    await signOut();
    setProfile(null);
    router.replace('/(tabs)/my' as any);
  };

  const profileImageUrl = getProfileImageUrl(profile?.avatar_path || profile?.avatar_url);
  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const sellerLevel = getSellerLevel(profile);
  const sellerPoints = getSellerPoints(profile);
  const sellerLevelStyle = getSellerLevelStyle(profile, sellerLevel);
  const publicPhone =
    isVerifiedStore && profile?.is_phone_public ? profile?.phone : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>내정보</Text>

        {user ? (
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

            <View style={styles.profileBadgeRow}>
              {isVerifiedStore ? (
                <Text style={styles.verifiedText}>가게인증완료</Text>
              ) : null}

              <Text
                style={[
                  styles.levelBadge,
                  {
                    borderColor: sellerLevelStyle.borderColor,
                    backgroundColor: sellerLevelStyle.backgroundColor,
                    color: sellerLevelStyle.textColor,
                  },
                ]}
              >
                LV.{sellerLevel} {getSellerLevelTitle(sellerLevel)}
              </Text>
            </View>

            <Text style={styles.levelSub}>{sellerPoints.toLocaleString()} XP</Text>

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
        ) : (
          <View style={styles.loginBox}>
            <Text style={styles.loginTitle}>로그인이 필요해요</Text>
            <Text style={styles.loginDesc}>
              공지사항과 정책 문서는 확인할 수 있습니다.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.push('/login' as any)}>
              <Text style={styles.btnText}>로그인하기</Text>
            </TouchableOpacity>
          </View>
        )}

        {user ? (
          <>
            <Section title="나의 거래">
              <MenuItem title="판매관리" onPress={() => router.push('/my/sales' as any)} />
              <MenuItem title="구매내역" onPress={() => router.push('/my/purchases' as any)} />
              <MenuItem title="레벨 꾸미기" onPress={() => router.push('/my/level' as any)} />
            </Section>

            <Section title="나의 관심">
              <MenuItem title="관심목록" onPress={() => router.push('/my/favorites' as any)} />
              <MenuItem title="키워드 알림 설정" onPress={() => router.push('/my/keywords' as any)} />
            </Section>
          </>
        ) : null}

        <Section title="고객지원">
          <MenuItem title="공지사항" onPress={() => router.push('/support/notices' as any)} />
          <MenuItem title="고객센터" onPress={() => router.push('/support/help' as any)} />
        </Section>

        <Section title="설정">
          <MenuItem title="개인정보처리방침" onPress={() => router.push('/my/privacy' as any)} />
          <MenuItem title="이용약관" onPress={() => router.push('/my/terms' as any)} />
          <MenuItem title="운영정책" onPress={() => router.push('/my/operation-policy' as any)} />
          {user ? (
            <>
              <MenuItem title="차단한 사용자" onPress={() => router.push('/my/blocked-users' as any)} />
              <MenuItem title="회원탈퇴" onPress={() => router.push('/my/delete-account' as any)} />
            </>
          ) : null}
        </Section>

        {profile?.role === 'admin' ? (
          <Section title="관리자">
            <MenuItem title="관리자 화면" onPress={() => router.push('/admin' as any)} />
          </Section>
        ) : null}

        {user ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.companyBox}>
          <TouchableOpacity
            style={styles.companyHeader}
            onPress={() => setCompanyInfoOpen((open) => !open)}
            activeOpacity={0.8}
          >
            <Text style={styles.companyTitle}>(주)우명건축 사업자 정보</Text>
            <Text
              style={[
                styles.companyArrow,
                companyInfoOpen && styles.companyArrowOpen,
              ]}
            >
              {'>'}
            </Text>
          </TouchableOpacity>

          {companyInfoOpen ? (
            <View style={styles.companyBody}>
              {COMPANY_INFO_ROWS.map(([label, value]) => (
                <View key={label} style={styles.companyRow}>
                  <Text style={styles.companyLabel}>{label}</Text>
                  <Text style={styles.companyValue}>{value}</Text>
                </View>
              ))}

              <Text style={styles.companyNotice}>
                인테리어마켓은 본 플랫폼을 통한 통신판매의 당사자가 아니며,
                해당 거래정보 및 내용에 대하여 책임을 지지 않습니다.
              </Text>
            </View>
          ) : null}
        </View>
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
  loginBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  loginTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  loginDesc: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
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
  profileBadgeRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  verifiedText: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  levelSub: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 12,
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

  companyBox: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  companyHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  companyTitle: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
  },
  companyArrow: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '900',
  },
  companyArrowOpen: {
    transform: [{ rotate: '90deg' }],
  },
  companyBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  companyLabel: {
    width: 110,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  companyValue: {
    flex: 1,
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  companyNotice: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },

  btn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
