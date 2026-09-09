// 가게 요금제 안내 모달과 배지: 무료/베이직/프리미엄/지역광고 노출 문구를 한 곳에서 관리한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type AppPalette } from '../contexts/theme';
import { useAppTheme } from '../hooks/use-app-theme';

type StorePlanId = 'free' | 'basic' | 'premium' | 'local_ad';
type StorePlanModalMode = 'owner' | 'public';

type StorePlanModalProps = {
  visible: boolean;
  currentPlan?: string | null;
  isPremium?: boolean;
  hasLocalAd?: boolean;
  mode?: StorePlanModalMode;
  onClose: () => void;
};

const STORE_PLAN_OPTIONS: {
  id: StorePlanId;
  name: string;
  price: string;
  description: string;
  features: string[];
}[] = [
  {
    id: 'free',
    name: '기본',
    price: '월 0원',
    description: '부담 없이 시작하는 가게용 플랜',
    features: ['상품 10개 등록', '기본 가게 프로필', '기본 지도 노출', '채팅 문의 가능'],
  },
  {
    id: 'basic',
    name: '베이직',
    price: '월 19,900원',
    description: '상품을 조금 더 많이 올리는 가게용 플랜',
    features: ['상품 20개 등록', '상품 복사 등록', '가게 공지 등록', '오늘 가능 배지', '기본 문의 통계'],
  },
  {
    id: 'premium',
    name: '프리미엄',
    price: '월 33,000원',
    description: '문의와 노출을 더 적극적으로 받는 가게용 플랜',
    features: ['상품 50개 등록', '추천 가게 노출', '지도 강조 마커', '오늘 가능 배지 강조', '상세 문의 통계', '상품 복사 등록', '가게 공지 상단 표시'],
  },
  {
    id: 'local_ad',
    name: '지역광고',
    price: '월 55,000원 ~ 110,000원',
    description: '프리미엄과 별도로 판매할 지역 상단 노출 상품',
    features: ['지역 홈 상단 노출', '카테고리 상단 노출', '추천 가게 고정', '지도 강조 표시', '월간 문의 리포트'],
  },
];

const PUBLIC_STORE_BENEFITS: {
  id: 'premium' | 'local_ad';
  title: string;
  description: string;
  features: string[];
}[] = [
  {
    id: 'premium',
    title: '프리미엄 인증 가게',
    description: '인증 완료 후 공개 화면에서 더 신뢰 있게 보이는 가게입니다.',
    features: [
      '가게 인증 완료 표시',
      '추천 가게 영역에 노출될 수 있음',
      '지도에서 더 잘 보이도록 강조될 수 있음',
      '오늘 가능 정보와 공지를 제공할 수 있음',
    ],
  },
  {
    id: 'local_ad',
    title: '지역광고 가게',
    description: '현재 지역에서 더 잘 보이도록 광고 노출이 적용된 가게입니다.',
    features: [
      '지역 화면에서 광고 표시 가능',
      '가게찾기와 지도에서 강조될 수 있음',
      '주변 가게가 많을 때 더 눈에 띄게 표시될 수 있음',
    ],
  },
];

export function showStorePlanEventNotice() {
  const message = '이벤트 기간동안 가게 인증 완료가 되면 프리미엄이 적용됩니다.';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message);
    return;
  }

  Alert.alert('플랜 변경 준비중', message);
}

export function PremiumStoreBadge({
  label = '프리미엄 가게',
  onPress,
}: {
  label?: string;
  onPress?: () => void;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const content = (
    <>
      <Ionicons name="shield-checkmark" size={13} color="#fff" />
      <Text style={styles.premiumBadgeText}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.premiumBadge} onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.premiumBadge}>{content}</View>;
}

export function LocalAdStoreBadge({
  label = '지역광고',
  onPress,
}: {
  label?: string;
  onPress?: () => void;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const content = (
    <>
      <Ionicons name="megaphone" size={13} color="#fff" />
      <Text style={styles.localAdBadgeText}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.localAdBadge} onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.localAdBadge}>{content}</View>;
}

export default function StorePlanModal({
  visible,
  currentPlan,
  isPremium,
  hasLocalAd = false,
  mode = 'owner',
  onClose,
}: StorePlanModalProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const activeBasePlan = currentPlan || 'free';
  const showPublicView = mode === 'public';
  const hasPremiumBenefit =
    isPremium ?? (activeBasePlan === 'premium' || activeBasePlan === 'partner');
  const visiblePublicBenefits = PUBLIC_STORE_BENEFITS.filter((benefit) => {
    if (benefit.id === 'premium') return hasPremiumBenefit;
    return hasLocalAd;
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>
                {showPublicView ? '가게 인증 안내' : '가게 요금제'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {showPublicView
                  ? '이 가게에 공개적으로 적용된 인증과 노출 기능만 안내합니다.'
                  : '현재 이벤트 기간에는 인증 완료 가게에 프리미엄이 적용됩니다.'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {showPublicView ? (
            <View style={styles.planList}>
              {(visiblePublicBenefits.length > 0
                ? visiblePublicBenefits
                : [
                    {
                      id: 'premium' as const,
                      title: '인증 가게',
                      description: '사업자 정보를 확인한 가게입니다.',
                      features: ['가게 인증 완료 표시', '기본 가게 프로필 제공', '채팅 문의 가능'],
                    },
                  ]).map((benefit) => (
                    <View key={benefit.id} style={styles.planRow}>
                      <View style={styles.publicBenefitHeader}>
                        <Ionicons
                          name={benefit.id === 'local_ad' ? 'megaphone' : 'shield-checkmark'}
                          size={18}
                          color={theme.primary}
                        />
                        <Text style={styles.planName}>{benefit.title}</Text>
                      </View>
                      <Text style={styles.planDescription}>{benefit.description}</Text>
                      <View style={styles.featureList}>
                        {benefit.features.map((feature) => (
                          <Text key={feature} style={styles.featureText}>
                            {feature}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))}
            </View>
          ) : (
            <View style={styles.planList}>
              {STORE_PLAN_OPTIONS.map((plan) => {
                const selected =
                  plan.id === 'local_ad'
                    ? hasLocalAd
                    : plan.id === activeBasePlan;

                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.planRow, selected && styles.planRowActive]}
                    onPress={showStorePlanEventNotice}
                    activeOpacity={0.85}
                  >
                    <View style={styles.planHeader}>
                      <View style={styles.planNameRow}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {selected ? (
                          <Text style={styles.currentBadge}>
                            {plan.id === 'local_ad' ? '사용중' : '현재'}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.planPrice}>{plan.price}</Text>
                    </View>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                    <View style={styles.featureList}>
                      {plan.features.map((feature) => (
                        <Text key={feature} style={styles.featureText}>
                          {feature}
                        </Text>
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '88%',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      backgroundColor: theme.surface,
      padding: 18,
      paddingBottom: 28,
      gap: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '900',
    },
    modalSubtitle: {
      marginTop: 5,
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 18,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planList: {
      gap: 10,
    },
    planRow: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      padding: 14,
      gap: 8,
    },
    planRowActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    planHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    planNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    publicBenefitHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    planName: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    currentBadge: {
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: theme.primary,
      color: theme.primaryText,
      paddingHorizontal: 7,
      paddingVertical: 3,
      fontSize: 11,
      fontWeight: '900',
    },
    planPrice: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '900',
    },
    planDescription: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    featureList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    featureText: {
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '800',
    },
    premiumBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      backgroundColor: '#166534',
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    premiumBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '900',
    },
    localAdBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      backgroundColor: '#14532d',
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    localAdBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '900',
    },
  });
}
