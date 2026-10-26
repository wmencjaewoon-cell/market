import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import { SHOW_AS_AI_ANALYSIS } from '../lib/appMode';
import type { AsAnalysisResult as AnalysisResult } from '../lib/asAnalysis';
import { supabase } from '../lib/supabase';
import AsAnalysisResult from './AsAnalysisResult';

// Query only when inquiry details are open; deployment without the optional migration remains usable.
export default function InquiryAsAnalysis({ requestId }: { requestId: number }) {
  const { user } = useAuth();
  const theme = useAppTheme();
  const [data, setData] = useState<{ userId: string; requestId: number; result: AnalysisResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!SHOW_AS_AI_ANALYSIS || !user) return;
    let active = true;
    setLoading(true); setError(false); setData(null);
    void supabase.from('as_ai_analyses').select('result').eq('linked_request_id', requestId).eq('status', 'completed').maybeSingle()
      .then(({ data: row, error: failure }) => {
        if (!active) return;
        setLoading(false);
        if (failure) { setError(!['42P01', 'PGRST205'].includes(failure.code)); return; }
        if (row?.result) setData({ userId: user.id, requestId, result: row.result as AnalysisResult });
      });
    return () => { active = false; };
  }, [requestId, revision, user]);
  if (!SHOW_AS_AI_ANALYSIS) return null;
  if (loading) return <ActivityIndicator color={theme.primary} accessibilityLabel="AI 분석 결과 불러오는 중" />;
  if (error) return <TouchableOpacity accessibilityRole="button" onPress={reload} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.text }}>AI 분석 결과 다시 불러오기</Text></TouchableOpacity>;
  return data?.userId === user?.id && data?.requestId === requestId ? <View><AsAnalysisResult result={data.result} /></View> : null;
}
