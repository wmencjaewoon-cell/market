export const ANIMAL_KEYWORDS = [
  '동물',
  '생물',
  '반려동물',
  '애완동물',
  '펫',

  '강아지',
  '개',
  '댕댕이',
  '멍멍이',
  '멍뭉이',
  '멈머',
  '강쥐',
  '퍼피',
  'puppy',
  'dog',
  'doggy',
  '애견',

  '고양이',
  '고냥이',
  '고냉이',
  '냥이',
  '냥냥이',
  '냐옹이',
  '야옹이',
  '괭이',
  '고앵이',
  '고먐미',
  '고영희',
  '키튼',
  'kitten',
  'cat',
  'kitty',
  '애묘',

  '햄스터',
  '토끼',
  '기니피그',
  '고슴도치',
  '페럿',
  '앵무새',
  '병아리',
  '거북이',
  '도마뱀',
  '파충류',
  '뱀',
  '이구아나',
  '개구리',
  '곤충',
  '사슴벌레',
  '장수풍뎅이',
  '물고기',
  '열대어',
  '금붕어',
  '구피',
  '베타',
  '새우',
  '활어',
];

export const ANIMAL_TRADE_KEYWORDS = [
  '분양',
  '입양',
  '무료분양',
  '책임분양',
  '책임비',
  '파양',
  '임보',
  '임시보호',
  '교배',
  '교배비',
  '짝짓기',
  '종견',
  '종묘',
  '혈통서',
  '가정분양',
  '개인분양',
  '새끼',
  '아가',
];

export const PROHIBITED_KEYWORDS = [
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

  '화약', '폭죽', '휘발유', '시너', '신나', '가스통', '위험물', '농약', '살충제',
  '총', '권총', '실탄', '도검', '칼', '석궁', '전기충격기',

  '군복', '경찰복', '소방복', '군용', '군마트', '진중문고',

  '정부지원물품', '혈액', '장기',
];

export const PROHIBITED_KEYWORD_ALIASES = [
  '댬배', '댐배', '땀배', '땸배', '담베', '담뱨',
  '전담', '전자담베', '전자댬배', '전자댐배',
  '액쌍', '액샹',
  '니코뛴', '니코틴액상',

  '술', '알콜', '알코올', '쏘주', '맥쥬', '위스키', '보드카',

  '민증', '주민증', '면허증',
  '대포통장', '대포계좌',

  '아이디거래', '아이디공유', '계정양도', '계정양수',

  '짭', '짭퉁', '레플', '이미테이션', '이미태이션',

  '처방전', '수면제', '스테로이드',
  '대마초', 'weed',

  '성인물', '야동',

  '고냥이', '고냉이', '냐옹이', '야옹이',
  '댕댕이', '멍멍이', '멍뭉이',
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_JUNG_COUNT = 21;
const HANGUL_JONG_COUNT = 28;

const FOLDED_CHO: Record<number, number> = {
  1: 0,
  4: 3,
  8: 7,
  10: 9,
  13: 12,
};

const FOLDED_JUNG: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  5: 4,
  6: 4,
  7: 4,
  12: 8,
  17: 13,
};

const DIRECT_ANIMAL_KEYWORDS = ANIMAL_KEYWORDS.filter(
  (keyword) => Array.from(normalize(keyword)).length > 1
);

function foldHangulForSearch(text: string) {
  return normalize(text)
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_BASE || code > HANGUL_END) return char;

      const offset = code - HANGUL_BASE;
      const cho = Math.floor(offset / (HANGUL_JUNG_COUNT * HANGUL_JONG_COUNT));
      const jung = Math.floor((offset % (HANGUL_JUNG_COUNT * HANGUL_JONG_COUNT)) / HANGUL_JONG_COUNT);
      const jong = offset % HANGUL_JONG_COUNT;
      const foldedCho = FOLDED_CHO[cho] ?? cho;
      const foldedJung = FOLDED_JUNG[jung] ?? jung;

      return String.fromCharCode(
        HANGUL_BASE +
          (foldedCho * HANGUL_JUNG_COUNT + foldedJung) * HANGUL_JONG_COUNT +
          jong
      );
    })
    .join('');
}

function getFuzzyKeywordDistance(keyword: string) {
  const length = Array.from(keyword).length;

  if (length <= 2) return 0;
  if (/^[a-z0-9]+$/.test(keyword) && length <= 4) return 0;
  if (length <= 4) return 1;
  return 2;
}

function getLevenshteinDistanceWithin(left: string, right: string, maxDistance: number) {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);

  if (Math.abs(leftChars.length - rightChars.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = rightChars.map((_, index) => index + 1);
  previous.unshift(0);

  for (let i = 0; i < leftChars.length; i += 1) {
    const current = [i + 1];
    let rowMin = current[0];

    for (let j = 0; j < rightChars.length; j += 1) {
      const cost = leftChars[i] === rightChars[j] ? 0 : 1;
      const distance = Math.min(
        previous[j + 1] + 1,
        current[j] + 1,
        previous[j] + cost
      );

      current[j + 1] = distance;
      rowMin = Math.min(rowMin, distance);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[rightChars.length] ?? maxDistance + 1;
}

function includesNearKeyword(text: string, keyword: string, maxDistance: number) {
  if (maxDistance <= 0) return false;

  const textChars = Array.from(text);
  const keywordLength = Array.from(keyword).length;
  const minLength = Math.max(1, keywordLength - maxDistance);
  const maxLength = keywordLength + maxDistance;

  for (let start = 0; start < textChars.length; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      if (start + length > textChars.length) continue;

      const candidate = textChars.slice(start, start + length).join('');
      if (getLevenshteinDistanceWithin(candidate, keyword, maxDistance) <= maxDistance) {
        return true;
      }
    }
  }

  return false;
}

function includesAny(text: string, keywords: string[]) {
  const foldedText = foldHangulForSearch(text);

  return keywords.find((keyword) => {
    const normalizedKeyword = normalize(keyword);
    const foldedKeyword = foldHangulForSearch(keyword);
    const fuzzyDistance = getFuzzyKeywordDistance(foldedKeyword);

    return (
      text.includes(normalizedKeyword) ||
      foldedText.includes(foldedKeyword) ||
      includesNearKeyword(foldedText, foldedKeyword, fuzzyDistance)
    );
  });
}

export function checkProhibitedContent(...values: Array<string | null | undefined>) {
  const text = normalize(values.filter(Boolean).join(' '));

  const directBlocked = includesAny(text, [
    ...PROHIBITED_KEYWORDS,
    ...PROHIBITED_KEYWORD_ALIASES,
    ...DIRECT_ANIMAL_KEYWORDS,
  ]);
  if (directBlocked) return directBlocked;

  const animalKeyword = includesAny(text, ANIMAL_KEYWORDS);
  const animalTradeKeyword = includesAny(text, ANIMAL_TRADE_KEYWORDS);

  if (animalKeyword && animalTradeKeyword) {
    return `${animalKeyword}/${animalTradeKeyword}`;
  }

  return undefined;
}
