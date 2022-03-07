import { filter, map } from "rxjs/operators";
import { firstValueFrom, Observable } from "rxjs";
import {
  P2PCALL_STATUS,
  P2PCALL_TYPE,
  RTCActionEvent,
  WebrtcP2pcall,
  WebrtcP2pcalls,
} from "../shared";
import { setICEServers } from "./state";
import {
  createConnection,
  endP2pCall,
  publishLocalStream,
  watchSignal,
  configStreamAuto,
  toggleTrack,
} from "./internal";
export * from "../shared";

export const callWith = (
  uid: string,
  callType: P2PCALL_TYPE = P2PCALL_TYPE.VIDEO
) => {
  return new Observable<RTCActionEvent | { event: "setup"; callId: string }>(
    (suber) => {
      Meteor.call(
        "webrtc/p2pcall/create",
        uid,
        callType,
        (err: any, res: string) => {
          if (err || !res) {
            return suber.error((err && err.reason) || "发起通话失败");
          }
          suber.next({ event: "setup", callId: res });
          firstValueFrom(
            (
              WebrtcP2pcalls.find({
                _id: res,
              }) as any as Observable<WebrtcP2pcall>
            ).pipe(
              map((v) => v[0]),
              filter((v) => !!v)
            )
          ).then((call) => {
            suber.add(
              watchSignal(call).subscribe((v) => {
                suber.next(v);
              })
            );
          });
        }
      );
      return () =>
        endP2pCall(
          WebrtcP2pcalls.findOne({
            callee: uid,
            status: { $gt: P2PCALL_STATUS.ENDED },
          })
        );
    }
  );
};
export const watchCalls = (iceServers: RTCIceServer[]) => {
  return new Observable<WebrtcP2pcall[]>((suber) => {
    setICEServers(iceServers);
    const sub = Meteor.subscribe("webrtc.p2pcall");
    suber.add(
      WebrtcP2pcalls.find({ calleeId: Meteor.userId() }).subscribe((v) =>
        suber.next(v)
      )
    );
    return () => {
      sub.stop();
    };
  });
};
export const configStream = (conf: MediaStreamConstraints) => {
  configStreamAuto(conf);
};

export const pickup = (p2pcall: WebrtcP2pcall) => {
  const callId = p2pcall._id;
  console.error(p2pcall);
  return new Observable<RTCActionEvent>((suber) => {
    WebrtcP2pcalls.update(callId, {
      $set: {
        startAt: new Date(),
        status: P2PCALL_STATUS.TALKING,
        calleeId: Meteor.userId(),
      },
    }).subscribe((v) => {
      if (v !== 1) return console.error(`incorrect call to pick`);
      suber.add(
        createConnection(p2pcall).subscribe((v) => {
          suber.next(v);
        })
      );
      publishLocalStream(p2pcall);
      suber.add(watchSignal(p2pcall).subscribe((v) => suber.next(v)));
    });
  });
};
export const hangup = (p2pcall: WebrtcP2pcall) => {
  endP2pCall(p2pcall);
};

export const toggleMute = (p2pcall: WebrtcP2pcall) => {
  return !toggleTrack(p2pcall, "audio");
};

export const toggleMask = (p2pcall: WebrtcP2pcall) => {
  return !toggleTrack(p2pcall, "video");
};
export { localStream, remoteStream } from "./state";
