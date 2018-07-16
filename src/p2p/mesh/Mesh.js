import WebRTC from "simple-datachannel";
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
    this.ref = {};
    this.state = {
      isConnectPeers: false,
      isMeshAnswer: false
    };
    this.resnponder = {};
    const resnponder = this.resnponder;

    resnponder[def.LISTEN] = network => {
      console.log("on listen", network.id);
      this.peerList[network.id].send(
        JSON.stringify({
          type: def.ON_LISTEN,
          data: this.getAllPeerId()
        })
      );
    };

    resnponder[def.ON_LISTEN] = network => {
      const targetList = network.data;
      console.log("listen done", targetList);
      this.connectPeers(targetList);
    };

    resnponder[def.MESH_MESSAGE] = transport => {
      console.log("mesh message", transport);
      this.ev.emit(def.ONCOMMAND, transport);
    };

    resnponder[def.MESH_OFFER] = transport => {
      const to = transport.data.to;
      if (to === this.nodeId) {
        const from = transport.data.from;
        const sdp = transport.data.sdp;
        if (!this.state.isMeshAnswer) {
          this.state.isMeshAnswer = true;
          this.ref.peer = new WebRTC();
          (async () => {
            await this.answer(from, sdp, this.ref).then(peer => {
              console.log("answer success");
              this.addPeer(peer);
            }, console.log("answer fail"));
            this.state.isMeshAnswer = false;
          })();
        }
      }
    };

    resnponder[def.MESH_ANSWER] = transport => {
      const to = transport.data.to;
      if (to === this.nodeId) {
        const sdp = transport.data.sdp;
        console.log("on mesh answer to me");
        this.ref.peer.setAnswer(sdp);
      }
    };

    resnponder[def.BROADCAST] = network => {
      const dataLink = JSON.stringify(network);
      if (this.onBroadCast(dataLink)) {
        const transport = network.data;
        console.log("oncommand tag", transport.tag);
        resnponder[transport.tag](transport);
      }
    };
  }

  addPeer(peer) {
    peer.ev.on("data", data => {
      this.onCommand(data);
    });
    peer.send(
      JSON.stringify({
        type: def.LISTEN,
        id: this.nodeId
      })
    );
    this.peerList[peer.nodeId] = peer;
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

  connectPeers(targetList) {
    if (!this.state.isConnectPeers) {
      (async () => {
        this.state.isConnectPeers = true;
        for (let target of targetList) {
          if (!this.getAllPeerId().includes(target) && target !== this.nodeId) {
            this.ref.peer = new WebRTC();
            try {
              const result = await this.offer(target, this.ref);
              this.addPeer(result);
            } catch (error) {
              console.log("offer fail", error);
            }
          }
        }
        this.state.isConnectPeers = false;
      })();
    } else {
      console.log("is connecting peers");
    }
  }

  offer(target, r) {
    r.peer.makeOffer("json");
    r.peer.connecting(target);
    return new Promise((resolve, reject) => {
      r.peer.ev.once("signal", sdp => {
        console.log(" offer store", target);

        this.broadCast(def.MESH_OFFER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.ev.once("connect", () => {
        console.log(" offer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject(false);
      }, 3 * 1000);
    });
  }

  answer(target, sdp, r) {
    r.peer.makeAnswer(sdp);
    r.peer.connecting(target);
    return new Promise((resolve, reject) => {
      console.log(" answer", target);

      r.peer.ev.once("signal", sdp => {
        this.broadCast(def.MESH_ANSWER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.ev.once("connect", () => {
        console.log(" answer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject();
      }, 3 * 1000);
    });
  }

  cleanPeers() {
    const deleteList = [];
    for (let key in this.peerList) {
      if (this.peerList[key].isDisconnected) deleteList.push(key);
    }
    if (deleteList.length > 0) {
      console.log("delete list", deleteList);
    }
    deleteList.forEach(v => {
      delete this.peerList[v];
    });
  }

  onCommand(packet) {
    const json = JSON.parse(packet);
    const type = json.type;

    this.resnponder[type](json);

    this.cleanPeers();
  }
}
