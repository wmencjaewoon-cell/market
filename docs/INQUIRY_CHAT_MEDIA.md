# AS 문의와 채팅 사진/영상 첨부

## 사용 범위

- AS/견적문의: 사진과 영상을 합쳐 최대 6개 선택, 삭제, 영상 미리보기.
- 내 문의 내역, 가게 견적관리, 관리자 문의 내용: 첨부 사진/영상 조회.
- 채팅: `+ > 사진·영상`에서 최대 10개 선택. 사진은 기존 묶음 메시지, 영상은 개별 메시지로 전송.
- 채팅의 카메라 메뉴는 기존 사진 촬영 기능을 유지한다. 녹화한 영상은 사진·영상 메뉴에서 선택한다.
- 사진은 10MB, 영상은 30MB까지. 파일을 순차 업로드하고 중복 전송을 막는다.
- 문의 업로드 실패 후 같은 화면에서 `첨부 재시도`를 누르면 기존 문의에 나머지 파일을 연결한다. 화면을 나간 뒤의 재시도 큐는 영구 저장하지 않는다.
- 영상은 누르면 앱 내 재생 화면에서 재생/일시정지/탐색/전체화면으로 확인한다. 화면 이탈과 백그라운드 전환 시 재생을 중지한다.
- 견적 PDF에는 사진을 유지하고 영상은 링크로 포함한다. PDF 자체에 동영상을 삽입하지 않는다.

## 배포 순서

1. Supabase SQL Editor에서 다음 파일을 실행한다.

   `supabase/migrations/20260921000000_inquiry_chat_video_attachments.sql`

   기존 `estimate-images`, `chat-images` 버킷이 있어야 한다. 허용 MIME과 최소 30MB 파일 제한만 조정하며 public 여부, RLS, 다른 테이블/버킷은 변경하지 않는다. Storage 프로젝트 전체 제한도 30MB 이상이어야 한다. 기존 이미지 경로와 사진 메시지는 호환된다.

2. 채팅 영상 알림 문구를 배포한다.

   ```sh
   npx supabase functions deploy send-chat-push
   ```

3. 네이티브 앱을 새로 빌드한다. `expo-video`는 package.json/package-lock.json에 설치했고 app.json 플러그인도 등록했다. 다른 컴퓨터에서는 먼저 `npm ci`를 실행한다.

   iOS, 기존 Xcode 배포 방식:

   ```sh
   npx expo prebuild --platform ios
   open ios/*.xcworkspace
   ```

   Xcode에서 새 빌드/Archive 후 TestFlight에 업로드한다. prebuild는 빌드 자체가 아니다. 기존 네이티브 수정과 인증 설정을 지우는 `--clean`은 사용하지 않는다.

   Android, 로컬 테스트:

   ```sh
   npx expo prebuild --platform android
   npx expo run:android
   ```

   배포는 기존 release/AAB 빌드 절차를 따른다. OTA 업데이트만으로는 설치된 앱에 영상 네이티브 모듈을 추가할 수 없다. 모듈이 없는 앱에서는 종료 대신 업데이트 안내를 표시한다. [Expo Video 공식 문서](https://docs.expo.dev/versions/v54.0.0/sdk/video/)

## 구현 경계

- `lib/mediaAttachments.ts`: 실제 MIME/확장자, 크기 제한, 영상 메시지 직렬화/검증.
- `lib/mediaUpload.ts`: 기존 경로 규칙을 유지한 바이너리 업로드. 미전송 파일 정리는 기존 DELETE 권한 내에서만 시도한다.
- `components/VideoAttachment.tsx`, `app/media/video.tsx`: 중복 진입 방지 및 구버전 네이티브 모듈 가드.
- `components/AttachmentVideoPlayer.tsx`: 모듈 확인 후에만 로드되는 expo-video 플레이어.
- `estimate_request_images.image_path`의 실제 확장자로 사진/영상을 구분하므로 새 DB 컬럼은 없다.
- 채팅 영상은 `[video:v1]`와 JSON 본문을 사용한다. 이 버전 이전 앱은 영상 전용 UI를 지원하지 않으므로 송수신자 모두 업데이트해야 한다.
- 기존 사진의 public URL 접근 방식을 그대로 사용한다. 이 변경은 버킷을 새로 공개하지 않으며, 접근 제어를 강화하려면 별도로 private 버킷/signed URL 전환이 필요하다.
- 서버 변환/압축은 없다. MP4(H.264/AAC)가 일반적으로 호환성이 높지만 MOV/HEVC 등은 상대 기기 코덱 지원 여부에 따라 재생 실패 안내가 나올 수 있다.

## 확인

```sh
node --test tests/mediaAttachments.test.cjs
npx tsc --noEmit
```

실기기 확인 항목:

- iOS/Android에서 사진과 영상을 섞어 문의 등록하고 신청자/배정 가게/관리자가 각각 확인.
- 일반/견적/현장 채팅에서 영상 전송, 수신, 재생, 뒤로가기 후 입력줄 정상 작동.
- 30MB 초과 영상 거부, 선택 취소, 네트워크 실패, 문의 첨부 재시도와 중복 문의 방지.
- 구버전 네이티브 빌드에서 영상 선택 후 재생 시 업데이트 안내.
- 견적 PDF에 깨진 영상 이미지가 없고 영상 링크가 열리는지 확인.

운영 Supabase SQL/Edge Function 배포와 Xcode/Android 네이티브 빌드는 코드 변경 과정에서 자동 실행하지 않는다.
