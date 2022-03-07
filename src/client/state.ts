import { WebrtcP2pcall } from ".";

export const iceServers: RTCIceServer[] = [];

export let localStream: MediaStream;
export let remoteStream: MediaStream;
export let currentCall: WebrtcP2pcall;
export const setICEServers = (servers: RTCIceServer[]) => {
  iceServers.splice(0);
  iceServers.push(...servers);
};
export const setLocalStream = (v) => {
  localStream = v;
  (window as any).localStream = v;
};
export const setRemoteStream = (v) => {
  remoteStream = v;
  (window as any).remoteStream = v;
};
export const setCurrentCall = (v: WebrtcP2pcall) => {
  currentCall = v;
};
export const mediaConstains: MediaStreamConstraints = {
  video: true,
  audio: true,
};
