import React from "react";

import "./tools-box.css";
import { PocketsViewType, PolymerViewType } from "../types";

export default class ToolsBox extends React.Component<{
  downloadUrl: string,
  downloadAs: string,
  polymerView: PolymerViewType,
  pocketsView: PocketsViewType,
  onPolymerViewChange: (value: PolymerViewType) => void,
  onPocketsViewChange: (value: PocketsViewType) => void,
  isPredicted: boolean,
  isShowOnlyPredicted: boolean,
  onShowConfidentChange: () => void,
}, {
  /**
   * True for expanded component false for minimized component.
   */
  visible: boolean
}> {

  state = {
    "visible": true,
    "showConfident": false,
  };

  constructor(props: any) {
    super(props);
    this.toggleVisible = this.toggleVisible.bind(this);
  }

  toggleVisible() {
    this.setState({"visible": !this.state.visible});
  }

  render() {
    return (
      <div className="card my-2">
        <div className="card-header">
          <h3 style={{"margin": "0"}}>
            Tools
            <button
              type="button"
              className="btn btn-default btn-icon-right"
              title="Show/Hyde tools."
              onClick={this.toggleVisible}
            >
              {
                this.state.visible ?
                  <span className="fontello-icon">
                    &#xe87f;
                  </span> :
                  <span className="fontello-icon">
                    &#xe882;
                  </span>
              }
            </button>
          </h3>
        </div>
        {this.state.visible && <div className="card-body">
          <ControlBoxContent
            downloadUrl={this.props.downloadUrl}
            downloadAs={this.props.downloadAs}
            polymerView={this.props.polymerView}
            onPolymerViewChange={this.props.onPolymerViewChange}
            pocketsView={this.props.pocketsView}
            onPocketsViewChange={this.props.onPocketsViewChange}
            isPredicted={this.props.isPredicted}
            isShowOnlyPredicted={this.props.isShowOnlyPredicted}
            onShowConfidentChange={this.props.onShowConfidentChange}
          />
        </div>
        }
      </div>
    );
  }
}

function ControlBoxContent(
  props: {
    downloadUrl: string,
    downloadAs: string,
    polymerView: PolymerViewType,
    onPolymerViewChange: (value: PolymerViewType) => void,
    pocketsView: PocketsViewType,
    onPocketsViewChange: (value: PocketsViewType) => void,
    isPredicted: boolean,
    isShowOnlyPredicted: boolean,
    onShowConfidentChange: () => void,
  }) {
  return (
    <div className="d-grid gap-2">
      <a
        className="btn btn-outline-secondary"
        href={props.downloadUrl}
        download={props.downloadAs}
      >
        <span className="fontello-icon">&#xe82d;</span>&nbsp;
        Download
      </a>
      <label>
        Protein visualisation
        <select
          id="polymer-visual"
          className="form-select"
          value={props.polymerView}
          onChange={(event) =>
            props.onPolymerViewChange(parseInt(event.target.value))}
        >
          <option value="0">Balls and Sticks</option>
          <option value="1">Surface</option>
          <option value="2">Cartoon</option>
        </select>
      </label>
      <label>
        Pockets visualisation
        <select
          id="pockets-visual"
          className="form-select"
          value={props.pocketsView}
          onChange={(event) =>
            props.onPocketsViewChange(parseInt(event.target.value))}
        >
          <option value="0">Balls and Sticks</option>
          <option value="1">Surface</option>
        </select>
      </label>
      {props.isPredicted && (
        <button
          type="button"
          className="btn btn-predicted"
          onClick={props.onShowConfidentChange}
        >
          {props.isShowOnlyPredicted ?
            "Show all regions" :
            "Show confident regions"}
        </button>
      )}
    </div>
  )
}