import WebRTC from "../lib/webrtc";
import Events from "events";
import { packetFormat } from "../constants/format";

export const def = {
  LISTEN: "LISTEN",
  ON_LISTEN: "ON_LISTEN",
  BROADCAST: "BROADCAST",
  MESH_OFFER: "MESH_OFFER",
  MESH_ANSWER: "MESH_ANSWER",
  MESH_MESSAGE: "MESH_MESSAGE",
  ONCOMMAND: "ONCOMMAND"
};

export const action = {
  PEER: "PEER"
};

export default class Mesh {
  constructor(nodeId) {
    this.ev = new Events.EventEmitter();
    this.nodeId = nodeId;
    this.peerList = {};
    this.packetIdList = [];
    this.sendFilePeer = undefined;
    this.ref = {};
    this.state = {
      isConnectPeers: false,
      isMeshAnswer: false
    };
  }

  addPeer(peer) {
    peer.rtc.on("data", data => {
      this.onCommand(data);
    });
    peer.send(
      JSON.stringify({
        type: def.LISTEN,
        id: this.nodeId
      })
    );
    this.peerList[peer.targetId] = peer;
    console.log("added peer", this.getAllPeerId());
    this.ev.emit(action.PEER);
  }

  getAllPeerId() {
    const idList = [];
    for (let key in this.peerList) {
      idList.push(key);
    }
    return idList;
  }

  onBroadCast(packet) {
    const json = JSON.parse(packet);
    if (!JSON.stringify(this.packetIdList).includes(json.hash)) {
      this.packetIdList.push(json.hash);
      for (let key in this.peerList) {
        this.peerList[key].send(packet);
      }
      return true;
    } else {
      return false;
    }
  }

  broadCast(tag, data) {
    this.onBroadCast(packetFormat(def.BROADCAST, { tag: tag, data: data }));
  }

  sendFile(ab, target) {
    this.ref.peer = new WebRTC("offer");
    this.offer(target, this.ref, "file").then(peer => peer.send(ab));
  }

  receiveFile(ab) {
    console.log("received file", ab);
    this.ev.emit("receiveFile", ab);
  }

  connectPeers(targetList) {
    if (!this.state.isConnectPeers) {
      (async () => {
        this.state.isConnectPeers = true;
        for (let target of targetList) {
          if (!this.getAllPeerId().includes(target) && target !== this.nodeId) {
            this.ref.peer = new WebRTC("offer");
            await this.offer(target, this.ref, "normal").then(peer =>
              this.addPeer(peer)
            );
          }
        }
        this.state.isConnectPeers = false;
      })();
    } else {
      console.log("is connecting peers");
    }
  }

  offer(target, r, tag) {
    return new Promise((resolve, reject) => {
      console.log(" offer", target);
      r.peer.connecting(target);

      r.peer.rtc.on("error", err => {
        console.log(" offer connect error", target, err);

        reject(err);
      });

      r.peer.rtc.on("signal", sdp => {
        console.log(" offer store", target);

        this.broadCast(def.MESH_OFFER, {
          from: this.nodeId,
          to: target,
          sdp: sdp,
          tag: tag
        });
      });

      r.peer.rtc.on("connect", () => {
        console.log(" offer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject();
      }, 3 * 1000);
    });
  }

  answer(target, sdp, r) {
    return new Promise((resolve, reject) => {
      r.peer.connecting(target);
      console.log(" answer", target);
      r.peer.rtc.signal(sdp);

      r.peer.rtc.on("error", err => {
        console.log("error", target, err);
        reject();
      });

      r.peer.rtc.on("signal", sdp => {
        this.broadCast(def.MESH_ANSWER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.rtc.on("connect", () => {
        console.log(" answer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject();
      }, 4 * 1000);
    });
  }

  cleanPeers() {
    const deleteList = [];
    for (let key in this.peerList) {
      if (this.peerList[key].isDisconnected) deleteList.push(key);
    }
    //console.log("delete list", deleteList);
    deleteList.forEach(v => {
      delete this.peerList[v];
    });
  }

  onCommand(packet) {
    const json = JSON.parse(packet);
    const type = json.type;
    switch (type) {
      case def.LISTEN:
        console.log("on listen", json.id);
        this.peerList[json.id].send(
          JSON.stringify({
            type: def.ON_LISTEN,
            data: this.getAllPeerId()
          })
        );
        break;
      case def.ON_LISTEN:
        console.log("listen done");
        const targetList = json.data;
        this.connectPeers(targetList);
        break;
      case def.MESH_MESSAGE:
        console.log("mesh message", json);
        this.ev.emit(def.ONCOMMAND, json);
        break;
      case def.BROADCAST:
        if (this.onBroadCast(packet)) {
          const broadcastData = json.data;
          console.log("oncommand tag", broadcastData.tag);
          switch (broadcastData.tag) {
            case def.MESH_OFFER: {
              const to = broadcastData.data.to;
              if (to === this.nodeId) {
                const from = broadcastData.data.from;
                const sdp = broadcastData.data.sdp;
                const tag = broadcastData.data.tag;
                if (!this.state.isMeshAnswer) {
                  this.state.isMeshAnswer = true;
                  this.ref.peer = new WebRTC("answer");
                  (async () => {
                    await this.answer(from, sdp, this.ref).then(peer => {
                      console.log("answer success");
                      switch (tag) {
                        case "file":
                          peer.rtc.on("data", ab => {
                            this.receiveFile(ab);
                          });
                          break;
                        default:
                          this.addPeer(peer);
                          break;
                      }
                    }, console.log("answer fail"));
                    this.state.isMeshAnswer = false;
                  })();
                }
              }
              break;
            }
            case def.MESH_ANSWER: {
              const to = broadcastData.data.to;
              if (to === this.nodeId) {
                const sdp = broadcastData.data.sdp;
                console.log("on mesh answer to me");
                this.ref.peer.rtc.signal(sdp);
              }
              break;
            }
            case def.MESH_MESSAGE:
              this.ev.emit(def.ONCOMMAND, broadcastData);
              break;
            default:
              break;
          }
        }
        break;
      default:
        break;
    }
    this.cleanPeers();
  }
}
