import Ionicons from '@expo/vector-icons/Ionicons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';
import type { VoiceDescriptionInputProps } from './VoiceDescriptionInput';

function joinSpeech(base: string, speech: string) {
  return [base.trim(), speech.trim()].filter(Boolean).join(base.trim() ? ' ' : '');
}

export default function VoiceDescriptionInputNative({ value, disabled, onChangeText }: VoiceDescriptionInputProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    wrap: { gap: 9 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: { minHeight: 56, flex: 1, minWidth: 200, borderRadius: 14, backgroundColor: theme.primary, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    listening: { backgroundColor: theme.danger },
    buttonText: { color: theme.primaryText, fontSize: 16, fontWeight: '800' },
    cancel: { minHeight: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.border, justifyContent: 'center' },
    cancelText: { color: theme.text, fontWeight: '700' },
    status: { color: theme.textMuted, fontSize: 14, lineHeight: 21 },
    live: { color: theme.primary, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  }), [theme]);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('말한 내용은 음성 파일로 저장되지 않습니다.');
  const [liveText, setLiveText] = useState('');
  const [hasUsed, setHasUsed] = useState(false);
  const baseRef = useRef('');
  const latestRef = useRef('');
  const cancelledRef = useRef(false);

  useSpeechRecognitionEvent('start', () => { setListening(true); setMessage('듣고 있습니다... 천천히 말씀해 주세요.'); });
  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript?.trim() || '';
    latestRef.current = transcript;
    setLiveText(transcript);
    if (transcript) onChangeText(joinSpeech(baseRef.current, transcript));
  });
  useSpeechRecognitionEvent('error', event => {
    if (cancelledRef.current || event.error === 'aborted') return;
    latestRef.current = '';
    setLiveText('');
    onChangeText(baseRef.current);
    setMessage(event.error === 'no-speech' ? '말소리를 듣지 못했습니다. 다시 말하기를 눌러 주세요.' : '음성 인식에 실패했습니다. 기존 입력 내용은 유지했어요.');
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false); setHasUsed(true);
    if (!cancelledRef.current && latestRef.current) {
      onChangeText(joinSpeech(baseRef.current, latestRef.current));
      setMessage('변환된 문장을 확인하고 필요하면 수정해 주세요.');
    }
    cancelledRef.current = false;
  });

  const start = async () => {
    if (disabled) return;
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setMessage('이 기기에서는 음성 인식을 사용할 수 없습니다. 텍스트로 입력해 주세요.');
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) { setMessage('마이크와 음성 인식 권한을 허용해 주세요. 기존 입력 내용은 유지됩니다.'); return; }
    baseRef.current = value;
    latestRef.current = '';
    cancelledRef.current = false;
    setLiveText('');
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false, maxAlternatives: 1 });
  };

  const cancel = () => {
    cancelledRef.current = true;
    latestRef.current = '';
    setLiveText('');
    onChangeText(baseRef.current);
    setMessage('음성 입력을 취소했습니다. 기존 입력 내용은 유지했어요.');
    ExpoSpeechRecognitionModule.abort();
  };

  return <View style={styles.wrap}>
    <View style={styles.row}>
      <TouchableOpacity style={[styles.button, listening && styles.listening, disabled && { opacity: 0.55 }]} disabled={disabled} accessibilityRole="button" accessibilityLabel={listening ? '음성 인식 중지' : '말로 설명하기'} accessibilityState={{ busy: listening }} onPress={() => void start()}>
        <Ionicons name={listening ? 'stop-circle' : 'mic'} size={25} color={theme.primaryText} />
        <Text style={styles.buttonText}>{listening ? '듣기 중지' : hasUsed ? '다시 말하기' : '말로 설명하기'}</Text>
      </TouchableOpacity>
      {listening ? <TouchableOpacity style={styles.cancel} accessibilityRole="button" onPress={cancel}><Text style={styles.cancelText}>취소</Text></TouchableOpacity> : null}
    </View>
    <Text style={styles.status} accessibilityLiveRegion="polite">{message}</Text>
    {listening && liveText ? <Text style={styles.live}>인식 중: {liveText}</Text> : null}
  </View>;
}
