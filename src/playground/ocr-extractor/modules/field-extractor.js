import { unique } from "./utils.js";

export const fieldDefinitions = {
  emails: { label: "Emails", hint: "문의, 계정, 담당자 이메일" },
  phones: { label: "Phones", hint: "휴대폰, 대표번호, 유선번호" },
  urls: { label: "URLs", hint: "웹사이트, 링크, 추적 URL" },
  dates: { label: "Dates", hint: "작성일, 결제일, 만기일 후보" },
  amounts: { label: "Amounts", hint: "금액, 통화, 원화 표기" },
  businessNumbers: { label: "Business IDs", hint: "사업자등록번호 후보" },
  personalIds: { label: "Masked IDs", hint: "주민등록번호 형태는 마스킹" },
  postalCodes: { label: "Postal Codes", hint: "5자리 우편번호 후보" },
  addresses: { label: "Addresses", hint: "도로명/지번 주소 후보" },
  bankAccounts: { label: "Bank Accounts", hint: "계좌번호처럼 보이는 숫자열" },
  cardNumbers: { label: "Cards", hint: "카드번호는 일부 마스킹" },
  documentNumbers: { label: "Document Nos.", hint: "주문, 송장, 청구서 번호" },
};

function maskPersonalId(value) {
  return value.replace(/(\d{6})[-\s]?(\d)\d{6}/g, "$1-$2******");
}

function normalizeDigits(value) {
  return String(value).replace(/\D/g, "");
}

function isLikelyCardNumber(value) {
  const digits = normalizeDigits(value);
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function maskCardNumber(value) {
  const digits = normalizeDigits(value);
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function isLikelyBankAccount(value) {
  const digits = normalizeDigits(value);
  return digits.length >= 10 && digits.length <= 16 && !isLikelyCardNumber(value);
}

function cleanFieldValue(value) {
  return String(value).replace(/\s+/g, " ").replace(/[.,;:)\]]+$/g, "").trim();
}

function cleanAddressValue(value) {
  return cleanFieldValue(value).replace(/\s+(?:계좌|카드|사업자|주민|우편|전화|팩스|이메일|메일|URL|사이트|작성일|결제일|금액|invoice|order|receipt|po|주문|주문번호|송장|운송장|문서|청구서|영수증|접수|접수번호|예약|거래명세서).*$/i, "").trim();
}

function isBusinessNumber(value) {
  return /\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/.test(value);
}

function isLikelyPhone(value) {
  const digits = normalizeDigits(value);
  return /^01[016789]\d{7,8}$/.test(digits) ||
    /^821[016789]\d{7,8}$/.test(digits) ||
    /^02\d{7,8}$/.test(digits) ||
    /^0(?:[3-6][1-5]?|70|80)\d{7,8}$/.test(digits);
}

function isValidDate(value) {
  const digits = String(value).match(/\d+/g) || [];
  if (digits.length !== 3) return false;

  let year;
  let month;
  let day;
  if (digits[0].length === 4) {
    [year, month, day] = digits.map(Number);
  } else {
    [month, day, year] = digits.map(Number);
  }

  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isLikelyCardPattern(value) {
  const digits = normalizeDigits(value);
  return digits.length >= 13 && digits.length <= 19 && /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/.test(value);
}

function extractPostalCodes(normalized) {
  return unique([...normalized.matchAll(/\b\d{5}\b/g)]
    .filter((match) => !/\d{3}[-\s]?\d{2}[-\s]?$/.test(normalized.slice(Math.max(0, match.index - 8), match.index)))
    .map((match) => match[0]));
}

function extractDocumentNumbers(normalized) {
  const labeledPattern = /\b(?:invoice|order|receipt|po|no)\.?(?:\s+(?:no\.?|number))?(?:\s+|[#:\s]+)[A-Z0-9][A-Z0-9-]{3,}\b/gi;
  const koreanPattern = /(?:주문|송장|운송장|문서|청구서|영수증|접수|예약|거래명세서)\s*(?:번호|#|:)?\s*[A-Z0-9][A-Z0-9-]{3,}/gi;
  return unique([
    ...(normalized.match(labeledPattern) || []),
    ...(normalized.match(koreanPattern) || []),
  ])
    .map(cleanFieldValue)
    .filter((value) => /[\d-]/.test(value));
}

export function extractFields(text) {
  const normalized = text.replace(/\s+/g, " ");
  const addresses = unique(normalized.match(/(?:[가-힣]+(?:시|도)\s*)?[가-힣]+(?:시|군|구)\s+[가-힣0-9\s.-]+(?:로|길)\s?\d+(?:[-\d]*)?(?:\s?[가-힣A-Za-z0-9동호층\s.-]{0,24})?/g))
    .map(cleanAddressValue)
    .filter(Boolean);
  const cardNumbers = unique(normalized.match(/\b(?:\d[ -]?){13,19}\b/g))
    .filter(isLikelyCardNumber)
    .map(maskCardNumber);
  const bankAccounts = unique(normalized.match(/\b\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}(?:[-\s]\d{1,4})?\b/g))
    .filter(isLikelyBankAccount)
    .filter((value) => !isLikelyPhone(value))
    .filter((value) => !isBusinessNumber(value))
    .filter((value) => !isLikelyCardPattern(value));

  return {
    emails: unique(normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)),
    phones: unique(normalized.match(/(?:\+?82[-\s]?)?0?1[016789][-\.\s]?\d{3,4}[-\.\s]?\d{4}|\d{2,3}[-\.\s]?\d{3,4}[-\.\s]?\d{4}/g)).filter(isLikelyPhone),
    urls: unique(normalized.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi)),
    dates: unique(normalized.match(/\d{4}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?|\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/g)).filter(isValidDate),
    amounts: unique(normalized.match(/(?:KRW|USD|₩|\$)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:원|달러|만원|억원)/gi)).map(cleanFieldValue),
    businessNumbers: unique(normalized.match(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g)),
    personalIds: unique((normalized.match(/\b\d{6}[-\s]?\d{7}\b/g) || []).map(maskPersonalId)),
    postalCodes: extractPostalCodes(normalized),
    addresses,
    bankAccounts,
    cardNumbers: unique(cardNumbers),
    documentNumbers: extractDocumentNumbers(normalized),
  };
}
