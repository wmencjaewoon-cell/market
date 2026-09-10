// 네이티브 음성/영상 통화 헬퍼: WebRTC peer connection과 InCallManager 제어를 캡슐화한다.
import InCallManager from 'react-native-incall-manager';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';

export {
  InCallManager,
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
};

export type { MediaStream };

export const isNativeCallSupported = true;
