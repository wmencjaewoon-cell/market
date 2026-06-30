import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const UPDATED_AT = '2026년 6월 30일';
const CONTACT_EMAIL = 'wmenc.jaewoon@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.bodyText}>{children}</Text>
    </View>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.bulletList}>
        {items.map((item) => (
          <Text key={item} style={styles.bulletText}>
            {'\u2022'} {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function PrivacyPolicyContent() {
  const openEmail = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>개인정보처리방침</Text>
      <Text style={styles.updated}>시행일: {UPDATED_AT}</Text>

      <Section title="1. 총칙">
        인테리어마켓은 이용자의 개인정보를 안전하게 보호하기 위해 관련 법령을 준수하며,
        서비스 제공에 필요한 범위에서만 개인정보를 수집하고 이용합니다. 본 방침은
        인테리어마켓 앱과 웹 서비스에 적용됩니다.
      </Section>

      <BulletSection
        title="2. 수집하는 개인정보"
        items={[
          '회원가입 및 로그인 정보: 이메일, 소셜 로그인 식별자, 이름 또는 닉네임, 프로필 사진, 휴대전화번호',
          '가게 회원 정보: 상호명, 전화번호, 가게 인증 여부, 사업자 인증을 위해 제출한 자료',
          '서비스 이용 정보: 게시글, 사진, 관심목록, 키워드 알림, 후기, 레벨 점수, 신고 및 차단 기록',
          '거래 및 소통 정보: 채팅 메시지, 거래완료 기록, 구매/판매 상대, 통화 상태, 알림 수신 기록',
          '위치 정보: 이용자가 설정한 지역, 거래 희망 장소, 지도 표시를 위해 입력하거나 선택한 위치 정보',
          '기기 및 접속 정보: 기기 정보, 앱 버전, OS, 접속 일시, 푸시 토큰, 오류 로그',
        ]}
      />

      <BulletSection
        title="3. 개인정보 수집 및 이용 목적"
        items={[
          '회원 식별, 로그인, 계정 관리, 탈퇴 및 복구 처리',
          '게시글 등록, 검색, 관심목록, 채팅, 후기, 거래완료 등 핵심 기능 제공',
          '지역 기반 게시글 노출, 거래 희망 장소 표시, 지도 기능 제공',
          '가게 인증, 전화 연결, 판매자 정보 표시 등 판매자 기능 제공',
          '푸시 알림, 채팅 알림, 관심 게시글 변경 알림, 후기 알림 제공',
          '신고 처리, 부정 이용 방지, 판매금지 품목 차단, 분쟁 대응, 서비스 안정성 개선',
        ]}
      />

      <BulletSection
        title="4. 보관 기간"
        items={[
          '회원 정보는 회원 탈퇴 시까지 보관하며, 탈퇴 요청 후 복구 가능 기간 및 법령상 보관 의무가 끝나면 삭제 또는 비식별 처리합니다.',
          '게시글, 사진, 채팅, 후기, 거래 기록은 서비스 운영, 분쟁 대응, 신고 처리에 필요한 기간 동안 보관될 수 있습니다.',
          '전자상거래, 소비자 보호, 통신비밀보호, 세법 등 관련 법령에서 정한 보관 기간이 있는 경우 해당 기간 동안 보관합니다.',
          '부정 이용, 신고, 제재 이력은 동일 또는 유사한 위반 방지를 위해 필요한 기간 동안 보관할 수 있습니다.',
        ]}
      />

      <BulletSection
        title="5. 제3자 제공 여부"
        items={[
          '인테리어마켓은 이용자의 개인정보를 원칙적으로 제3자에게 판매하거나 제공하지 않습니다.',
          '다만 이용자가 게시글, 프로필, 채팅, 전화번호 공개, 거래 희망 장소 등을 직접 공개하거나 상대방에게 전송한 정보는 해당 이용자 또는 상대방에게 표시될 수 있습니다.',
          '법령에 따른 요청, 수사기관의 적법한 절차, 이용자의 생명·신체·재산 보호가 필요한 경우에는 필요한 범위에서 제공될 수 있습니다.',
        ]}
      />

      <BulletSection
        title="6. 개인정보 처리위탁"
        items={[
          'Supabase: 회원 인증, 데이터베이스, 파일 저장소, Edge Function 운영',
          'Expo: 앱 빌드, 푸시 알림 토큰 및 알림 전송 기능',
          'Render: 웹 서비스 배포 및 서버 운영',
          'Apple, Kakao, Naver: 소셜 로그인 인증',
          'Google Maps 또는 지도 API 제공사: 지도 표시 및 위치 검색 기능',
          '위탁사는 서비스 제공에 필요한 범위에서만 정보를 처리하며, 처리 목적이 달성되면 관련 법령과 각 위탁사의 정책에 따라 보관 또는 삭제됩니다.',
        ]}
      />

      <BulletSection
        title="7. 위치정보 처리"
        items={[
          '위치정보는 지역 기반 게시글 노출, 거래 희망 장소 선택, 지도 표시, 거리 기반 탐색 기능을 위해 사용됩니다.',
          '정확한 위치 접근 권한이 필요한 기능은 이용자 동의 후 사용하며, 이용자는 기기 설정에서 위치 권한을 변경할 수 있습니다.',
          '게시글 또는 채팅에 직접 입력한 주소, 장소명, 좌표는 다른 이용자에게 표시될 수 있으므로 민감한 주소 공개에 주의해야 합니다.',
        ]}
      />

      <BulletSection
        title="8. 사진, 채팅, 게시글 처리"
        items={[
          '이용자가 등록한 게시글 사진과 내용은 거래 목적에 따라 다른 이용자에게 공개될 수 있습니다.',
          '채팅 메시지와 채팅 사진은 거래 협의, 신고 처리, 분쟁 대응, 부정 이용 방지를 위해 보관될 수 있습니다.',
          '판매금지 품목, 사기 의심, 개인정보 노출, 불법 정보가 포함된 게시글이나 채팅은 신고 또는 운영정책에 따라 숨김, 삭제, 이용 제한 처리될 수 있습니다.',
          '이용자가 삭제한 게시글 또는 사진은 서비스 화면에서 노출되지 않도록 처리되며, 백업, 로그, 법령상 보관 의무가 있는 정보는 일정 기간 남을 수 있습니다.',
        ]}
      />

      <BulletSection
        title="9. 탈퇴 및 삭제 방법"
        items={[
          '앱 또는 웹에서 내정보 > 회원탈퇴 메뉴를 통해 탈퇴를 요청할 수 있습니다.',
          '탈퇴 요청 후 복구 가능 기간 동안 계정이 제한될 수 있으며, 기간이 지나면 계정 정보가 삭제 또는 비식별 처리됩니다.',
          '게시글, 사진, 채팅, 후기 등 개별 콘텐츠 삭제가 필요한 경우 앱 내 삭제 기능 또는 문의 이메일을 통해 요청할 수 있습니다.',
          '법령상 보관 의무, 신고 처리, 분쟁 대응, 부정 이용 방지를 위해 필요한 정보는 해당 목적 달성 또는 보관 기간 종료 후 삭제됩니다.',
        ]}
      />

      <Section title="10. 이용자의 권리">
        이용자는 본인의 개인정보 열람, 정정, 삭제, 처리정지, 동의 철회를 요청할 수 있습니다.
        요청은 앱 내 기능 또는 문의 이메일을 통해 접수할 수 있으며, 본인 확인 후 관련 법령에
        따라 처리합니다.
      </Section>

      <Section title="11. 문의">
        개인정보 보호, 탈퇴, 데이터 삭제, 신고 및 분쟁 관련 문의는 아래 이메일로 접수해 주세요.
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
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 48,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '900',
  },
  updated: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 13,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  bodyText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 24,
  },
  bulletList: {
    gap: 7,
  },
  bulletText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 24,
  },
  contactBtn: {
    marginTop: 20,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  contactBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
});
