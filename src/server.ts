import {
  P2PCALL_KIND,
  P2PCALL_STATUS,
  WebrtcP2pcall,
  WebrtcP2pcalls,
  WebrtcSignal,
  WebrtcSignals,
} from "./shared";
console.log(`p2pcall setup at server side `);
WebrtcSignals.allow({
  insert(userId, doc: WebrtcSignal) {
    if (!userId || !doc.callId || !doc.type) return false;
    doc.userId = userId;
    return true;
  },
  update(userId, doc: WebrtcSignal) {
    return doc.target === userId || doc.userId === userId;
  },
});
Meteor.publish("webrtc.p2pcall", function () {
  if (!this.userId) return;
  return WebrtcP2pcalls.find(
    {
      $or: [
        {
          calleeId: this.userId,
        },
        {
          callerId: this.userId,
        },
      ],
      status: {
        $gt: P2PCALL_STATUS.ENDED,
      },
    }
    // { fields: { calleeId: 1, callerId: 1, status: 1, _id: 1 } }
  );
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
  "webrtc/p2pcall/create": async function (uid: string, kind: P2PCALL_KIND) {
    if (!Meteor.users.findOne(uid) || !Meteor.users.findOne(this.userId)) {
      throw new Meteor.Error(403, "不存在的用户或对方");
    }
    const going = WebrtcP2pcalls.findOne({
      $or: [{ calleeId: this.userId }, { callerId: this.userId }],
      status: { $ne: P2PCALL_STATUS.ENDED },
    });
    if (going) throw new Meteor.Error(400, "对方正在通话中");
    const callId = WebrtcP2pcalls.insert({
      calleeId: uid,
      callerId: this.userId,
      createAt: new Date(),
      status: P2PCALL_STATUS.CALLING,
      kind,
    });
    if (callId) return callId;
  },
});
WebrtcP2pcalls.allow({
  update(userId, doc: WebrtcP2pcall) {
    console.log(
      `allow check ${userId === doc.calleeId || userId === doc.callerId}`
    );
    return userId === doc.calleeId || userId === doc.callerId;
  },
});
WebrtcP2pcalls.after.update((userId, doc) => {
  if (doc.status === P2PCALL_STATUS.ENDED) {
    WebrtcSignals.remove({ callId: doc._id });
  }
});

const endUsersCallout = Meteor.bindEnvironment(function (userId?: string) {
  if (!userId) {
    return;
  }
  WebrtcP2pcalls.update(
    { callerId: userId, status: { $ne: P2PCALL_STATUS.ENDED } },
    {
      $set: {
        endAt: new Date(),
        status: P2PCALL_STATUS.ENDED,
      },
    },
    {
      multi: true,
    }
  );
});

Meteor.onConnection((con) => {
  con.onClose(() => {
    endUsersCallout((con as any).userId);
  });
});

Accounts.onLogin(({ user, connection }: any) => {
  connection.userId = user._id;
});

Accounts.onLogout(({ connection }: any) => {
  endUsersCallout(connection.userId);
  connection.userId = null;
});
