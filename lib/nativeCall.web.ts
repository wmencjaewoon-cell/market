import { createElement } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type MediaStream = {
  getTracks: () => { stop: () => void; enabled?: boolean }[];
  getAudioTracks: () => { enabled?: boolean }[];
  getVideoTracks: () => { enabled?: boolean }[];
  toURL: () => string;
};

const unsupportedCallMessage =
  '웹에서는 앱 내 보이스톡/영상통화를 지원하지 않습니다. 모바일 앱에서 이용해 주세요.';

export const mediaDevices = {
  async getUserMedia(): Promise<MediaStream> {
    throw new Error(unsupportedCallMessage);
  },
};

export class RTCIceCandidate {
  constructor(candidate: unknown) {
    Object.assign(this, candidate);
  }
}

export class RTCSessionDescription {
  constructor(description: unknown) {
    Object.assign(this, description);
  }
}

export class RTCPeerConnection {
  constructor() {
    throw new Error(unsupportedCallMessage);
  }
}

export function RTCView(props: { style?: StyleProp<ViewStyle> }) {
  return createElement(View, { style: props.style });
}

export const InCallManager = {
  start() {},
  stop() {},
  setSpeakerphoneOn() {},
  setMicrophoneMute() {},
};

export const isNativeCallSupported = false;
