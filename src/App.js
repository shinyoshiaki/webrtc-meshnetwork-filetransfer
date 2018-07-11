import React, { Component } from "react";
import Node from "./p2p/mesh/Node";
import * as fileHelper from "./p2p/lib/fileHelper";

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      file: null,
      img: null,
      textValue: ""
    };
    this.node = new Node("localhost", "20000");
    this.node.mesh.ev.on("receiveFile", arr => {
      const blob = new Blob(arr);
      console.log("react receive", arr, blob);

      this.setState({
        img: window.URL.createObjectURL(blob)
      });
    });
  }

  onChange(e) {
    this.setState({ file: e.target.files[0] });
  }

  sendFile() {
    fileHelper.getSliceArrayBuffer(this.state.file).then(arr => {
      console.log("ab arr", arr);
      this.node.mesh.sendFile(arr, this.state.textValue);
    });
  }

  changeText(e) {
    this.setState({ textValue: e.target.value });
  }

  render() {
    return (
      <div>
        {this.node.nodeId}
        <input type="file" onChange={e => this.onChange(e)} />
        <input type="button" onClick={() => this.sendFile()} value="send" />
        <input
          type="text"
          value={this.state.textValue}
          onChange={e => this.changeText(e)}
        />
        <img src={this.state.img} />
      </div>
    );
  }
}

export default App;
