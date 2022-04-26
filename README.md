>使用


> 一个利用webrtc+meteor实现的包含了信令相关的p2p通话

> 服务器端
```
import "meteor-webrtc-p2pcall";
```

> 客户端

```
import {
  P2PCALL_KIND,
  toggleCamera,
  watchCalls,
  callWith,
  acceptCall,
  WebrtcP2pcall,
  hangup,
} from "meteor-webrtc-p2pcall/dist/client";
/* methods summary
export declare const callWith: (uid: string, kind: P2PCALL_KIND) => Observable<RTCActionEvent | {
    event: "setup";
    callId: string;
}>;
export declare const watchCalls: (ices: Array<{
    urls?: string;
    username?: string;
    credential?: string;
}>) => Observable<WebrtcP2pcall[]>;
export declare const setMediaConfig: (conf: MediaStreamConstraints) => void;
export declare const acceptCall: (p2pcall: WebrtcP2pcall) => Observable<RTCActionEvent>;
export declare const hangup: (p2pcall: WebrtcP2pcall) => void;
export declare const toggleCamera: (call: WebrtcP2pcall) => Promise<MediaStream>;
*/
```
