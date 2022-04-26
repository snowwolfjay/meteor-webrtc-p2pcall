export const iceServers = [] as any[];

export let localStream: MediaStream | null;
export let remoteStream: MediaStream | null;

export const setLocalStream = (v: MediaStream | null) => {
  localStream = v;
  (window as any).localStream = v;
};
export const setRemoteStream = (v: MediaStream | null) => {
  remoteStream = v;
  (window as any).remoteStream = v;
};

export const mediaConstains: MediaStreamConstraints = {
  video: true,
  audio: true,
};

export const senders = {
  audio: null as null | RTCRtpSender,
  video: null as null | RTCRtpSender,
};
