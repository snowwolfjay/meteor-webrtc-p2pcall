# meteor-webrtc-p2pcall
A package integrate with Meteor to fulfill webrtc p2pcall . Include signal exchange and connect setup

## 一个快速集成p2p call的包，依赖于Meteor后台

### server端使用，在main.ts引入
```
import 'meteor-webrtc-p2pcall'
```

### client端：
```
import { callWith,watchCalls,configStream,pickup,hangup,toggleMute, } from  'meteor-webrtc-p2pcall/src/client';

callWith(`asds`) // userId  发起呼叫请求
watchCalls().subscribe(calls=>{}) // call[] 监听呼入列表
pickup(call) 
hangup(call)

```
