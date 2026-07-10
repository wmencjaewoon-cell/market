export const STORE_CATEGORY_OPTIONS = [
  '전체',
  '인테리어',
  '자재',
  '타일',
  '도배',
  '장판',
  '욕실',
  '주방',
  '전기/조명',
  '철거',
  '목공',
  '필름',
  '가구제작',
  '부분수리',
  '기타',
];

export const STORE_CATEGORY_SELECT_OPTIONS = STORE_CATEGORY_OPTIONS.filter(
  (item) => item !== '전체'
);

export function normalizeStoreCategory(category?: string | null) {
  return category?.trim() || null;
}

export function getStoreCategoryLabel(category?: string | null) {
  return normalizeStoreCategory(category) || '업종 미등록';
}
