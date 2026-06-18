import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const UPDATED_AT = '2026년 6월 18일';
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

export default function OperationPolicyScreen() {
  const openEmail = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>운영정책</Text>
      <Text style={styles.updated}>시행일: {UPDATED_AT}</Text>

      <Section title="1. 기본 원칙">
        이 운영정책은 중고 물품거래, 인테리어 자재거래, 채팅, 계좌 송금, 위치기반 거래,
        전화, 보이스톡, 영상통화 기능을 안전하게 운영하기 위한 기준입니다. 이용자는
        법령, 이용약관, 개인정보처리방침, 본 운영정책을 준수해야 하며, 운영자는 안전한
        거래 환경을 위해 게시글, 채팅, 계정, 통화 기능의 이용을 제한할 수 있습니다.
      </Section>

      <BulletSection
        title="2. 판매금지 품목"
        items={[
          '법령상 개인 간 거래 또는 온라인 판매가 금지되거나 제한된 물품은 등록할 수 없습니다.',
          '의약품, 처방약, 의료기기, 콘택트렌즈, 도수 안경 등 건강·의료 관련 제한 물품은 거래할 수 없습니다.',
          '담배, 전자담배, 니코틴 액상, 주류, 마약류, 환각물질, 청소년유해약물은 거래할 수 없습니다.',
          '총포, 도검, 전기충격기, 실탄, 폭죽, 화약, 위험물, 고압가스, 인화성 물질 등 안전 위해 물품은 거래할 수 없습니다.',
          '신분증, 계좌, 통장, 카드, 개인정보, 계정, 인증수단, 명의 대여 등 권리·신원 거래는 금지됩니다.',
          '위조품, 가품, 불법 복제물, 저작권·상표권 침해 물품, 도난품, 분실물은 거래할 수 없습니다.',
          '동물, 입양·분양 목적 게시글, 청소년에게 유해한 매체물 또는 성적 서비스 관련 게시글은 금지됩니다.',
        ]}
      />

      <BulletSection
        title="3. 자재 거래 제한 품목"
        items={[
          '인테리어 자재라도 오남용, 흡입, 화재, 폭발, 중독 위험이 있는 물품은 제한 품목으로 관리합니다.',
          '본드, 강력접착제, 순간접착제, 신나, 시너, 희석제, 락카, 래커, 페인트, 방수제, 용제, 세척제, 휘발성 화학제품은 제품명, 성분, 용도, 밀봉 상태, 유통기한, 안전표시가 명확해야 합니다.',
          '환각물질 또는 청소년유해약물로 오남용될 우려가 있는 본드, 신나, 접착제, 부탄가스, 휘발성 용제류는 개인 간 거래를 제한하거나 삭제할 수 있습니다.',
          '개봉품, 소분품, 라벨 훼손품, 성분 미상 제품, 사용기한 경과 제품, 누액·파손 제품, 보관 상태가 불명확한 화학 자재는 등록할 수 없습니다.',
          '사업자·가게 판매자는 관련 법령상 판매 자격, 안전보건자료, 표시사항, 보관·배송 기준을 준수해야 하며 운영자는 증빙을 요청할 수 있습니다.',
          '운영자는 신고, 키워드 탐지, 사진 확인, 거래 정황에 따라 게시글을 임시 숨김 처리하거나 추가 확인 전까지 채팅·판매 처리를 제한할 수 있습니다.',
        ]}
      />

      <BulletSection
        title="4. 청소년 보호정책"
        items={[
          '청소년에게 유해한 물품, 약물, 매체물, 서비스, 장소, 거래 제안은 금지됩니다.',
          '본드, 신나, 부탄가스, 휘발성 접착제 등 흡입·오남용 우려 물품은 청소년 거래가 금지되며, 청소년 접근 가능성이 있으면 게시가 제한될 수 있습니다.',
          '청소년을 대상으로 한 계좌 대여, 대리구매, 인증 대행, 위험 자재 운반 요청, 부적절한 채팅 또는 통화는 즉시 제한될 수 있습니다.',
          '운영자는 청소년 보호를 위해 검색어 차단, 게시글 삭제, 채팅 제한, 신고 접수, 수사기관 협조 등의 조치를 할 수 있습니다.',
        ]}
      />

      <BulletSection
        title="5. 채팅·통화 이용정책"
        items={[
          '채팅, 전화, 보이스톡, 영상통화는 거래 협의와 안전 확인 목적에 한해 사용할 수 있습니다.',
          '욕설, 협박, 성희롱, 스토킹, 개인정보 요구, 외부 결제 유도, 사기성 링크 전송, 판매금지 품목 거래 제안은 금지됩니다.',
          '통화와 영상통화 이용 시 마이크·카메라 권한이 필요하며, 상대방 동의 없이 통화 내용을 녹음·녹화·유포해서는 안 됩니다.',
          '가게 판매자의 공개 전화번호로 연결되는 전화와 앱 내 보이스톡·영상통화는 별도 기능이며, 이용자는 통신요금 또는 데이터 사용량이 발생할 수 있습니다.',
          '운영자는 신고된 채팅·통화 정황, 계좌 송금 유도, 위험 품목 거래 제안이 확인되면 이용을 제한할 수 있습니다.',
        ]}
      />

      <BulletSection
        title="6. 계좌 송금 주의 정책"
        items={[
          '서비스는 거래 당사자 간 송금을 중개하거나 보증하지 않습니다. 계좌 송금은 이용자 본인 책임으로 진행됩니다.',
          '선입금, 예약금, 택배비, 보증금, 추가금 요청은 사기 위험이 있으므로 거래 전 판매자 정보, 물품 상태, 거래 장소, 환불 조건을 확인해야 합니다.',
          '계좌번호, 예금주, 연락처 등 금융정보는 필요한 범위에서만 공유해야 하며, 타인의 계좌 대여, 대포통장 의심 거래, 환전·현금화 요구는 금지됩니다.',
          '고가 거래, 자재 대량 거래, 사업자 거래는 세금계산서, 사업자 정보, 실제 재고, 배송·반품 조건을 확인한 뒤 진행해야 합니다.',
          '사기 의심 정황이 있으면 송금 전 신고하고 거래를 중단해야 하며, 운영자는 계좌 송금 메시지와 신고 내용을 바탕으로 이용 제한을 할 수 있습니다.',
        ]}
      />

      <BulletSection
        title="7. 위치기반 거래정책"
        items={[
          '위치 정보는 동네 기반 게시글 노출, 거래 희망 장소 선택, 지도 표시를 위해 사용됩니다.',
          '정확한 집 주소, 현관 비밀번호, 사무실 내부 위치 등 민감한 위치 정보는 공개 게시글이나 채팅에 공유하지 않는 것을 권장합니다.',
          '거래는 사람이 많은 공개 장소에서 진행하고, 야간·외진 장소·위험 자재 운반이 필요한 장소는 피해야 합니다.',
          '타인의 위치를 추적하거나 거래 목적과 무관하게 위치 정보를 요구하는 행위는 금지됩니다.',
        ]}
      />

      <BulletSection
        title="8. 사업자·가게 판매자 정책"
        items={[
          '가게 판매자는 실제 사업자 정보, 상호, 연락처, 판매 물품 정보를 정확하게 등록해야 합니다.',
          '사업자 인증 정보가 허위이거나 타인의 정보를 사용한 경우 가게 표시, 전화 공개, 게시글 등록, 채팅 이용이 제한될 수 있습니다.',
          '가게 판매자는 표시·광고, 가격, 재고, 하자, 배송, 교환·환불, 세금 처리, 안전표시 의무를 준수해야 합니다.',
          '자재, 화학제품, 전기·가스·소방 관련 물품 등 전문성이 필요한 품목은 관련 자격, 안전기준, 판매 제한 여부를 확인해야 합니다.',
          '대량 재고, 시공 연계, 외부 계약 유도, 반복 광고성 게시글은 운영자 검수 또는 광고 정책 적용 대상이 될 수 있습니다.',
        ]}
      />

      <BulletSection
        title="9. 신고 및 제재 정책"
        items={[
          '이용자는 사기 의심, 판매금지 품목, 청소년 유해 거래, 욕설·협박, 개인정보 침해, 부적절한 통화·채팅을 신고할 수 있습니다.',
          '신고가 접수되면 운영자는 게시글, 채팅, 통화 상태, 계정 정보, 거래 정황을 검토할 수 있습니다.',
          '신고 누적 또는 중대한 위반이 확인되면 경고, 게시글 숨김·삭제, 채팅 제한, 통화 제한, 등록 제한, 계정 정지, 영구 이용제한이 적용될 수 있습니다.',
          '신고 누적 기준은 서비스 안전을 위해 운영자가 조정할 수 있으며, 허위 신고 또는 보복성 신고도 제재 대상입니다.',
          '법령 위반, 청소년 위해, 생명·신체 위험, 금융사기, 개인정보 침해가 의심되는 경우 운영자는 관계기관 신고 또는 자료 보존 조치를 할 수 있습니다.',
        ]}
      />

      <Section title="10. 정책 변경 및 문의">
        운영정책은 법령, 앱 기능, 심사 기준, 거래 위험 변화에 따라 변경될 수 있습니다. 변경사항은
        앱 내 공지 또는 정책 화면을 통해 안내합니다. 정책 문의와 이의제기는 아래 이메일로 접수해
        주세요.
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
  bulletList: {
    gap: 8,
  },
  bulletText: {
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
