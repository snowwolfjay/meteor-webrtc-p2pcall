export interface WebrtcSignal {
  _id?: string;
  callId: string;
  userId?: string;
  target: string;
  type: "new-ice-candidate" | "offer" | "answer" | "hangup";
  sdp?: any;
  candidate?: any;
  handled?: boolean;
}
export const WebrtcSignals = new Mongo.Collection<WebrtcSignal>(
  "webrtc_signals"
);
export enum P2PCALL_STATUS {
  ENDED,
  TALKING,
  CALLING,
}
export enum P2PCALL_KIND {
  Audio,
  Video,
}
export interface WebrtcP2pcall {
  _id: string;
  callerId: string;
  calleeId: string;
  createAt: Date;
  startAt?: Date;
  endAt?: Date;
  status: P2PCALL_STATUS;
  kind: P2PCALL_KIND;
}
export const WebrtcP2pcalls = new Mongo.Collection<WebrtcP2pcall>(
  "webrtc_p2pcall"
);

export const getAnother = (userId: string, p2pcall: WebrtcP2pcall) => {
  return p2pcall.calleeId === userId ? p2pcall.callerId : p2pcall.calleeId;
};
export type RTCActionEvent = StreamEvent | CloseEvent;
interface CloseEvent {
  event: "close";
  reason?: string;
}
interface StreamEvent {
  event: "stream" | "localstream";
  stream: MediaStream;
}
