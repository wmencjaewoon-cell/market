import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const UPDATED_AT = '2026년 6월 9일';
const CONTACT_EMAIL = 'wmenc.jaewoon@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.bodyText}>{children}</Text>
    </View>
  );
}

export default function TermsScreen() {
  const openEmail = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>이용약관</Text>
      <Text style={styles.updated}>시행일: {UPDATED_AT}</Text>

      <Section title="1. 서비스 목적">
        이 서비스는 인테리어 자재, 물품, 나눔, 구해요 게시글을 등록하고 이용자 간
        거래와 소통을 돕는 중개 플랫폼입니다.
      </Section>

      <Section title="2. 회원의 책임">
        회원은 정확한 정보를 입력해야 하며, 본인이 작성한 게시글, 채팅, 거래 행위에
        대한 책임을 집니다. 타인의 권리를 침해하거나 허위 정보를 등록해서는 안 됩니다.
      </Section>

      <Section title="3. 거래 책임">
        실제 거래는 이용자 간 직접 진행됩니다. 거래 전 물품 상태, 수량, 가격, 장소,
        결제 방식을 충분히 확인해야 하며, 거래 과정에서 발생하는 분쟁은 거래 당사자가
        우선 해결해야 합니다.
      </Section>

      <Section title="4. 금지 행위">
        사기, 허위 매물, 불법 물품 거래, 욕설과 협박, 스팸, 광고성 도배, 타인의
        개인정보 무단 공개, 서비스 운영을 방해하는 행위는 금지됩니다.
      </Section>

      <Section title="5. 게시글과 채팅 관리">
        운영자는 신고, 법령 위반, 서비스 정책 위반이 확인된 게시글, 채팅, 계정에 대해
        노출 제한, 삭제, 이용 제한 등의 조치를 할 수 있습니다.
      </Section>

      <Section title="6. 가게 인증">
        가게 회원은 사업자 정보 등 인증에 필요한 정보를 제출할 수 있습니다. 인증 정보가
        허위로 확인되면 가게 표시 또는 서비스 이용이 제한될 수 있습니다.
      </Section>

      <Section title="7. 약관 변경">
        약관이 변경되는 경우 공지사항 등을 통해 안내합니다. 변경 이후 서비스를 계속
        이용하면 변경된 약관에 동의한 것으로 볼 수 있습니다.
      </Section>

      <Section title="8. 문의">
        약관과 서비스 이용 관련 문의는 아래 이메일로 접수해 주세요.
      </Section>

      <TouchableOpacity style={styles.contactBtn} onPress={openEmail}>
        <Text style={styles.contactBtnText}>{CONTACT_EMAIL}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  updated: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 13,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  bodyText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 24,
  },
  contactBtn: {
    marginTop: 18,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  contactBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
