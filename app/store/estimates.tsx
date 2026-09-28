// 견적/고객관리 화면: 견적문의 목록, 견적서 작성/저장/PDF, 현장 전환을 처리한다.
// 견적 원본 요청과 업체가 작성하는 견적서는 분리되어 있으므로 저장 테이블을 섞지 않는다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { decode } from 'base64-arraybuffer';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import AttachmentGallery from '../../components/AttachmentGallery';
import { isVideoAttachment } from '../../lib/mediaAttachments';
import {
  DEFAULT_STORE_LIMITS,
  getPlanLabel,
  getStoreSubscriptionLimits,
  type StoreSubscriptionLimits,
} from '../../lib/storeLimits';
import { getMyStoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

type CustomerStatus =
  | 'new'
  | 'consulting'
  | 'estimating'
  | 'contracted'
  | 'construction'
  | 'completed'
  | 'closed';

type EstimateFilter = CustomerStatus | 'all';

const ATTACHMENT_BUCKET = 'estimate-quote-attachments';

const STATUS_OPTIONS: { key: EstimateFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'new', label: '신규 문의' },
  { key: 'consulting', label: '상담중' },
  { key: 'estimating', label: '견적중' },
  { key: 'contracted', label: '계약완료' },
  { key: 'construction', label: '공사중' },
  { key: 'completed', label: '완료' },
  { key: 'closed', label: '종료' },
];

function getStatusLabel(status: CustomerStatus) {
  return STATUS_OPTIONS.find((item) => item.key === status)?.label || '신규 문의';
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9]/g, '')) || 0;
}

function formatAmount(value?: number | null) {
  const numberValue = Number(value || 0);
  if (!numberValue) return '';
  return numberValue.toLocaleString('ko-KR');
}

function getQuoteAmounts(draft: any) {
  const laborCost = parseAmount(draft?.laborCost || '');
  const materialCost = parseAmount(draft?.materialCost || '');
  const additionalCost = parseAmount(draft?.additionalCost || '');
  const depositAmount = parseAmount(draft?.depositAmount || '');
  const progressAmount = parseAmount(draft?.progressAmount || '');
  const totalAmount = laborCost + materialCost + additionalCost;
  const finalAmount = Math.max(totalAmount - depositAmount - progressAmount, 0);

  return {
    laborCost,
    materialCost,
    additionalCost,
    totalAmount,
    depositAmount,
    progressAmount,
    finalAmount,
  };
}

function sanitizeFileName(value?: string | null) {
  const baseName = (value || 'estimate-attachment').trim() || 'estimate-attachment';
  return baseName.replace(/[^\w.\-가-힣]/g, '_').slice(0, 80);
}

function getExtensionFromMime(mimeType?: string | null) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function getMimeFromName(name?: string | null, fallback = 'application/pdf') {
  const lowerName = (name || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

function getAttachmentIcon(fileType?: string | null) {
  if (fileType?.startsWith('image/')) return 'image-outline';
  return 'document-text-outline';
}

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return '';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.ceil(size / 1024)}KB`;
}

function escapeHtml(value?: string | number | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value?: string | null) {
  return escapeHtml(value || '').replace(/\n/g, '<br />');
}

function formatPdfMoney(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function buildEstimatePdfHtml({
  request,
  quote,
  draft,
  applicantName,
  applicantPhone,
  requestImages,
  attachments,
}: {
  request: any;
  quote: any;
  draft: any;
  applicantName: string;
  applicantPhone: string;
  requestImages: any[];
  attachments: any[];
}) {
  const amounts = getQuoteAmounts(draft);
  const quoteTitle = draft.quoteTitle || quote?.title || request?.title || '견적서';
  const createdAt = new Date().toLocaleString('ko-KR');
  const requestImageAttachments = requestImages.filter((item) => item.signedUrl && !isVideoAttachment(item.image_path || ''));
  const imageAttachments = attachments.filter(
    (item) => item.file_type?.startsWith('image/') && item.signedUrl
  );
  const fileAttachments = [
    ...attachments.filter((item) => !item.file_type?.startsWith('image/')),
    ...requestImages.filter((item) => item.signedUrl && isVideoAttachment(item.image_path || '')),
  ];
  const renderImageSection = (title: string, items: any[]) => {
    if (items.length === 0) return '';

    return `
        ${items.map((attachment, index) => `
          <section class="photo-page">
            <div class="photo-header">
              <h2>${escapeHtml(title)} <span class="section-count">${index + 1}/${items.length}</span></h2>
              ${attachment.file_name ? `<small>${escapeHtml(attachment.file_name)}</small>` : ''}
            </div>
            <div class="photo-frame">
              <img src="${escapeHtml(attachment.signedUrl)}" alt="${escapeHtml(attachment.file_name || `${title} ${index + 1}`)}" />
            </div>
          </section>
        `).join('')}
    `;
  };

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(quoteTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 10mm; }
    body { margin: 0; padding: 24px; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; }
    .page { max-width: 760px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.25; }
    h2 { margin: 28px 0 12px; font-size: 17px; border-bottom: 2px solid #111827; padding-bottom: 8px; }
    .section-count { color: #166534; font-size: 12px; font-weight: 900; margin-left: 4px; }
    .sub { color: #6b7280; font-size: 12px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
    .field { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; min-height: 58px; }
    .label { color: #6b7280; font-size: 11px; font-weight: 800; margin-bottom: 5px; }
    .value { font-size: 14px; font-weight: 800; line-height: 1.45; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: left; }
    th { background: #f9fafb; color: #374151; font-weight: 900; }
    td:last-child, th:last-child { text-align: right; }
    .total-row td { background: #ecfdf5; color: #14532d; font-weight: 900; }
    .text-box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; min-height: 48px; font-size: 13px; line-height: 1.6; }
    .photo-page { break-before: page; page-break-before: always; min-height: 920px; display: flex; flex-direction: column; }
    .photo-header { margin-bottom: 10px; }
    .photo-header h2 { margin-top: 0; }
    .photo-header small { display: block; color: #6b7280; font-size: 11px; font-weight: 700; word-break: break-word; }
    .photo-frame { flex: 1; min-height: 780px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb; padding: 6px; display: flex; align-items: center; justify-content: center; }
    .photo-frame img { width: 100%; height: 100%; max-height: 860px; object-fit: contain; display: block; border-radius: 8px; }
    .attach { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; margin-top: 8px; font-size: 13px; }
    a { color: #166534; font-weight: 800; word-break: break-all; }
    @media print {
      body { padding: 0; }
      .page { max-width: none; }
      h2 { break-after: avoid; page-break-after: avoid; }
      .photo-page { min-height: auto; height: 277mm; break-before: page; page-break-before: always; break-inside: avoid-page; page-break-inside: avoid; display: flex; flex-direction: column; }
      .photo-frame { flex: 1; min-height: 0; padding: 0; border: 0; background: #fff; }
      .photo-frame img { width: 100%; height: 100%; max-height: none; object-fit: contain; }
    }
  </style>
</head>
<body>
  <main class="page">
    <h1>${escapeHtml(quoteTitle)}</h1>
    <div class="sub">견적서 생성일 ${escapeHtml(createdAt)}</div>

    <section class="grid">
      <div class="field"><div class="label">견적문의 제목</div><div class="value">${escapeHtml(request?.title || '-')}</div></div>
      <div class="field"><div class="label">공사 종류</div><div class="value">${escapeHtml(request?.category || '-')}</div></div>
      <div class="field"><div class="label">지역</div><div class="value">${escapeHtml(request?.region || '-')}</div></div>
      <div class="field"><div class="label">주소</div><div class="value">${escapeHtml(request?.address || '-')}</div></div>
      <div class="field"><div class="label">희망 일정</div><div class="value">${escapeHtml(request?.desired_date || '미정')}</div></div>
      <div class="field"><div class="label">연락 방법</div><div class="value">${escapeHtml(request?.preferred_contact || '-')}</div></div>
      <div class="field"><div class="label">신청자 이름</div><div class="value">${escapeHtml(applicantName)}</div></div>
      <div class="field"><div class="label">신청자 전화번호</div><div class="value">${escapeHtml(applicantPhone)}</div></div>
    </section>

    <h2>견적 금액</h2>
    <table>
      <tbody>
        <tr><th>시공비</th><td>${formatPdfMoney(amounts.laborCost)}</td></tr>
        <tr><th>자재비</th><td>${formatPdfMoney(amounts.materialCost)}</td></tr>
        <tr><th>추가공사</th><td>${formatPdfMoney(amounts.additionalCost)}</td></tr>
        <tr class="total-row"><th>합계</th><td>${formatPdfMoney(amounts.totalAmount)}</td></tr>
        <tr><th>계약금</th><td>${formatPdfMoney(amounts.depositAmount)}</td></tr>
        <tr><th>중도금</th><td>${formatPdfMoney(amounts.progressAmount)}</td></tr>
        <tr class="total-row"><th>잔금</th><td>${formatPdfMoney(amounts.finalAmount)}</td></tr>
      </tbody>
    </table>

    <h2>견적문의 내용</h2>
    <div class="text-box">${nl2br(request?.description || '상세 내용 없음')}</div>

    <h2>추가공사 내역</h2>
    <div class="text-box">${nl2br(draft.additionalWork || '추가공사 내역 없음')}</div>

    <h2>상담 메모</h2>
    <div class="text-box">${nl2br(draft.memo || '상담 메모 없음')}</div>

    ${renderImageSection('문의 첨부 사진', requestImageAttachments)}
    ${renderImageSection('견적서 첨부 사진', imageAttachments)}

    <h2>첨부 파일</h2>
    ${fileAttachments.length === 0 ? '<div class="text-box">별도 파일 첨부 없음</div>' : ''}
    ${fileAttachments.map((attachment) => `
      <div class="attach">
        <div class="value">${escapeHtml(attachment.file_name || '첨부 파일')}</div>
        <div class="sub">${escapeHtml(attachment.file_type || '파일')} ${escapeHtml(formatFileSize(attachment.file_size))}</div>
        <a href="${escapeHtml(attachment.signedUrl)}">첨부 파일 열기</a>
      </div>
    `).join('')}
  </main>
</body>
</html>`;
}

async function readUploadBody(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return decode(base64);
}

/**
 * 견적 완료/삭제처럼 연결 데이터가 같이 바뀌는 작업 전에 확인을 받는다.
 * web은 Alert 버튼 스타일을 쓸 수 없으므로 window.confirm으로 같은 boolean 계약을 맞춘다.
 */
function confirmEstimateLifecycleAction(title: string, message: string, confirmText: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n${message}`));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: confirmText === '삭제' ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export default function StoreEstimatesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string; quoteId?: string; projectId?: string }>();

  // 이 화면은 대표/직원/현장 참여자가 모두 들어올 수 있다.
  // `effectiveStoreId`는 실제 견적서가 귀속되는 가게 id이고, readOnly는 협력업체/고객 조회용 진입을 구분한다.
  const [effectiveStoreId, setEffectiveStoreId] = useState<string | null>(null);
  const [isStoreOwner, setIsStoreOwner] = useState(false);
  const [canAssignStaff, setCanAssignStaff] = useState(false);
  const [estimateReadOnly, setEstimateReadOnly] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [activeStaffMembership, setActiveStaffMembership] = useState<any | null>(null);
  const [limits, setLimits] = useState<StoreSubscriptionLimits>(DEFAULT_STORE_LIMITS);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);

  // 요청 원본, 가게별 상태, 견적서, 첨부파일을 requestId 기준 map으로 들고 간다.
  // 목록과 상세가 같은 화면에 있어서 row 하나를 수정한 뒤 부분 갱신하기 쉽도록 분리했다.
  const [requests, setRequests] = useState<any[]>([]);
  const [statusRows, setStatusRows] = useState<Record<number, any>>({});
  const [quoteRows, setQuoteRows] = useState<Record<number, any>>({});
  const [attachmentRows, setAttachmentRows] = useState<Record<number, any[]>>({});

  // 사용자가 입력 중인 견적서 값은 저장 전 draft로 유지한다.
  // title/address를 빈칸으로 지우고 다시 입력하는 중에 서버값으로 복구되지 않게 draft를 별도 관리한다.
  const [quoteDrafts, setQuoteDrafts] = useState<Record<number, any>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<EstimateFilter>('new');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [uploadingAttachmentId, setUploadingAttachmentId] = useState<number | null>(null);
  const [convertingProjectId, setConvertingProjectId] = useState<number | null>(null);
  const [downloadingEstimateId, setDownloadingEstimateId] = useState<number | null>(null);
  const [openingChatId, setOpeningChatId] = useState<number | null>(null);
  const [completingEstimateId, setCompletingEstimateId] = useState<number | null>(null);
  const [deletingEstimateId, setDeletingEstimateId] = useState<number | null>(null);

  /**
   * 견적관리 화면에 필요한 원본 요청, 상태 row, 견적서 row, 첨부파일을 한 번에 구성한다.
   *
   * 진입 경로에 따라 동작이 달라진다.
   * - 일반 가게 진입: 해당 가게로 들어온 최근 문의 목록을 보여준다.
   * - requestId/quoteId 진입: 알림이나 채팅에서 특정 견적 상세를 바로 연다.
   * - projectId 진입: 현장에서 견적서 보기를 누른 경우라서 협력업체/고객은 readOnly로 본다.
   */
  const loadEstimates = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    let requestedRequestId = Number(params.requestId || 0);
    let requestedQuoteId = Number(params.quoteId || 0);
    const requestedProjectId = typeof params.projectId === 'string' ? params.projectId : '';

    const access = await getMyStoreAccessContext();
    const verifiedOwner = access.isStoreOwner;
    let nextEffectiveStoreId = access.storeUserId;
    const nextStaffMembership = access.membership;
    let nextEstimateReadOnly = false;
    let nextLinkedProjectId: string | null = null;

    // 현장 화면에서 들어온 경우, 현장 row가 어느 가게의 어떤 견적과 연결되는지 먼저 찾는다.
    // 이 값을 기준으로 requestId/quoteId를 보정해야 현장과 견적서가 서로 다른 row를 보지 않는다.
    if (requestedProjectId) {
      const { data: linkedProject, error: linkedProjectError } = await supabase
        .from('store_projects')
        .select('id, store_user_id, estimate_request_id, estimate_quote_id')
        .eq('id', requestedProjectId)
        .maybeSingle();
      if (linkedProject?.id) {
        nextLinkedProjectId = linkedProject.id;
        nextEffectiveStoreId = linkedProject.store_user_id || nextEffectiveStoreId;
        requestedRequestId = Number(linkedProject.estimate_request_id || requestedRequestId || 0);
        requestedQuoteId = Number(linkedProject.estimate_quote_id || requestedQuoteId || 0);
        nextEstimateReadOnly = !(
          access.storeUserId === linkedProject.store_user_id &&
          (access.canManageStore || access.isStaff)
        );
      }
    }

    // quoteId만 들어온 deep link는 requestId를 알 수 없으므로 견적서 row에서 역조회한다.
    if (!requestedRequestId && requestedQuoteId) {
      const { data: quoteLookup, error: quoteLookupError } = await supabase
        .from('estimate_quotes')
        .select('estimate_request_id, store_user_id')
        .eq('id', requestedQuoteId)
        .maybeSingle();
      if (quoteLookup?.estimate_request_id) {
        requestedRequestId = Number(quoteLookup.estimate_request_id);
        nextEffectiveStoreId = quoteLookup.store_user_id || nextEffectiveStoreId;
      }
    }

    const hasRequestedEstimate =
      (Number.isFinite(requestedRequestId) && requestedRequestId > 0) ||
      (Number.isFinite(requestedQuoteId) && requestedQuoteId > 0);
    const shouldShowStoreEstimateInbox = !nextEstimateReadOnly && !hasRequestedEstimate;

    setIsStoreOwner(verifiedOwner);
    setCanAssignStaff(access.canManageStore && !nextEstimateReadOnly);
    setActiveStaffMembership(nextStaffMembership);
    setEffectiveStoreId(nextEffectiveStoreId);
    setEstimateReadOnly(nextEstimateReadOnly);
    setLinkedProjectId(nextLinkedProjectId);

    if (!nextEffectiveStoreId) {
      setLimits(DEFAULT_STORE_LIMITS);
      setRequests([]);
      setStatusRows({});
      setQuoteRows({});
      setAttachmentRows({});
      setQuoteDrafts({});
      setAddressDrafts({});
      setStaffMembers([]);
      setLoading(false);
      return;
    }

    const nextLimits = nextEstimateReadOnly
      ? DEFAULT_STORE_LIMITS
      : await getStoreSubscriptionLimits(nextEffectiveStoreId);
    setLimits(nextLimits);

    // 담당자 배정 select는 대표/매니저만 전체 직원을 보고,
    // 일반 직원은 자기 멤버십만 사용한다. readOnly 사용자는 직원 목록을 볼 필요가 없다.
    if (!nextEstimateReadOnly && access.canManageStore) {
      const { data: staffData } = await supabase
        .from('store_staff_members')
        .select('id, store_user_id, staff_user_id, display_name, phone, position, role, status')
        .eq('store_user_id', nextEffectiveStoreId)
        .eq('status', 'active')
        .eq('role', 'staff')
        .order('display_name', { ascending: true });

      setStaffMembers(staffData || []);
    } else if (!nextEstimateReadOnly) {
      setStaffMembers(nextStaffMembership ? [nextStaffMembership] : []);
    } else {
      setStaffMembers([]);
    }

    let requestQuery = supabase
      .from('estimate_requests')
      .select(`
        *,
        profiles!estimate_requests_user_id_fkey (
          display_name,
          email,
          phone
        ),
        estimate_request_images (
          id,
          image_path,
          sort_order
        )
      `)
      .neq('status', 'hidden')
      .order('created_at', { ascending: false });

    if (Number.isFinite(requestedRequestId) && requestedRequestId > 0) {
      requestQuery = requestQuery.eq('id', requestedRequestId);
    } else if (shouldShowStoreEstimateInbox) {
      requestQuery = requestQuery.or(
        `assigned_store_user_id.eq.${nextEffectiveStoreId},preferred_store_user_id.eq.${nextEffectiveStoreId}`
      );
    }

    // 무료/베이직 제한은 여기서 목록 조회량을 줄이는 UI 제한이다.
    // 서버 RLS/RPC 제한과 함께 사용해야 하며, 클라이언트 limit만 보안 기준으로 보면 안 된다.
    if (nextLimits.estimateRecentLimit != null && !hasRequestedEstimate) {
      requestQuery = requestQuery.limit(nextLimits.estimateRecentLimit);
    }

    const { data: requestData, error } = await requestQuery;

    if (error) {      setRequests([]);
      setStatusRows({});
      setQuoteRows({});
      setAttachmentRows({});
      setQuoteDrafts({});
      setAddressDrafts({});
      setLoading(false);
      return;
    }

    const nextRequests = (requestData || []).map((item: any) => ({
      ...item,
      estimate_request_images: [...(item.estimate_request_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    setRequests(nextRequests);

    const requestIds = nextRequests.map((item: any) => Number(item.id));

    if (requestIds.length === 0) {
      setStatusRows({});
      setQuoteRows({});
      setAttachmentRows({});
      setQuoteDrafts({});
      setAddressDrafts({});
      setLoading(false);
      return;
    }

    const [statusResult, quoteResult] = await Promise.all([
      nextEstimateReadOnly
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('estimate_request_store_statuses')
            .select('*')
            .eq('store_user_id', nextEffectiveStoreId)
            .in('estimate_request_id', requestIds),
      supabase
        .from('estimate_quotes')
        .select(`
          *,
          estimate_quote_attachments (
            id,
            quote_id,
            file_path,
            file_name,
            file_type,
            file_size,
            created_at
          )
        `)
        .eq('store_user_id', nextEffectiveStoreId)
        .in('estimate_request_id', requestIds),
    ]);

    const nextStatuses = Object.fromEntries(
      (statusResult.data || []).map((item: any) => [Number(item.estimate_request_id), item])
    );
    const nextQuotes = Object.fromEntries(
      (quoteResult.data || []).map((item: any) => [Number(item.estimate_request_id), item])
    );
    const nextAttachments = Object.fromEntries(
      requestIds.map((requestId) => [
        requestId,
        [...(nextQuotes[requestId]?.estimate_quote_attachments || [])].sort(
          (a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ),
      ])
    );
    const nextAddressDrafts = Object.fromEntries(
      nextRequests.map((request: any) => [Number(request.id), request.address || ''])
    );

    // 서버 row를 화면 입력 draft로 변환한다.
    // 금액 input은 문자열이어야 사용자가 중간에 지우거나 쉼표 없는 값을 입력할 수 있다.
    setStatusRows(nextStatuses);
    setQuoteRows(nextQuotes);
    setAttachmentRows(nextAttachments);
    setAddressDrafts(nextAddressDrafts);
    setQuoteDrafts(
      Object.fromEntries(
        nextRequests.map((request: any) => {
          const requestId = Number(request.id);
          const quote = nextQuotes[requestId];
          return [
            requestId,
            {
              laborCost: formatAmount(quote?.labor_cost),
              materialCost: formatAmount(quote?.material_cost),
              additionalCost: formatAmount(quote?.additional_cost),
              depositAmount: formatAmount(quote?.deposit_amount),
              progressAmount: formatAmount(quote?.progress_amount),
              finalAmount: formatAmount(quote?.final_amount),
              quoteTitle: quote?.title ?? request.title ?? '',
              additionalWork: quote?.additional_work || '',
              memo: quote?.memo || '',
              pdfUrl: quote?.pdf_url || '',
            },
          ];
        })
      )
    );

    setLoading(false);
  }, [params.projectId, params.quoteId, params.requestId, user]);

  useEffect(() => {
    void loadEstimates();
  }, [loadEstimates]);

  // 알림이나 현장 화면에서 requestId/quoteId로 들어온 경우 목록 첫 화면을 건너뛰고 해당 상세를 연다.
  useEffect(() => {
    const requestedRequestId = Number(params.requestId || 0);
    if (Number.isFinite(requestedRequestId) && requestedRequestId > 0) {
      if (requests.some((item) => Number(item.id) === requestedRequestId)) {
        setSelectedRequestId(requestedRequestId);
      }
      return;
    }

    const requestedQuoteId = Number(params.quoteId || 0);
    if (!Number.isFinite(requestedQuoteId) || requestedQuoteId <= 0) return;

    const matchedQuote = Object.values(quoteRows).find(
      (quote: any) => Number(quote?.id) === requestedQuoteId
    );

    if (matchedQuote?.estimate_request_id) {
      setSelectedRequestId(Number(matchedQuote.estimate_request_id));
    }
  }, [params.quoteId, params.requestId, quoteRows, requests]);

  const canUseEstimates =
    estimateReadOnly || isStoreOwner || (!!activeStaffMembership && !!effectiveStoreId);
  const canEditEstimate = canUseEstimates && !estimateReadOnly;

  /**
   * 견적문의 목록 필터링이다.
   *
   * 상태 필터, 날짜 필터, 검색어를 동시에 적용한다. 검색 대상에는 제목/지역/주소/희망일정뿐 아니라
   * 신청자 이름/전화번호와 로그인 profile의 이름/전화번호도 포함해서 실제 업무에서 찾기 쉽게 한다.
   */
  const filteredRequests = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const selectedDate = dateFilter.trim();

    return requests.filter((item) => {
      const status = statusRows[Number(item.id)]?.status || 'new';
      if (filter !== 'all' && status !== filter) return false;

      if (selectedDate) {
        const createdDate = String(item.created_at || '').slice(0, 10);
        if (item.desired_date !== selectedDate && createdDate !== selectedDate) return false;
      }

      if (!keyword) return true;

      const requesterProfile = Array.isArray(item.profiles)
        ? item.profiles[0]
        : item.profiles;
      const searchTarget = [
        item.title,
        item.region,
        item.address,
        item.desired_date,
        item.preferred_contact,
        item.applicant_name,
        item.applicant_phone,
        requesterProfile?.display_name,
        requesterProfile?.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchTarget.includes(keyword);
    });
  }, [dateFilter, filter, requests, searchKeyword, statusRows]);

  // 상태 탭 배지에 표시할 건수를 계산한다. 상태 row가 아직 없으면 신규문의로 본다.
  const statusCounts = useMemo(() => {
    return requests.reduce<Record<string, number>>((acc, item) => {
      const status = statusRows[Number(item.id)]?.status || 'new';
      acc[status] = (acc[status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});
  }, [requests, statusRows]);

  // 상세가 선택되면 목록 대신 해당 견적 하나만 렌더링한다.
  // 뒤로가기를 누르면 selectedRequestId만 비워 다시 목록으로 돌아간다.
  const visibleRequests = useMemo(() => {
    if (!selectedRequestId) return filteredRequests;
    return requests.filter((item) => Number(item.id) === selectedRequestId);
  }, [filteredRequests, requests, selectedRequestId]);

  const isMissingRpcError = (error: any, functionName: string) => {
    const message = error?.message || '';
    return message.includes(functionName) || message.includes('schema cache');
  };

  /**
   * 견적서 변경사항을 연결된 현장 summary에 반영한다.
   *
   * 견적서가 현장 전환된 뒤에도 금액, 제목, 담당자, 메모를 수정할 수 있다.
   * 이때 현장관리 목록/상세/채팅 헤더가 예전 견적 정보를 계속 보여주지 않도록
   * 서버 RPC로 동기화하고, RPC가 아직 배포되지 않은 개발 DB에서는 fallback update를 수행한다.
   */
  const syncLinkedProjectFromQuote = async (quote: any, request: any) => {
    if (estimateReadOnly || !quote?.id) return;

    const { error: syncError } = await supabase.rpc('sync_project_from_estimate_quote', {
      p_quote_id: quote.id,
    });

    if (!syncError) return;

    if (!isMissingRpcError(syncError, 'sync_project_from_estimate_quote')) {
      throw syncError;
    }
    const { error: fallbackError } = await supabase
      .from('store_projects')
      .update({
        name: quote.title || request?.title || '견적서',
        address: request?.address || null,
        work_summary: quote.additional_work || request?.description || null,
        contract_amount: Number(quote.total_amount || 0),
        assigned_staff_user_id: request?.assigned_staff_user_id || null,
        memo: quote.memo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('estimate_quote_id', quote.id);

    if (fallbackError) {
      throw fallbackError;
    }
  };

  /**
   * 견적 제목을 요청/견적서/현장/채팅방에 같이 반영한다.
   *
   * 사용자는 "견적서 제목" 하나를 수정한다고 느끼지만 실제 DB에는
   * estimate_requests, estimate_quotes, store_projects, chat_rooms가 따로 존재한다.
   * 제목 동기화 RPC가 이 네 군데를 맞춰주며, 없을 때는 최소 요청/현장 row만 fallback으로 맞춘다.
   */
  const syncEstimateProjectTitle = async (requestId: number, title: string, quoteId?: number | null) => {
    if (!effectiveStoreId || estimateReadOnly) return;

    const nextTitle = title.trim();
    if (!nextTitle) return;

    const { error: titleSyncError } = await supabase.rpc('update_estimate_project_title', {
      p_estimate_request_id: requestId,
      p_store_user_id: effectiveStoreId,
      p_title: nextTitle,
    });

    if (titleSyncError && !isMissingRpcError(titleSyncError, 'update_estimate_project_title')) {
      throw titleSyncError;
    }

    if (titleSyncError) {
      const { error: requestError } = await supabase
        .from('estimate_requests')
        .update({
          title: nextTitle,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      let projectUpdate = supabase
        .from('store_projects')
        .update({
          name: nextTitle,
          updated_at: new Date().toISOString(),
        })
        .eq('store_user_id', effectiveStoreId);

      projectUpdate = quoteId
        ? projectUpdate.or(`estimate_request_id.eq.${requestId},estimate_quote_id.eq.${quoteId}`)
        : projectUpdate.eq('estimate_request_id', requestId);

      const { error: projectError } = await projectUpdate;
      if (projectError) throw projectError;
    }

    setRequests((prev) =>
      prev.map((item) => (Number(item.id) === requestId ? { ...item, title: nextTitle } : item))
    );
    setQuoteRows((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        title: nextTitle,
      },
    }));
  };

  const updateCustomerStatus = async (requestId: number, status: CustomerStatus) => {
    if (!user || !effectiveStoreId || estimateReadOnly) return;

    setSavingId(requestId);

    const current = statusRows[requestId];
    const { data, error } = await supabase
      .from('estimate_request_store_statuses')
      .upsert(
        {
          id: current?.id,
          estimate_request_id: requestId,
          store_user_id: effectiveStoreId,
          status,
          memo: current?.memo || null,
          last_contacted_at:
            status === 'consulting' || status === 'estimating'
              ? new Date().toISOString()
              : current?.last_contacted_at || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'estimate_request_id,store_user_id' }
      )
      .select()
      .single();

    setSavingId(null);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    setStatusRows((prev) => ({
      ...prev,
      [requestId]: data,
    }));
  };

  /**
   * 화면 draft를 `estimate_quotes` row로 저장하거나 갱신한다.
   *
   * 잔금은 총액 - 계약금 - 중도금으로 계산한 값을 같이 저장한다.
   * 저장 성공 뒤에는 제목 동기화와 현장 summary 동기화를 이어서 실행해
   * 견적관리, 현장관리, 채팅방 제목/금액이 같은 값을 보게 만든다.
   */
  const upsertQuoteDraft = async (requestId: number) => {
    if (!user || !effectiveStoreId || estimateReadOnly) {
      throw new Error('견적 저장 권한이 없습니다.');
    }
    const draft = quoteDrafts[requestId] || {};
    const request = requests.find((item) => Number(item.id) === requestId);
    const amounts = getQuoteAmounts(draft);
    const existingQuoteStatus = quoteRows[requestId]?.status;
    const nextQuoteStatus =
      existingQuoteStatus === 'accepted' || existingQuoteStatus === 'completed'
        ? existingQuoteStatus
        : 'draft';

    const { data, error } = await supabase
      .from('estimate_quotes')
      .upsert(
        {
          id: quoteRows[requestId]?.id,
          estimate_request_id: requestId,
          store_user_id: effectiveStoreId,
          title: draft.quoteTitle?.trim() || request?.title || '견적서',
          status: nextQuoteStatus,
          labor_cost: amounts.laborCost,
          material_cost: amounts.materialCost,
          additional_cost: amounts.additionalCost,
          total_amount: amounts.totalAmount,
          deposit_amount: amounts.depositAmount,
          progress_amount: amounts.progressAmount,
          final_amount: amounts.finalAmount,
          additional_work: draft.additionalWork?.trim() || null,
          memo: draft.memo?.trim() || null,
          pdf_url: draft.pdfUrl?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'estimate_request_id,store_user_id' }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    setQuoteRows((prev) => ({
      ...prev,
      [requestId]: data,
    }));

    await syncEstimateProjectTitle(requestId, data.title || request?.title || '견적서', data.id);
    await syncLinkedProjectFromQuote(data, request);

    return data;
  };

  const saveQuote = async (requestId: number) => {
    if (!user || !effectiveStoreId || estimateReadOnly) return;

    setSavingId(requestId);

    try {
      await upsertQuoteDraft(requestId);
    } catch (error: any) {
      setSavingId(null);
      Alert.alert('견적 저장 실패', error?.message || '견적 저장 중 오류가 발생했습니다.');
      return;
    }

    setSavingId(null);
    await updateCustomerStatus(requestId, 'estimating');
    Alert.alert('견적 저장', '견적 내용이 저장되었습니다.');
  };

  const completeEstimateThread = async (requestId: number) => {
    if (!user || !effectiveStoreId || estimateReadOnly || completingEstimateId === requestId) return;

    const ok = await confirmEstimateLifecycleAction(
      '견적 완료 처리',
      '이 견적과 연결된 현장, 채팅방을 완료 상태로 보관할까요?',
      '완료'
    );
    if (!ok) return;

    setCompletingEstimateId(requestId);

    try {
      const quote = quoteRows[requestId]?.id
        ? quoteRows[requestId]
        : await upsertQuoteDraft(requestId);
      const projectId = linkedProjectId || quote?.converted_project_id || null;

      const { error } = await supabase.rpc('complete_estimate_project_thread', {
        p_estimate_request_id: requestId,
        p_project_id: projectId,
        p_store_user_id: effectiveStoreId,
      });

      if (error) throw error;

      setStatusRows((prev) => ({
        ...prev,
        [requestId]: {
          ...(prev[requestId] || {}),
          estimate_request_id: requestId,
          store_user_id: effectiveStoreId,
          status: 'completed',
        },
      }));
      setQuoteRows((prev) => ({
        ...prev,
        [requestId]: {
          ...(prev[requestId] || quote || {}),
          status: 'completed',
        },
      }));
      setFilter('completed');
      await loadEstimates();
      Alert.alert('완료 처리', '완료 목록에 보관되었습니다.');
    } catch (error: any) {
      Alert.alert(
        '완료 처리 실패',
        error?.message?.includes('complete_estimate_project_thread') ||
          error?.message?.includes('schema cache')
          ? 'Supabase에 최신 lifecycle SQL을 먼저 실행해 주세요.'
          : error?.message || '완료 처리 중 오류가 발생했습니다.'
      );
    } finally {
      setCompletingEstimateId(null);
    }
  };

  const deleteEstimateThread = async (requestId: number) => {
    if (!user || !effectiveStoreId || estimateReadOnly || deletingEstimateId === requestId) return;

    const ok = await confirmEstimateLifecycleAction(
      '견적 삭제',
      '이 견적과 연결된 현장, 견적서, 채팅방, 첨부 데이터가 함께 삭제됩니다.',
      '삭제'
    );
    if (!ok) return;

    setDeletingEstimateId(requestId);

    try {
      const projectId = linkedProjectId || quoteRows[requestId]?.converted_project_id || null;
      const { error } = await supabase.rpc('delete_estimate_project_thread', {
        p_estimate_request_id: requestId,
        p_project_id: projectId,
        p_store_user_id: effectiveStoreId,
      });

      if (error) throw error;

      setRequests((prev) => prev.filter((item) => Number(item.id) !== requestId));
      setStatusRows((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setQuoteRows((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setAttachmentRows((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setQuoteDrafts((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setAddressDrafts((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setSelectedRequestId(null);
      await loadEstimates();
      Alert.alert('견적 삭제', '견적과 연결 데이터가 삭제되었습니다.');
    } catch (error: any) {
      Alert.alert(
        '견적 삭제 실패',
        error?.message?.includes('delete_estimate_project_thread') ||
          error?.message?.includes('schema cache')
          ? 'Supabase에 최신 lifecycle SQL을 먼저 실행해 주세요.'
          : error?.message || '삭제 중 오류가 발생했습니다.'
      );
    } finally {
      setDeletingEstimateId(null);
    }
  };

  /**
   * 현재 견적서를 PDF로 저장/공유한다.
   *
   * 먼저 draft를 저장해서 최신 금액/메모/추가공사내역을 확정한 뒤,
   * 문의 사진과 견적 첨부파일을 signed/public URL로 변환해 HTML에 크게 넣는다.
   * native에서는 expo-print로 PDF 파일을 만들고 expo-sharing으로 저장/공유한다.
   */
  const downloadQuotePdf = async (requestId: number) => {
    if (!user || !effectiveStoreId || downloadingEstimateId === requestId) return;

    const request = requests.find((item) => Number(item.id) === requestId);
    if (!request) {
      Alert.alert('견적 다운로드', '견적문의 정보를 찾을 수 없습니다.');
      return;
    }

    setDownloadingEstimateId(requestId);

    try {
      const quote = estimateReadOnly ? quoteRows[requestId] : await upsertQuoteDraft(requestId);
      if (!estimateReadOnly) {
        await updateCustomerStatus(requestId, 'estimating');
      }

      if (!quote?.id) {
        Alert.alert('견적 다운로드', '저장된 견적서가 없습니다.');
        return;
      }

      const draft = quoteDrafts[requestId] || {};
      const requesterProfile = Array.isArray(request.profiles)
        ? request.profiles[0]
        : request.profiles;
      const applicantName =
        request.applicant_name || requesterProfile?.display_name || '신청자 이름 미입력';
      const applicantPhone =
        request.applicant_phone || requesterProfile?.phone || '전화번호 미입력';
      const requestImages = (request.estimate_request_images || [])
        .map((image: any, index: number) => {
          if (!image.image_path) return null;

          return {
            ...image,
            file_name: `문의 ${isVideoAttachment(image.image_path) ? '영상' : '사진'} ${index + 1}`,
            signedUrl: supabase.storage.from('estimate-images').getPublicUrl(image.image_path).data.publicUrl,
          };
        })
        .filter(Boolean);
      const attachments = await Promise.all(
        (attachmentRows[requestId] || []).map(async (attachment) => {
          if (!attachment.file_path) return attachment;

          const { data } = await supabase.storage
            .from(ATTACHMENT_BUCKET)
            .createSignedUrl(attachment.file_path, 60 * 60);

          return {
            ...attachment,
            signedUrl: data?.signedUrl || '',
          };
        })
      );
      const html = buildEstimatePdfHtml({
        request,
        quote,
        draft,
        applicantName,
        applicantPhone,
        requestImages,
        attachments,
      });

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const popup = window.open('', '_blank');
        if (!popup) {
          Alert.alert('견적 다운로드', '팝업이 차단되어 PDF 창을 열 수 없습니다.');
          return;
        }
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        setTimeout(() => {
          popup.focus();
          popup.print();
        }, 300);
        return;
      }

      const nativePrint = requireOptionalNativeModule('ExpoPrint');
      if (!nativePrint) {
        Alert.alert(
          'PDF 모듈 설치 필요',
          '현재 설치된 앱에는 PDF 저장 모듈이 아직 포함되지 않았습니다. 아래 명령어로 새 개발 빌드를 설치한 뒤 다시 눌러주세요.\n\nnpx eas build --profile development --platform ios'
        );
        return;
      }

      const printModule = await import('expo-print');
      const sharingModule = await import('expo-sharing');

      const { uri } = await printModule.printToFileAsync({
        html,
        base64: false,
      });
      const canShare = await sharingModule.isAvailableAsync();

      if (canShare) {
        await sharingModule.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: '견적서 저장',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Linking.openURL(uri);
      }
    } catch (error: any) {
      Alert.alert('견적 다운로드 실패', error?.message || 'PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setDownloadingEstimateId(null);
    }
  };

  const updateQuoteDraft = (requestId: number, key: string, value: string) => {
    if (estimateReadOnly) return;

    setQuoteDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        [key]: value,
      },
    }));
  };

  /**
   * 견적문의 주소 입력 draft를 갱신한다.
   * 서버 저장은 `saveRequestAddress`에서만 해서 사용자가 수정 중인 값을 바로 DB에 쓰지 않는다.
   */
  const updateAddressDraft = (requestId: number, value: string) => {
    setAddressDrafts((prev) => ({
      ...prev,
      [requestId]: value,
    }));
  };

  /**
   * 가게/담당자가 견적문의 주소를 수정해 저장한다.
   *
   * 고객이 보낸 원본 주소가 비어 있거나 상담 후 주소가 바뀐 경우를 보정하기 위한 기능이다.
   * 연결된 현장이 있으면 견적서 동기화 함수를 다시 호출해 현장관리 주소도 따라 바뀌게 한다.
   */
  const saveRequestAddress = async (requestId: number) => {
    if (!user || !effectiveStoreId || estimateReadOnly || savingId === requestId) return;

    const address = (addressDrafts[requestId] ?? '').trim();

    setSavingId(requestId);

    const { data, error } = await supabase
      .from('estimate_requests')
      .update({
        address: address || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('id, address')
      .single();

    setSavingId(null);

    if (error) {
      Alert.alert('주소 저장 실패', error.message);
      return;
    }

    const quote = quoteRows[requestId];
    if (quote?.id) {
      try {
        const request = requests.find((item) => Number(item.id) === requestId);
        await syncLinkedProjectFromQuote(quote, { ...request, address: data?.address || null });
      } catch (syncError: any) {
        Alert.alert('현장 주소 반영 실패', syncError.message);
      }
    }

    setRequests((prev) =>
      prev.map((item) =>
        Number(item.id) === requestId ? { ...item, address: data?.address || null } : item
      )
    );
    setAddressDrafts((prev) => ({
      ...prev,
      [requestId]: data?.address || '',
    }));
    Alert.alert('주소 저장', '견적문의 주소가 저장되었습니다.');
  };

  const uploadQuoteAttachment = async (
    requestId: number,
    file: {
      uri: string;
      name?: string | null;
      mimeType?: string | null;
      size?: number | null;
    }
  ) => {
    if (!effectiveStoreId || estimateReadOnly) {
      Alert.alert('첨부 실패', '가게 정보를 찾을 수 없습니다.');
      return;
    }

    setUploadingAttachmentId(requestId);

    try {
      const quote = quoteRows[requestId]?.id
        ? quoteRows[requestId]
        : await upsertQuoteDraft(requestId);

      // 첨부파일은 견적서가 먼저 있어야 quote_id로 묶을 수 있다.
      // 아직 저장하지 않은 견적이라면 이 시점에 draft를 저장해 quote row를 만든다.
      const mimeType = file.mimeType || getMimeFromName(file.name);
      const extension = getExtensionFromMime(mimeType);
      const baseFileName = sanitizeFileName(
        file.name || `estimate-${requestId}-${Date.now()}.${extension}`
      );
      const fileName = baseFileName.includes('.')
        ? baseFileName
        : `${baseFileName}.${extension}`;
      const filePath = `${effectiveStoreId}/${quote.id}/${Date.now()}-${fileName}`;
      const uploadBody = await readUploadBody(file.uri);

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(filePath, uploadBody, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('estimate_quote_attachments')
        .insert({
          quote_id: quote.id,
          file_path: filePath,
          file_name: fileName,
          file_type: mimeType,
          file_size: file.size || null,
        })
        .select()
        .single();

      if (error) throw error;

      setAttachmentRows((prev) => ({
        ...prev,
        [requestId]: [data, ...(prev[requestId] || [])],
      }));
    } catch (error: any) {
      Alert.alert('첨부 실패', error?.message || '파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingAttachmentId(null);
    }
  };

  /**
   * 파일 앱/문서 picker에서 PDF 견적서를 첨부한다.
   * 직접 작성한 견적 외에 업체가 보유한 외부 PDF도 같은 quote attachment로 관리한다.
   */
  const pickQuotePdf = async (requestId: number) => {
    if (estimateReadOnly || uploadingAttachmentId === requestId) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    await uploadQuoteAttachment(requestId, {
      uri: asset.uri,
      name: asset.name || `estimate-${requestId}.pdf`,
      mimeType: asset.mimeType || getMimeFromName(asset.name),
      size: asset.size || null,
    });
  };

  /**
   * 사진 앨범에서 견적 관련 이미지를 여러 장 첨부한다.
   * 촬영 견적서, 자재 사진, 현장 사진을 PDF 다운로드 시 함께 크게 보여주기 위해 사용한다.
   */
  const pickQuoteImages = async (requestId: number) => {
    if (estimateReadOnly || uploadingAttachmentId === requestId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 권한 필요', '견적서 사진을 첨부하려면 사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets?.length) return;

    for (let index = 0; index < result.assets.length; index += 1) {
      const asset = result.assets[index];
      const mimeType = asset.mimeType || 'image/jpeg';
      await uploadQuoteAttachment(requestId, {
        uri: asset.uri,
        name:
          asset.fileName ||
          `estimate-${requestId}-${Date.now()}-${index}.${getExtensionFromMime(mimeType)}`,
        mimeType,
        size: asset.fileSize || null,
      });
    }
  };

  /**
   * 카메라로 견적 관련 사진을 촬영해서 첨부한다.
   * native 전용 경로지만 web에서도 함수가 호출되지 않게 버튼 조건에서 막는다.
   */
  const takeQuotePhoto = async (requestId: number) => {
    if (estimateReadOnly || uploadingAttachmentId === requestId) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('카메라 권한 필요', '견적서 사진을 촬영하려면 카메라 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    await uploadQuoteAttachment(requestId, {
      uri: asset.uri,
      name:
        asset.fileName ||
        `estimate-${requestId}-${Date.now()}.${getExtensionFromMime(mimeType)}`,
      mimeType,
      size: asset.fileSize || null,
    });
  };

  /**
   * 저장된 견적 첨부파일을 연다.
   * Supabase Storage signed URL은 짧게 발급해서 링크가 오래 노출되지 않게 한다.
   */
  const openQuoteAttachment = async (attachment: any) => {
    if (!attachment?.file_path) return;

    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.file_path, 60 * 10);

    if (error || !data?.signedUrl) {
      Alert.alert('파일 열기 실패', error?.message || '파일 주소를 만들지 못했습니다.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    await Linking.openURL(data.signedUrl);
  };

  /**
   * 견적문의와 연결된 업무 채팅방을 연다.
   * 방 생성/멤버 동기화는 서버 RPC가 담당하고, 앱은 반환된 room id로 이동만 한다.
   */
  const openEstimateChat = async (requestId: number) => {
    if (!effectiveStoreId || openingChatId === requestId) return;

    setOpeningChatId(requestId);

    try {
      const { data, error } = await supabase.rpc('ensure_estimate_chat_room', {
        p_estimate_request_id: requestId,
        p_store_user_id: effectiveStoreId,
      });

      if (error || !data) {
        Alert.alert(
          '견적 채팅방',
          error?.message?.includes('ensure_estimate_chat_room') ||
            error?.message?.includes('schema cache')
            ? 'Supabase에 최신 SQL을 먼저 실행해 주세요.'
            : error?.message || '채팅방을 열 수 없습니다.'
        );
        return;
      }

      router.push(`/chat/${data}` as any);
    } finally {
      setOpeningChatId(null);
    }
  };

  /**
   * 견적서를 현장으로 전환한다.
   *
   * 이미 전환된 견적은 새 현장을 만들지 않고 기존 현장 상세로 이동한다.
   * 새로 전환할 때는 quote row를 최신으로 저장한 뒤 RPC가 고객/주소/금액/담당자를 복사해
   * store_projects row를 만들고, 이어서 현장 채팅방도 보장한다.
   */
  const convertToProject = async (requestId: number) => {
    if (!effectiveStoreId || convertingProjectId === requestId) return;

    const existingProjectId = quoteRows[requestId]?.converted_project_id;
    if (existingProjectId) {
      router.push({
        pathname: '/store/projects',
        params: { projectId: existingProjectId },
      } as any);
      return;
    }

    if (estimateReadOnly) return;

    setConvertingProjectId(requestId);

    try {
      const quote = quoteRows[requestId]?.id
        ? quoteRows[requestId]
        : await upsertQuoteDraft(requestId);

      const { data, error } = await supabase.rpc('convert_estimate_quote_to_project', {
        p_quote_id: quote.id,
        p_project_name: null,
        p_start_date: null,
        p_end_date: null,
      });

      if (error) throw error;

      setQuoteRows((prev) => ({
        ...prev,
        [requestId]: {
          ...(prev[requestId] || quote),
          status: 'accepted',
          converted_project_id: data?.id,
        },
      }));
      await updateCustomerStatus(requestId, 'contracted');

      if (data?.id) {
        const { error: chatSyncError } = await supabase.rpc('ensure_project_chat_room', {
          p_project_id: data.id,
        });
        router.push({
          pathname: '/store/projects',
          params: { projectId: data.id },
        } as any);
      } else {
        Alert.alert('현장 전환 완료', '현장관리에서 생성된 현장을 확인해 주세요.');
      }
    } catch (error: any) {
      Alert.alert('현장 전환 실패', error?.message || '현장 전환 중 오류가 발생했습니다.');
    } finally {
      setConvertingProjectId(null);
    }
  };

  const assignStaff = async (requestId: number, staffUserId: string | null) => {
    if (!canAssignStaff || estimateReadOnly) return;

    setSavingId(requestId);

    const { error } = await supabase
      .from('estimate_requests')
      .update({
        assigned_staff_user_id: staffUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    setSavingId(null);

    if (error) {
      Alert.alert('담당자 배정 실패', error.message);
      return;
    }

    const quoteId = quoteRows[requestId]?.id;
    if (quoteId) {
      const { error: projectError } = await supabase
        .from('store_projects')
        .update({
          assigned_staff_user_id: staffUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('estimate_quote_id', quoteId);

      if (projectError) {
        Alert.alert('현장 담당자 반영 실패', projectError.message);
        return;
      }
    }

    await loadEstimates();
  };

  const getEstimateImageUrl = (path?: string | null) => {
    if (!path) return null;
    return supabase.storage.from('estimate-images').getPublicUrl(path).data.publicUrl;
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '견적관리' }} />

      <View style={styles.header}>
        <Text style={styles.title}>{estimateReadOnly ? '견적서 보기' : '견적관리'}</Text>
        <Text style={styles.desc}>
          {estimateReadOnly
            ? '현장에 연결된 견적서를 읽기 전용으로 확인합니다.'
            : '신규 문의부터 견적 저장과 계약 상태까지 관리합니다.'}
        </Text>
      </View>

      {loading && requests.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : !canUseEstimates ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>
            견적문의 열람과 견적관리는 가게 인증 완료 계정 또는 활성 직원 계정만 사용할 수 있습니다.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.filterRow}>
            <View style={styles.limitBox}>
              <Text style={styles.limitText}>
                {estimateReadOnly
                  ? '읽기 전용 · 현장 참여자 권한'
                  : `현재 플랜 ${getPlanLabel(limits.plan)} · 견적관리 ${
                      limits.estimateRecentLimit == null
                        ? '전체 기간'
                        : `최근 ${limits.estimateRecentLimit}건`
                    }`}
              </Text>
            </View>
            {!selectedRequestId ? (
              <View style={styles.searchBox}>
                <TextInput
                  style={styles.searchInput}
                  value={searchKeyword}
                  onChangeText={setSearchKeyword}
                  placeholder="제목, 지역, 주소, 신청자, 전화번호 검색"
                  placeholderTextColor="#9ca3af"
                />
                <TextInput
                  style={styles.dateFilterInput}
                  value={dateFilter}
                  onChangeText={setDateFilter}
                  placeholder="날짜 YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
              </View>
            ) : null}
            {!selectedRequestId ? STATUS_OPTIONS.map((option) => {
              const active = filter === option.key;
              const count = statusCounts[option.key] || 0;

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(option.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {option.label} {count ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            }) : null}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listContent}>
              {visibleRequests.length === 0 ? (
                <Text style={styles.emptyText}>표시할 견적문의가 없습니다.</Text>
              ) : (
                visibleRequests.map((item) => {
                  const requestId = Number(item.id);
                  const currentStatus = (statusRows[requestId]?.status || 'new') as CustomerStatus;
                  const draft = quoteDrafts[requestId] || {};
                  const firstImage = item.estimate_request_images?.find((attachment: any) => !isVideoAttachment(attachment.image_path || ''));
                  const imageUrl = getEstimateImageUrl(firstImage?.image_path);
                  const attachments = attachmentRows[requestId] || [];
                  const uploadingAttachments = uploadingAttachmentId === requestId;
                  const convertedProjectId = quoteRows[requestId]?.converted_project_id;
                  const convertingProject = convertingProjectId === requestId;
                  const downloadingEstimate = downloadingEstimateId === requestId;
                  const openingChat = openingChatId === requestId;
                  const completingEstimate = completingEstimateId === requestId;
                  const deletingEstimate = deletingEstimateId === requestId;
                  const requesterProfile = Array.isArray(item.profiles)
                    ? item.profiles[0]
                    : item.profiles;
                  const applicantName =
                    item.applicant_name || requesterProfile?.display_name || '신청자 이름 미입력';
                  const applicantPhone =
                    item.applicant_phone || requesterProfile?.phone || '전화번호 미입력';
                  const quoteTitle = draft.quoteTitle ?? quoteRows[requestId]?.title ?? item.title;

                  if (!selectedRequestId) {
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.summaryCard}
                        onPress={() => setSelectedRequestId(requestId)}
                        activeOpacity={0.82}
                      >
                        <View style={styles.summaryHeader}>
                          <Text style={styles.summaryTitle} numberOfLines={1}>
                            {quoteTitle || '견적서 제목 미입력'}
                          </Text>
                          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                        </View>
                        <View style={styles.summaryGrid}>
                          <SummaryField label="지역" value={item.region || '지역 미입력'} />
                          <SummaryField label="주소" value={item.address || '주소 미입력'} />
                          <SummaryField label="희망 일정" value={item.desired_date || '미정'} />
                          <SummaryField label="연락 방법" value={item.preferred_contact || '미입력'} />
                          <SummaryField label="신청자 이름" value={applicantName} />
                          <SummaryField label="전화번호" value={applicantPhone} />
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  const quoteAmounts = getQuoteAmounts(draft);
                  const totalAmount = quoteAmounts.totalAmount;

                  return (
                    <View key={item.id} style={styles.card}>
                      <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => setSelectedRequestId(null)}
                      >
                        <Ionicons name="chevron-back" size={18} color="#111827" />
                        <Text style={styles.backText}>견적 목록</Text>
                      </TouchableOpacity>

                      <View style={styles.cardTop}>
                        <View style={styles.thumb}>
                          {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.thumbImage} />
                          ) : (
                            <Ionicons name="construct-outline" size={26} color="#9ca3af" />
                          )}
                        </View>

                        <View style={styles.cardInfo}>
                          <View style={styles.badgeRow}>
                            <Text style={styles.categoryBadge}>{item.category}</Text>
                            <Text style={styles.statusBadge}>{getStatusLabel(currentStatus)}</Text>
                          </View>
                          <Text style={styles.requestTitle}>{item.title}</Text>
                          <Text style={styles.metaText}>
                            {item.region || '지역 미입력'} · {item.budget || '예산 미입력'}
                          </Text>
                          <Text style={styles.metaText}>
                            희망 일정 {item.desired_date || '미정'} · {item.preferred_contact || '연락 방법 미입력'}
                          </Text>
                          <Text style={styles.metaText}>
                            신청자 {applicantName} · {applicantPhone}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.addressEditBox}>
                        <Text style={styles.addressEditTitle}>현장 주소</Text>
                        <TextInput
                          style={styles.input}
                          value={addressDrafts[requestId] ?? item.address ?? ''}
                          onChangeText={(value) => updateAddressDraft(requestId, value)}
                          placeholder="주소를 입력하거나 수정하세요"
                          autoCapitalize="none"
                          editable={canEditEstimate}
                        />
                        {canEditEstimate ? (
                          <TouchableOpacity
                            style={[
                              styles.addressSaveBtn,
                              savingId === requestId && styles.saveBtnDisabled,
                            ]}
                            onPress={() => saveRequestAddress(requestId)}
                            disabled={savingId === requestId}
                          >
                            <Ionicons name="location-outline" size={16} color="#166534" />
                            <Text style={styles.addressSaveText}>
                              {savingId === requestId ? '저장 중...' : '주소 저장'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.bodyText}>{item.description || '상세 내용 없음'}</Text>
                      {item.estimate_request_images?.length ? (
                        <AttachmentGallery attachments={item.estimate_request_images} />
                      ) : null}

                      {canAssignStaff && canEditEstimate ? (
                        <View style={styles.assignmentBox}>
                          <Text style={styles.assignmentTitle}>담당 직원 배정</Text>
                          <View style={styles.assignmentRow}>
                            <TouchableOpacity
                              style={[
                                styles.assignmentChip,
                                !item.assigned_staff_user_id && styles.assignmentChipActive,
                              ]}
                              onPress={() => assignStaff(requestId, null)}
                              disabled={savingId === requestId || completingEstimate}
                            >
                              <Text
                                style={[
                                  styles.assignmentChipText,
                                  !item.assigned_staff_user_id &&
                                    styles.assignmentChipTextActive,
                                ]}
                              >
                                가게 본계정
                              </Text>
                            </TouchableOpacity>
                            {staffMembers.map((staff) => {
                              const active = item.assigned_staff_user_id === staff.staff_user_id;

                              return (
                                <TouchableOpacity
                                  key={staff.id}
                                  style={[
                                    styles.assignmentChip,
                                    active && styles.assignmentChipActive,
                                  ]}
                                  onPress={() => assignStaff(requestId, staff.staff_user_id)}
                                  disabled={savingId === requestId}
                                >
                                  <Text
                                    style={[
                                      styles.assignmentChipText,
                                      active && styles.assignmentChipTextActive,
                                    ]}
                                  >
                                    {staff.display_name || '직원'}
                                    {staff.position ? ` · ${staff.position}` : ''}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ) : activeStaffMembership ? (
                        <View style={styles.assignmentBox}>
                          <Text style={styles.assignmentTitle}>내 담당 문의</Text>
                          <Text style={styles.metaText}>
                            {activeStaffMembership.display_name || '직원'} 계정으로 배정된 문의입니다.
                          </Text>
                        </View>
                      ) : null}

                      {canEditEstimate ? (
                        <View style={styles.statusActions}>
                          {STATUS_OPTIONS.filter((option) => option.key !== 'all').map((option) => (
                            <TouchableOpacity
                              key={option.key}
                              style={[
                                styles.statusActionBtn,
                                currentStatus === option.key && styles.statusActionBtnActive,
                              ]}
                              onPress={() => {
                                if (option.key === 'completed') {
                                  completeEstimateThread(requestId);
                                  return;
                                }

                                updateCustomerStatus(requestId, option.key as CustomerStatus);
                              }}
                              disabled={savingId === requestId}
                            >
                              <Text
                                style={[
                                  styles.statusActionText,
                                  currentStatus === option.key && styles.statusActionTextActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}

                      {canEditEstimate ? (
                        <View style={styles.lifecycleActions}>
                          {currentStatus !== 'completed' ? (
                            <TouchableOpacity
                              style={[
                                styles.completeBtn,
                                completingEstimate && styles.saveBtnDisabled,
                              ]}
                              onPress={() => completeEstimateThread(requestId)}
                              disabled={completingEstimate}
                            >
                              <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                              <Text style={styles.completeBtnText}>
                                {completingEstimate ? '완료 처리 중...' : '완료 처리'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {canAssignStaff ? (
                            <TouchableOpacity
                              style={[
                                styles.dangerBtn,
                                deletingEstimate && styles.saveBtnDisabled,
                              ]}
                              onPress={() => deleteEstimateThread(requestId)}
                              disabled={deletingEstimate}
                            >
                              <Ionicons name="trash-outline" size={17} color="#991b1b" />
                              <Text style={styles.dangerBtnText}>
                                {deletingEstimate ? '삭제 중...' : '삭제'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={[
                          styles.estimateChatBtn,
                          openingChat && styles.saveBtnDisabled,
                        ]}
                        onPress={() => openEstimateChat(requestId)}
                        disabled={openingChat}
                      >
                        <Ionicons name="chatbubbles-outline" size={17} color="#fff" />
                        <Text style={styles.estimateChatText}>
                          {openingChat
                            ? '채팅 여는 중...'
                            : convertedProjectId || linkedProjectId
                              ? '견적/현장 채팅'
                              : '견적 채팅'}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.quoteBox}>
                        <Text style={styles.quoteTitle}>견적서 작성</Text>
                        <TextInput
                          style={styles.input}
                          value={draft.quoteTitle ?? quoteRows[requestId]?.title ?? item.title ?? ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'quoteTitle', value)}
                          placeholder="견적서 제목"
                          autoCapitalize="none"
                          editable={canEditEstimate}
                        />
                        <View style={styles.amountGrid}>
                          <QuoteInput
                            label="시공비"
                            value={draft.laborCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'laborCost', value)}
                            editable={canEditEstimate}
                          />
                          <QuoteInput
                            label="자재비"
                            value={draft.materialCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'materialCost', value)}
                            editable={canEditEstimate}
                          />
                          <QuoteInput
                            label="추가공사"
                            value={draft.additionalCost || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'additionalCost', value)}
                            editable={canEditEstimate}
                          />
                          <View style={styles.totalBox}>
                            <Text style={styles.totalLabel}>합계</Text>
                            <Text style={styles.totalValue}>{totalAmount.toLocaleString()}원</Text>
                          </View>
                        </View>

                        <View style={styles.amountGrid}>
                          <QuoteInput
                            label="계약금"
                            value={draft.depositAmount || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'depositAmount', value)}
                            editable={canEditEstimate}
                          />
                          <QuoteInput
                            label="중도금"
                            value={draft.progressAmount || ''}
                            onChangeText={(value) => updateQuoteDraft(requestId, 'progressAmount', value)}
                            editable={canEditEstimate}
                          />
                          <View style={styles.totalBox}>
                            <Text style={styles.totalLabel}>잔금 자동 계산</Text>
                            <Text style={styles.totalValue}>
                              {quoteAmounts.finalAmount.toLocaleString()}원
                            </Text>
                          </View>
                        </View>

                        <TextInput
                          style={[styles.input, styles.textarea]}
                          value={draft.additionalWork || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'additionalWork', value)}
                          placeholder="추가공사 내역"
                          multiline
                          textAlignVertical="top"
                          editable={canEditEstimate}
                        />
                        <TextInput
                          style={[styles.input, styles.textarea]}
                          value={draft.memo || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'memo', value)}
                          placeholder="상담 메모"
                          multiline
                          textAlignVertical="top"
                          editable={canEditEstimate}
                        />
                        <TextInput
                          style={styles.input}
                          value={draft.pdfUrl || ''}
                          onChangeText={(value) => updateQuoteDraft(requestId, 'pdfUrl', value)}
                          placeholder="외부 PDF 공유 링크"
                          autoCapitalize="none"
                          editable={canEditEstimate}
                        />

                        <View style={styles.attachmentBox}>
                          <View style={styles.attachmentHeader}>
                            <View>
                              <Text style={styles.attachmentTitle}>견적서 첨부</Text>
                              <Text style={styles.attachmentHelp}>
                                PDF 파일이나 사진으로 올려두고 언제든 다시 열람합니다.
                              </Text>
                            </View>
                            {uploadingAttachments ? <ActivityIndicator size="small" /> : null}
                          </View>

                          {canEditEstimate ? (
                            <View style={styles.attachmentActions}>
                              <TouchableOpacity
                                style={[
                                  styles.attachmentUploadBtn,
                                  uploadingAttachments && styles.saveBtnDisabled,
                                ]}
                                onPress={() => pickQuotePdf(requestId)}
                                disabled={uploadingAttachments}
                              >
                                <Ionicons name="document-attach-outline" size={16} color="#fff" />
                                <Text style={styles.attachmentUploadText}>PDF 파일</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.attachmentUploadBtn,
                                  styles.attachmentPhotoBtn,
                                  uploadingAttachments && styles.saveBtnDisabled,
                                ]}
                                onPress={() => pickQuoteImages(requestId)}
                                disabled={uploadingAttachments}
                              >
                                <Ionicons name="image-outline" size={16} color="#111827" />
                                <Text style={styles.attachmentPhotoText}>사진</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.attachmentUploadBtn,
                                  styles.attachmentPhotoBtn,
                                  uploadingAttachments && styles.saveBtnDisabled,
                                ]}
                                onPress={() => takeQuotePhoto(requestId)}
                                disabled={uploadingAttachments}
                              >
                                <Ionicons name="camera-outline" size={16} color="#111827" />
                                <Text style={styles.attachmentPhotoText}>촬영</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}

                          {attachments.length === 0 ? (
                            <Text style={styles.attachmentEmptyText}>
                              아직 첨부된 견적서 파일이 없습니다.
                            </Text>
                          ) : (
                            <View style={styles.attachmentList}>
                              {attachments.map((attachment) => (
                                <TouchableOpacity
                                  key={attachment.id}
                                  style={styles.attachmentRow}
                                  onPress={() => openQuoteAttachment(attachment)}
                                >
                                  <View style={styles.attachmentIconBox}>
                                    <Ionicons
                                      name={getAttachmentIcon(attachment.file_type) as any}
                                      size={18}
                                      color="#166534"
                                    />
                                  </View>
                                  <View style={styles.attachmentInfo}>
                                    <Text style={styles.attachmentName} numberOfLines={1}>
                                      {attachment.file_name || '첨부 파일'}
                                    </Text>
                                    <Text style={styles.attachmentMeta}>
                                      {[attachment.file_type || '파일', formatFileSize(attachment.file_size)]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </Text>
                                  </View>
                                  <Ionicons name="open-outline" size={17} color="#6b7280" />
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>

                        {canEditEstimate ? (
                          <TouchableOpacity
                            style={[styles.saveBtn, savingId === requestId && styles.saveBtnDisabled]}
                            onPress={() => saveQuote(requestId)}
                            disabled={savingId === requestId}
                          >
                            <Text style={styles.saveText}>
                              {savingId === requestId ? '저장 중...' : '견적 저장'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[
                            styles.downloadBtn,
                            downloadingEstimate && styles.saveBtnDisabled,
                          ]}
                          onPress={() => downloadQuotePdf(requestId)}
                          disabled={downloadingEstimate}
                        >
                          <Ionicons name="download-outline" size={17} color="#fff" />
                          <Text style={styles.downloadText}>
                            {downloadingEstimate ? 'PDF 생성 중...' : '견적 다운'}
                          </Text>
                        </TouchableOpacity>
                        {canEditEstimate || convertedProjectId || linkedProjectId ? (
                          <TouchableOpacity
                            style={[
                              styles.projectBtn,
                              convertingProject && styles.saveBtnDisabled,
                            ]}
                            onPress={() => {
                              if (linkedProjectId && !convertedProjectId) {
                                router.push({
                                  pathname: '/store/projects',
                                  params: { projectId: linkedProjectId },
                                } as any);
                                return;
                              }
                              convertToProject(requestId);
                            }}
                            disabled={convertingProject}
                          >
                            <Ionicons
                              name={
                                convertedProjectId || linkedProjectId
                                  ? 'business-outline'
                                  : 'arrow-forward-circle-outline'
                              }
                              size={17}
                              color="#111827"
                            />
                            <Text style={styles.projectBtnText}>
                              {convertingProject
                                ? '전환 중...'
                                : convertedProjectId || linkedProjectId
                                  ? '현장관리 열기'
                                  : '현장으로 전환'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function QuoteInput({
  label,
  value,
  onChangeText,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
}) {
  return (
    <View style={styles.amountInputBox}>
      <Text style={styles.amountLabel}>{label}</Text>
      <TextInput
        style={styles.amountInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        keyboardType="number-pad"
        editable={editable}
      />
    </View>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryField}>
      <Text style={styles.summaryFieldLabel}>{label}</Text>
      <Text style={styles.summaryFieldValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 16, gap: 6, backgroundColor: '#fff' },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  desc: { color: '#6b7280', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  noticeBox: {
    margin: 16,
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  limitBox: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  limitText: { color: '#14532d', fontSize: 13, fontWeight: '900' },
  filterBtn: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  filterText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: '#fff' },
  searchBox: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  searchInput: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    color: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '700',
  },
  dateFilterInput: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    color: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '700',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 16, paddingBottom: 48, gap: 14 },
  emptyText: { color: '#6b7280', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 60 },
  summaryCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: { flex: 1, color: '#111827', fontSize: 16, fontWeight: '900' },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryField: {
    width: '48%',
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    gap: 4,
  },
  summaryFieldLabel: { color: '#6b7280', fontSize: 11, fontWeight: '900' },
  summaryFieldValue: { color: '#111827', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  card: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryBadge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#166534',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  requestTitle: { marginTop: 7, color: '#111827', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  metaText: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  addressText: { color: '#374151', fontSize: 13, fontWeight: '800', lineHeight: 19 },
  addressEditBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 12,
    gap: 8,
  },
  addressEditTitle: { color: '#111827', fontSize: 13, fontWeight: '900' },
  addressSaveBtn: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addressSaveText: { color: '#166534', fontSize: 13, fontWeight: '900' },
  bodyText: { color: '#374151', fontSize: 14, lineHeight: 21 },
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: { color: '#111827', fontSize: 13, fontWeight: '900' },
  assignmentBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 12,
    gap: 8,
  },
  assignmentTitle: { color: '#111827', fontSize: 13, fontWeight: '900' },
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assignmentChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  assignmentChipActive: {
    borderColor: '#166534',
    backgroundColor: '#ecfdf5',
  },
  assignmentChipText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  assignmentChipTextActive: { color: '#14532d' },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusActionBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  statusActionText: { color: '#374151', fontSize: 12, fontWeight: '900' },
  statusActionTextActive: { color: '#fff' },
  lifecycleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  completeBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  completeBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  dangerBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 12,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dangerBtnText: { color: '#991b1b', fontSize: 13, fontWeight: '900' },
  quoteBox: {
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 10,
  },
  quoteTitle: { color: '#111827', fontSize: 15, fontWeight: '900' },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountInputBox: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 10,
    gap: 5,
  },
  amountLabel: { color: '#6b7280', fontSize: 11, fontWeight: '900' },
  amountInput: { color: '#111827', fontSize: 14, fontWeight: '900', paddingVertical: 0 },
  totalBox: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: '#111827',
    padding: 10,
    gap: 5,
  },
  totalLabel: { color: '#d1d5db', fontSize: 11, fontWeight: '900' },
  totalValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
  textarea: { minHeight: 76, lineHeight: 20 },
  attachmentBox: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 10,
  },
  attachmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  attachmentTitle: { color: '#111827', fontSize: 14, fontWeight: '900' },
  attachmentHelp: { marginTop: 3, color: '#6b7280', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  attachmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachmentUploadBtn: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  attachmentPhotoBtn: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  attachmentUploadText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  attachmentPhotoText: { color: '#111827', fontSize: 13, fontWeight: '900' },
  attachmentEmptyText: { color: '#6b7280', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  attachmentList: { gap: 8 },
  attachmentRow: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  attachmentIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfo: { flex: 1, minWidth: 0 },
  attachmentName: { color: '#111827', fontSize: 13, fontWeight: '900' },
  attachmentMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  saveBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  downloadBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  downloadText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  estimateChatBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  estimateChatText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  projectBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  projectBtnText: { color: '#111827', fontSize: 14, fontWeight: '900' },
});
