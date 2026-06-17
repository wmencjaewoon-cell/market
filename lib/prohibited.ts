export const PROHIBITED_KEYWORDS = [
  '동물', '강아지', '고양이', '분양', '입양',

  '담배', '전자담배', '액상', '니코틴',
  '주류', '소주', '맥주', '와인', '양주',

  '신분증', '주민등록증', '운전면허증', '여권',
  '통장', '계좌', '신용카드', '카드번호',
  '개인정보', '명의대여',

  '계정판매', '계정거래', '아이디판매', '아이디거래', '계정공유',

  '가품', '짝퉁', '레플리카', '위조', '상표권침해',
  '불법복제', '해킹', '도박',

  '의약품', '처방약', '전문의약품', '항생제',
  '의료기기', '콘택트렌즈', '렌즈', '도수안경',
  '마약', '대마', '필로폰',

  '청소년유해약물', '청소년유해매체물',
  '음란물',

  '티켓양도금지', '거래금지티켓',

  '거래금지식품', '거래금지화장품',

  '화약', '폭죽', '휘발유', '시너', '가스통', '위험물', '농약', '살충제',
  '총', '권총', '실탄', '도검', '칼', '석궁', '전기충격기',

  '군복', '경찰복', '소방복', '군용', '군마트', '진중문고',

  '정부지원물품', '혈액', '장기',
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

export function checkProhibitedContent(...values: Array<string | null | undefined>) {
  const text = normalize(values.filter(Boolean).join(' '));

  return PROHIBITED_KEYWORDS.find((keyword) =>
    text.includes(normalize(keyword))
  );
}
