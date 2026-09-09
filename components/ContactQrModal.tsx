// 연락처 QR 모달 플랫폼 브리지: 웹/네이티브 구현을 런타임에서 선택한다.
import { Platform } from 'react-native';

let ContactQrModal: any;

if (Platform.OS === 'web') {
  ContactQrModal = require('./ContactQrModal.web').default;
} else {
  ContactQrModal = require('./ContactQrModal.native').default;
}

export default ContactQrModal;
