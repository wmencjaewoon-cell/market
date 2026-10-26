import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import {
  AS_CONSENT_VERSION,
  AS_HAZARDS,
  AsAnalysisRequestError,
  clarifyAsAnalysis,
  getAnalysisStatus,
  inputSafetyResult,
  runAsAnalysis,
  type AsAnalysisResult as AnalysisResult,
  type AsAnalysisRecord,
  type AsHazard,
} from '../lib/asAnalysis';
import AsAnalysisResult from './AsAnalysisResult';
import NearbyAsPlaces from './NearbyAsPlaces';

export default function AsAnalysisPanel({ homeId, assets, description, categories, symptoms, step, skipAI, disabled, onBusy, onResult, onAnswered, onConsult }: {
  homeId?: string | null;
  assets: ImagePickerAsset[]; description: string; categories: string[]; symptoms: string[];
  step: 'question' | 'answer' | 'consult'; skipAI: boolean; disabled: boolean;
  onBusy: (busy: boolean) => void; onResult: (id: string | null) => void; onAnswered: () => void; onConsult: () => void;
}) {
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    root: { paddingVertical: 20, gap: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 18, fontWeight: '700', color: theme.text },
    label: { color: theme.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
    text: { color: theme.textMuted, fontSize: 13, lineHeight: 21, flexShrink: 1 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 44, paddingVertical: 10, flexShrink: 1 },
    button: { minHeight: 48, padding: 12, borderRadius: 6, backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    buttonText: { color: theme.primaryText, fontWeight: '700', fontSize: 15, lineHeight: 23, flexShrink: 1 },
    secondary: { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border },
    link: { minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start' },
    error: { color: theme.danger, fontSize: 14, lineHeight: 22 },
    clarificationCard: {
  gap: 14,
  padding: 16,
  borderRadius: 8,
  backgroundColor: theme.surfaceMuted,
  borderWidth: 1,
  borderColor: theme.border,
},

clarificationTitle: {
  color: theme.primary,
  fontSize: 14,
  lineHeight: 21,
  fontWeight: '700',
},

clarificationQuestion: {
  color: theme.text,
  fontSize: 17,
  lineHeight: 26,
  fontWeight: '700',
},

clarificationOptions: {
  gap: 10,
},

clarificationButton: {
  minHeight: 52,
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: theme.border,
  backgroundColor: theme.surface,
  justifyContent: 'center',
},

clarificationButtonText: {
  color: theme.text,
  fontSize: 14,
  lineHeight: 21,
  fontWeight: '600',
},
  }), [theme]);
  const [safety, setSafety] = useState<'none' | 'unsure' | 'hazard' | null>(null);
  const [hazards, setHazards] = useState<AsHazard[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [needsNewAnalysis, setNeedsNewAnalysis] = useState(false);
  const [record, setRecord] = useState<AsAnalysisRecord | null>(null);
  const [policyAnswer, setPolicyAnswer] = useState<AnalysisResult | null>(null);
  const analysisId = useRef<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const safetyPreview = inputSafetyResult({ description, categories, symptoms, safety_answer: safety ?? 'unsure', hazards, media: [], consent_version: AS_CONSENT_VERSION });
  const actionLabel = busy ? progress || '답변 준비 중...' : needsNewAnalysis ? '새 분석으로 질문하기' : error ? '다시 질문하기' : '질문하기';
  const clarification =
  record?.result?.recommended_action === 'needs_more_info'
    ? record.result.clarification ?? null
    : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false); }; }, [onBusy]);

  const invalidate = () => { analysisId.current = null; setRecord(null); setPolicyAnswer(null); setError(''); setNeedsNewAnalysis(false); onResult(null); };
  const analyze = async () => {
    if (locked.current || disabled || skipAI) return;
    if (!description.trim() && !symptoms.length) { setError('증상을 선택하거나 간단히 입력해 주세요.'); return; }
    // 위험 징후는 로그인/외부 AI 응답을 기다리지 않고 정적 안전 안내로 분기한다.
    if (safetyPreview) { setPolicyAnswer(safetyPreview); onResult(null); setError(''); onAnswered(); return; }
    if (!user) { router.push('/login?redirect=/estimate/create' as any); return; }
    if (!safety || (safety === 'hazard' && !hazards.length)) { setError('위험 여부와 해당 분야를 선택해 주세요.'); return; }
    if (!consent) { setError('증상과 첨부파일(선택)의 AI 전송에 동의해 주세요.'); return; }
    Keyboard.dismiss();
    locked.current = true;
    setBusy(true); onBusy(true); setError('');
    try {
      // New drafts do not spend an answer allowance, but may call the provider.
      // Restart only on an explicit press, never automatically after exhaustion.
      if (needsNewAnalysis) invalidate();
      if (analysisId.current) {
        const previous = await getAnalysisStatus(analysisId.current).catch(() => null);
        if (!mounted.current) return;
        if (previous?.status === 'completed') {
          if (!previous.result) {
            throw new Error(
              '저장된 답변을 불러오지 못했습니다. 다시 질문하거나 상담을 요청해 주세요.',
            );
          }

          setRecord(previous);

          if (
            previous.result.recommended_action
              === 'needs_more_info'
          ) {
            onResult(null);
          } else {
            onResult(previous.id);
          }

          onAnswered();
          return;
        }
      }
      analysisId.current ??= Crypto.randomUUID();
      const next = await runAsAnalysis({
        id: analysisId.current, assets,
        input: { home_id: homeId ?? null, description, categories, symptoms, safety_answer: safety, hazards, consent_version: AS_CONSENT_VERSION },
        onProgress: value => { if (mounted.current) setProgress(value); },
      });
      if (mounted.current) {
        setRecord(next);
        if (
          next.status === 'completed'
          && next.result
        ) {
          if (
            next.result.recommended_action
              === 'needs_more_info'
          ) {
            onResult(null);
          } else {
            onResult(next.id);
          }

          onAnswered();
        }
        else { onResult(null); setError(next.error_message || '답변이 아직 완료되지 않았습니다. 잠시 후 다시 확인해 주세요.'); }
      }
    } catch (failure) {
      if (mounted.current) {
        const restart = failure instanceof AsAnalysisRequestError && failure.needsNewAnalysis;
        setNeedsNewAnalysis(restart);
        setError(restart ? '이 분석은 더 이상 재시도할 수 없습니다. 새 분석으로 질문해 주세요. 실패한 분석은 이용 횟수에 포함되지 않습니다.'
          : failure instanceof Error ? failure.message : '분석에 실패했습니다. 다시 시도해 주세요.');
      }
    } finally {
      locked.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  };
  const answerClarification = async (
  value: string,
) => {
  if (
    locked.current
    || busy
    || disabled
    || !analysisId.current
    || !clarification
  ) {
    return;
  }

  Keyboard.dismiss();

  locked.current = true;
  setBusy(true);
  onBusy(true);
  setError('');

  try {
    const next =
      await clarifyAsAnalysis({
        id:
          analysisId.current,

        value,

        onProgress:
          (label) => {
            if (mounted.current) {
              setProgress(label);
            }
          },
      });

    if (!mounted.current) {
      return;
    }

    setRecord(next);

    if (
      next.status === 'completed'
      && next.result
    ) {
      if (
        next.result.recommended_action
          === 'needs_more_info'
      ) {
        onResult(null);

        setError(
          '추가 확인 후에도 최종 분석을 완료하지 못했습니다. 상담을 요청해 주세요.',
        );

        return;
      }

      onResult(next.id);
      setError('');
      return;
    }

    onResult(null);

    setError(
      next.error_message
      || '최종 분석이 아직 완료되지 않았습니다. 다시 시도해 주세요.',
    );
  } catch (failure) {
    if (mounted.current) {
      setError(
        failure instanceof Error
          ? failure.message
          : '추가 답변을 반영하지 못했습니다. 다시 시도해 주세요.',
      );
    }
  } finally {
    locked.current = false;

    if (mounted.current) {
      setBusy(false);
      onBusy(false);
      setProgress('');
    }
  }
};

  return (
    <View style={[styles.root, (step === 'consult' || (skipAI && !safetyPreview)) && { display: 'none' }]} testID="as-analysis-panel">
      {step === 'question' ? <>
      {safetyPreview ? <AsAnalysisResult result={safetyPreview} /> : null}
      {!skipAI ? <>
      <View style={styles.row}><Ionicons name="scan-outline" size={22} color={theme.primary} /><Text style={styles.title}>AI 사전 분석</Text></View>
      <Text style={styles.text}>첨부 선택 · 사진 최대 5장 · 영상 1개, 60초 이하</Text>
      <Text style={styles.text}>분석 답변은 24시간 동안 5회까지 이용할 수 있으며, 실패한 분석은 차감되지 않습니다.</Text>
      <Text style={styles.label}>전기·가스·누전·벽 내부 배관·구조 균열·천장 누수·보일러 문제가 관련되어 있나요?</Text>
      <View style={styles.choices}>
        {([['none', '아니요'], ['hazard', '해당해요'], ['unsure', '잘 모르겠어요']] as const).map(([value, label]) => <TouchableOpacity key={value} style={styles.check} disabled={busy} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: safety === value }} onPress={() => { invalidate(); setSafety(value); setHazards([]); }}>
          <Ionicons name={safety === value ? 'radio-button-on' : 'radio-button-off'} size={21} color={theme.primary} /><Text style={styles.label}>{label}</Text>
        </TouchableOpacity>)}
      </View>
      {safety === 'hazard' ? <View style={styles.choices}>{Object.entries(AS_HAZARDS).map(([key, label]) => <TouchableOpacity key={key} style={styles.check} disabled={busy} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: hazards.includes(key as AsHazard) }} onPress={() => {
        invalidate(); setHazards(previous => previous.includes(key as AsHazard) ? previous.filter(item => item !== key) : [...previous, key as AsHazard]);
      }}><Ionicons name={hazards.includes(key as AsHazard) ? 'checkbox' : 'square-outline'} size={21} color={theme.primary} /><Text style={styles.label}>{label}</Text></TouchableOpacity>)}</View> : null}
      {!safetyPreview ? <>
      <TouchableOpacity style={styles.check} disabled={busy} accessibilityRole="checkbox" accessibilityLabel="AI 분석 전송 동의" accessibilityState={{ checked: consent }} aria-checked={consent} onPress={() => { invalidate(); setConsent(value => !value); }}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={theme.primary} />
        <Text style={styles.text}>증상과 첨부한 사진·영상을 AI 분석 서버로 전송하는 데 동의합니다.
  상담 단계의 연락처·주소는 AI 분석에 전송하지 않습니다.
  개인정보·민감정보·기밀정보가 없는 자료만 사용해 주세요.
  분석은 확정 진단이 아닙니다.</Text>
      </TouchableOpacity>
      <Text style={styles.text}>문의하지 않은 분석은 30일 보관 후 삭제합니다. 상담 요청 시 해당 문의의 담당자에게 분석 결과가 전달됩니다.</Text>
      </> : null}
      </> : null}
      {!skipAI ? <TouchableOpacity style={[styles.button, (busy || disabled) && { opacity: 0.6 }]} disabled={busy || disabled} accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ busy }} onPress={() => void analyze()}>
        {busy ? <ActivityIndicator color={theme.primaryText} /> : <Ionicons name={error ? 'refresh-outline' : 'scan-outline'} size={20} color={theme.primaryText} />}
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </TouchableOpacity> : null}
      {!skipAI && error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {!skipAI && error && analysisId.current && !needsNewAnalysis ? <TouchableOpacity style={styles.link} disabled={busy || disabled} accessibilityRole="button" accessibilityLabel="새 분석 준비" onPress={invalidate}><Ionicons name="refresh-outline" size={18} color={theme.primary} /><Text style={[styles.label, { color: theme.primary }]}>새 분석 준비</Text></TouchableOpacity> : null}
      {!skipAI && error ? <TouchableOpacity style={[styles.button, styles.secondary]} disabled={busy || disabled} accessibilityRole="button" accessibilityLabel="답변 없이 문의하기" onPress={() => { invalidate(); onConsult(); }}><Ionicons name="chatbubble-outline" size={19} color={theme.text} /><Text style={[styles.buttonText, { color: theme.text }]}>답변 없이 문의하기</Text></TouchableOpacity> : null}
      </> : null}
      {step === 'answer'
&& (record?.result || policyAnswer)
? (
  <>
    {clarification ? (
      <View style={styles.clarificationCard}>
        <Text style={styles.clarificationTitle}>
          한 가지만 더 확인해주세요
        </Text>

        <Text style={styles.clarificationQuestion}>
          {clarification.question}
        </Text>

        <View style={styles.clarificationOptions}>
          {clarification.options.map(
            (option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.clarificationButton,
                  busy && {
                    opacity: 0.6,
                  },
                ]}
                disabled={busy || disabled}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                onPress={() =>
                  void answerClarification(
                    option.value,
                  )
                }
              >
                <Text
                  style={
                    styles.clarificationButtonText
                  }
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </View>

        {busy ? (
          <View style={styles.row}>
            <ActivityIndicator
              color={theme.primary}
            />

            <Text style={styles.text}>
              {progress
                || '추가 답변을 분석하고 있어요...'}
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
      </View>
    ) : (
      <>
        <AsAnalysisResult
          result={
            (record?.result
              ?? policyAnswer)!
          }
        />

        {record?.id && record.result ? <NearbyAsPlaces analysisId={record.id} homeId={homeId} /> : null}

        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="문의하기"
          onPress={onConsult}
        >
          <Ionicons
            name="chatbubble-outline"
            size={19}
            color={theme.primaryText}
          />

          <Text style={styles.buttonText}>
            문의하기
          </Text>
        </TouchableOpacity>
      </>
    )}
  </>
) : null}
      {user ? <TouchableOpacity style={styles.link} accessibilityRole="button" onPress={() => router.push('/my/as-analyses' as any)}><Ionicons name="time-outline" size={18} color={theme.primary} /><Text style={[styles.label, { color: theme.primary }]}>내 분석 내역</Text></TouchableOpacity> : null}
    </View>
  );
}
