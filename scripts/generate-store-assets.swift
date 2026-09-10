#!/usr/bin/env swift

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct StoreAssetSpec {
  let folder: String
  let width: Int
  let height: Int
  let device: DeviceKind
}

enum DeviceKind {
  case phone
  case tablet
}

struct StoreScene {
  let index: Int
  let slug: String
  let headline: String
  let subhead: String
  let background: NSColor
  let accent: NSColor
  let darkPhone: Bool
  let renderer: (CGRect, Bool) -> Void
}

let rootURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputURL = rootURL.appendingPathComponent("store-assets")
let logoURL = rootURL.appendingPathComponent("assets/images/icon.png")
let logoImage = NSImage(contentsOf: logoURL)
var activeCanvasHeight: CGFloat = 0

let green = color("#166534")
let deepGreen = color("#0F3F2A")
let mint = color("#DDEBDD")
let cream = color("#F8F2E7")
let warmWhite = color("#FFFDF8")
let charcoal = color("#151A16")
let ink = color("#161816")
let muted = color("#687268")
let line = color("#E5E0D6")
let tan = color("#D8B06B")
let red = color("#D64B3C")
let blueGray = color("#72809C")

let scenes: [StoreScene] = [
  StoreScene(
    index: 1,
    slug: "home",
    headline: "동네 인테리어 자재를\n빠르게 찾기",
    subhead: "판매, 나눔, 구함까지 가까운 매물을 한 화면에서 확인하세요.",
    background: warmWhite,
    accent: green,
    darkPhone: false,
    renderer: drawHomeScreen
  ),
  StoreScene(
    index: 2,
    slug: "map",
    headline: "내 주변 가게와 매물을\n지도에서 확인",
    subhead: "프리미엄 가게와 지역광고 매장을 지도에서 더 쉽게 찾을 수 있습니다.",
    background: mint,
    accent: deepGreen,
    darkPhone: false,
    renderer: drawMapScreen
  ),
  StoreScene(
    index: 3,
    slug: "chat",
    headline: "채팅으로 바로 문의하고\n약속까지",
    subhead: "견적, 현장, 일반 거래 채팅을 구분해서 관리합니다.",
    background: charcoal,
    accent: color("#A8D5A2"),
    darkPhone: true,
    renderer: drawChatScreen
  ),
  StoreScene(
    index: 4,
    slug: "estimate",
    headline: "견적 문의부터 견적서까지\n한 번에 정리",
    subhead: "신청자 정보, 일정, 금액, 첨부파일을 견적서로 저장하고 공유하세요.",
    background: cream,
    accent: green,
    darkPhone: false,
    renderer: drawEstimateScreen
  ),
  StoreScene(
    index: 5,
    slug: "store-center",
    headline: "가게 운영에 필요한 관리를\n한 곳에서",
    subhead: "상품, 직원, 고객, 견적, 현장까지 가게센터에서 관리합니다.",
    background: warmWhite,
    accent: deepGreen,
    darkPhone: false,
    renderer: drawStoreCenterScreen
  ),
  StoreScene(
    index: 6,
    slug: "project-report",
    headline: "현장 일정과 일일보고서를\n캘린더로 확인",
    subhead: "협력업체와 직원을 현장에 초대하고 사진 보고서를 남기세요.",
    background: color("#F1F5EF"),
    accent: green,
    darkPhone: false,
    renderer: drawProjectScreen
  ),
  StoreScene(
    index: 7,
    slug: "premium",
    headline: "프리미엄 가게는\n더 잘 보이게",
    subhead: "추천 노출, 지도 강조, 문의 통계로 가게의 발견 가능성을 높입니다.",
    background: color("#F6F1EA"),
    accent: deepGreen,
    darkPhone: false,
    renderer: drawPremiumScreen
  ),
  StoreScene(
    index: 8,
    slug: "calendar-widget",
    headline: "일정 알림과 위젯으로\n하루 일을 놓치지 않게",
    subhead: "현장, 견적, 개인 일정을 홈 화면에서 빠르게 확인하세요.",
    background: color("#111712"),
    accent: color("#B8E0B2"),
    darkPhone: true,
    renderer: drawWidgetScreen
  )
]

let specs = [
  StoreAssetSpec(folder: "app-store/iphone-6-9", width: 1290, height: 2796, device: .phone),
  StoreAssetSpec(folder: "app-store/ipad-13", width: 2048, height: 2732, device: .tablet),
  StoreAssetSpec(folder: "google-play/phone", width: 1080, height: 1920, device: .phone)
]

try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

for spec in specs {
  let folderURL = outputURL.appendingPathComponent(spec.folder)
  try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)

  for scene in scenes {
    let image = makeImage(width: spec.width, height: spec.height) {
      drawStoreAsset(scene: scene, spec: spec)
    }
    let name = String(format: "%02d-%@.png", scene.index, scene.slug)
    try writePNG(image, to: folderURL.appendingPathComponent(name))
  }
}

let featureGraphic = makeImage(width: 1024, height: 500) {
  drawFeatureGraphic()
}
try FileManager.default.createDirectory(
  at: outputURL.appendingPathComponent("google-play"),
  withIntermediateDirectories: true
)
try writePNG(featureGraphic, to: outputURL.appendingPathComponent("google-play/feature-graphic.png"))

print("Generated store assets in \(outputURL.path)")

func drawStoreAsset(scene: StoreScene, spec: StoreAssetSpec) {
  let width = CGFloat(spec.width)
  let height = CGFloat(spec.height)
  let canvas = CGRect(x: 0, y: 0, width: width, height: height)
  let isDark = scene.background.isDark

  scene.background.setFill()
  NSBezierPath(rect: canvas).fill()
  drawBackgroundBands(canvas, accent: scene.accent, dark: isDark)

  let margin = width * (spec.device == .tablet ? 0.085 : 0.082)
  let logoSize = width * (spec.device == .tablet ? 0.058 : 0.075)
  let top = height * (spec.device == .tablet ? 0.055 : 0.055)
  drawAppMark(
    in: CGRect(x: margin, y: top, width: logoSize, height: logoSize),
    title: "인테리어마켓",
    dark: isDark
  )

  let titleSize = width * (spec.device == .tablet ? 0.054 : 0.067)
  let subSize = width * (spec.device == .tablet ? 0.022 : 0.035)
  let titleY = height * (spec.device == .tablet ? 0.13 : 0.145)
  let textColor = isDark ? NSColor.white : ink
  let secondaryColor = isDark ? color("#C8D2C7") : muted

  drawText(
    scene.headline,
    in: CGRect(x: margin, y: titleY, width: width - margin * 2, height: height * 0.12),
    size: titleSize,
    weight: .heavy,
    color: textColor,
    lineHeight: titleSize * 1.15
  )
  drawText(
    scene.subhead,
    in: CGRect(x: margin, y: titleY + titleSize * 2.5, width: width - margin * 2, height: height * 0.08),
    size: subSize,
    weight: .medium,
    color: secondaryColor,
    lineHeight: subSize * 1.45
  )

  let phoneRect: CGRect
  if spec.device == .tablet {
    let deviceWidth = width * 0.70
    let deviceHeight = min(height * 0.60, deviceWidth * 1.32)
    phoneRect = CGRect(
      x: (width - deviceWidth) / 2,
      y: height - deviceHeight - height * 0.09,
      width: deviceWidth,
      height: deviceHeight
    )
  } else {
    let deviceHeight = height * (spec.height < 2200 ? 0.64 : 0.66)
    let deviceWidth = min(width * 0.72, deviceHeight * 0.49)
    phoneRect = CGRect(
      x: (width - deviceWidth) / 2,
      y: height - deviceHeight - height * 0.055,
      width: deviceWidth,
      height: deviceHeight
    )
  }

  drawDeviceFrame(rect: phoneRect, kind: spec.device, dark: scene.darkPhone) { contentRect in
    scene.renderer(contentRect, scene.darkPhone)
  }
}

func drawFeatureGraphic() {
  let canvas = CGRect(x: 0, y: 0, width: 1024, height: 500)
  color("#F7F3EA").setFill()
  NSBezierPath(rect: canvas).fill()

  drawRoundedRect(CGRect(x: -80, y: 360, width: 1180, height: 210), radius: 0, fill: deepGreen, alpha: 1)
  drawRoundedRect(CGRect(x: 620, y: -100, width: 520, height: 700), radius: 64, fill: mint, alpha: 1)

  drawAppMark(in: CGRect(x: 72, y: 62, width: 68, height: 68), title: "인테리어마켓", dark: false)
  drawText(
    "동네 인테리어 자재와\n공사 관리를 한 번에",
    in: CGRect(x: 72, y: 158, width: 570, height: 150),
    size: 44,
    weight: .heavy,
    color: ink,
    lineHeight: 54
  )
  drawText(
    "매물 찾기, 견적 문의, 현장 일정, 일일보고서까지",
    in: CGRect(x: 72, y: 320, width: 620, height: 44),
    size: 22,
    weight: .semibold,
    color: muted,
    lineHeight: 30
  )

  drawDeviceFrame(rect: CGRect(x: 690, y: 64, width: 220, height: 390), kind: .phone, dark: false) { rect in
    drawMiniMapAndList(rect)
  }
  drawRoundedRect(CGRect(x: 58, y: 398, width: 170, height: 44), radius: 22, fill: color("#F7F3EA"), alpha: 1)
  drawText("지도 기반 탐색", in: CGRect(x: 82, y: 407, width: 130, height: 28), size: 18, weight: .bold, color: deepGreen)
  drawRoundedRect(CGRect(x: 246, y: 398, width: 170, height: 44), radius: 22, fill: color("#F7F3EA"), alpha: 1)
  drawText("견적·현장 관리", in: CGRect(x: 265, y: 407, width: 140, height: 28), size: 18, weight: .bold, color: deepGreen)
}

func drawHomeScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  let text = dark ? NSColor.white : ink

  drawText("홈", in: CGRect(x: left, y: rect.minY + 28, width: rect.width - pad * 2, height: 34), size: 28, weight: .heavy, color: text)
  drawRoundedRect(CGRect(x: rect.maxX - pad - 48, y: rect.minY + 22, width: 48, height: 48), radius: 24, fill: green)
  drawText("+", in: CGRect(x: rect.maxX - pad - 48, y: rect.minY + 25, width: 48, height: 48), size: 32, weight: .bold, color: NSColor.white, align: .center)

  drawRoundedRect(CGRect(x: left, y: rect.minY + 86, width: rect.width - pad * 2, height: 54), radius: 18, fill: dark ? color("#222922") : color("#F1F3EF"))
  drawText("타일, 싱크대, 욕실자재 검색", in: CGRect(x: left + 24, y: rect.minY + 103, width: rect.width - pad * 2 - 48, height: 25), size: 15, weight: .medium, color: dark ? color("#BBC5B9") : muted)

  let chips = ["전체", "판매", "나눔", "구함"]
  var chipX = left
  for (index, chip) in chips.enumerated() {
    let chipWidth = CGFloat(54 + chip.count * 8)
    drawRoundedRect(CGRect(x: chipX, y: rect.minY + 158, width: chipWidth, height: 34), radius: 17, fill: index == 0 ? green : (dark ? color("#232B24") : color("#F2F0EA")))
    drawText(chip, in: CGRect(x: chipX, y: rect.minY + 167, width: chipWidth, height: 18), size: 13, weight: .bold, color: index == 0 ? NSColor.white : text, align: .center)
    chipX += chipWidth + 8
  }

  let cardTop = rect.minY + 220
  drawListingCard(x: left, y: cardTop, width: rect.width - pad * 2, title: "포세린 타일 600각", price: "18,000원", meta: "양산 물금읍 · 오늘 가능", badge: "판매", dark: dark, imageColor: color("#D6C19D"))
  drawListingCard(x: left, y: cardTop + 146, width: rect.width - pad * 2, title: "원목 하부장 나눔", price: "나눔", meta: "부산 화명동 · 인증가게", badge: "나눔", dark: dark, imageColor: color("#B7C49B"))
  drawListingCard(x: left, y: cardTop + 292, width: rect.width - pad * 2, title: "욕실 자재 구해요", price: "협의", meta: "김해 장유 · 채팅 3", badge: "구함", dark: dark, imageColor: color("#C7D3D2"))

  drawBottomTab(rect: rect, selected: 0, dark: dark)
}

func drawMapScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  drawMiniMapAndList(rect)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawRoundedRect(CGRect(x: left, y: rect.minY + 24, width: rect.width - pad * 2, height: 52), radius: 18, fill: dark ? color("#202720") : NSColor.white)
  drawText("양산시 물금읍 주변", in: CGRect(x: left + 22, y: rect.minY + 40, width: rect.width - pad * 2 - 44, height: 24), size: 17, weight: .bold, color: dark ? NSColor.white : ink)
  drawBottomTab(rect: rect, selected: 1, dark: dark)
}

func drawMiniMapAndList(_ rect: CGRect) {
  drawRoundedRect(rect, radius: 0, fill: color("#E8ECD9"))
  drawRoad(from: CGPoint(x: rect.minX + rect.width * 0.05, y: rect.minY + rect.height * 0.30), to: CGPoint(x: rect.maxX - rect.width * 0.10, y: rect.minY + rect.height * 0.18), width: 18)
  drawRoad(from: CGPoint(x: rect.minX + rect.width * 0.20, y: rect.minY + rect.height * 0.06), to: CGPoint(x: rect.maxX - rect.width * 0.08, y: rect.minY + rect.height * 0.58), width: 14)
  drawRoad(from: CGPoint(x: rect.minX + rect.width * 0.08, y: rect.minY + rect.height * 0.62), to: CGPoint(x: rect.maxX - rect.width * 0.05, y: rect.minY + rect.height * 0.48), width: 16)

  drawMapMarker(x: rect.minX + rect.width * 0.28, y: rect.minY + rect.height * 0.34, text: "판매", fill: green)
  drawMapMarker(x: rect.minX + rect.width * 0.65, y: rect.minY + rect.height * 0.43, text: "가게", fill: deepGreen, premium: true)
  drawMapMarker(x: rect.minX + rect.width * 0.47, y: rect.minY + rect.height * 0.24, text: "광고", fill: color("#295B37"), star: true)
  drawCluster(x: rect.minX + rect.width * 0.72, y: rect.minY + rect.height * 0.26, count: 8)

  let sheetY = rect.maxY - rect.height * 0.30
  drawRoundedRect(CGRect(x: rect.minX + 16, y: sheetY, width: rect.width - 32, height: rect.height * 0.25), radius: 24, fill: NSColor.white)
  drawText("추천 가게", in: CGRect(x: rect.minX + 36, y: sheetY + 22, width: 120, height: 26), size: 19, weight: .heavy, color: ink)
  drawStoreRow(x: rect.minX + 36, y: sheetY + 64, width: rect.width - 72, title: "프리미엄 인증 가게", meta: "타일 · 도배 · 장판", badge: "PREMIUM")
}

func drawChatScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: true)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("욕실 리모델링 견적", in: CGRect(x: left, y: rect.minY + 28, width: rect.width - pad * 2, height: 30), size: 22, weight: .heavy, color: NSColor.white)
  drawRoundedRect(CGRect(x: left, y: rect.minY + 78, width: rect.width - pad * 2, height: 86), radius: 18, fill: color("#232C24"))
  drawText("오늘 일정", in: CGRect(x: left + 18, y: rect.minY + 96, width: 120, height: 22), size: 15, weight: .bold, color: color("#A8D5A2"))
  drawText("10:30 현장 실측 · 15:00 타일 샘플 확인", in: CGRect(x: left + 18, y: rect.minY + 124, width: rect.width - pad * 2 - 36, height: 25), size: 14, weight: .medium, color: color("#D6DDD3"))

  drawBubble("욕실 타일은 포세린으로 진행하고 싶어요.", x: left, y: rect.minY + 210, width: rect.width * 0.68, sent: false, dark: true)
  drawBubble("네, 철거 포함 견적서로 정리해서 보내드릴게요.", x: rect.maxX - pad - rect.width * 0.66, y: rect.minY + 304, width: rect.width * 0.66, sent: true, dark: true)
  drawBubble("내일 오전 방문 가능할까요?", x: left, y: rect.minY + 398, width: rect.width * 0.55, sent: false, dark: true)
  drawBubble("가능합니다. 약속으로 등록해둘게요.", x: rect.maxX - pad - rect.width * 0.58, y: rect.minY + 488, width: rect.width * 0.58, sent: true, dark: true, unread: "1")

  drawRoundedRect(CGRect(x: left, y: rect.maxY - 112, width: 48, height: 48), radius: 24, fill: color("#263027"))
  drawText("+", in: CGRect(x: left, y: rect.maxY - 107, width: 48, height: 42), size: 26, weight: .bold, color: NSColor.white, align: .center)
  drawRoundedRect(CGRect(x: left + 60, y: rect.maxY - 116, width: rect.width - pad * 2 - 122, height: 56), radius: 22, fill: color("#252C25"))
  drawText("메시지 보내기", in: CGRect(x: left + 82, y: rect.maxY - 98, width: 160, height: 23), size: 15, weight: .medium, color: color("#AAB4A8"))
  drawRoundedRect(CGRect(x: rect.maxX - pad - 52, y: rect.maxY - 114, width: 52, height: 52), radius: 26, fill: green)
  drawText("↑", in: CGRect(x: rect.maxX - pad - 52, y: rect.maxY - 111, width: 52, height: 48), size: 25, weight: .bold, color: NSColor.white, align: .center)
}

func drawEstimateScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("견적관리", in: CGRect(x: left, y: rect.minY + 28, width: 160, height: 34), size: 27, weight: .heavy, color: ink)
  drawRoundedRect(CGRect(x: left, y: rect.minY + 84, width: rect.width - pad * 2, height: 46), radius: 16, fill: color("#F0F2ED"))
  drawText("신청자명, 제목, 지역 검색", in: CGRect(x: left + 18, y: rect.minY + 98, width: 230, height: 22), size: 14, weight: .medium, color: muted)

  drawEstimateRow(rect: CGRect(x: left, y: rect.minY + 158, width: rect.width - pad * 2, height: 104), title: "욕실 리모델링", name: "정재운", phone: "010-1234-5678", amount: "견적 작성중", active: true)
  drawEstimateRow(rect: CGRect(x: left, y: rect.minY + 278, width: rect.width - pad * 2, height: 104), title: "거실 도배·장판", name: "김민지", phone: "010-9876-1234", amount: "4,730,000원", active: false)

  let boxY = rect.minY + 430
  drawRoundedRect(CGRect(x: left, y: boxY, width: rect.width - pad * 2, height: 238), radius: 22, fill: NSColor.white, stroke: line)
  drawText("견적서 작성", in: CGRect(x: left + 22, y: boxY + 22, width: 180, height: 27), size: 21, weight: .heavy, color: ink)
  drawMoneyLine(x: left + 22, y: boxY + 72, width: rect.width - pad * 2 - 44, title: "시공비", value: "2,200,000원")
  drawMoneyLine(x: left + 22, y: boxY + 112, width: rect.width - pad * 2 - 44, title: "자재비", value: "1,500,000원")
  drawMoneyLine(x: left + 22, y: boxY + 152, width: rect.width - pad * 2 - 44, title: "잔금", value: "2,300,000원", highlight: true)
  drawRoundedRect(CGRect(x: left + 22, y: boxY + 190, width: 120, height: 34), radius: 17, fill: green)
  drawText("PDF 저장", in: CGRect(x: left + 22, y: boxY + 199, width: 120, height: 18), size: 13, weight: .bold, color: NSColor.white, align: .center)
  drawRoundedRect(CGRect(x: left + 154, y: boxY + 190, width: 120, height: 34), radius: 17, fill: color("#F2F0EA"))
  drawText("첨부 보기", in: CGRect(x: left + 154, y: boxY + 199, width: 120, height: 18), size: 13, weight: .bold, color: ink, align: .center)
}

func drawStoreCenterScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("가게센터", in: CGRect(x: left, y: rect.minY + 28, width: 170, height: 34), size: 27, weight: .heavy, color: ink)
  drawRoundedRect(CGRect(x: left, y: rect.minY + 86, width: rect.width - pad * 2, height: 86), radius: 22, fill: deepGreen)
  drawText("프리미엄 인증 완료", in: CGRect(x: left + 24, y: rect.minY + 108, width: 220, height: 24), size: 18, weight: .heavy, color: NSColor.white)
  drawText("상품 50개 · 직원 무제한 · 전체 통계", in: CGRect(x: left + 24, y: rect.minY + 136, width: 260, height: 20), size: 13, weight: .medium, color: color("#DDEBDD"))

  let cardW = (rect.width - pad * 2 - 14) / 2
  let items = [
    ("상품관리", "50개 등록", "🧱"),
    ("직원관리", "무제한", "👥"),
    ("견적관리", "전체 보기", "🧾"),
    ("현장관리", "일정·보고서", "📋")
  ]
  for (index, item) in items.enumerated() {
    let col = CGFloat(index % 2)
    let row = CGFloat(index / 2)
    let x = left + col * (cardW + 14)
    let y = rect.minY + 204 + row * 124
    drawRoundedRect(CGRect(x: x, y: y, width: cardW, height: 106), radius: 20, fill: NSColor.white, stroke: line)
    drawText(item.2, in: CGRect(x: x + 18, y: y + 18, width: 34, height: 34), size: 28, weight: .regular, color: ink)
    drawText(item.0, in: CGRect(x: x + 18, y: y + 58, width: cardW - 36, height: 22), size: 16, weight: .heavy, color: ink)
    drawText(item.1, in: CGRect(x: x + 18, y: y + 82, width: cardW - 36, height: 18), size: 12, weight: .medium, color: muted)
  }

  drawRoundedRect(CGRect(x: left, y: rect.minY + 480, width: rect.width - pad * 2, height: 126), radius: 22, fill: color("#F2F7F0"))
  drawText("문의 통계", in: CGRect(x: left + 22, y: rect.minY + 500, width: 140, height: 22), size: 17, weight: .heavy, color: ink)
  drawBarChart(x: left + 24, y: rect.minY + 538, width: rect.width - pad * 2 - 48, height: 50)
}

func drawProjectScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("현장관리", in: CGRect(x: left, y: rect.minY + 28, width: 170, height: 34), size: 27, weight: .heavy, color: ink)
  drawRoundedRect(CGRect(x: left, y: rect.minY + 84, width: rect.width - pad * 2, height: 86), radius: 22, fill: NSColor.white, stroke: line)
  drawText("욕실 리모델링", in: CGRect(x: left + 22, y: rect.minY + 106, width: 220, height: 24), size: 18, weight: .heavy, color: ink)
  drawText("양산 물금읍 · 진행중 · 참여자 4명", in: CGRect(x: left + 22, y: rect.minY + 136, width: 260, height: 20), size: 13, weight: .medium, color: muted)

  let cal = CGRect(x: left, y: rect.minY + 200, width: rect.width - pad * 2, height: 276)
  drawCalendar(rect: cal, compact: false, selectedDay: 18)

  drawRoundedRect(CGRect(x: left, y: rect.minY + 506, width: rect.width - pad * 2, height: 104), radius: 22, fill: color("#F8F7F2"), stroke: line)
  drawText("일일보고서", in: CGRect(x: left + 22, y: rect.minY + 526, width: 150, height: 24), size: 18, weight: .heavy, color: ink)
  drawText("타일 시공 완료 · 사진 6장 · 고객 공개", in: CGRect(x: left + 22, y: rect.minY + 556, width: 260, height: 22), size: 13, weight: .medium, color: muted)
  drawPhotoThumbs(x: left + 22, y: rect.minY + 584, count: 4)
}

func drawPremiumScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: dark)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("요금제", in: CGRect(x: left, y: rect.minY + 28, width: 170, height: 34), size: 27, weight: .heavy, color: ink)

  let cards = [
    ("기본", "무료", "상품 5개 · 기본 지도 노출", false),
    ("베이직", "월 19,900원", "상품 20개 · 공지 · 오늘 가능", false),
    ("프리미엄", "월 33,000원", "추천 노출 · 지도 강조 · 상세 통계", true),
    ("지역광고", "월 55,000원부터", "지역 홈 상단 · 광고 마커", true)
  ]
  for (index, card) in cards.enumerated() {
    let y = rect.minY + 88 + CGFloat(index) * 126
    drawRoundedRect(CGRect(x: left, y: y, width: rect.width - pad * 2, height: 104), radius: 22, fill: card.3 ? deepGreen : NSColor.white, stroke: card.3 ? deepGreen : line)
    drawText(card.0, in: CGRect(x: left + 22, y: y + 20, width: 150, height: 25), size: 19, weight: .heavy, color: card.3 ? NSColor.white : ink)
    drawText(card.1, in: CGRect(x: left + 22, y: y + 49, width: 180, height: 22), size: 15, weight: .bold, color: card.3 ? color("#DDEBDD") : green)
    drawText(card.2, in: CGRect(x: left + 22, y: y + 74, width: rect.width - pad * 2 - 44, height: 20), size: 12, weight: .medium, color: card.3 ? color("#DDEBDD") : muted)
    if card.3 {
      drawRoundedRect(CGRect(x: rect.maxX - pad - 94, y: y + 20, width: 72, height: 28), radius: 14, fill: color("#F4E6B8"))
      drawText("인증", in: CGRect(x: rect.maxX - pad - 94, y: y + 27, width: 72, height: 14), size: 11, weight: .heavy, color: deepGreen, align: .center)
    }
  }

  drawRoundedRect(CGRect(x: left, y: rect.minY + 620, width: rect.width - pad * 2, height: 52), radius: 20, fill: green)
  drawText("이벤트 기간 프리미엄 적용", in: CGRect(x: left, y: rect.minY + 636, width: rect.width - pad * 2, height: 22), size: 15, weight: .heavy, color: NSColor.white, align: .center)
}

func drawWidgetScreen(_ rect: CGRect, _ dark: Bool) {
  fillScreen(rect, dark: true)
  let pad = rect.width * 0.06
  let left = rect.minX + pad
  drawText("일정표", in: CGRect(x: left, y: rect.minY + 28, width: 150, height: 34), size: 27, weight: .heavy, color: NSColor.white)
  drawRoundedRect(CGRect(x: left, y: rect.minY + 88, width: rect.width - pad * 2, height: 310), radius: 30, fill: color("#1E261F"))
  drawText("9월", in: CGRect(x: left + 24, y: rect.minY + 112, width: 80, height: 28), size: 22, weight: .heavy, color: NSColor.white)
  drawCalendar(rect: CGRect(x: left + 20, y: rect.minY + 154, width: rect.width - pad * 2 - 40, height: 210), compact: true, selectedDay: 18, dark: true)

  drawRoundedRect(CGRect(x: left, y: rect.minY + 428, width: rect.width - pad * 2, height: 86), radius: 24, fill: color("#252E26"))
  drawText("오늘 일정", in: CGRect(x: left + 22, y: rect.minY + 448, width: 100, height: 22), size: 16, weight: .heavy, color: color("#B8E0B2"))
  drawText("욕실 철거 · 도배 실측", in: CGRect(x: left + 22, y: rect.minY + 476, width: 220, height: 22), size: 15, weight: .bold, color: NSColor.white)

  drawRoundedRect(CGRect(x: left, y: rect.minY + 536, width: rect.width - pad * 2, height: 86), radius: 24, fill: color("#252E26"))
  drawText("내일 일정", in: CGRect(x: left + 22, y: rect.minY + 556, width: 100, height: 22), size: 16, weight: .heavy, color: color("#B8E0B2"))
  drawText("타일 시공 · 자재 입고 확인", in: CGRect(x: left + 22, y: rect.minY + 584, width: 240, height: 22), size: 15, weight: .bold, color: NSColor.white)
}

func drawBottomTab(rect: CGRect, selected: Int, dark: Bool) {
  let h: CGFloat = 82
  let y = rect.maxY - h
  drawRoundedRect(CGRect(x: rect.minX, y: y, width: rect.width, height: h), radius: 0, fill: dark ? color("#181F19") : NSColor.white, stroke: dark ? color("#2F382F") : line)
  let labels = ["홈", "지도", "채팅", "내정보"]
  for (index, label) in labels.enumerated() {
    let x = rect.minX + CGFloat(index) * rect.width / 4
    let selectedColor = dark ? NSColor.white : ink
    let idleColor = dark ? color("#899486") : color("#9AA094")
    drawCircle(center: CGPoint(x: x + rect.width / 8, y: y + 24), radius: 8, fill: index == selected ? selectedColor : idleColor)
    drawText(label, in: CGRect(x: x, y: y + 42, width: rect.width / 4, height: 20), size: 11, weight: .bold, color: index == selected ? selectedColor : idleColor, align: .center)
  }
}

func drawDeviceFrame(rect: CGRect, kind: DeviceKind, dark: Bool, content: (CGRect) -> Void) {
  withShadow(color: NSColor.black.withAlphaComponent(0.20), blur: 28, offset: CGSize(width: 0, height: 18)) {
    drawRoundedRect(rect, radius: kind == .tablet ? 48 : 60, fill: dark ? color("#0B0F0C") : color("#111411"))
  }
  let bezel = kind == .tablet ? rect.width * 0.035 : rect.width * 0.045
  let inner = rect.insetBy(dx: bezel, dy: bezel)
  drawRoundedRect(inner, radius: kind == .tablet ? 32 : 44, fill: dark ? color("#101611") : color("#FCFBF7"))
  NSGraphicsContext.saveGraphicsState()
  NSBezierPath(
    roundedRect: topLeftRect(inner),
    xRadius: kind == .tablet ? 32 : 44,
    yRadius: kind == .tablet ? 32 : 44
  ).addClip()
  content(inner)
  NSGraphicsContext.restoreGraphicsState()

  if kind == .phone {
    let notchW = rect.width * 0.30
    drawRoundedRect(
      CGRect(x: rect.midX - notchW / 2, y: rect.minY + bezel * 0.65, width: notchW, height: bezel * 0.42),
      radius: bezel * 0.20,
      fill: dark ? color("#050705") : color("#111411")
    )
  }
}

func fillScreen(_ rect: CGRect, dark: Bool) {
  drawRoundedRect(rect, radius: 0, fill: dark ? color("#101611") : color("#FCFBF7"))
}

func drawListingCard(x: CGFloat, y: CGFloat, width: CGFloat, title: String, price: String, meta: String, badge: String, dark: Bool, imageColor: NSColor) {
  drawRoundedRect(CGRect(x: x, y: y, width: width, height: 124), radius: 22, fill: dark ? color("#1B211B") : NSColor.white, stroke: dark ? color("#2C342C") : line)
  drawRoundedRect(CGRect(x: x + 16, y: y + 16, width: 92, height: 92), radius: 18, fill: imageColor)
  drawRoundedRect(CGRect(x: x + 122, y: y + 18, width: 48, height: 24), radius: 12, fill: green)
  drawText(badge, in: CGRect(x: x + 122, y: y + 24, width: 48, height: 14), size: 10, weight: .heavy, color: NSColor.white, align: .center)
  drawText(title, in: CGRect(x: x + 122, y: y + 49, width: width - 138, height: 24), size: 17, weight: .heavy, color: dark ? NSColor.white : ink)
  drawText(price, in: CGRect(x: x + 122, y: y + 75, width: width - 138, height: 24), size: 16, weight: .bold, color: green)
  drawText(meta, in: CGRect(x: x + 122, y: y + 99, width: width - 138, height: 20), size: 12, weight: .medium, color: dark ? color("#AEB8AB") : muted)
}

func drawStoreRow(x: CGFloat, y: CGFloat, width: CGFloat, title: String, meta: String, badge: String) {
  drawRoundedRect(CGRect(x: x, y: y, width: 58, height: 58), radius: 18, fill: mint)
  drawText("가", in: CGRect(x: x, y: y + 17, width: 58, height: 24), size: 19, weight: .heavy, color: deepGreen, align: .center)
  drawText(title, in: CGRect(x: x + 72, y: y + 4, width: width - 72, height: 24), size: 16, weight: .heavy, color: ink)
  drawText(meta, in: CGRect(x: x + 72, y: y + 30, width: width - 72, height: 18), size: 12, weight: .medium, color: muted)
  drawRoundedRect(CGRect(x: x + width - 94, y: y + 6, width: 80, height: 24), radius: 12, fill: deepGreen)
  drawText(badge, in: CGRect(x: x + width - 94, y: y + 12, width: 80, height: 12), size: 9, weight: .heavy, color: NSColor.white, align: .center)
}

func drawEstimateRow(rect: CGRect, title: String, name: String, phone: String, amount: String, active: Bool) {
  drawRoundedRect(rect, radius: 22, fill: active ? color("#F2F7F0") : NSColor.white, stroke: active ? green : line)
  drawText(title, in: CGRect(x: rect.minX + 20, y: rect.minY + 18, width: rect.width - 40, height: 24), size: 18, weight: .heavy, color: ink)
  drawText("\(name) · \(phone)", in: CGRect(x: rect.minX + 20, y: rect.minY + 48, width: rect.width - 40, height: 20), size: 13, weight: .medium, color: muted)
  drawText(amount, in: CGRect(x: rect.minX + 20, y: rect.minY + 74, width: rect.width - 40, height: 20), size: 13, weight: .bold, color: active ? green : ink)
}

func drawMoneyLine(x: CGFloat, y: CGFloat, width: CGFloat, title: String, value: String, highlight: Bool = false) {
  drawText(title, in: CGRect(x: x, y: y, width: 120, height: 22), size: 14, weight: .medium, color: muted)
  drawText(value, in: CGRect(x: x + 120, y: y, width: width - 120, height: 22), size: 15, weight: .heavy, color: highlight ? green : ink, align: .right)
}

func drawBubble(_ text: String, x: CGFloat, y: CGFloat, width: CGFloat, sent: Bool, dark: Bool, unread: String? = nil) {
  let bubbleColor = sent ? green : color("#222A23")
  let textColor = NSColor.white
  drawRoundedRect(CGRect(x: x, y: y, width: width, height: 66), radius: 22, fill: bubbleColor)
  drawText(text, in: CGRect(x: x + 18, y: y + 17, width: width - 36, height: 36), size: 14, weight: .semibold, color: textColor, lineHeight: 20)
  if let unread {
    drawText(unread, in: CGRect(x: x - 18, y: y + 44, width: 14, height: 16), size: 11, weight: .bold, color: color("#B8E0B2"), align: .right)
  }
}

func drawBarChart(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
  let values: [CGFloat] = [0.45, 0.75, 0.58, 0.90, 0.66, 0.82, 0.50]
  let gap: CGFloat = 8
  let barWidth = (width - gap * CGFloat(values.count - 1)) / CGFloat(values.count)
  for (index, value) in values.enumerated() {
    let h = height * value
    drawRoundedRect(CGRect(x: x + CGFloat(index) * (barWidth + gap), y: y + height - h, width: barWidth, height: h), radius: 6, fill: index == 3 ? green : color("#C7D8C5"))
  }
}

func drawCalendar(rect: CGRect, compact: Bool, selectedDay: Int, dark: Bool = false) {
  drawRoundedRect(rect, radius: compact ? 16 : 22, fill: dark ? color("#1E261F") : NSColor.white, stroke: dark ? color("#344034") : line)
  let columns = 7
  let rows = 5
  let pad: CGFloat = compact ? 10 : 16
  let headerH: CGFloat = compact ? 20 : 28
  let cellW = (rect.width - pad * 2) / CGFloat(columns)
  let cellH = (rect.height - pad * 2 - headerH) / CGFloat(rows)
  let days = ["일", "월", "화", "수", "목", "금", "토"]
  for col in 0..<columns {
    let c = col == 0 ? red : (dark ? color("#B5BEB2") : muted)
    drawText(days[col], in: CGRect(x: rect.minX + pad + CGFloat(col) * cellW, y: rect.minY + pad, width: cellW, height: headerH), size: compact ? 9 : 11, weight: .bold, color: c, align: .center)
  }

  var day = 1
  for row in 0..<rows {
    for col in 0..<columns {
      let cell = CGRect(x: rect.minX + pad + CGFloat(col) * cellW, y: rect.minY + pad + headerH + CGFloat(row) * cellH, width: cellW, height: cellH)
      let isHoliday = col == 0
      let isSelected = day == selectedDay
      if isSelected {
        drawRoundedRect(cell.insetBy(dx: compact ? 4 : 6, dy: compact ? 5 : 7), radius: compact ? 8 : 12, fill: green)
      }
      let dayColor: NSColor
      if isSelected {
        dayColor = NSColor.white
      } else if isHoliday {
        dayColor = red
      } else {
        dayColor = dark ? NSColor.white : ink
      }
      drawText("\(day)", in: CGRect(x: cell.minX, y: cell.minY + (compact ? 4 : 7), width: cell.width, height: 16), size: compact ? 9 : 12, weight: .bold, color: dayColor, align: .center)
      if [6, 13, 18, 24].contains(day) {
        let eventColor = isSelected ? NSColor.white : green
        drawRoundedRect(CGRect(x: cell.minX + cell.width * 0.25, y: cell.minY + cellH - 10, width: cell.width * 0.5, height: 4), radius: 2, fill: eventColor)
      }
      day += 1
    }
  }
}

func drawPhotoThumbs(x: CGFloat, y: CGFloat, count: Int) {
  for i in 0..<count {
    let rect = CGRect(x: x + CGFloat(i) * 44, y: y, width: 36, height: 28)
    drawRoundedRect(rect, radius: 8, fill: [tan, color("#B7C49B"), color("#D4D8D1"), color("#C3B29B")][i % 4])
  }
}

func drawMapMarker(x: CGFloat, y: CGFloat, text: String, fill: NSColor, premium: Bool = false, star: Bool = false) {
  drawCircle(center: CGPoint(x: x, y: y), radius: 30, fill: fill)
  if premium {
    drawCircle(center: CGPoint(x: x, y: y), radius: 34, fill: NSColor.clear, stroke: color("#F4D36B"), lineWidth: 4)
  }
  if star {
    drawText("★", in: CGRect(x: x - 12, y: y - 37, width: 24, height: 18), size: 13, weight: .bold, color: color("#F4D36B"), align: .center)
  }
  drawText(text, in: CGRect(x: x - 26, y: y - 8, width: 52, height: 16), size: 11, weight: .heavy, color: NSColor.white, align: .center)
}

func drawCluster(x: CGFloat, y: CGFloat, count: Int) {
  drawCircle(center: CGPoint(x: x, y: y), radius: 30, fill: color("#575F57"))
  drawText("\(count)", in: CGRect(x: x - 20, y: y - 10, width: 40, height: 20), size: 16, weight: .heavy, color: NSColor.white, align: .center)
}

func drawRoad(from: CGPoint, to: CGPoint, width: CGFloat) {
  let path = NSBezierPath()
  path.move(to: topLeftPoint(from))
  path.line(to: topLeftPoint(to))
  path.lineWidth = width
  path.lineCapStyle = .round
  color("#D4D9C7").setStroke()
  path.stroke()
  path.lineWidth = max(2, width * 0.22)
  NSColor.white.withAlphaComponent(0.65).setStroke()
  path.stroke()
}

func drawBackgroundBands(_ rect: CGRect, accent: NSColor, dark: Bool) {
  let band1 = NSBezierPath()
  band1.move(to: topLeftPoint(CGPoint(x: rect.minX, y: rect.maxY * 0.74)))
  band1.line(to: topLeftPoint(CGPoint(x: rect.maxX, y: rect.maxY * 0.58)))
  band1.line(to: topLeftPoint(CGPoint(x: rect.maxX, y: rect.maxY)))
  band1.line(to: topLeftPoint(CGPoint(x: rect.minX, y: rect.maxY)))
  band1.close()
  accent.withAlphaComponent(dark ? 0.26 : 0.12).setFill()
  band1.fill()

  let band2 = NSBezierPath()
  band2.move(to: topLeftPoint(CGPoint(x: rect.minX, y: rect.maxY * 0.88)))
  band2.line(to: topLeftPoint(CGPoint(x: rect.maxX, y: rect.maxY * 0.74)))
  band2.line(to: topLeftPoint(CGPoint(x: rect.maxX, y: rect.maxY)))
  band2.line(to: topLeftPoint(CGPoint(x: rect.minX, y: rect.maxY)))
  band2.close()
  (dark ? NSColor.white : accent).withAlphaComponent(dark ? 0.06 : 0.08).setFill()
  band2.fill()
}

func drawAppMark(in rect: CGRect, title: String, dark: Bool) {
  drawRoundedRect(rect, radius: rect.width * 0.22, fill: dark ? NSColor.white : NSColor.white, stroke: dark ? color("#CAD5CA") : line)
  if let logoImage {
    logoImage.draw(in: topLeftRect(rect.insetBy(dx: rect.width * 0.10, dy: rect.height * 0.10)))
  } else {
    drawCircle(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width * 0.32, fill: green)
  }
  drawText(title, in: CGRect(x: rect.maxX + rect.width * 0.22, y: rect.minY + rect.height * 0.18, width: rect.width * 4.5, height: rect.height * 0.62), size: rect.height * 0.34, weight: .heavy, color: dark ? NSColor.white : ink)
}

func drawCircle(center: CGPoint, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
  let rect = topLeftRect(CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
  let path = NSBezierPath(ovalIn: rect)
  if fill != NSColor.clear {
    fill.setFill()
    path.fill()
  }
  if let stroke {
    stroke.setStroke()
    path.lineWidth = lineWidth
    path.stroke()
  }
}

func drawRoundedRect(_ rect: CGRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, alpha: CGFloat = 1) {
  let path = NSBezierPath(roundedRect: topLeftRect(rect), xRadius: radius, yRadius: radius)
  fill.withAlphaComponent(alpha).setFill()
  path.fill()
  if let stroke {
    stroke.setStroke()
    path.lineWidth = 1
    path.stroke()
  }
}

func withShadow(color: NSColor, blur: CGFloat, offset: CGSize, draw: () -> Void) {
  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = color
  shadow.shadowBlurRadius = blur
  shadow.shadowOffset = offset
  shadow.set()
  draw()
  NSGraphicsContext.restoreGraphicsState()
}

func drawText(
  _ text: String,
  in rect: CGRect,
  size: CGFloat,
  weight: NSFont.Weight,
  color: NSColor,
  align: NSTextAlignment = .left,
  lineHeight: CGFloat? = nil
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = align
  paragraph.lineBreakMode = .byWordWrapping
  if let lineHeight {
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
  }
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: color,
    .paragraphStyle: paragraph
  ]
  NSString(string: text).draw(with: topLeftRect(rect), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes, context: nil)
}

func makeImage(width: Int, height: Int, draw: () -> Void) -> CGImage {
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let bitmapInfo = CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
  guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: bitmapInfo
  ) else {
    fatalError("Could not create CGContext")
  }

  let graphicsContext = NSGraphicsContext(cgContext: context, flipped: false)
  NSGraphicsContext.saveGraphicsState()
  activeCanvasHeight = CGFloat(height)
  NSGraphicsContext.current = graphicsContext
  draw()
  NSGraphicsContext.restoreGraphicsState()

  guard let image = context.makeImage() else {
    fatalError("Could not create CGImage")
  }
  return image
}

func topLeftRect(_ rect: CGRect) -> CGRect {
  CGRect(x: rect.minX, y: activeCanvasHeight - rect.maxY, width: rect.width, height: rect.height)
}

func topLeftPoint(_ point: CGPoint) -> CGPoint {
  CGPoint(x: point.x, y: activeCanvasHeight - point.y)
}

func writePNG(_ image: CGImage, to url: URL) throws {
  guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    throw NSError(domain: "StoreAssetGenerator", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create PNG destination"])
  }
  CGImageDestinationAddImage(destination, image, nil)
  if !CGImageDestinationFinalize(destination) {
    throw NSError(domain: "StoreAssetGenerator", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not write PNG"])
  }
}

func color(_ hex: String, alpha: CGFloat = 1) -> NSColor {
  var cleaned = hex.replacingOccurrences(of: "#", with: "")
  if cleaned.count == 3 {
    cleaned = cleaned.map { "\($0)\($0)" }.joined()
  }
  var value: UInt64 = 0
  Scanner(string: cleaned).scanHexInt64(&value)
  let r = CGFloat((value >> 16) & 0xFF) / 255.0
  let g = CGFloat((value >> 8) & 0xFF) / 255.0
  let b = CGFloat(value & 0xFF) / 255.0
  return NSColor(calibratedRed: r, green: g, blue: b, alpha: alpha)
}

extension NSColor {
  var isDark: Bool {
    guard let rgb = usingColorSpace(.deviceRGB) else { return false }
    let luminance = 0.2126 * rgb.redComponent + 0.7152 * rgb.greenComponent + 0.0722 * rgb.blueComponent
    return luminance < 0.35
  }
}
