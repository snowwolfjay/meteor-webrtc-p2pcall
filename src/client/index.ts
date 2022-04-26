import { Observable } from "rxjs";
import {
  P2PCALL_KIND,
  P2PCALL_STATUS,
  RTCActionEvent,
  WebrtcP2pcall,
  WebrtcP2pcalls,
} from "../shared";
import {
  iceServers,
  localStream,
  mediaConstains,
  setLocalStream,
} from "./state";
import {
  createConnection,
  endP2pCall,
  publishLocalStream,
  watchSignal,
} from "./internal";
export * from "../shared";
// const log = (...args: any[]) => {}; //log(...args);

export const callWith = (uid: string, kind: P2PCALL_KIND) => {
  console.log(`call with ${uid} @ ${kind}`);
  return new Observable<RTCActionEvent | { event: "setup"; callId: string }>(
    (suber) => {
      Meteor.call(
        "webrtc/p2pcall/create",
        uid,
        kind,
        (err: { reason: any }, res: string) => {
          if (err || !res) {
            return suber.error((err && err.reason) || "发起通话失败");
          }
          suber.next({ event: "setup", callId: res });
          suber.add(
            watchSignal(res).subscribe((v) => {
              suber.next(v);
            })
          );
        }
      );
      return () =>
        endP2pCall(
          WebrtcP2pcalls.findOne({
            callee: uid,
            status: { $gt: P2PCALL_STATUS.ENDED },
          })!
        );
    }
  );
};
export const watchCalls = (
  ices: Array<{
    urls?: string;
    username?: string;
    credential?: string;
  }>
) => {
  iceServers.splice(0, iceServers.length, ...ices);
  return new Observable<WebrtcP2pcall[]>((suber) => {
    const sub = Meteor.subscribe("webrtc.p2pcall");
    const query = {
      $or: [{ calleeId: Meteor.userId()! }, { callerId: Meteor.userId()! }],
    };
    const list = WebrtcP2pcalls.find(query).fetch();
    const sub1 = WebrtcP2pcalls.find(query).observe({
      added(doc) {
        const oi = list.findIndex((el) => el._id === doc._id);
        if (oi > -1) {
          list.splice(oi, 1, doc);
        } else {
          list.push(doc);
        }
        suber.next(list);
      },
      removed(doc) {
        const oi = list.findIndex((el) => el._id === doc._id);
        if (oi === -1) {
          return;
        }
        list.splice(oi, 1);
        suber.next(list);
      },
      changed(this: any, doc) {
        this.added(doc);
      },
    });
    suber.next(list);
    return () => {
      sub1.stop();
      sub.stop();
    };
  });
};
export const setMediaConfig = (conf: MediaStreamConstraints) => {
  Object.assign(mediaConstains, conf);
};

export const acceptCall = (p2pcall: WebrtcP2pcall) => {
  const callId = p2pcall._id!;
  return new Observable<RTCActionEvent>((suber) => {
    WebrtcP2pcalls.update(
      callId,
      {
        $set: {
          startAt: new Date(),
          status: P2PCALL_STATUS.TALKING,
        },
      },
      {},
      (err: any, v: number) => {
        console.log({ err, v });
        if (suber.closed) return;
        if (v !== 1 || err) return suber.error(err?.reason ?? `接听通话失败`);
        const ssub = createConnection(p2pcall).subscribe((v) => {
          console.error(v);
          suber.next(v);
        });
        publishLocalStream(p2pcall).then((stream) => {
          suber.next({
            event: "localstream",
            stream,
          });
        });
        suber.add(ssub);
        const lq = watchSignal(callId).subscribe((v) => suber.next(v));
        suber.add(lq);
      }
    );
    return () => {
      WebrtcP2pcalls.update(callId, {
        $set: {
          startAt: new Date(),
          status: P2PCALL_STATUS.ENDED,
        },
      });
    };
  });
};
export const hangup = (p2pcall: WebrtcP2pcall) => {
  endP2pCall(p2pcall);
};

export const toggleCamera = (call: WebrtcP2pcall) => {
  const facingMode =
    (mediaConstains.video as any)?.facingMode === "user"
      ? "environment"
      : "user";
  setMediaConfig({ video: { facingMode } });
  localStream.getTracks().forEach((track) => {
    track.stop();
  });
  setLocalStream(null);
  return publishLocalStream(call);
};

export { localStream, remoteStream } from "./state";
