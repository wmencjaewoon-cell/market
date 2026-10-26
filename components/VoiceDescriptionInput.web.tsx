import Ionicons from '@expo/vector-icons/Ionicons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';
import type { VoiceDescriptionInputProps } from './VoiceDescriptionInput';

function joinSpeech(base: string, speech: string) {
  return [base.trim(), speech.trim()].filter(Boolean).join(base.trim() ? ' ' : '');
}

export default function VoiceDescriptionInputWeb({ value, disabled, onChangeText }: VoiceDescriptionInputProps) {
  const theme = useAppTheme();
  const available = typeof window !== 'undefined' && ExpoSpeechRecognitionModule.isRecognitionAvailable();
  const styles = useMemo(() => StyleSheet.create({
    wrap: { gap: 8 },
    button: { minHeight: 56, borderRadius: 14, backgroundColor: theme.primary, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', padding: 14 },
    active: { backgroundColor: theme.danger },
    buttonText: { color: theme.primaryText, fontSize: 16, fontWeight: '800' },
    status: { color: theme.textMuted, fontSize: 14, lineHeight: 21 },
  }), [theme]);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState(available ? '말한 내용은 음성 파일로 저장되지 않습니다.' : '이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력해 주세요.');
  const baseRef = useRef('');
  const latestRef = useRef('');
  useSpeechRecognitionEvent('start', () => { setListening(true); setMessage('듣고 있습니다... 다시 누르면 중지합니다.'); });
  useSpeechRecognitionEvent('result', event => { const text = event.results[0]?.transcript?.trim() || ''; latestRef.current = text; if (text) onChangeText(joinSpeech(baseRef.current, text)); });
  useSpeechRecognitionEvent('error', () => { latestRef.current = ''; onChangeText(baseRef.current); setMessage('음성 인식에 실패했습니다. 기존 입력 내용은 유지했어요.'); });
  useSpeechRecognitionEvent('end', () => { setListening(false); if (latestRef.current) setMessage('변환된 문장을 확인하고 필요하면 수정해 주세요.'); });
  const toggle = async () => {
    if (!available || disabled) return;
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) { setMessage('브라우저의 마이크 권한을 허용해 주세요.'); return; }
    baseRef.current = value; latestRef.current = '';
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false, maxAlternatives: 1 });
  };
  if (!available) return <Text style={styles.status}>{message}</Text>;
  return <View style={styles.wrap}><TouchableOpacity style={[styles.button, listening && styles.active]} disabled={disabled} accessibilityRole="button" onPress={() => void toggle()}><Ionicons name={listening ? 'stop-circle' : 'mic'} size={25} color={theme.primaryText} /><Text style={styles.buttonText}>{listening ? '듣기 중지' : '말로 설명하기'}</Text></TouchableOpacity><Text style={styles.status} accessibilityLiveRegion="polite">{message}</Text></View>;
}
