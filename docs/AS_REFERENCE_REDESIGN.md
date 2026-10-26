# AS 홈·문의 화면 시안 적용 (2026-09-28)

## 적용 범위

- 첨부 HTML의 홈, 사진·영상 문의 화면을 기존 Expo 화면으로 옮겼습니다.
- 이름은 `우리집 AS`, 주요 버튼은 진한 녹색을 유지합니다. 다크모드도 기존 테마를 사용합니다.
- 홈: AS 문의 버튼, 내 문의/근처 가게/장터, 6개 수리 분야, 실제 최근 문의.
- 분야 선택: 해당 카테고리가 선택된 문의 화면으로 이동합니다.
- 문의: 사진/영상 선택 또는 촬영, 첨부 미리보기/삭제, 증상 선택, 추가 설명, 연락처, 주소/희망일, 접을 수 있는 가게 선택.
- 기존 제한(합계 6개, 사진 10MB, 영상 30MB)을 유지합니다. 앱에서 영상 촬영 시 최대 10초를 요청합니다. 웹은 파일 선택기를 사용하며 촬영 방식은 브라우저에 따릅니다.
- 제목을 생략하면 선택한 분야로 제목을 만듭니다. 사진·영상/증상/직접 입력 내용 중 하나는 있어야 합니다. 이름과 전화번호는 필수입니다.
- 실제 접수·첨부 업로드와 실패 시 이어서 업로드하는 흐름은 유지합니다. 가게 미선택 문의의 관리자 배정/알림 흐름도 유지합니다.
- 최근 문의는 로그인한 본인의 원본 문의 1건만 조회합니다. 다른 계정의 캐시를 보여주지 않으며 로딩/없음/실패 상태를 구분합니다.

## 그대로 둔 항목

- 장터, 채팅, 가게 관리, 요금제, 하단 탭 구성, 서버 권한/DB 스키마.
- 예시의 AI 진단/음성 인식, 3분 견적, 즉시 출동, 무상 보증, 가상 후기/가상 일정은 구현하거나 표시하지 않았습니다.
- 이번 변경을 위한 SQL 실행이나 패키지 추가는 없습니다. 사진·영상은 기존 설치 모듈과 스토리지 설정을 사용합니다.

## 수정 파일

- `app/(tabs)/home/index.tsx`: 간편 AS 홈을 새 컴포넌트로 연결. 장터 화면은 유지.
- `components/AsHomeScreen.tsx`: 홈 UI와 본인 문의 요약 조회.
- `app/estimate/create.tsx`: 실제 문의 작성 화면 재구성.
- `lib/asInquiry.ts`: 분야 매핑과 문의 본문 생성 규칙.
- `tests/asInquiry.test.cjs`: 분야 파라미터 검증/빈 문의/첨부-only/증상 저장 테스트.

## 이번 변경만 되돌리기

작업 시작 당시 이미 수정되어 있던 파일을 기준으로 역패치를 만들었습니다. Git HEAD로 되돌리는 명령이 아니므로 이전 작업은 유지됩니다.

프로젝트 루트에서 실행:

```sh
git apply --check docs/rollback-as-reference-redesign.patch
git apply docs/rollback-as-reference-redesign.patch
```

첫 명령이 실패하면 이후 추가 수정과 충돌한 것입니다. 강제 적용하거나 `git reset --hard`를 실행하지 말고 차이를 확인하세요. 이미 적용한 뒤 두 번째로 실행할 수도 없습니다.

- 백업: `docs/backups/home-before-as-redesign-20260928.tsx.txt`
- 백업: `docs/backups/inquiry-before-as-redesign-20260928.tsx.txt`
- 역패치는 원본 2개를 복구하고 이번에 추가한 소스/테스트 3개를 제거합니다. 백업·문서·패치 자체는 남깁니다.
- 접수한 문의/첨부 등 실제 데이터는 롤백으로 삭제하지 않습니다.
- 이전 홈 단순화 작업까지 되돌리려면 이 패치를 먼저 적용한 뒤 이전 문서를 확인해야 합니다.

## 확인 방법

실행 결과:

- TypeScript와 변경 파일 ESLint 통과.
- 문의 구성, 미디어 업로드, 관리자/가게 알림 회귀 테스트 26개 통과.
- iOS/Android JS 번들 생성 통과. 기존 WebRTC의 `event-target-shim` exports 경고는 남아 있습니다.
- Playwright로 320/390/1440px, light/dark 6개 조합 확인: 가로 넘침 없음, 카테고리 이동, 증상 선택/해제, 가게 선택 접기/펼치기, 연락처 입력. 390px light에서는 사진 파일 선택/삭제도 확인.
- 임시 복사본에 역패치를 실제 적용하여 원본 2개가 백업과 바이트 단위로 같고 신규 소스/테스트 3개가 제거되는 것을 검증.
- 네이티브 실기기 촬영과 운영 DB 실제 접수/푸시 수신은 이번 자동 검증에 포함하지 않았습니다.

```sh
npx --no-install tsc --noEmit
npx --no-install eslint 'app/(tabs)/home/index.tsx' app/estimate/create.tsx components/AsHomeScreen.tsx lib/asInquiry.ts tests/asInquiry.test.cjs
node --test tests/asInquiry.test.cjs tests/mediaAttachments.test.cjs tests/estimateNotifications.test.cjs
```

실기기 확인: 카메라 권한 거절/허용, 사진·영상 촬영/선택/삭제, 실제 문의 접수 및 관리자 알림, 업로드 실패 후 재시도. 자동 테스트에서는 운영 DB에 문의를 제출하지 않습니다.
