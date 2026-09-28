// 사용자 레벨 화면: 개인과 가게가 획득한 활동 점수와 해금된 프로필 꾸미기를 보여준다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
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
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {      showAlert('레벨 꾸미기', '레벨 정보를 불러오지 못했습니다.');
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

    if (error) {      showAlert('저장 실패', error.message);
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
            backgroundColor: theme.scheme === 'dark' ? theme.surface : selectedStyle.backgroundColor,
          },
        ]}
      >
        <Text style={[styles.levelText, { color: theme.scheme === 'dark' ? theme.text : selectedStyle.textColor }]}>
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
          label="프로필에 표시"
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
                    borderColor: selected
                      ? theme.scheme === 'dark' ? theme.primary : style.textColor
                      : style.borderColor,
                    backgroundColor: theme.scheme === 'dark' ? theme.surface : style.backgroundColor,
                    opacity: unlocked ? 1 : 0.45,
                  },
                ]}
                disabled={!unlocked || saving}
                onPress={() => selectStyle(style.id, style.minLevel)}
                activeOpacity={0.8}
              >
                <View style={styles.styleHeader}>
                  <Text style={[styles.styleLabel, { color: theme.scheme === 'dark' ? theme.text : style.textColor }]}>
                    {style.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={18} color={theme.scheme === 'dark' ? theme.primary : style.textColor} />
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
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: '#166534' }}
      />
    </View>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
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
    color: theme.text,
  },
  points: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
    color: theme.textMuted,
  },
  progressTrack: {
    marginTop: 14,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.primary,
  },
  progressText: {
    marginTop: 8,
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    backgroundColor: theme.background,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.text,
  },
  settingRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLabel: {
    color: theme.text,
    flexShrink: 1,
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
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
}
