import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RadiusSlider from '../../../components/RadiusSlider';
import { useAppTheme } from '../../../hooks/use-app-theme';
import {
  addMyRegionByCandidate,
  deleteMyRegion,
  fetchMyRegions,
  fetchMyRegionSettings,
  getNearbyRegionCandidatesByGps,
  saveMyRegionSettings,
} from '../../../lib/region';


export default function RegionsScreen() {
  const theme = useAppTheme();
  const backIconColor = theme.scheme === 'dark' ? '#fff' : theme.text;
  const [regions, setRegions] = useState<any[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [message, setMessage] = useState('');
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [regionCandidates, setRegionCandidates] = useState<any[]>([]);
  const params = useLocalSearchParams<{ returnTo?: string; category?: string }>();

  const load = async () => {
    try {
      const myRegions = await fetchMyRegions();
      const settings = await fetchMyRegionSettings();

      setRegions(myRegions);
      setActiveRegionId(settings?.active_region_id ?? myRegions?.[0]?.id ?? null);
      setRadiusKm(settings?.radius_km ?? 5);
    } catch (e: any) {
      setMessage(e?.message || '지역 정보를 불러오지 못했습니다.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

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
      router.back();
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
  <View style={{ flex: 1 }}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={backIconColor} />
        </TouchableOpacity>
        <Text style={styles.title}>동네 설정</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.desc}>
        홈에서 볼 범위를 정하는 동네와 반경을 설정할 수 있어요.
        앱에서는 현재 위치 기반으로 동네 인증을 할 수 있습니다.
      </Text>

      {Platform.OS !== 'web' && (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyRegion}>
          <Text style={styles.primaryBtnText}>현재 위치로 동네 인증</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>보여줄 범위</Text>
        <Text style={styles.radiusText}>{radiusKm}km</Text>
        <RadiusSlider
            min={1}
            max={20}
            step={1}
            value={radiusKm}
            onChangeEnd={handleSaveRadius}
            />
        <Text style={styles.helpText}>
          대표 동네 기준으로 {radiusKm}km 안의 게시글을 보여줍니다.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>등록한 동네</Text>

        {regions.map((region) => {
          const active = region.id === activeRegionId;

          return (
            <View key={region.id} style={styles.card}>
              <View style={{ flex: 1 }}>
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
                    onPress={() => handleSelectRegion(region.id)}
                  >
                    <Text style={styles.smallBtnText}>대표로 선택</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.grayBtn}
                  onPress={() => handleDeleteRegion(region.id)}
                >
                  <Text style={styles.grayBtnText}>삭제</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
</ScrollView>

<Modal visible={candidateModalOpen} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={styles.candidateBox}>
      <Text style={styles.modalTitle}>내 주변 동네 선택</Text>

      {regionCandidates.map((candidate, index) => (
        <TouchableOpacity
          key={index}
          style={styles.candidateItem}
          onPress={() => handleSelectCandidate(candidate)}
        >
          <Text style={styles.candidateText}>
            {candidate.region_name}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => setCandidateModalOpen(false)}
      >
        <Text style={styles.cancelText}>취소</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>

</View>
);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  desc: { color: '#6b7280', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  section: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  radiusText: { fontSize: 18, fontWeight: '800', color: '#2563eb' },
  helpText: { color: '#6b7280', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  regionName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  regionNameActive: { color: '#2563eb' },
  regionSub: { marginTop: 4, color: '#6b7280' },
  actions: { gap: 8 },
  smallBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  grayBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.35)',
  justifyContent: 'flex-end',
  padding: 16,
},

candidateBox: {
  backgroundColor: '#fff',
  borderRadius: 18,
  padding: 16,
  gap: 10,
},

modalTitle: {
  fontSize: 18,
  fontWeight: '800',
},

candidateItem: {
  borderWidth: 1,
  borderColor: '#e5e7eb',
  borderRadius: 12,
  padding: 14,
},

candidateText: {
  fontWeight: '700',
},

cancelBtn: {
  marginTop: 6,
  padding: 12,
  alignItems: 'center',
  backgroundColor: '#f3f4f6',
  borderRadius: 10,
},

cancelText: {
  fontWeight: '700',
},
  grayBtnText: { color: '#111827', fontWeight: '700' },
  message: { color: '#dc2626', fontWeight: '600' },
});
