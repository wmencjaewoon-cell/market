# Interior Market Developer Handoff

이 문서는 새 개발자가 코드베이스에 들어왔을 때 먼저 봐야 하는 운영 흐름과 코드 경계를 정리합니다.

## 빠른 시작

- 앱 실행: `npm start`
- iOS 네이티브 반영: `npx expo prebuild --platform ios`, `npx pod-install ios`, `open ios/*.xcworkspace`
- Android 네이티브 반영: `npx expo prebuild --platform android`
- 정적 검사: `npx expo lint`, `npx tsc --noEmit`
- Supabase SQL은 `supabase/migrations`의 날짜 순서대로 적용합니다.

## 앱 구조

- `app/(tabs)/home`: 홈, 게시글 목록, 게시글 상세, 작성/수정
- `app/(tabs)/map`: 지도탭 진입점. 실제 구현은 `components/MapTabScreen.*`
- `app/(tabs)/chat`: 채팅 목록
- `app/chat/[roomId].tsx`: 일반 채팅, 견적 채팅, 현장 채팅을 모두 처리하는 공용 채팅방
- `app/(tabs)/my.tsx`: 내정보, 가게센터 진입, 요금제 요약
- `app/store/*`: 가게센터. 상품, 직원, 고객/견적, 현장, 가게 프로필 관리
- `app/estimate/create.tsx`: 사용자가 가게에 견적문의를 넣는 화면
- `app/my/calendar.tsx`: 개인/견적/현장/보고서 일정을 합쳐 보여주는 일정표

## 주석 읽는 방법

- 파일 첫 줄 주석은 그 파일의 책임을 한 문장으로 설명합니다.
- 함수 위 JSDoc 주석은 데이터 흐름, 권한 기준, 서버 RPC 의존성을 설명합니다.
- 함수 내부 주석은 실수하기 쉬운 분기만 설명합니다. 특히 readOnly, partner, premium/local_ad, route params, RLS fallback처럼 장애가 나기 쉬운 값입니다.
- 구독과 권한은 클라이언트 표시용 주석만 보고 판단하지 말고 항상 Supabase RPC/RLS와 같이 확인해야 합니다.
- 큰 파일은 모든 줄에 주석을 달기보다 상태 그룹, 조회 함수, 저장 함수, 이동 함수 단위로 읽는 것이 빠릅니다.
- 핵심 업무 파일은 다음 순서로 읽으면 구조가 잡힙니다.
- `lib/storeStaff.ts` -> 대표/직원/매니저 기준
- `lib/storeLimits.ts` -> 무료/베이직/프리미엄 제한 기준
- `lib/storeExposure.ts` -> 프리미엄/지역광고 공개 노출 기준
- `app/store/estimates.tsx` -> 견적문의, 견적서, PDF, 현장 전환
- `app/store/projects.tsx` -> 현장, 협력업체, 일정, 일일보고서
- `app/chat/[roomId].tsx` -> 일반/견적/현장 채팅 분기와 읽음 숫자
- `app/my/calendar.tsx` -> 현장/견적/보고서/개인 일정 통합과 위젯 snapshot

## 수정 위치 빠른 참조

- 홈 피드 정렬/검색/프리미엄 게시글 노출: `app/(tabs)/home/index.tsx`, `components/MaterialCard.tsx`, `lib/storeExposure.ts`
- 게시글 작성/수정 공통 로직: `components/ListingForm.tsx`
- 판매/나눔/구해요 기존 작성 화면: `app/(tabs)/home/create/sell.tsx`, `share.tsx`, `want.tsx`
- 게시글 상세, 전화/채팅/지도 확대/UP: `app/(tabs)/home/post/[id].tsx`
- 지도탭 마커/군집/가게 노출: `components/MapTabScreen.native.tsx`, `components/MapTabScreen.web.tsx`
- 위치 선택 화면: `components/MapPickerScreen.native.tsx`, `components/MapPickerScreen.web.tsx`
- 가게찾기 목록: `app/store/index.tsx`
- 가게 상세 프로필: `app/store/[id].tsx`
- 가게센터 대시보드: `app/store/dashboard.tsx`
- 가게 상품관리/등록 한도: `app/store/products.tsx`, `app/store/product-create.tsx`, `components/ListingForm.tsx`
- 직원관리/직원 비밀번호 흐름: `app/store/staff.tsx`
- 가게 프로필/지도 주소/상세주소 저장: `app/store/profile.tsx`
- 견적문의 접수와 견적서/PDF/현장 전환: `app/store/estimates.tsx`
- 현장관리/협력업체/일정/일일보고서: `app/store/projects.tsx`
- 견적문의 신청 화면: `app/estimate/create.tsx`
- 채팅 목록, 숨김, 완료 정렬: `app/(tabs)/chat.tsx`
- 채팅방, 읽음 수, 현장 패널, 약속/후기/통화: `app/chat/[roomId].tsx`
- 내정보 홈과 요금제 진입: `app/(tabs)/my.tsx`
- 일정표와 개인 일정: `app/my/calendar.tsx`, `lib/calendarWidget.ts`
- 푸시/앱 알림 라우팅: `lib/notifications.ts`, `lib/notificationsData.ts`
- 키워드 알림: `app/my/keywords.tsx`, `lib/keywordAlerts.ts`, `lib/listingNotifications.ts`
- 가게 권한 계산: `lib/storeStaff.ts`
- 구독 제한 계산: `lib/storeLimits.ts`, `supabase/migrations/20260903000000_store_subscription_plans_and_local_ads.sql`
- 관리자 운영 화면: `app/admin.tsx`

## 인증과 가게 권한

- 로그인 사용자의 프로필은 `profiles`에 있습니다.
- 가게 대표는 `profiles.user_type = 'store'`이고 `business_verified = true`여야 합니다.
- 직원/매니저 권한은 `store_staff_members`로 확인합니다.
- 가게센터 화면은 직접 `user.id`만 믿지 말고 `getMyStoreAccessContext()`를 통해 `storeUserId`, `canManageStore`, `isStaff`를 확인해야 합니다.
- 매니저는 가게를 관리할 수 있지만, 일반 직원은 배정된 업무 위주로 제한해야 합니다.
- 협력업체 파트너는 `project_members.role = 'partner'`로 현장에 참여하지만, 가게 관리 권한을 가지면 안 됩니다.

## 구독과 노출

- 클라이언트의 기본 제한값은 `lib/storeLimits.ts`의 `DEFAULT_STORE_LIMITS`입니다.
- 실제 제한은 Supabase RPC `get_store_subscription_limits(store_user_id)`가 기준입니다.
- 공개 화면의 프리미엄/지역광고 배지는 `store_public_exposure` 뷰를 통해 읽습니다.
- `store_subscriptions`는 기본/베이직/프리미엄 같은 가게 멤버십을 저장합니다.
- `store_local_ads`는 지역광고를 별도 저장합니다.
- 현재 이벤트 기간 정책상 명시 구독이 없어도 인증 가게는 프리미엄처럼 계산될 수 있습니다. 이 정책은 SQL 함수 안에 있으므로 이벤트 종료 시 서버 함수를 먼저 수정해야 합니다.
- 상품 등록 수, 직원 수, 공지 등록, 오늘 가능 배지 등은 클라이언트 UI만으로 막지 말고 서버 제한과 같이 유지해야 합니다.

## 가게 위치

- 기본주소: `profiles.store_address`
- 상세주소: `profiles.store_detail_address`
- 지도 좌표: `profiles.store_latitude`, `profiles.store_longitude`
- 가게 위치 저장은 `update_store_profile_settings` RPC를 통해 합니다.
- 지도탭에 가게가 보이려면 `store_latitude`와 `store_longitude`가 모두 있어야 합니다.
- `/map-picker`는 여러 화면이 공유하는 위치 선택 라우트입니다.
- 지도 선택 화면은 `lat`, `lng`, `address`, `returnTo` 파라미터로 기존 화면에 값을 돌려줍니다.
- 이미 저장된 위치를 다시 고칠 때는 `useCurrentLocation=false`를 넘겨야 기존 좌표에서 시작합니다.

## 지도탭

- 네이티브 지도 구현은 `components/MapTabScreen.native.tsx`입니다.
- 웹 지도 구현은 `components/MapTabScreen.web.tsx`입니다.
- 지도탭은 게시글 마커와 가게 마커를 레이어로 분리합니다.
- 프리미엄/지역광고 가게는 `fetchStorePublicExposureMap()` 결과를 합쳐서 정렬과 배지에 사용합니다.
- Android는 커스텀 마커 children을 자르는 문제가 있어, 가게 마커는 지도 위 오버레이로 렌더링합니다.
- 지도탭이 이미 마운트된 상태에서 가게 위치를 저장하면 `emitTabRefresh('map')`으로 다시 조회합니다.

## 견적, 현장, 보고서

- `estimate_requests`: 고객이 처음 보낸 원본 문의입니다.
- `estimate_quotes`와 관련 항목 테이블: 업체가 작성하는 견적서입니다.
- `store_projects`: 확정된 견적 또는 오프라인 계약에서 만들어진 현장입니다.
- `project_members`: 현장 참여자입니다. 내부 직원과 협력업체 파트너를 구분해야 합니다.
- `project_schedules`: 현장 일정입니다. 현장 기간은 가장 빠른 일정 시작일과 가장 늦은 일정 종료일에서 계산합니다.
- `daily_reports`: 일일보고서입니다. `customer_visible`이 true인 보고서만 고객에게 공개합니다.
- 보고서 수정/삭제는 현재 작성자 기준으로 제한합니다.

## 채팅

- 일반 게시글 채팅, 견적 채팅, 현장 채팅은 `chat_rooms.room_type`과 연결 id로 구분합니다.
- 견적/현장 업무 데이터가 채팅방에 종속되면 안 됩니다. 채팅방은 연결 통로이고, 업무 데이터는 견적/현장 테이블이 소유합니다.
- 현장 채팅 참여자 표시는 `chat_room_members`를 기준으로 하되, `project_members.invitation_status = 'removed'`는 UI에서 제외합니다.
- 읽음 숫자는 보낸 사람을 제외한 활성 참여자 수에서 읽은 사람 수를 뺀 값입니다.
- 현장 일정/보고서 알림은 채팅방 참여자와 알림 설정을 함께 고려해야 합니다.

## 배포 전 확인

- 새 SQL을 적용한 뒤 앱을 실행합니다.
- `npx expo lint`와 `npx tsc --noEmit`을 통과해야 합니다.
- 가게 프로필에서 주소/상세주소/좌표 저장 후 지도탭에 마커가 바로 나오는지 확인합니다.
- 무료/베이직/프리미엄/지역광고 권한을 각각 테스트합니다.
- 협력업체 파트너 계정으로 현장 조회, 채팅 참여, 수정 제한을 확인합니다.
- 고객 계정으로 내부 일일보고서가 보이지 않는지 확인합니다.

## 코드 리뷰 체크리스트

- 권한: 화면에서 버튼을 숨겼더라도 Supabase RLS/RPC에서 같은 제한이 걸려 있는지 확인합니다.
- 구독: 무료 fallback이 너무 넓게 열려 있지 않은지, 베이직/프리미엄/지역광고가 서버 함수와 UI에서 같은 의미인지 확인합니다.
- 지도: 주소 문자열만 저장한 상태인지, 실제 지도 노출에 필요한 위도/경도까지 저장했는지 확인합니다.
- 채팅: 새 업무 기능을 넣을 때 `chat_rooms`에 데이터를 직접 쌓지 말고 견적/현장 테이블을 소유자로 둡니다.
- 알림: 알림 테이블 저장, push token 발송, payload 클릭 이동이 모두 같은 entity id를 쓰는지 확인합니다.
- 파일 업로드: Storage bucket, RLS, DB row insert가 같은 권한 모델을 쓰는지 확인합니다.
- 다크모드: 새 버튼/아이콘은 `useAppTheme()` 또는 기존 테마 색상을 사용합니다.
- 중복 터치: 저장, 지도 확대, PDF 생성, 초대, 채팅방 생성처럼 느린 액션은 중복 실행 방지가 필요합니다.
- 플랫폼 차이: iOS/Android/Web 파일이 분리된 컴포넌트는 세 구현을 모두 확인합니다.

## 현재 리팩터링 후보

- `app/chat/[roomId].tsx`는 채팅, 통화, 약속, 후기, 현장 패널이 한 파일에 모여 있어 가장 먼저 분리할 후보입니다.
- `app/store/estimates.tsx`는 목록, 상세, 견적서 폼, PDF, 현장 전환이 섞여 있어 견적서 폼과 PDF 생성 로직을 분리하는 게 좋습니다.
- `app/store/projects.tsx`는 현장 상세, 일정, 보고서, 참여자 초대가 커져 있어 섹션별 컴포넌트 분리가 필요합니다.
- 기존 작성 화면 `sell.tsx`, `share.tsx`, `want.tsx`와 `components/ListingForm.tsx`가 기능을 일부 중복합니다. 장기적으로 공용 폼 하나로 통합하는 편이 안전합니다.
- 일부 Expo 템플릿 파일은 실제 서비스에서 쓰는지 확인 후 제거할 수 있습니다.

## 주의할 점

- 앱 코드에서 직접 구독 권한을 확정하지 말고 서버 RPC 결과를 기준으로 삼습니다.
- 신규 컬럼을 select에 추가하면 SQL이 먼저 배포되지 않은 환경에서 조회가 실패할 수 있습니다.
- 위치 선택처럼 화면 이동 후 값을 돌려받는 흐름은 입력 중인 값이 초기화되지 않는지 확인해야 합니다.
- RLS 오류가 나면 우선 해당 테이블 정책과 RPC security definer 여부를 확인합니다.
