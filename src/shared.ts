import { MongoObservable } from "meteor-rxjs";

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
export const WebrtcSignals = new MongoObservable.Collection<WebrtcSignal>(
  "webrtc_signals"
);
export enum P2PCALL_STATUS {
  ENDED,
  TALKING,
  CALLING,
}
export enum P2PCALL_TYPE {
  VOICE,
  VIDEO,
}

export interface WebrtcP2pcall {
  readonly _id?: string;
  readonly callerId: string;
  readonly calleeId: string;
  readonly createAt: Date;
  readonly startAt?: Date;
  readonly endAt?: Date;
  readonly endReason?: string;
  readonly status: P2PCALL_STATUS;
  readonly type: P2PCALL_TYPE;
}
export const WebrtcP2pcalls = new MongoObservable.Collection<WebrtcP2pcall>(
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

export interface WebrtcP2pCallInstance {
  data: WebrtcP2pcall;
  pickup(): WebrtcP2pCallInstance;
  hangup(): void;
  mute(): void;
}
