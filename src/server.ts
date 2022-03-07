import {
  getAnother,
  P2PCALL_STATUS,
  P2PCALL_TYPE,
  WebrtcP2pcall,
  WebrtcP2pcalls,
  WebrtcSignal,
  WebrtcSignals,
} from "./shared";

WebrtcSignals.allow({
  insert(userId, doc: WebrtcSignal) {
    if (!userId || !doc.callId || !doc.type) return false;
    doc.userId = userId;
    return true;
  },
  update(userId, doc: WebrtcSignal) {
    return doc.target === userId || doc.userId === userId;
  },
  remove(userId, doc: WebrtcSignal) {
    return doc.target === userId || doc.userId === userId;
  },
});

Meteor.publish("webrtc.p2psignals", function (callId: string) {
  if (!this.userId) return;
  return WebrtcSignals.find({
    target: this.userId,
    callId,
    handled: {
      $ne: true,
    },
  });
});

Meteor.methods({
  "webrtc/p2pcall/create": async function (
    uid: string,
    type = P2PCALL_TYPE.VIDEO
  ) {
    const going = WebrtcP2pcalls.findOne({
      $or: [
        { calleeId: this.userId, callerId: uid },
        { callerId: this.userId, calleeId: uid },
      ],
      status: { $gt: P2PCALL_STATUS.ENDED },
    });
    if (going) throw new Meteor.Error(400, "还有未完成的通话");
    const callId = WebrtcP2pcalls.collection.insert({
      calleeId: uid,
      callerId: this.userId,
      createAt: new Date(),
      status: P2PCALL_STATUS.CALLING,
      type,
    });
    if (callId) return callId;
  },
});
WebrtcP2pcalls.allow({
  update(userId, doc) {
    console.log(
      `allow check ${userId === doc.calleeId || userId === doc.callerId}`
    );
    return userId === doc.calleeId || userId === doc.callerId;
  },
});
WebrtcP2pcalls.collection.after.update((userId, doc) => {
  if (doc.status === P2PCALL_STATUS.ENDED) {
    WebrtcSignals.remove({ callId: doc._id }).subscribe((num) => {
      console.log(`remove signal of call ${doc._id}`);
    });
  }
});
function clearDummyCall(userId: string) {
  console.log(`try remove dummy of ${userId}`);
  if (!userId) return;
  WebrtcP2pcalls.update(
    {
      $or: [{ callerId: userId }, { calleeId: userId }],
      status: { $gt: P2PCALL_STATUS.ENDED },
    },
    {
      $set: {
        endAt: new Date(),
        status: P2PCALL_STATUS.ENDED,
      },
    },
    {
      multi: true,
    }
  ).subscribe((n) => {
    console.log(`end call for user ${n}`);
  });
}
Meteor.onConnection((con) => {
  con.onClose(() => {
    console;
    clearDummyCall((con as any).userId);
  });
});

Accounts.onLogin((data) => {
  const { user, connection } = data;
  clearDummyCall(user._id);
});
const publishComposite = Package["reywood:publish-composite"].publishComposite;
publishComposite("webrtc.p2pcall", function (): PublishCompositeConfig<any> {
  const userId = this.userId;
  if (!userId) return;
  return {
    find() {
      return WebrtcP2pcalls.collection.find({
        $or: [
          {
            calleeId: userId,
          },
          {
            callerId: userId,
          },
        ],
        status: {
          $gt: P2PCALL_STATUS.ENDED,
        },
      });
    },
    children: [
      {
        find(doc: WebrtcP2pcall) {
          const _id = getAnother(userId, doc);
          return Meteor.users.find(_id, { fields: { profile: 1 } });
        },
      },
    ],
  };
});
