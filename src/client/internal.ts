import { Observable } from "rxjs";
import { shareReplay } from "rxjs/operators";
import { P2PCALL_TYPE } from ".";
import {
  getAnother,
  P2PCALL_STATUS,
  RTCActionEvent,
  WebrtcP2pcall,
  WebrtcP2pcalls,
  WebrtcSignal,
  WebrtcSignals,
} from "../shared";
import {
  currentCall,
  iceServers,
  localStream,
  mediaConstains,
  setCurrentCall,
  setLocalStream,
} from "./state";

export let con: RTCPeerConnection;

const log = (...args: any[]) => console.log(...args); //{}; //
export function handledSignale(signal: WebrtcSignal) {
  return WebrtcSignals.remove(signal._id).toPromise();
}

export function watchSignal(call: WebrtcP2pcall) {
  const callId = call._id;
  console.error(`watch ${callId}`);
  setCurrentCall(call);
  Meteor.subscribe("webrtc.p2psignals", callId);
  return new Observable<RTCActionEvent>((suber) => {
    const target = Meteor.userId();
    log(callId, target);
    const lq = WebrtcSignals.find({ target, callId }).observe({
      added: async (doc: WebrtcSignal) => {
        console.warn({ doc });
        if (doc.callId !== callId) return;
        handledSignale(doc);
        if (doc.type === "hangup") {
          suber.complete();
          endP2pCall(null, true);
          return;
        }
        const target = getAnother(Meteor.userId(), call);
        if (doc.type === "offer" && doc.sdp) {
          if (!call) return suber.error("call fail");
          log(`offer come`);
          try {
            suber.add(
              createConnection(call).subscribe((v) => {
                if (v.event === "stream") {
                  suber.next(v);
                } else {
                }
              })
            );
            var desc = new RTCSessionDescription(doc.sdp);
            if (con.signalingState != "stable") {
              await con.setLocalDescription({ type: "rollback" });
            }
            await con.setRemoteDescription(desc);
            const stream = await publishLocalStream(call);
            suber.next({ event: "localstream", stream });
            const answer = await con.createAnswer({});
            await con.setLocalDescription(answer);
            WebrtcSignals.insert({
              type: "answer",
              sdp: con.localDescription.toJSON(),
              callId: call._id,
              target,
            });
          } catch (error) {
            suber.error(`处理请求失败`);
          }
        } else if (doc.type === "new-ice-candidate" && doc.candidate) {
          await handleNewICECandidate([doc.candidate]);
        } else if (doc.type === "answer" && doc.sdp) {
          try {
            const sdp = new RTCSessionDescription(doc.sdp);
            await con.setRemoteDescription(sdp);
            log(`handled answer ${doc.sdp}`);
          } catch (error) {
            suber.error(`处理应答失败`);
          }
        }
      },
    });
    return () => {
      suber.unsubscribe();
      lq.stop();
    };
  });
}

export async function handleNewICECandidate(candidates: any[]) {
  for (const str of candidates) {
    try {
      const candidate = new RTCIceCandidate(str);
      await con.addIceCandidate(candidate);
      log(`set ice candi`, candidate.candidate);
    } catch (error) {
      console.error(`candidate error`, error);
    }
  }
}

export async function endP2pCall(p2pcall: WebrtcP2pcall, remote = false) {
  log(`end`, p2pcall);
  if (localStream) {
    localStream
      .getTracks()
      .forEach((el) => (el.stop(), localStream.removeTrack(el)));
    setLocalStream(null);
  }
  setCurrentCall(undefined);
  if (con) {
    con.close();
    con = null;
  }
  if (!p2pcall) return;
  if (!remote) {
    await WebrtcSignals.insert({
      type: "hangup",
      target: getAnother(Meteor.userId(), p2pcall),
      callId: p2pcall._id,
    }).toPromise();
  }
  await WebrtcP2pcalls.update(p2pcall._id, {
    $set: {
      status: P2PCALL_STATUS.ENDED,
      endAt: new Date(),
    },
  }).toPromise();
}
export function createConnection(p2pcall: WebrtcP2pcall) {
  console.error(iceServers);
  if (!con) con = new RTCPeerConnection({ iceServers });
  return new Observable<RTCActionEvent>((suber) => {
    const target = getAnother(Meteor.userId(), p2pcall);
    const callId = p2pcall._id;
    let connected = false;
    con.onicecandidate = (ev) => {
      log(`ice change`);
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
    con.onconnectionstatechange = (ev) => {
      console.warn("connection state =>", con.connectionState);
    };
    con.onnegotiationneeded = async (ev) => {
      log(`nego ----- `);
      if (p2pcall.callerId === Meteor.userId()) {
        console.info(`被呼叫者跳过offer创建`);
        return;
      }
      if (con.signalingState != "stable") {
        console.log(`wait for stable`);
        return;
      }
      const offer = await con.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        // iceRestart: true,
      });
      await con.setLocalDescription(offer);
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
      console.warn("ice connection state => ", con.iceConnectionState);
      // "checking" | "closed" | "completed" | "connected" | "disconnected" | "failed" | "new";
      switch (con.iceConnectionState) {
        case "connected":
          connected = true;
          break;
        case "failed":
          con.restartIce();
          break;
        case "disconnected":
        case "closed":
          endCall();
          if (!connected) {
            suber.next({ event: "close", reason: "fail" });
          }
          break;
      }
    };
    con.onicegatheringstatechange = (ev) => {
      console.warn(con.iceGatheringState);
    };
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
  const conf = { ...mediaConstains };
  if (call.type === P2PCALL_TYPE.VOICE) {
    delete conf.video;
  }
  log(conf);
  const stream = await navigator.mediaDevices.getUserMedia(conf);
  setLocalStream(stream);
  stream.getTracks().forEach((el) => con.addTrack(el, stream));
  return stream;
}

export const configStreamAuto = (config: MediaStreamConstraints) => {
  Object.assign(mediaConstains, config);
};

export const toggleTrack = (p2pcall: WebrtcP2pcall, type: string) => {
  if (currentCall?._id !== p2pcall._id || !con) return false;
  const transs = con.getTransceivers();
  console.log(transs);
  const trans = transs.find((el) => el.sender?.track?.kind === type);
  if (!trans) return false;
  return (trans.sender.track.enabled = !trans.sender.track.enabled);
};
