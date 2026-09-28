// 내 동네 관리 화면: 활동 지역과 반경 설정을 저장하고 홈 피드 필터 기준으로 사용한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RadiusSlider from '../../../components/RadiusSlider';
import { useAppTheme } from '../../../hooks/use-app-theme';
import { getAsPalette, type AsPalette } from '../../../lib/asAppearance';
import { useSingleFlightPress } from '../../../lib/useSingleFlightPress';
import {
  addMyRegionByCandidate,
  deleteMyRegion,
  fetchMyRegions,
  fetchMyRegionSettings,
  getNearbyRegionCandidatesByGps,
  saveMyRegionSettings,
} from '../../../lib/region';


export default function RegionsScreen() {
  const base = useAppTheme();
  const theme = useMemo(() => getAsPalette(base), [base]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const singlePress = useSingleFlightPress();
  const [regions, setRegions] = useState<any[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [message, setMessage] = useState('');
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [regionCandidates, setRegionCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const params = useLocalSearchParams<{ returnTo?: string; category?: string }>();

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const myRegions = await fetchMyRegions();
      const settings = await fetchMyRegionSettings();

      setRegions(myRegions);
      setActiveRegionId(settings?.active_region_id ?? myRegions?.[0]?.id ?? null);
      setRadiusKm(settings?.radius_km ?? 5);
    } catch (e: any) {
      setMessage(e?.message || '지역 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const goBack = () => singlePress('back', () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  });

  const runAction = (action: () => Promise<void>) => singlePress('region-action', async () => {
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  });

  const handleVerifyRegion = async () => {
    try {
      setMessage('');

      const candidates = await getNearbyRegionCandidatesByGps();

      setRegionCandidates(candidates);
      setCandidateModalOpen(true);

    } catch (e: any) {
      setMessage(e?.message || '동네 인증에 실패했습니다.');
    }
  };

  const handleSelectCandidate = async (candidate: any) => {
    try {
      setMessage('');

      await addMyRegionByCandidate(candidate);

      setCandidateModalOpen(false);
      setRegionCandidates([]);

      const myRegions = await fetchMyRegions();

      const selectedRegion =
        myRegions.find((region) => region.region_name === candidate.region_name) ||
        myRegions?.[0];

      if (selectedRegion) {
        setRegions(myRegions);
        setActiveRegionId(selectedRegion.id);

        await saveMyRegionSettings(selectedRegion.id, radiusKm);

        if (params.returnTo) {
          router.replace({
            pathname: params.returnTo as any,
            params: {
              regionChanged: String(Date.now()),
              regionName: selectedRegion.region_name,
              regionLat: String(selectedRegion.latitude),
              regionLng: String(selectedRegion.longitude),
              ...(params.category ? { category: String(params.category) } : {}),
            },
          });

          return;
        }
      }

      await load();
    } catch (e: any) {
      setMessage(e?.message || '동네 등록에 실패했습니다.');
    }
  };

  const handleSelectRegion = async (regionId: number) => {
    try {
      setMessage('');

      const selectedRegion = regions.find((region) => region.id === regionId);

      if (!selectedRegion) {
        setMessage('선택한 동네 정보를 찾을 수 없습니다.');
        return;
      }

      setActiveRegionId(regionId);
      await saveMyRegionSettings(regionId, radiusKm);

      if (params.returnTo) {
        router.replace({
          pathname: params.returnTo as any,
          params: {
            regionChanged: String(Date.now()),
            regionName: selectedRegion.region_name,
            regionLat: String(selectedRegion.latitude),
            regionLng: String(selectedRegion.longitude),
            ...(params.category ? { category: String(params.category) } : {}),
          },
        });
      } else {
        goBack();
      }
    } catch (e: any) {
      setMessage(e?.message || '대표 동네 변경에 실패했습니다.');
    }
  };

  const handleSaveRadius = async (nextRadius: number) => {
    try {
      setRadiusKm(nextRadius);
      await saveMyRegionSettings(activeRegionId, nextRadius);
    } catch (e: any) {
      setMessage(e?.message || '반경 저장에 실패했습니다.');
    }
  };

  const handleDeleteRegion = async (regionId: number) => {
    try {
      setMessage('');
      await deleteMyRegion(regionId);
      await load();
    } catch (e: any) {
      setMessage(e?.message || '동네 삭제에 실패했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="region-settings-screen">
      {/* 하단 여백은 탭 바가 처리한다. 헤더는 안전 영역 안에서 스크롤과 분리한다. */}
      <View style={styles.header}>
        <View style={styles.headerRow} testID="region-settings-header">
          <TouchableOpacity style={styles.headerButton} accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={goBack}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.title} accessibilityRole="header">동네 설정</Text>
          <View style={styles.headerButton} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>

        {Platform.OS !== 'web' && (
          <View style={styles.section}>
            <TouchableOpacity style={[styles.primaryBtn, (loading || working) && styles.disabled]} accessibilityRole="button" accessibilityLabel="현재 위치로 동네 인증" accessibilityState={{ disabled: loading || working, busy: working }} disabled={loading || working} onPress={() => void runAction(handleVerifyRegion)}>
              {working ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate-outline" size={20} color="#fff" />}
              <Text style={styles.primaryBtnText}>현재 위치로 동네 인증</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>보여줄 범위</Text>
            <Text style={styles.radiusText}>{radiusKm}km</Text>
          </View>
          <RadiusSlider
            min={1}
            max={20}
            step={1}
            value={radiusKm}
            onChangeEnd={handleSaveRadius}
            activeColor={theme.primary}
            trackColor={theme.border}
            disabled={loading || working}
          />
          <View style={styles.rangeLabels}><Text style={styles.helpText}>1km</Text><Text style={styles.helpText}>20km</Text></View>
        </View>

        <View style={[styles.section, styles.regionSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>등록한 동네</Text>
            {!loading ? <Text style={styles.helpText}>{regions.length}/3</Text> : null}
          </View>
          {loading ? <View style={styles.state}><ActivityIndicator color={theme.primary} /><Text style={styles.helpText}>동네 정보 확인 중...</Text></View>
            : !regions.length && !message ? <View style={styles.state}><Ionicons name="location-outline" size={30} color={theme.textMuted} /><Text style={styles.helpText}>등록한 동네가 없어요</Text></View> : null}

          {!loading && regions.map((region) => {
            const active = region.id === activeRegionId;

            return (
              <View key={region.id} style={[styles.card, active && styles.activeCard]}>
                <View style={styles.regionInfo}>
                  {active ? <Text style={styles.activeLabel}>대표 동네</Text> : null}
                  <Text style={[styles.regionName, active && styles.regionNameActive]}>
                    {region.region_name}
                  </Text>
                  <Text style={styles.regionSub}>
                    {region.verified ? '인증 완료' : '검색으로 추가됨'}
                  </Text>
                </View>

                <View style={styles.actions}>
                  {!active && (
                    <TouchableOpacity
                      style={styles.smallBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`${region.region_name} 대표로 선택`}
                      accessibilityState={{ disabled: working }}
                      disabled={working}
                      onPress={() => void runAction(() => handleSelectRegion(region.id))}
                    >
                      <Text style={styles.smallBtnText}>대표로 선택</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.deleteButton}
                    accessibilityRole="button"
                    accessibilityLabel={`${region.region_name} 삭제`}
                    accessibilityState={{ disabled: working }}
                    disabled={working}
                    onPress={() => void runAction(() => handleDeleteRegion(region.id))}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {message ? <View style={styles.section} accessibilityLiveRegion="polite"><Text style={styles.message}>{message}</Text><TouchableOpacity style={styles.retryButton} accessibilityRole="button" accessibilityLabel="동네 정보 다시 불러오기" disabled={working || loading} onPress={() => void load()}><Ionicons name="refresh-outline" size={18} color={theme.primary} /><Text style={styles.retryText}>다시 불러오기</Text></TouchableOpacity></View> : null}
      </ScrollView>

      <Modal visible={candidateModalOpen} transparent animationType="fade" onRequestClose={() => { if (!working) setCandidateModalOpen(false); }}>
        <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.candidateBox} accessibilityViewIsModal>
            <Text style={styles.modalTitle} accessibilityRole="header">내 주변 동네 선택</Text>

            <ScrollView style={styles.candidateList} contentContainerStyle={styles.candidateListContent}>
              {regionCandidates.map((candidate, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.candidateItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${candidate.region_name} 동네로 등록`}
                  accessibilityState={{ disabled: working }}
                  disabled={working}
                  onPress={() => void runAction(() => handleSelectCandidate(candidate))}
                >
                  <Text style={styles.candidateText}>
                    {candidate.region_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {working ? <ActivityIndicator color={theme.primary} /> : null}
            {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}

            <TouchableOpacity
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => setCandidateModalOpen(false)}
            >
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function createStyles(theme: AsPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingVertical: 20, gap: 24 },
    header: { backgroundColor: theme.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    headerRow: {
      width: '100%', maxWidth: 680, alignSelf: 'center', minHeight: 56, paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, lineHeight: 26, fontWeight: '700', color: theme.text },
    primaryBtn: {
      backgroundColor: theme.action, borderRadius: 8, minHeight: 52, padding: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
    disabled: { opacity: 0.6 },
    section: { paddingHorizontal: 20, gap: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: theme.text, flexShrink: 1 },
    radiusText: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: theme.primary },
    rangeLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    helpText: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    regionSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 24 },
    state: { paddingVertical: 24, alignItems: 'center', gap: 12 },
    card: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      borderWidth: 1, borderColor: theme.border, borderRadius: 8,
      backgroundColor: theme.surface, padding: 14,
    },
    activeCard: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    regionInfo: { flex: 1, minWidth: 120, gap: 4 },
    activeLabel: { fontSize: 11, lineHeight: 17, fontWeight: '700', color: theme.primary },
    regionName: { fontSize: 15, lineHeight: 23, fontWeight: '700', color: theme.text },
    regionNameActive: { color: theme.primary },
    regionSub: { fontSize: 12, lineHeight: 19, color: theme.textMuted },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    smallBtn: {
      backgroundColor: theme.action, borderRadius: 8, minHeight: 44,
      paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center',
    },
    smallBtnText: { color: '#fff', fontSize: 12, lineHeight: 20, fontWeight: '600' },
    deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    retryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    retryText: { color: theme.primary, fontSize: 14, lineHeight: 22, fontWeight: '600' },
    modalOverlay: {
      flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end', paddingHorizontal: 16,
    },
    candidateBox: { width: '100%', maxWidth: 640, maxHeight: '90%', alignSelf: 'center', backgroundColor: theme.surface, borderRadius: 8, padding: 16, gap: 14 },
    modalTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: theme.text },
    candidateList: { flexGrow: 0, flexShrink: 1 },
    candidateListContent: { gap: 10 },
    candidateItem: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 14, minHeight: 48, justifyContent: 'center', backgroundColor: theme.surface },
    candidateText: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: theme.text },
    cancelBtn: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceSoft, borderRadius: 8 },
    cancelText: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: theme.text },
    message: { color: theme.danger, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  });
}
