import React, { useEffect } from "react";

import "../app.css";
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';
import { createLigandRepresentations, createPocketsGroupFromJson, loadStructureIntoMolstar, showPocketInCurrentRepresentation } from "../../viewer/molstar-visualise";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { getApiEndpoint } from "../../prankweb-api";
import { Model, DockingTaskProps } from "./types";
import parsePdbqt from "./pdbqt-parser";

import { DockingTaskVisualizationBox } from "./visualization-box";
import { DockingTaskRightPanel } from "./right-panel";
import { StateObjectSelector } from "molstar/lib/mol-state";
import { PocketData, PocketsViewType, PredictionData } from "../../custom-types";

let dockedMolecule: any; // to be able to access the docked molecule from here and avoid multiple fetches

export function DockingTask(dp: DockingTaskProps) {
    const [plugin, setPlugin] = React.useState<PluginUIContext | undefined>(undefined);
    const [pdbqtModels, setPdbqtModels] = React.useState<Model[]>([]);
    const [pocketRank, setPocketRank] = React.useState<string>("");
    const [prediction, setPrediction] = React.useState<PredictionData | undefined>(undefined);

    // this is a hook that runs when the component is mounted
    useEffect(() => {
        const loadPlugin = async () => {
            const plugin: PluginUIContext = await createMolstarViewer();
            setPlugin(plugin);

            const baseUrl: string = getApiEndpoint(dp.database, dp.id) + "/public";
            // Download pdb/mmcif and create a model in Mol*.
            const molData = await loadStructureIntoMolstar(plugin, `${baseUrl}/${dp.structureName}`, 0.5).then(result => result);
            // Load the docked ligand into Mol*.
            const ligandData = await loadLigandIntoMolstar(plugin, dockedMolecule);

            // Add the pocket representations.
            // First, we have to download the prediction file.
            const prediction: PredictionData = await fetch(`${baseUrl}/prediction.json`).then(res => res.json()).catch(err => console.log(err));
            setPrediction(prediction);

            // Then, download information about the docking tasks.
            const secondUrl: string = getApiEndpoint(dp.database, dp.id, "docking");
            const dockingTasks = await fetch(`${secondUrl}/tasks`).then(res => res.json()).catch(err => console.log(err));

            const builder = plugin.state.data.build();
            const structure: StateObjectSelector = molData[1];

            // Find the pocket rank that we are interested in.
            let pocketRank: string | undefined = undefined;
            dockingTasks["tasks"].forEach((task: any) => {
                if (task["initialData"]["hash"] === dp.hash) {
                    pocketRank = task["initialData"]["pocket"];
                    return;
                }
            });
            setPocketRank(pocketRank!);

            const pocket = prediction.pockets.find((pocket: PocketData) => pocket.rank === pocketRank);
            if (!pocket) return;
            pocket.color = "ff0000";
            await createPocketsGroupFromJson(plugin, structure, "Pockets", prediction, 0.75);
            await builder.commit();

            prediction.pockets.forEach((pocket: PocketData, idx: number) => {
                showPocketInCurrentRepresentation(plugin, PocketsViewType.Surface_Atoms_Color, idx, pocket.rank === pocketRank);
            });
            // TODO: think about adding interactions (if possible?)
        };
        loadPlugin();

        // Parse the PDBQT content and store the models.
        const parsedModels = parsePdbqt(dp.content);
        setPdbqtModels(parsedModels);
    }, []);

    const changePocketsView = (pocketsView: PocketsViewType) => {
        if (plugin === undefined || prediction === undefined) {
            return;
        }

        prediction.pockets.forEach((pocket: PocketData, idx: number) => {
            showPocketInCurrentRepresentation(plugin, pocketsView, idx, pocket.rank === pocketRank);
        });
    };

    return <div style={{ display: "flex" }}>
        <div style={{ width: "50%", margin: "5px" }}>
            <DockingTaskVisualizationBox plugin={plugin!} changePocketsView={changePocketsView} />
        </div>
        <div id="content-wrapper" style={{ width: "50%", margin: "5px" }}>
            <DockingTaskRightPanel pdbqtModels={pdbqtModels} dp={dp} plugin={plugin!} />
        </div>
    </div>;
}

async function loadLigandIntoMolstar(plugin: PluginUIContext | undefined, dockedMolecule: any) {
    if (dockedMolecule === undefined || plugin === undefined) {
        return;
    }

    const ligandData = await plugin.builders.data.rawData({ data: dockedMolecule });
    const trajectory = await plugin.builders.structure.parseTrajectory(ligandData, "pdbqt");
    const model = await plugin.builders.structure.createModel(trajectory);
    const structure = await plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
    const preset = await plugin.builders.structure.representation.applyPreset(structure, 'polymer-and-ligand');

    await createLigandRepresentations(plugin, structure);

    return [model, structure, preset];
}

async function createMolstarViewer() {
    const wrapper = document.getElementById('molstar-wrapper')!;
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

    return MolstarPlugin;
}

export async function getDockingTaskContent(type: string, id: string, database: string, hash: string, structureName: string): Promise<DockingTaskProps> {
    const apiEndpoint = getApiEndpoint(database, id, "docking");
    const response = await fetch(`${apiEndpoint}/${hash}/public/out_vina.pdbqt`).then(res => res.text()).catch(err => console.log(err));

    if (response === undefined) {
        return { content: "Error", hash: hash, id: id, database: database, structureName: structureName };
    }

    dockedMolecule = response;

    return { content: response, hash: hash, id: id, database: database, structureName: structureName };
}