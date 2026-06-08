import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import QRCode from 'react-qr-code';

type Props = {
  visible: boolean;
  onClose: () => void;
  deepLinkUrl: string;
};

export default function ContactQrModal({
  visible,
  onClose,
  deepLinkUrl,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.box}>
              <Text style={styles.title}>앱으로 연결하기</Text>
              <Text style={styles.desc}>
                휴대폰 카메라로 QR을 스캔하면 앱에서 바로 채팅 화면으로 이동해요.
              </Text>

              <View style={styles.qrWrap}>
                <QRCode value={deepLinkUrl} size={180} />
              </View>

              <Text style={styles.linkText}>{deepLinkUrl}</Text>

              <TouchableOpacity style={styles.openBtn} onPress={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = deepLinkUrl;
                }
              }}>
                <Text style={styles.openBtnText}>앱으로 열기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  desc: {
    marginTop: 10,
    textAlign: 'center',
    color: '#6b7280',
    lineHeight: 22,
  },
  qrWrap: {
    marginTop: 18,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  linkText: {
    marginTop: 14,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  openBtn: {
    marginTop: 18,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  openBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  closeBtn: {
    marginTop: 10,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});