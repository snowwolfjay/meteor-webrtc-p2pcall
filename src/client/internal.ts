import { Observable } from "rxjs";
import { shareReplay } from "rxjs/operators";
import {
  getAnother,
  P2PCALL_KIND,
  P2PCALL_STATUS,
  RTCActionEvent,
  WebrtcP2pcall,
  WebrtcP2pcalls,
  WebrtcSignal,
  WebrtcSignals,
} from "../shared";
import {
  iceServers,
  localStream,
  mediaConstains,
  senders,
  setLocalStream,
} from "./state";

export let con: RTCPeerConnection;

const log = (...args: any[]) => {
  console.warn(...args);
}; //log(...args);
export function handledSignale(signal: WebrtcSignal) {
  return new Promise<number>((resolve, reject) => {
    WebrtcSignals.update(
      { _id: signal._id },
      { $set: { handled: true } },
      {},
      (err: any, data: number) => {
        err ? reject(err) : resolve(data);
      }
    );
  });
}

export function watchSignal(callId: string) {
  const subRem = Meteor.subscribe("webrtc.p2psignals", callId);
  console.error(`watch signal ${callId}`);
  return new Observable<RTCActionEvent>((suber) => {
    const target = Meteor.userId()!;
    log(callId, target);
    let answered = false;
    const ices = [] as any[];
    const lq = WebrtcSignals.find({ target, callId }).observe({
      added(doc: WebrtcSignal) {
        handledSignale(doc);
        const call = WebrtcP2pcalls.findOne(callId);
        if (!call) return;
        if (doc.type === "hangup") {
          suber.complete();
          endP2pCall(call, true);
          return;
        }
        const isOffer = call.calleeId === Meteor.userId()!;
        console.warn({ call, doc, isOffer });
        if (doc.type === "offer" && doc.sdp) {
          if (!call) return suber.error("call fail");
          suber.add(
            createConnection(call).subscribe((v) => {
              if (v.event === "stream") {
                suber.next(v);
              } else {
                console.warn({ call, doc, isOffer });
              }
            })
          );
          const desc = new RTCSessionDescription(doc.sdp);
          log(`set remote desc ${con.iceConnectionState}`);
          // if (con.signalingState != "stable") {
          //   log(
          //     "  - But the signaling state isn't stable, so triggering rollback"
          //   );
          //   // Set the local and remove descriptions for rollback; don't proceed
          //   // until both return.
          //   con.setLocalDescription({ type: "rollback" });
          //   con.setRemoteDescription(desc);
          // } else
          con
            .setRemoteDescription(desc)
            .then(function () {
              return publishLocalStream(call);
            })
            .then(function (stream) {
              suber.next({ event: "localstream", stream });
            })
            .then(function () {
              return con.createAnswer({});
            })
            .then(function (answer) {
              return con.setLocalDescription(answer);
            })
            .then(function () {
              if (!con.localDescription) throw new Error(`need local desc`);
              WebrtcSignals.insert({
                type: "answer",
                sdp: con.localDescription.toJSON(),
                callId: call._id!,
                target: call.calleeId,
              });
            })
            .catch((err) => suber.error(err));
          log("handle offer");
          ices.forEach((el) => handleNewICECandidate(el));
        } else if (doc.type === "new-ice-candidate" && doc.candidate) {
          const candidate = new RTCIceCandidate(doc.candidate);
          if (!isOffer || answered)
            handleNewICECandidate(candidate).catch((err) => suber.error(err));
          else {
            ices.push(candidate);
          }
        } else if (doc.type === "answer" && doc.sdp) {
          log(`set remote desc ${con.iceConnectionState}`);
          answered = true;
          const sdp = new RTCSessionDescription(doc.sdp);
          con.setRemoteDescription(sdp).catch((err) => suber.error(err));
        }
      },
    });
    return () => {
      subRem.stop();
      lq.stop();
    };
  });
}

export async function handleNewICECandidate(candidate: RTCIceCandidate) {
  await con.addIceCandidate(candidate);
  return log(`set candi`, candidate);
}

export async function endP2pCall(
  p2pcall: WebrtcP2pcall | null,
  remote = false
) {
  log(`end`, p2pcall);
  senders.audio = senders.video = null;
  if (localStream) {
    localStream
      ?.getTracks()
      .forEach((el) => (el.stop(), localStream?.removeTrack(el)));
    setLocalStream(null);
  }
  if (con) {
    con.close();
    con = null as any;
  }
  if (!p2pcall) return;
  if (!remote) {
    await new Promise((res) => {
      WebrtcSignals.insert(
        {
          type: "hangup",
          target: getAnother(Meteor.userId()!, p2pcall),
          callId: p2pcall._id!,
        },
        res
      );
    });
  }
  return new Promise<any>((res, rej) => {
    WebrtcP2pcalls.update(
      p2pcall._id!,
      {
        $set: {
          status: P2PCALL_STATUS.ENDED,
          endAt: new Date(),
        },
      },
      {},
      (err: any, doc: unknown) => {
        err ? rej(err) : res(doc);
      }
    );
  });
}
export function createConnection(p2pcall: WebrtcP2pcall) {
  if (!con) {
    console.log(`create connection at${p2pcall._id}`);
    con = new RTCPeerConnection({ iceServers });
  }
  return new Observable<RTCActionEvent>((suber) => {
    const target = getAnother(Meteor.userId()!, p2pcall);
    const callId = p2pcall._id!;
    let connected = false;
    con.onicecandidate = (ev) => {
      log(`ice change ${target}`);
      log(ev);
      if (ev.candidate) {
        WebrtcSignals.insert({
          type: "new-ice-candidate",
          callId,
          candidate: ev.candidate.toJSON(),
          target,
        });
      } else {
        console.info(`ice ended --- result ${con.iceConnectionState}`);
      }
    };
    const endCall = () => {
      endP2pCall(p2pcall);
      suber.next({ event: "close" });
    };
    con.ontrack = (ev) => {
      log(`stream come`);
      const stream = ev.streams[0];
      if (!stream) return;
      // stream.onaddtrack = (ev) => {
      //   console.warn("add track", ev);
      // };
      // stream.onremovetrack = (ev) => {
      //   console.warn("remove track", ev);
      // };
      // log(ev.streams);
      suber.next({
        event: "stream",
        stream,
      });
    };
    con.onnegotiationneeded = async (ev) => {
      log(`nego ----- ${target}`);
      console.warn(ev);
      if (con.signalingState != "stable") {
        return;
      }
      const offer = await con.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        // iceRestart: true,
      });
      await con.setLocalDescription(offer);
      if (!con.localDescription) throw new Error(`need local desc`);
      WebrtcSignals.insert({
        callId,
        type: "offer",
        sdp: con.localDescription.toJSON(),
        target,
      });
    };
    con.onicecandidateerror = (ev) => {
      console.error(ev);
    };
    con.oniceconnectionstatechange = () => {
      console.warn(con.iceConnectionState);
      switch (con.iceConnectionState) {
        case "connected":
          connected = true;
          console.error(con.getTransceivers());
          break;
        case "closed":
        case "failed":
        case "disconnected":
          endCall();
          if (!connected) {
            suber.next({ event: "close", reason: "fail" });
          }
          break;
      }
    };
    con.onicegatheringstatechange = (ev) => console.warn(con.iceGatheringState);
    con.onsignalingstatechange = (ev) => {
      console.warn(con.signalingState);
      switch (con.signalingState) {
        case "closed":
          endCall();
          break;
      }
    };
    log(`setup connection`);
    // con.
    return () => {
      endCall();
    };
  }).pipe(shareReplay(1));
}

export async function publishLocalStream(call: WebrtcP2pcall) {
  if (!con) throw new Error(`建立连接后才能进行publish操作`);
  const cons = { ...mediaConstains };
  cons.audio = cons.audio || true;
  if (call.kind === P2PCALL_KIND.Audio) {
    cons.video = false;
  }
  console.log(`[P2PCALL] publish local stream`, cons);
  const stream = await navigator.mediaDevices.getUserMedia(cons);
  setLocalStream(stream);
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    if (senders.audio) {
      senders.audio.replaceTrack(audioTrack);
    } else {
      senders.audio = con.addTrack(audioTrack, stream);
    }
  }
  if (!cons.video) return stream;
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    if (senders.video) {
      senders.video.replaceTrack(videoTrack);
    } else {
      senders.video = con.addTrack(videoTrack, stream);
    }
  }
  return stream;
}
