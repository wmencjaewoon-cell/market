import { Platform } from 'react-native';

let ContactQrModal: any;

if (Platform.OS === 'web') {
  ContactQrModal = require('./ContactQrModal.web').default;
} else {
  ContactQrModal = require('./ContactQrModal.native').default;
}

export default ContactQrModal;