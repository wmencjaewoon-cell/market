import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import {
  SELLER_LEVEL_STYLES,
  getSellerLevel,
  getSellerLevelProgress,
  getSellerLevelStyle,
  getSellerLevelTitle,
  getSellerPoints,
} from '../../lib/sellerLevel';
import { supabase } from '../../lib/supabase';

function showAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

export default function SellerLevelScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.log('레벨 프로필 조회 실패:', error);
      showAlert('레벨 꾸미기', '레벨 정보를 불러오지 못했습니다.');
      return;
    }

    setProfile(data || null);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile])
  );

  const points = getSellerPoints(profile);
  const level = getSellerLevel(profile);
  const progress = getSellerLevelProgress(points);
  const selectedStyle = getSellerLevelStyle(profile, level);

  const updateProfile = async (patch: Record<string, any>) => {
    if (!user || saving) return;

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      console.log('레벨 설정 저장 실패:', error);
      showAlert('저장 실패', error.message);
      return;
    }

    setProfile((prev: any | null) => (prev ? { ...prev, ...patch } : prev));
  };

  const selectStyle = async (styleId: string, minLevel: number) => {
    if (level < minLevel) return;
    await updateProfile({ seller_level_style: styleId });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.summary,
          {
            borderColor: selectedStyle.borderColor,
            backgroundColor: selectedStyle.backgroundColor,
          },
        ]}
      >
        <Text style={[styles.levelText, { color: selectedStyle.textColor }]}>
          LV.{level}
        </Text>
        <Text style={styles.title}>{getSellerLevelTitle(level)}</Text>
        <Text style={styles.points}>{points.toLocaleString()} XP</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {level >= 100 ? '최고 레벨입니다.' : `다음 레벨까지 ${progress.remaining} XP`}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>표시 설정</Text>
        <SettingRow
          label="판매자 정보에 표시"
          value={profile?.show_level_on_profile !== false}
          onValueChange={(value) => updateProfile({ show_level_on_profile: value })}
        />
        <SettingRow
          label="게시글에 표시"
          value={profile?.show_level_on_posts !== false}
          onValueChange={(value) => updateProfile({ show_level_on_posts: value })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>레벨 뱃지</Text>
        <View style={styles.styleGrid}>
          {SELLER_LEVEL_STYLES.map((style) => {
            const unlocked = level >= style.minLevel;
            const selected = selectedStyle.id === style.id;

            return (
              <TouchableOpacity
                key={style.id}
                style={[
                  styles.styleCard,
                  {
                    borderColor: selected ? style.textColor : style.borderColor,
                    backgroundColor: style.backgroundColor,
                    opacity: unlocked ? 1 : 0.45,
                  },
                ]}
                disabled={!unlocked || saving}
                onPress={() => selectStyle(style.id, style.minLevel)}
                activeOpacity={0.8}
              >
                <View style={styles.styleHeader}>
                  <Text style={[styles.styleLabel, { color: style.textColor }]}>
                    {style.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={18} color={style.textColor} />
                  ) : null}
                </View>
                <Text style={styles.unlockText}>LV.{style.minLevel}부터</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function SettingRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  summary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  levelText: {
    fontSize: 30,
    fontWeight: '900',
  },
  title: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  points: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
    color: '#4b5563',
  },
  progressTrack: {
    marginTop: 14,
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  progressText: {
    marginTop: 8,
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  settingRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    color: '#374151',
    fontWeight: '800',
  },
  styleGrid: {
    gap: 10,
  },
  styleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  styleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  unlockText: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
});
