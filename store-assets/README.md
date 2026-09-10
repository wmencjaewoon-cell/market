# 스토어 등록 이미지

앱스토어와 구글 플레이스토어 등록에 사용할 수 있는 초안 이미지입니다.

## 다시 생성

```bash
swift scripts/generate-store-assets.swift
```

## App Store

- `app-store/iphone-6-9/`
  - iPhone 6.9형용 세로 스크린샷
  - 크기: `1290 x 2796`
  - 파일: `01-home.png` ~ `08-calendar-widget.png`
- `app-store/ipad-13/`
  - iPad 13형용 세로 스크린샷
  - 크기: `2048 x 2732`
  - `app.json`의 `ios.supportsTablet`가 `true`라서 iPad 스크린샷도 같이 준비했습니다.

App Store Connect에는 앱 버전 화면의 **App Previews and Screenshots** 영역에 올리면 됩니다.

## Google Play

- `google-play/phone/`
  - 휴대전화 세로 스크린샷
  - 크기: `1080 x 1920`
  - 파일: `01-home.png` ~ `08-calendar-widget.png`
- `google-play/feature-graphic.png`
  - 그래픽 이미지
  - 크기: `1024 x 500`

Play Console에는 **Grow users > Store presence > Main store listing > Graphics**에서 올리면 됩니다.

## 구성

1. 홈 매물 탐색
2. 지도 기반 가게/매물 확인
3. 채팅과 약속
4. 견적 문의/견적서
5. 가게센터
6. 현장관리/일일보고서
7. 프리미엄 요금제
8. 일정 알림/위젯

개인 전화번호, 실제 주소, 실제 고객명은 넣지 않았습니다.
