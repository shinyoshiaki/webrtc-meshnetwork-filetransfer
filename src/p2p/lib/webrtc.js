const wrtc = require("wrtc");
const simplePeer = require("simple-peer");

export default class webrtc {
  constructor(_type) {
    this.rtc;
    this.nodeId;
    this.targetId;
    this.isConnected = false;
    this.isCheking = false;
    this.type = _type;
    switch (_type) {
      case "offer":
        console.log("webrtc", "offer");
        this.initOffer();
        break;
      case "answer":
        console.log("webrtc", "answer");
        this.initAnswer();
        break;
      default:
        break;
    }

    this.rtc.on("data", function(data) {});
  }

  initOffer() {
    this.rtc = new simplePeer({
      initiator: true,
      config: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302"
          }
        ]
      },
      trickle: false,
      wrtc: wrtc
    });
  }
  initAnswer() {
    this.rtc = new simplePeer({
      initiator: false,
      config: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302"
          }
        ]
      },
      trickle: false,
      wrtc: wrtc
    });
  }

  connecting(targetId) {
    console.log("webrtc_connecting", targetId);
    this.targetId = targetId;
    this.isConnected = false;
  }

  connected() {
    console.log("webrtc", "connected", this.targetId);
    this.isConnected = true;
  }

  failed() {
    console.log("webrtc", "connectFailed", this.targetId);
  }

  disconnected() {
    console.log("webrtc", "disconnected", this.targetId);
    this.isConnected = false;
  }

  send(data) {
    try {
      this.rtc.send(data);
      return true;
    } catch (error) {
      console.log("send error", error);
      this.disconnected();
      return false;
    }
  }
}
