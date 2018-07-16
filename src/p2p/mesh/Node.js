import WebRTC from "simple-datachannel";
import client from "socket.io-client";
import Mesh from "./Mesh";
import sha1 from "sha1";
import events from "events";

const def = {
  OFFER: "OFFER",
  ANSWER: "ANSWER",
  MESH_MESSAGE: "MESH_MESSAGE",
  ONCOMMAND: "ONCOMMAND"
};

let peerOffer;
export default class Node {
  constructor(targetAddress, targetPort) {
    this.targetUrl = undefined;
    if (targetAddress !== undefined && targetAddress.length > 0) {
      this.targetUrl = "http://" + targetAddress + ":" + targetPort;
    }

    this.nodeId = sha1(Math.random().toString());
    console.log("nodeId", this.nodeId);

    this.mesh = new Mesh(this.nodeId);
    this.ev = new events.EventEmitter();

    this.mesh.ev.on(def.ONCOMMAND, datalinkLayer => {
      this.ev.emit("ONCOMMAND", datalinkLayer);
    });

    if (this.targetUrl !== undefined) {
      const socket = client.connect(this.targetUrl);

      socket.on("connect", () => {
        console.log("socket connected");
        this.offerFirst(socket);
      });

      socket.on(def.ANSWER, data => {
        console.log(data);
        peerOffer.setAnswer(data.sdp);
        peerOffer.connecting(data.nodeId);
      });
    }
  }

  offerFirst(socket) {
    console.log("@cli", "offer first");
    peerOffer = new WebRTC();
    peerOffer.makeOffer("json");

    peerOffer.ev.once("signal", sdpValue => {
      socket.emit(def.OFFER, {
        nodeId: this.nodeId,
        sdp: sdpValue
      });
    });

    peerOffer.ev.once("connect", () => {
      console.log("first connected");
      peerOffer.connected();
      setTimeout(() => {
        this.mesh.addPeer(peerOffer);
      }, 1 * 1000);
    });
  }

  broadCast(data) {
    this.mesh.broadCast(def.MESH_MESSAGE, data);
  }

  send(target, data) {
    for (let key in this.mesh.peerList) {
      console.log(key);
    }
    console.log(this.mesh.peerList[target]);
    this.mesh.peerList[target].send(
      JSON.stringify({ type: def.MESH_MESSAGE, data: data })
    );
  }
}
