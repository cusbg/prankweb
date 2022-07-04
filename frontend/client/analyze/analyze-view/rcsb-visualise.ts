import { RcsbFv, RcsbFvDisplayTypes, RcsbFvTrackDataElementInterface, RcsbFvRowConfigInterface, RcsbFvBoardConfigInterface, RcsbFvTrackData } from "@rcsb/rcsb-saguaro";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { PredictionData, MolstarResidue, chainResidueAtom } from './types';
import { highlightInViewerLabelIdWithoutFocus, highlightInViewerAuthId } from "./molstar-visualise";

export function initRcsb(data: PredictionData, rcsbPlugin: RcsbFv, molstarPlugin: PluginUIContext) {

    const boardConfigData : RcsbFvBoardConfigInterface = {
        length: data.structure.sequence.length,
        trackWidth: 1300,
        includeAxis: true,
        highlightHoverPosition: true,
        highlightHoverCallback: (n: Array<RcsbFvTrackDataElementInterface>) => onHighlight(data, molstarPlugin, n),
        elementClickCallBack: (d?: RcsbFvTrackDataElementInterface, e?: MouseEvent) => elementClicked(data, molstarPlugin, d, e)
    };

    const rowConfigData = createRowConfigDataRcsb(data);

    const elementId = "application-rcsb"; //div where the plugin is placed

    rcsbPlugin = new RcsbFv({
        rowConfigData,
        boardConfigData,
        elementId
    });

    return rcsbPlugin;
}


//TODO : EDIT THOSE 
function elementClicked(data: PredictionData, molstarPlugin: PluginUIContext, d?: RcsbFvTrackDataElementInterface, e?: MouseEvent) {
    console.log(d);
    if(d) {
        if(data) {
            let element = data.structure.indices[d.begin - 1];
            if(element) {
                let id = Number(element.substring(element.indexOf('_') + 1));
                highlightInViewerAuthId(molstarPlugin, element[0], [id]);
            }
        }
    }
}

function onHighlight(data: PredictionData, molstarPlugin: PluginUIContext, n: Array<RcsbFvTrackDataElementInterface>) {
    console.log(n);
    if(n && n.length > 0) {
        if(data) {
            let element = data.structure.indices[n[0].begin - 1];
            if(element) {
                let id = Number(element.substring(element.indexOf('_') + 1));
                highlightInViewerLabelIdWithoutFocus(molstarPlugin, element[0], [id]);
            }
        }
    }
}

function createRowConfigDataRcsb(data: PredictionData) {

    const rowConfigData : Array<RcsbFvRowConfigInterface> = [];
    //firstly add the sequence
    rowConfigData.push({
        trackId: "sequenceTrack",
        trackHeight: 20,
        trackColor: "#F9F9F9",
        displayType: RcsbFvDisplayTypes.SEQUENCE,
        nonEmptyDisplay: true, //???
        rowTitle: "SEQUENCE",
        trackData: [{
            begin: 1,
            value: data.structure.sequence.join('')
            //value: finalseqString
        }]
    });

    //then we need to add the binding sites, if they exist
    if(data.structure.binding.length > 0) {
        const bindingData : RcsbFvTrackData = [];

        //create the blocks
        for(let i = 0; i < data.structure.binding.length; i++) {
            let firstElement = data.structure.binding[i];
            if(i < data.structure.binding.length - 1) {
                while((data.structure.binding[i] + 1) === data.structure.binding[i+1]) {
                    i++;
                    if(i >= data.structure.binding.length - 1) break;
                }
            } 
            bindingData.push({
                begin: firstElement,
                end: data.structure.binding[i]
            })
        }
    
        rowConfigData.push({
            trackId: "bindingsTrack",
            trackHeight: 20,
            trackColor: "#F9F9F9",
            displayType: RcsbFvDisplayTypes.BLOCK,
            displayColor: "#9542F5",
            rowTitle: "BINDING",
            trackData: bindingData
        });
    }

    //then we need to add the actual pockets, if there are any
    if(data.pockets.length > 0) {
        const pocketsData : RcsbFvTrackData = [];

        for(let y = 0; y < data.pockets.length; y++) {
            //first we need to assign a color to a pocket
            data.pockets[y].color = pickColor(y);
            //create the blocks with the same principle... 
            for(let i = 0; i < data.pockets[y].residues.length; i++) {
                let firstElement = data.pockets[y].residues[i];
    
                if(i < data.pockets[y].residues.length - 1) {
                    while(
                        data.pockets[y].residues[i][0] === data.pockets[y].residues[i+1][0]
                        && Number(data.pockets[y].residues[i].substring(firstElement.indexOf('_') + 1)) + 1 === Number(data.pockets[y].residues[i+1].substring(firstElement.indexOf('_') + 1))
                    ) {
                        i++;
                        if(i >= data.pockets[y].residues.length - 1) break;
                    }
                }
    
                let finalBegin = data.structure.indices.indexOf(firstElement) + 1;
                let finalEnd = data.structure.indices.indexOf(data.pockets[y].residues[i]) + 1;
    
                pocketsData.push({
                    begin: finalBegin,
                    end: finalEnd,
                    color: "#" + data.pockets[y].color, //later on, when the pocket should be hidden, we need to use the same color as the background one
                    provenanceName: data.pockets[y].name
                })
            }
        }
    
        rowConfigData.push({
            trackId: "pocketsTrack",
            trackHeight: 20,
            trackColor: "#F9F9F9",
            displayType: RcsbFvDisplayTypes.BLOCK,
            displayColor: "#FF0000",
            rowTitle: "POCKETS",
            trackData: pocketsData
        });
    }

    //then resolve the conservation, if available
    if(data.structure.scores.conservation) {
        const conservationData = [];
    
        /* NOT NEEDED NOW!
        //the first thing we have to do - if there are some gaps inbetween, we have to adjust the conservation scores array...
        //so when we encounter a space in the sequence, then add a zero to the conservation array
        for (let i = 0; i < finalseqString.length; i++) {
            if(finalseqString[i] === ' ') {
                data.structure.scores.conservation.splice(i, 0, 0);
            }
        }
        */
    
        //we need to normalize the scores to fit in properly
        //by the definition of conservation scoring the maximum is log_2(20)
        const maximum = getLogBaseX(2, 20);
    
        for (let i = 0; i < data.structure.scores.conservation.length; i++) {
            //console.log(data.structure.scores.conservation[i] / maximum);
            conservationData.push({
                begin: i+1,
                //do not forget to normalize
                value: data.structure.scores.conservation[i] / maximum,
            });
        }
    
        rowConfigData.push({
            trackId: "conservationTrack",
            trackHeight: 45,
            trackColor: "#F9F9F9",
            displayType: RcsbFvDisplayTypes.AREA,
            displayColor: {
                "thresholds":[0.5],
                "colors":["#8484FF","#FF8484"]
            },
            rowTitle: "CONSERVATION",
            trackData: conservationData,
        })
    }

    //then resolve alphafold scores, if available
    if(data.structure.scores.plddt) 
    {
        const alphafoldData = [];
    
        //we need to normalize the scores to fit in properly
        //by the definition of alphafold scores the maximum should be possibly 100
        const maximum = 100;
    
        for (let i = 0; i < data.structure.scores.plddt.length; i++) {
            alphafoldData.push({
                begin: i+1,
                //do not forget to normalize and round to 5
                value: Number((data.structure.scores.plddt[i] / maximum).toFixed(5)),
            });
        }
    
        rowConfigData.push({
            trackId: "alphafoldTrack",
            trackHeight: 45,
            trackColor: "#F9F9F9",
            displayType: RcsbFvDisplayTypes.AREA,
            displayColor: {
                "thresholds":[0.5],
                "colors":["#8484FF","#FF8484"]
            },
            rowTitle: "ALPHAFOLD",
            trackData: alphafoldData,
        })
    }
    console.log(rowConfigData);
    return rowConfigData;
}

//returns log_x(y)
function getLogBaseX(x : number, y : number) { 
    return Math.log(y) / Math.log(x);
}

//pick a color for the pocket, try to choose one from the preset ones otherwise generate a random one
function pickColor(pocketId: number) {
    //colorblind edited scheme 'Wong' from https://davidmathlogic.com/colorblind/ 
    const defaultColors = [
        "000000",
        "CE0000",
        "F0E442",
        "E69F00",
        "56B4E9",
        "009E73",
        "0072B2",
        "DA74AD"
    ]
    if(pocketId >= defaultColors.length) {
        return Math.floor(Math.random()*16777215).toString(16);
    }
    return defaultColors[pocketId];
}