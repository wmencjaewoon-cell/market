// 네이티브 QR 모달 대체 구현: 현재는 QR 렌더링 없이 공유 링크 안내만 맡는다.
type Props = {
  visible: boolean;
  onClose: () => void;
  deepLinkUrl: string;
};

export default function ContactQrModal(_: Props) {
  return null;
}
