# 홈 분야 버튼 / 방문 일정 (2026-09-28)

## 변경 범위

- `components/AsHomeScreen.tsx`: 분야별 빠른 접수를 3열 2행으로 고정. ScrollView 내부의 `height: '100%'`와 줄바꿈 그리드를 제거해 버튼이 늘어나거나 다음 영역과 겹치지 않게 함.
- 기존 문의 영역을 `components/AsHomeVisitSection.tsx`로 교체. 최근 문의 건수는 위쪽 '내 문의' 바로가기에 유지.
- 사용자가 직접 조정한 홈 상단 문의 영역의 둥근 모서리와 좌우 여백은 그대로 유지. 동네 선택 헤더는 수정하지 않음.
- 가게 후기 구현은 유지하면서 홈에서 숨김. 기존 가게 상세의 후기 기능에는 영향 없음.

## 방문 일정 사용

1. 문의를 접수하고 업체가 해당 문의의 견적/현장 채팅을 연다.
2. 그 채팅방에서 기존 '약속잡기'로 날짜와 시간을 보낸다.
3. 홈으로 돌아오면 분야 버튼 아래에 '방문 예약 진행중' 영역이 표시된다.
4. 전화 연결은 해당 가게 프로필의 전화번호를 사용하고, 실시간 상담은 해당 문의의 채팅방으로 바로 이동한다.

- 본인이 신청한 문의이면서 현재 참여 중인 채팅방만 조회. 일반 장터 거래 약속이나 다른 고객의 문의는 표시하지 않음.
- 같은 방에서는 가장 최근에 전송한 약속 하나만 사용. 날짜를 바꾸면 이전 약속을 다시 보여주지 않음.
- 오늘과 이후 일정만 날짜순으로 정렬. 오늘 일정은 시간이 지나도 그날까지 표시. 완료/취소된 방과 문의/현장은 제외.
- 여러 일정은 좌우 화살표로 전환. 방을 페이지 단위로 읽어 100개 이후의 일정도 누락하지 않음.
- 홈 재진입, 앱이 다시 활성화될 때, 홈 새로고침에서 재조회. 실시간 위치 추적이나 상시 푸시 구독을 추가한 것은 아님.
- 비로그인, 일정 없음, 조회 중, 실패/재시도, 가게 연락처 없음 상태를 각각 처리.
- 희망일은 고객의 선호 날짜일 뿐이므로 방문 예약으로 표시하지 않음.

### 현재 예약 상태의 의미

기존 채팅은 `약속 제안` 메시지를 저장하며 별도의 예약 확정/기사 출발 상태를 저장하지 않는다. 따라서 홈에도 '일정 제안'으로 표시한다. **예약 확정, 취소 처리, 기사 이동/도착 추적을 새로 구현한 것은 아니다.** 시안의 가상 기사 이름이나 '이동 중' 문구를 실제 상태처럼 표시하지 않는다. 취소 의사를 일반 대화로 남긴 것만으로는 일정을 자동 제거하지 않으며, 별도 확정/취소 흐름이 필요하면 구조화된 예약 데이터와 상태 변경 기능을 추가해야 한다.

채팅 메시지 형식을 변경할 경우 `lib/asHomeVisits.ts`의 `APPOINTMENT_PREFIX`와 `parseVisitAppointment`를 함께 변경하고 테스트한다. 홈 조회는 기존 Supabase RLS를 사용하는 읽기 전용 조회이며, SQL/패키지 설치/네이티브 재설정은 필요하지 않다.

## 후기를 다시 켜기

`components/AsHomeScreen.tsx` 상단의 설정 한 줄을 변경:

```ts
const SHOW_AS_HOME_REVIEWS = true;
```

현재는 `false`이므로 빈 후기 영역도 보이지 않고 리뷰 조회 요청도 보내지 않는다. `true`로 바꾸면 기존 `fetchAsHomeReviews()`로 실제 인증 가게 후기/첨부사진을 읽고 가게 상세로 연결한다. 임의 후기나 평점을 생성하지 않는다.

## 이번 작업만 되돌리기

프로젝트 루트에서:

```sh
git apply --check docs/rollback-as-home-visits.patch
git apply docs/rollback-as-home-visits.patch
```

변경 전 홈 화면을 복원하고 이번에 추가한 방문 일정 컴포넌트/조회 헬퍼/테스트만 제거한다. 문의/채팅/업로드 등 운영 데이터는 변경하지 않는다. 이후 추가 수정으로 첫 명령이 실패하면 강제로 적용하지 않는다.

직전 원본: `docs/backups/AsHomeScreen-before-home-visits-20260928.txt`.

## 검증

```sh
npx --no-install tsc --noEmit
npx --no-install eslint components/AsHomeScreen.tsx components/AsHomeVisitSection.tsx lib/asHomeVisits.ts
node --test tests/asHomeVisits.test.cjs tests/asHomeData.test.cjs tests/asInquiry.test.cjs tests/mediaAttachments.test.cjs tests/estimateNotifications.test.cjs
```

- 테스트 37개: 날짜/형식 검증, 본인 문의/멤버십 필터, 완료/취소 제외, 최신 약속, 정렬/페이지 처리, 연락처와 실패 처리 등.
- Playwright: 320/390/1440px의 밝은/어두운 화면에서 버튼 6개 경계와 2행 배치, 영역 겹침, 예약 전환, 비로그인/빈 상태/오류 재시도/연락처 없음, 해당 채팅방 이동, 숨긴 후기 미조회 확인.
- 브라우저 예약 데이터와 로그인은 모의 데이터 사용. 운영 계정의 RLS/실제 전화 앱/실기기 터치는 자동 테스트에서 확인하지 않음.
- iOS/Android JS 번들 생성. 기존 WebRTC의 `event-target-shim` exports 경고는 별도로 남아 있음.
- 역패치 검사 및 임시 복사본의 복구 결과와 백업 비교.

실행 중인 개발 화면: http://localhost:8081/home
