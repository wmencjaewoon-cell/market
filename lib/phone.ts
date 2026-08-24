export function normalizePersonalPhone(value: string) {
  const digits = value.replace(/[^0-9]/g, '');

  if (digits.startsWith('8210')) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

export function isValidPersonalPhone(value: string) {
  return /^010\d{8}$/.test(normalizePersonalPhone(value));
}

export function getPersonalPhoneValidationMessage(value: string) {
  if (!value.trim()) return '전화번호를 입력해 주세요.';
  if (!isValidPersonalPhone(value)) {
    return '개인 전화번호는 01012341234 형식의 휴대폰 번호로 입력해 주세요.';
  }

  return '';
}
