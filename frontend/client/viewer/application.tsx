import React from "react";
import { createRoot } from 'react-dom/client';

import "./application.css";
import { PredictionInfo } from "../prankweb-api";

import { VisualizationToolBox } from "./components/visualization-tool-box";
import BasicTabs from "./components/pocket-tabs";

import { sendDataToPlugins } from './data-loader';
import { PocketsViewType, PolymerColorType, PolymerRepresentation, PocketRepresentation, PolymerViewType, PredictionData, ReactApplicationProps, ReactApplicationState } from "../custom-types";

import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';
import { RcsbFv, RcsbFvTrackDataElementInterface, RcsbFvTrackData } from "@rcsb/rcsb-saguaro";
import { highlightSurfaceAtomsInViewerLabelId, overPaintPolymer, updatePolymerView, showPocketInCurrentRepresentation } from './molstar-visualise';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';

/**
 * A function to render the actual PrankWeb viewer.
 * @param predictionInfo Information about the prediction to be visualised.
 */
export async function renderProteinView(predictionInfo: PredictionInfo) {
    const wrapper = document.getElementById('application-molstar')!;
    const MolstarPlugin = await createPluginUI(
        {
            target: wrapper,
            render: renderReact18,
            spec: {
                ...DefaultPluginUISpec(),
                layout: {
                    initial: {
                        isExpanded: false,
                        showControls: true,
                        controlsDisplay: "reactive",
                        regionState: {
                            top: "hidden",    //sequence
                            left: (window.innerWidth > 1200) ? "collapsed" : "hidden",
                            //tree with some components, hide for small and medium screens
                            bottom: "hidden", //shows log information
                            right: "hidden"   //structure tools
                        }
                    }
                },
                components: {
                    remoteState: 'none'
                }
            }
        });

    // If the Mol* plugin is maximized, hide the React components.
    MolstarPlugin.layout.events.updated.subscribe(() => {
        const information = document.getElementById('information')!;
        const visualizationToolbox = document.getElementById('visualization-toolbox')!;

        information.style.display = MolstarPlugin.layout.state.isExpanded ? "none" : "block";
        visualizationToolbox.style.display = MolstarPlugin.layout.state.isExpanded ? "none" : "block";
    });

    // Render pocket list on the right side (or bottom for smartphones) using React.
    const pocketListContainer = (window.innerWidth >= 768) ? document.getElementById('pocket-list-aside') : document.getElementById('pocket-list-aside-mobile');
    const pocketListRoot = createRoot(pocketListContainer!);
    pocketListRoot.render(<Application molstarPlugin={MolstarPlugin} predictionInfo={predictionInfo}
        pocketsView={PocketsViewType.Surface_Atoms_Color} polymerView={PolymerViewType.Gaussian_Surface} polymerColor={PolymerColorType.White} />);
}

/**
 * A React component containing all of the components other than the Mol* and RCSB plugins.
 */
export class Application extends React.Component<ReactApplicationProps, ReactApplicationState> {
    state = {
        "isLoading": true,
        "data": {} as PredictionData,
        "error": undefined,
        "polymerView": this.props.polymerView,
        "pocketsView": this.props.pocketsView,
        "polymerColor": this.props.polymerColor,
        "isShowOnlyPredicted": false,
        "pluginRcsb": {} as RcsbFv,
        "numUpdated": 0,
        "tabIndex": 0,
        "initialPocket": 1,
        "pocketRepresentations": [],
        "polymerRepresentations": [],
        "predictedPolymerRepresentations": [],
    };

    constructor(props: ReactApplicationProps) {
        super(props);
        this.onPolymerViewChange = this.onPolymerViewChange.bind(this);
        this.onPocketsViewChange = this.onPocketsViewChange.bind(this);
        this.onPolymerColorChange = this.onPolymerColorChange.bind(this);
        this.onToggleAllPockets = this.onToggleAllPockets.bind(this);
        this.onSetPocketVisibility = this.onSetPocketVisibility.bind(this);
        this.onShowOnlyPocket = this.onShowOnlyPocket.bind(this);
        this.onFocusPocket = this.onFocusPocket.bind(this);
        this.onHighlightPocket = this.onHighlightPocket.bind(this);
        this.onShowConfidentChange = this.onShowConfidentChange.bind(this);
        this.changeTab = this.changeTab.bind(this);
    }

    componentDidMount() {
        this.loadData();
    }

    /**
     * Loads the data from the server and sends them to the plugins.
     * Also renders the tool box on the bottom of the visualization using React.
     */
    async loadData() {
        this.setState({
            "isLoading": true,
            "error": undefined,
        });
        const { molstarPlugin, predictionInfo } = this.props;

        let loadedData = null;

        //at first we need the plugins to download the needed data and visualise them
        await sendDataToPlugins(
            molstarPlugin,
            predictionInfo.database,
            predictionInfo.id,
            predictionInfo.metadata.structureName,
            predictionInfo.metadata.predictedStructure ? true : false
        ).then((data) => {
            loadedData = data;
            this.setState({
                "isLoading": false,
                "data": data[0] as PredictionData,
                "pluginRcsb": data[1] as RcsbFv,
                "polymerRepresentations": data[2] as PolymerRepresentation[],
                "pocketRepresentations": data[3] as PocketRepresentation[],
                "predictedPolymerRepresentations": data[4] as PolymerRepresentation[]
            });
        }).catch((error) => {
            this.setState({
                "isLoading": false,
            });
            console.log(error);
        });

        if (!loadedData) return;

        // Render the tool box on the bottom of the visualization using React.
        const toolBoxContainer = document.getElementById('visualization-toolbox');
        const toolBoxRoot = createRoot(toolBoxContainer!);
        const isPredicted = predictionInfo.metadata["predictedStructure"] === true;

        toolBoxRoot.render(<VisualizationToolBox
            molstarPlugin={this.props.molstarPlugin}
            predictionData={loadedData[0]}
            pluginRcsb={loadedData[1]}
            isPredicted={isPredicted}
            polymerView={this.state.polymerView}
            pocketsView={this.state.pocketsView}
            polymerColor={this.state.polymerColor}
            onShowConfidentChange={this.onShowConfidentChange}
            onPolymerViewChange={this.onPolymerViewChange}
            onPocketsViewChange={this.onPocketsViewChange}
            onPolymerColorChange={this.onPolymerColorChange}
        />);
    }

    // The following functions are called by the child components to change the visualisation via the child components.
    onPolymerViewChange(value: PolymerViewType) {
        this.setState({ "polymerView": value });
        updatePolymerView(value, this.props.molstarPlugin, this.state.polymerRepresentations, this.state.predictedPolymerRepresentations, this.state.isShowOnlyPredicted);
    }

    onPocketsViewChange(value: PocketsViewType) {
        this.setState({ "pocketsView": value });
        let index = 0;
        this.state.data.pockets.forEach(pocket => {
            this.onSetPocketVisibility(index, pocket.isVisible ? true : false, value);
            index++;
        });
    }

    async onPolymerColorChange(value: PolymerColorType) {
        this.setState({ "polymerColor": value });
        await overPaintPolymer(value, this.props.molstarPlugin, this.state.data, this.state.polymerRepresentations, this.state.predictedPolymerRepresentations, this.state.pocketRepresentations);
    }

    onShowConfidentChange() {
        const isShowOnlyPredicted = !this.state.isShowOnlyPredicted;
        this.setState({
            "isShowOnlyPredicted": isShowOnlyPredicted
        });
        updatePolymerView(this.state.polymerView, this.props.molstarPlugin, this.state.polymerRepresentations, this.state.predictedPolymerRepresentations, isShowOnlyPredicted);
    }

    onToggleAllPockets(visible: boolean) {
        this.state.data.pockets.map((pocket, i) => {
            this.onSetPocketVisibility(i, visible);
        });
    }

    onSetPocketVisibility(index: number, isVisible: boolean, value?: PocketsViewType) {
        let stateData: PredictionData = { ...this.state.data };
        stateData.pockets[index].isVisible = isVisible;
        this.setState({
            data: stateData
        });

        //resolve RCSB at first - do it by recoloring the pocket to the default color value
        //currently there is no other way to "remove" one of the pockets without modyfing the others
        const newColor = isVisible ? "#" + this.state.data.pockets[index].color : "#F9F9F9";
        const track = this.state.pluginRcsb.getBoardData().find((e: any) => e.trackId.indexOf("pocketsTrack") !== -1);
        if (track) {
            // this shouldn't be any but I couldn't find a way to avoid it
            track.trackData!.filter((e: any) => e.provenanceName === `pocket${index + 1}`).forEach((foundPocket: RcsbFvTrackDataElementInterface) => (foundPocket.color = newColor));
            const newData = track.trackData;
            this.state.pluginRcsb.updateTrackData("pocketsTrack", newData!);
        }

        //then resolve Mol*
        //here value may be passed as an parameter whilst changing the pocket view type, because the state is not updated yet.
        //Otherwise the value is taken from the state.
        if (value === null || value === undefined) {
            showPocketInCurrentRepresentation(this.props.molstarPlugin, this.state.pocketsView, this.state.pocketRepresentations, index, isVisible);
        }
        else {
            showPocketInCurrentRepresentation(this.props.molstarPlugin, value, this.state.pocketRepresentations, index, isVisible);
        }
    }

    onShowOnlyPocket(index: number) {
        let i = 0;
        this.state.data.pockets.forEach(pocket => {
            this.onSetPocketVisibility(i, (index === i) ? true : false);
            i++;
        });
    }

    onFocusPocket(index: number) {
        const pocket = this.state.data.pockets[index];
        highlightSurfaceAtomsInViewerLabelId(this.props.molstarPlugin, pocket.surface, true);
    }

    onHighlightPocket(index: number, isHighlighted: boolean) {
        const pocket = this.state.data.pockets[index];
        highlightSurfaceAtomsInViewerLabelId(this.props.molstarPlugin, pocket.surface, false);
        //currently the residues are not de-selected on mouse out, could be potentially changed in the future
    }

    changeTab(num: number, pocketIndex?: number) {
        this.setState({ tabIndex: num, numUpdated: this.state.numUpdated + 1 });
        if (pocketIndex !== undefined) {
            this.setState({ initialPocket: pocketIndex });
        }
    }

    render() {
        if (this.state.isLoading) {
            return (
                <div>
                    <h1 className="text-center">Loading...</h1>
                </div>
            );
        }
        if (this.state.data) {
            return (
                <div>
                    <BasicTabs
                        pockets={this.state.data.pockets}
                        predictionInfo={this.props.predictionInfo}
                        setPocketVisibility={this.onSetPocketVisibility}
                        showOnlyPocket={this.onShowOnlyPocket}
                        focusPocket={this.onFocusPocket}
                        highlightPocket={this.onHighlightPocket}
                        toggleAllPockets={this.onToggleAllPockets}
                        plugin={this.props.molstarPlugin}
                        tab={this.state.tabIndex}
                        key={this.state.numUpdated}
                        setTab={this.changeTab}
                        initialPocket={this.state.initialPocket}
                        predictionData={this.state.data}
                    />
                </div>
            );
        }
        console.error("Can't load data:", this.state.error);
        return (
            <div style={{ "textAlign": "center" }}>
                <h1 className="text-center">Can't load data</h1>
                <button className="btn btn-warning" onClick={this.loadData}>
                    Force reload
                </button>
            </div>
        );
    }
}