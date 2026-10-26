import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';
import { AS_HAZARDS, AS_RESULT_LABELS, type AsAnalysisResult as AnalysisResult } from '../lib/asAnalysis';
import { supabase } from '../lib/supabase';

export default function AsAnalysisResult({ result }: { result: AnalysisResult }) {
  const theme = useAppTheme();
  const [approvedGuide, setApprovedGuide] = useState<string | null>(null);
  const guideRevision = result.guide ? `${result.guide.key}:${result.guide.reviewed_at}` : null;
  useEffect(() => {
    let active = true;
    setApprovedGuide(null);
    if (result.recommended_action === 'self_repair' && result.guide) {
      void supabase.from('as_repair_guides').select('key,reviewed_at').eq('key', result.guide.key).eq('status', 'published')
        .not('reviewed_by', 'is', null).maybeSingle().then(({ data, error }) => {
          if (active && !error && data && `${data.key}:${data.reviewed_at}` === guideRevision) setApprovedGuide(guideRevision);
        });
    }
    return () => { active = false; };
  }, [guideRevision, result.guide, result.recommended_action]);
  const styles = useMemo(() => StyleSheet.create({
    root: { gap: 14, paddingVertical: 16, borderTopWidth: 1, borderTopColor: theme.border },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    title: { fontSize: 17, lineHeight: 25, fontWeight: '700', color: theme.text, flex: 1 },
    label: { color: theme.text, fontSize: 14, lineHeight: 22, fontWeight: '700' },
    body: { color: theme.text, fontSize: 14, lineHeight: 23 },
    muted: { color: theme.textMuted, fontSize: 13, lineHeight: 21 },
    section: { gap: 6 },
    warning: { padding: 12, gap: 6, backgroundColor: theme.warningBg, borderRadius: 6 },
    warningText: { color: theme.warningText, fontSize: 14, lineHeight: 23 },
    bullet: { color: theme.textMuted, width: 24, fontSize: 14, lineHeight: 23 },
    text: { flex: 1, color: theme.text, fontSize: 14, lineHeight: 23 },
    emergency: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.danger, padding: 12, borderRadius: 6 },
  }), [theme]);
  const list = (title: string, items: string[], numbered = false) => items.length ? (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {items.map((item, index) => <View key={`${title}-${index}`} style={styles.row}><Text style={styles.bullet}>{numbered ? `${index + 1}.` : '-'}</Text><Text style={styles.text} selectable>{item}</Text></View>)}
    </View>
  ) : null;
  return (
    <View style={styles.root} testID="as-analysis-result">
      <Text style={styles.muted}>{result.source === 'safety_policy' ? '위험 확인 결과 · AI 미분석' : 'AI 사전 분석 · 확정 진단 아님'}</Text>
      <View style={styles.row}>
        <Ionicons name={result.recommended_action === 'self_repair' ? 'checkmark-circle-outline' : 'shield-outline'} size={23} color={result.risk_level === 'high' ? theme.danger : theme.primary} />
        <Text style={styles.title}>
  {result.recommended_action === 'self_repair' &&
  result.procedure_source === 'guide' &&
  approvedGuide !== guideRevision
    ? '셀프 가이드 확인이 필요해요'
    : AS_RESULT_LABELS[result.recommended_action]}
</Text>
      </View>
      <Text style={styles.label}>{result.issue_area}</Text>
      <Text style={styles.body} selectable>{result.problem_summary}</Text>
      <Text style={styles.body} selectable>{result.reason}</Text>
      {result.hazards.length ? <Text style={styles.warningText}>셀프 수리 제외: {result.hazards.map(key => AS_HAZARDS[key]).join(' · ')}</Text> : null}
      <View style={styles.warning}><Text style={styles.warningText}>{result.safety_warning}</Text></View>
      {result.recommended_action === 'emergency' ? <TouchableOpacity style={styles.emergency} accessibilityRole="link" onPress={() => { void Linking.openURL('tel:119').catch(() => { /* The visible 119 number remains available on devices without a dialer. */ }); }}>
        <Ionicons name="call-outline" size={20} color="#fff" /><Text style={[styles.label, { color: '#fff' }]}>긴급 위험 시 119</Text>
      </TouchableOpacity> : null}
      {list('관찰한 내용', result.observations)}
      {list('예상 원인', result.possible_causes)}
      {result.repairability !== 'unknown' ? <Text style={styles.muted}>{result.repairability === 'replacement_possible' ? '부품 교체로 해결될 가능성이 있습니다. 규격·호환성과 실제 손상 상태는 별도 확인이 필요합니다.' : '수리로 해결될 가능성이 있습니다. 실제 상태에 따라 작업 범위가 달라질 수 있습니다.'}</Text> : null}
      {list('추가 확인이 필요한 내용', result.follow_up_questions)}
      {result.recommended_action === 'self_repair' &&
result.procedure_source === 'guide' &&
result.guide &&
approvedGuide === guideRevision ? (
  <>
    <Text style={styles.label}>{result.guide.title}</Text>
    <Text style={styles.body}>{result.guide.applicability}</Text>

    {list('준비물', result.guide.tools)}
    {list('셀프 수리 방법', result.guide.steps, true)}
    {list('주의사항', result.guide.warnings)}
    {list('작업을 중단해야 하는 경우', result.guide.stop_conditions)}
  </>
) : null}

{result.recommended_action === 'self_repair' &&
result.procedure_source === 'ai' ? (
  <>
    {list('필요한 공구', result.tools)}
    {list('필요한 부품', result.parts)}
    {list('셀프 수리 방법', result.repair_steps, true)}
    {list('작업을 중단해야 하는 경우', result.stop_conditions)}
  </>
) : null}

{result.recommended_action === 'self_repair' &&
result.procedure_source === 'guide' &&
result.guide &&
approvedGuide !== guideRevision ? (
  <Text style={styles.muted}>
    가이드의 현재 게시 상태를 확인할 수 없거나 내용이 변경되었습니다.
    수리 절차는 상담으로 확인해 주세요.
  </Text>
) : null}

{list('분석의 한계', result.limitations)}
    </View>
  );
}
