import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { Color } from "molstar/lib/mol-util/color";
import { Asset } from "molstar/lib/mol-util/assets";
import { AlphaFoldColorsMolStar, AlphaFoldThresholdsMolStar, PredictionData, PocketData, MolstarResidue, ChainData, PolymerRepresentation, PolymerColorType, PolymerViewType, PocketRepresentation, PocketsViewType, Point3D, OverPaintParams } from '../custom-types';
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import { MolScriptBuilder as MS } from "molstar/lib/mol-script/language/builder";
import { createStructureRepresentationParams } from "molstar/lib/mol-plugin-state/helpers/structure-representation-params";
import { StructureSelection, StructureElement, StructureProperties, Bond } from "molstar/lib/mol-model/structure";
import { Script } from "molstar/lib/mol-script/script";
import { Canvas3D } from "molstar/lib/mol-canvas3d/canvas3d";
import { RcsbFv } from '@rcsb/rcsb-saguaro';
import { Loci } from "molstar/lib/mol-model/loci";
import { Bundle } from "molstar/lib/mol-model/structure/structure/element/bundle";
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { StateObjectSelector } from 'molstar/lib/mol-state';
import { Expression } from 'molstar/lib/mol-script/language/expression';

/**
 * Loads the structure to be predicted and adds the polymer representations to the viewer.
 * @param plugin Mol* plugin
 * @param structureUrl URL of the structure to be predicted
 * @param structureAlpha Alpha of the structure (0-1)
 * @param ligandColor Color of the ligands
 * @returns An array containing the model, structure and polymer representations
 */
export async function loadStructureIntoMolstar(plugin: PluginUIContext, structureUrl: string, structureAlpha: number = 1, ligandColor: `0x${string}` = "0x") {
    const data = await plugin.builders.data.download({
        url: Asset.Url(structureUrl),
        isBinary: false
    }, { state: { isGhost: true } });

    let trajectory;
    if (structureUrl.endsWith("cif")) trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
    else trajectory = await plugin.builders.structure.parseTrajectory(data, "pdb");

    //create the initial model
    const model = await plugin.builders.structure.createModel(trajectory);
    const structure: StateObjectSelector = await plugin.builders.structure.createStructure(model, { name: 'model', params: {} });

    const polymerRepresentations: PolymerRepresentation[] = [];

    // adds polymer representations
    const polymer = await plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer');
    if (polymer) {
        polymerRepresentations.push({
            type: PolymerViewType.Gaussian_Surface,
            representation: await plugin.builders.structure.representation.addRepresentation(polymer, {
                type: 'gaussian-surface', //molecular-surface could be probably better, but is slower
                typeParams: { alpha: structureAlpha },
                color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
                ref: "polymer_gaussian"
            }),
            transparentRepresentationRef: null,
            overpaintRef: null
        });

        await plugin.builders.structure.representation.addRepresentation(polymer, {
            type: 'ball-and-stick',
            typeParams: { alpha: structureAlpha },
            color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
            ref: "polymer_balls"
        }).then((e) => {
            //hide ball and stick representation
            polymerRepresentations.push({
                type: PolymerViewType.Atoms,
                representation: e,
                transparentRepresentationRef: null,
                overpaintRef: null
            });
            setSubtreeVisibility(plugin.state.data, polymerRepresentations.find(e => e.type === PolymerViewType.Atoms)!.representation.ref, true);
        });

        await plugin.builders.structure.representation.addRepresentation(polymer, {
            type: 'cartoon',
            typeParams: { alpha: structureAlpha },
            color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
            ref: "polymer_cartoon"
        }).then((e) => {
            //hide ball and stick representation
            polymerRepresentations.push({
                type: PolymerViewType.Cartoon,
                representation: e,
                transparentRepresentationRef: null,
                overpaintRef: null
            });
            setSubtreeVisibility(plugin.state.data, polymerRepresentations.find(e => e.type === PolymerViewType.Cartoon)!.representation.ref, true);
        });
    }

    await createLigandRepresentations(plugin, structure, ligandColor);

    return [model, structure, polymerRepresentations];
}

/**
 * Creates representation of the ligands in the structure.
 * @param plugin Mol* plugin
 * @param structure Mol* structure representation
 * @param color Color of the ligands
 */
export async function createLigandRepresentations(plugin: PluginUIContext, structure: StateObjectSelector, color: `0x${string}` = "0x") {
    const shownGroups = ["water", "ion", "ligand", "nucleic", "lipid", "branched", "non-standard", "coarse"] as const;

    for (const group of shownGroups) {
        const component = await plugin.builders.structure.tryCreateComponentStatic(structure, group);
        if (component) {
            if (color !== "0x" && group !== "water") {
                await plugin.builders.structure.representation.addRepresentation(component, {
                    type: 'ball-and-stick',
                    color: 'uniform',
                    colorParams: { value: Color.fromHexString(color) }
                });
            }
            else {
                await plugin.builders.structure.representation.addRepresentation(component, {
                    type: 'ball-and-stick'
                });
            }
        }
    }

    await plugin.build().commit();
}

/** Method returning log_x(y) */
function getLogBaseX(x: number, y: number) {
    return Math.log(y) / Math.log(x);
}

/**
 * Method used to show only the currently selected representation.
 * @param value Currently shown type of polymer representation
 * @param plugin Mol* plugin
 * @param polymerRepresentations Array of polymer representations
 * @param predictedPolymerRepresentations Array of predicted polymer representations
 * @param showConfidentResidues Whether to show only the confident residues 
 * @returns void
 */
export function updatePolymerView(value: PolymerViewType, plugin: PluginUIContext, polymerRepresentations: PolymerRepresentation[], predictedPolymerRepresentations: PolymerRepresentation[], showConfidentResidues: boolean) {
    // firstly check if the structure is a predicted one
    // and if we're supposed to show only confident residues
    if (predictedPolymerRepresentations.length > 0 && showConfidentResidues) {
        // if so, show the predicted polymer representation
        // it might seem weird, but setSubtreeVisibility "false" means "show"
        predictedPolymerRepresentations.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, element.type !== value));

        // hide all other ones
        polymerRepresentations.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, true));
        return;
    }

    // if predicted and not showing confident residues, show none
    predictedPolymerRepresentations.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, true));

    // lastly, show only the selected representation
    polymerRepresentations.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, element.type !== value));
}

/**
 * Sets the transparency of all polymer representations.
 * @param plugin Mol* plugin
 * @param alpha Structure alpha (0-1)
 * @param polymerRepresentations Array of polymer representations
 */
export async function setStructureTransparency(plugin: PluginUIContext, alpha: number, polymerRepresentations: PolymerRepresentation[]) {
    const params: any = [];

    const query = MS.struct.generator.all;
    const sel = Script.getStructureSelection(query, plugin.managers.structure.hierarchy.current.structures[0].cell.obj!.data);
    const bundle = Bundle.fromSelection(sel);

    params.push({
        bundle: bundle,
        value: alpha
    });

    for (const element of polymerRepresentations) {
        const builder = plugin.state.data.build();
        if (element.transparentRepresentationRef) {
            builder.to(element.representation.ref).delete(element.transparentRepresentationRef);
        }
        await builder.commit();

        const r = await plugin.state.data.build().to(element.representation.ref).apply(StateTransforms.Representation.TransparencyStructureRepresentation3DFromBundle, { layers: params }).commit();
        element.transparentRepresentationRef = r.ref;
    }
}

/**
 * Method used to overpaint the currently selected polymer representation.
 * @param value Currently shown type of polymer representation
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param polymerRepresentations Array of polymer representations
 * @param predictedPolymerRepresentations Array of predicted polymer representations
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
export async function overPaintPolymer(value: PolymerColorType, plugin: PluginUIContext, prediction: PredictionData, polymerRepresentations: PolymerRepresentation[], predictedPolymerRepresentations: PolymerRepresentation[], pocketRepresentations: PocketRepresentation[]) {
    switch (value) {
        case PolymerColorType.White:
            overPaintStructureWhite(plugin, prediction, polymerRepresentations, predictedPolymerRepresentations);
            overPaintPocketsWhite(plugin, prediction, pocketRepresentations);
            return;
        case PolymerColorType.Conservation:
            overPaintStructureWithConservation(plugin, prediction, polymerRepresentations, predictedPolymerRepresentations);
            overPaintPocketsWithConservation(plugin, prediction, pocketRepresentations);
            return;
        case PolymerColorType.AlphaFold:
            overPaintStructureWithAlphaFold(plugin, prediction, polymerRepresentations, predictedPolymerRepresentations);
            overPaintPocketsWithAlphaFold(plugin, prediction, pocketRepresentations);
            return;
    }
}

/**
 * Overpaints a given element representation with given parameters.
 * @param plugin Mol* plugin
 * @param element Element to be overpainted (either a pocket or a polymer representation)
 * @param params Parameters for the overpaint
 */
async function overPaintOneRepresentation(plugin: PluginUIContext, element: PocketRepresentation | PolymerRepresentation, params: OverPaintParams[]) {
    const builder = plugin.state.data.build();
    if (element.overpaintRef) {
        builder.to(element.representation.ref).delete(element.overpaintRef);
    }
    await builder.commit();

    const r = await plugin.build().to(element.representation).apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, { layers: params }).commit();
    element.overpaintRef = r.ref;
}

/**
 * Overpaints the structure with a white color.
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param polymerRepresentations Array of polymer representations
 * @param predictedPolymerRepresentations Array of predicted polymer representations
 * @returns void
 */
async function overPaintStructureWhite(plugin: PluginUIContext, prediction: PredictionData, polymerRepresentations: PolymerRepresentation[], predictedPolymerRepresentations: PolymerRepresentation[]) {
    const chains: ChainData[] = [];
    const params: OverPaintParams[] = [];

    for (let i = 0; i < prediction.structure.indices.length; i++) {
        let splitIndice = prediction.structure.indices[i].split("_");
        let element = chains.find(x => x.chainId === splitIndice[0]);
        if (element) {
            element.residueNums.push(Number(splitIndice[1]));
        } else {
            chains.push({ chainId: splitIndice[0], residueNums: [Number(splitIndice[1])] });
        }
    }

    for (let i = 0; i < chains.length; i++) {
        const sel = getSelectionFromChainAuthId(plugin, chains[i].chainId, chains[i].residueNums);
        const bundle = Bundle.fromSelection(sel);

        params.push({
            bundle: bundle,
            color: Color(0xFFFFFF),
            clear: false
        });
    }

    polymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
    predictedPolymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
}

/**
 * Overpaints the pockets' whole residues (not atoms!) with white color
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
async function overPaintPocketsWhite(plugin: PluginUIContext, prediction: PredictionData, pocketRepresentations: PocketRepresentation[]) { //clears current overpaint with a white color
    for (const pocket of prediction.pockets) {
        const chains: ChainData[] = [];
        const params: OverPaintParams[] = [];

        for (const residue of pocket.residues) {
            let splitResidue = residue.split("_");
            let element = chains.find(x => x.chainId === splitResidue[0]);
            if (element) {
                element.residueNums.push(Number(splitResidue[1]));
            } else {
                chains.push({ chainId: splitResidue[0], residueNums: [Number(splitResidue[1])] });
            }
        }

        for (let i = 0; i < chains.length; i++) {
            const sel = getSelectionFromChainAuthId(plugin, chains[i].chainId, chains[i].residueNums);
            const bundle = Bundle.fromSelection(sel);

            params.push({
                bundle: bundle,
                color: Color(0xFFFFFF),
                clear: false
            });
        }

        const pocketReprs = pocketRepresentations.filter(e => e.pocketId === pocket.name);
        for (const element of pocketReprs) {
            if (!element.coloredPocket) {
                overPaintOneRepresentation(plugin, element, params);
            }
        }
    }
}

/**
 * Overpaints the structure with AlphaFold colors
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param polymerRepresentations Array of polymer representations
 * @param predictedPolymerRepresentations Array of predicted polymer representations
 * @returns void
 */
async function overPaintStructureWithAlphaFold(plugin: PluginUIContext, prediction: PredictionData, polymerRepresentations: PolymerRepresentation[], predictedPolymerRepresentations: PolymerRepresentation[]) { //paints the structure with the alpha fold prediction
    if (!prediction.structure.scores.plddt) return;

    const params: OverPaintParams[] = [];
    const selections: ChainData[] = [];

    //create the selections for the pockets
    for (let i = 0; i < prediction.structure.indices.length; i++) {
        const residue = prediction.structure.indices[i];
        const splitResidue = residue.split("_");
        const chain = splitResidue[0];
        const id = Number(splitResidue[1]);

        const score = prediction.structure.scores.plddt[i];

        for (let y = 0; y < AlphaFoldThresholdsMolStar.length; y++) {
            if (score > AlphaFoldThresholdsMolStar[y]) {
                const element = selections.find(e => e.threshold === AlphaFoldThresholdsMolStar[y] && e.chainId == chain);
                if (element) {
                    element.residueNums.push(id);
                }
                else {
                    selections.push({ chainId: chain, residueNums: [id], threshold: AlphaFoldThresholdsMolStar[y] });
                }
                break;
            }
        }
    }

    //color the residues
    for (let i = 0; i < selections.length; i++) {
        const sel = getSelectionFromChainAuthId(plugin, selections[i].chainId, selections[i].residueNums);
        const bundle = Bundle.fromSelection(sel);

        params.push({
            bundle: bundle,
            color: AlphaFoldColorsMolStar[AlphaFoldThresholdsMolStar.findIndex(e => e === selections[i].threshold)],
            clear: false
        });
    }

    polymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
    predictedPolymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
}

/**
 * Overpaints the pockets' whole residues (not atoms!) with AlphaFold colors
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
async function overPaintPocketsWithAlphaFold(plugin: PluginUIContext, prediction: PredictionData, pocketRepresentations: PocketRepresentation[]) {
    if (!prediction.structure.scores.plddt) return;

    const thresholds = [90, 70, 50, 0];
    const colors: Color[] = [ //those are the colors from ALPHAFOLD db
        Color.fromRgb(0, 83, 214),
        Color.fromRgb(101, 203, 243),
        Color.fromRgb(255, 219, 19),
        Color.fromRgb(255, 125, 69),
    ];

    for (const pocket of prediction.pockets) {
        const params: OverPaintParams[] = [];
        const selections: ChainData[] = [];

        for (const residue of pocket.residues) {
            const splitResidue = residue.split("_");
            const chain = splitResidue[0];
            const id = Number(splitResidue[1]);

            const index = prediction.structure.indices.findIndex(e => e === residue);
            const score = prediction.structure.scores.plddt[index];

            for (let y = 0; y < thresholds.length; y++) {
                if (score > thresholds[y]) {
                    const element = selections.find(e => e.threshold === thresholds[y] && e.chainId == chain);
                    if (element) {
                        element.residueNums.push(id);
                    }
                    else {
                        selections.push({ chainId: chain, residueNums: [id], threshold: thresholds[y] });
                    }
                    break;
                }
            }
        }

        //color the residues
        for (let i = 0; i < selections.length; i++) {
            const sel = getSelectionFromChainAuthId(plugin, selections[i].chainId, selections[i].residueNums);
            const bundle = Bundle.fromSelection(sel);

            params.push({
                bundle: bundle,
                color: colors[thresholds.findIndex(e => e === selections[i].threshold)],
                clear: false
            });
        }

        const pocketReprs = pocketRepresentations.filter(e => e.pocketId === pocket.name);
        for (const element of pocketReprs) {
            if (!element.coloredPocket) {
                overPaintOneRepresentation(plugin, element, params);
            }
        }
    }
}

/**
 * Computes the normalized conservation scores and saves them in the conservationNormalized variable.
 * @param prediction Prediction data
 * @returns Array of normalized conservation scores
 */
export function computeNormalizedConservation(prediction: PredictionData) {
    if (!prediction.structure.scores.conservation) return;
    //by the definition of conservation scoring the maximum is log_2(20)
    const maxConservation = getLogBaseX(2, 20);
    const conservationNormalized = [];
    for (let i = 0; i < prediction.structure.scores.conservation.length; i++) {
        conservationNormalized.push(prediction.structure.scores.conservation[i] / maxConservation);
    }

    return conservationNormalized;
}

/**
 * Overpaints the structure with grayscale colors based on the conservation scores for each residue
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param polymerRepresentations Array of polymer representations
 * @param predictedPolymerRepresentations Array of predicted polymer representations
 * @returns void
 */
async function overPaintStructureWithConservation(plugin: PluginUIContext, prediction: PredictionData, polymerRepresentations: PolymerRepresentation[], predictedPolymerRepresentations: PolymerRepresentation[]) {
    if (!prediction.structure.scores.conservation) return;

    const params: OverPaintParams[] = [];
    const thresholds = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
    const colors: Color[] = [];

    //create shades of gray
    //the first one is 120, 120, 120
    //the last one is 255, 255, 255
    for (let i = 0; i < thresholds.length; i++) {
        let colorShade = i * 15 + 120;
        colors.push(Color.fromRgb(colorShade, colorShade, colorShade));
    }

    const selections: ChainData[] = [];

    for (let i = 0; i < prediction.structure.indices.length; i++) {
        let residue = prediction.structure.indices[i];
        const splitResidue = residue.split("_");
        const chain = splitResidue[0];
        const id = Number(splitResidue[1]);

        let score = prediction.structure.scores.conservation[i];

        for (let y = 0; y < thresholds.length; y++) {
            if (score > thresholds[y]) {
                let element = selections.find(e => e.threshold === thresholds[y] && e.chainId == chain);
                if (element) {
                    element.residueNums.push(id);
                }
                else {
                    selections.push({ chainId: chain, residueNums: [id], threshold: thresholds[y] });
                }
                break;
            }
        }
    }

    //color the residues
    for (let i = 0; i < selections.length; i++) {
        const sel = getSelectionFromChainAuthId(plugin, selections[i].chainId, selections[i].residueNums);
        const bundle = Bundle.fromSelection(sel);

        params.push({
            bundle: bundle,
            color: colors[thresholds.findIndex(e => e === selections[i].threshold)],
            clear: false
        });
    }

    polymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
    predictedPolymerRepresentations.forEach(element => overPaintOneRepresentation(plugin, element, params));
}

/**
 * Overpaints the pockets' whole residues (not atoms!) with grayscale colors based on the conservation scores for each residue
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
async function overPaintPocketsWithConservation(plugin: PluginUIContext, prediction: PredictionData, pocketRepresentations: PocketRepresentation[]) {
    if (!prediction.structure.scores.conservation) return;

    const thresholds = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
    const colors: Color[] = [];
    //create shades of gray
    //the first one is 120, 120, 120
    //the last one is 255, 255, 255
    for (let i = 0; i < thresholds.length; i++) {
        let colorShade = i * 15 + 120;
        colors.push(Color.fromRgb(colorShade, colorShade, colorShade));
    }


    for (const pocket of prediction.pockets) {
        const params: OverPaintParams[] = [];
        const selections: ChainData[] = [];

        for (const residue of pocket.residues) {
            const splitResidue = residue.split("_");
            const chain = splitResidue[0];
            const id = Number(splitResidue[1]);

            let index = prediction.structure.indices.findIndex(e => e === residue);
            let score = prediction.structure.scores.conservation[index];

            // console.log('residue: %s, index: %d, score: %d', residue, index, score);

            for (let y = 0; y < thresholds.length; y++) {
                if (score > thresholds[y]) {
                    let element = selections.find(e => e.threshold === thresholds[y] && e.chainId == chain);
                    if (element) {
                        element.residueNums.push(id);
                    }
                    else {
                        selections.push({ chainId: chain, residueNums: [id], threshold: thresholds[y] });
                    }
                    break;
                }
            }
        }

        //color the residues
        for (let i = 0; i < selections.length; i++) {
            const sel = getSelectionFromChainAuthId(plugin, selections[i].chainId, selections[i].residueNums);
            const bundle = Bundle.fromSelection(sel);

            params.push({
                bundle: bundle,
                color: colors[thresholds.findIndex(e => e === selections[i].threshold)],
                clear: false
            });
        }

        const pocketReprs = pocketRepresentations.filter(e => e.pocketId === pocket.name);
        for (const element of pocketReprs) {
            if (!element.coloredPocket) {
                overPaintOneRepresentation(plugin, element, params);
            }
        }
    }
}

/**
 * Method to create the pocket holder group (called "Pockets" in the tree)
 * @param plugin Mol* plugin
 * @param structure Mol* structure (returned from the first call of loadStructureIntoMolstar())
 * @param groupName Group name (in this case "Pockets")
 * @param prediction Prediction data
 * @param alpha Alpha for the pocket
 * @param createOverpaint Whether to create representations for overpaint
 * @returns Array of pocket representations
 */
export async function createPocketsGroupFromJson(plugin: PluginUIContext, structure: StateObjectSelector, groupName: string, prediction: PredictionData, alpha: number = 1, createOverpaint: boolean = true) {
    const builder = plugin.state.data.build();
    const group = builder.to(structure).apply(StateTransforms.Misc.CreateGroup, { label: groupName }, { ref: groupName });

    const pocketRepresentations: PocketRepresentation[] = [];

    prediction.pockets.map((pocket, i) => {
        createPocketFromJson(plugin, structure, pocket, `Pocket ${i + 1}`, group, pocketRepresentations, alpha, createOverpaint);
    });
    await builder.commit();

    return pocketRepresentations;
}

/**
 * Creates pockets' representation one by one and assigns them to the groups
 * @param plugin Mol* plugin
 * @param structure Mol* structure (returned from the first call of loadStructureIntoMolstar())
 * @param pocket Current pocket data
 * @param groupName Name of the group to which the pocket will be assigned
 * @param group Group to which the pocket will be assigned (from createPocketsGroupFromJson())
 * @param pocketRepresentations Array of pocket representations
 * @param alpha Alpha of the pocket (0-1)
 * @param createOverpaint Whether to create representations for overpaint
 * @returns void
 */
export async function createPocketFromJson(plugin: PluginUIContext, structure: StateObjectSelector, pocket: PocketData, groupName: string, group: any, pocketRepresentations: PocketRepresentation[], alpha: number = 1, createOverpaint: boolean = true) { //group should not be any but i cannot figure out the right type
    const group2 = group.apply(StateTransforms.Misc.CreateGroup, { label: groupName }, { ref: groupName }, { selectionTags: groupName });

    const atomsExpression = MS.struct.generator.atomGroups({
        'atom-test': MS.core.set.has([MS.set(...pocket.surface.map(Number)), MS.struct.atomProperty.macromolecular.id()])
    });

    //this selects the whole residues
    const wholeResiduesExpression = MS.struct.modifier.wholeResidues({ 0: atomsExpression });

    //create the gaussian surface representations...
    //we need to create one for the whole residue and one for the atoms
    const wholeResiduesSelection = group2.apply(StateTransforms.Model.StructureSelectionFromExpression, { expression: wholeResiduesExpression });
    const atomsSelection = group2.apply(StateTransforms.Model.StructureSelectionFromExpression, { expression: atomsExpression });
    const color = Number("0x" + pocket.color);

    //NOTE: the following piece of code could be transformed into a function,
    //for better readability & clarity it is not done here
    //moreover, the function would potentially depend on internal Mol* implementation

    //the first one selects the whole residues and does not color them -> for overpaints
    if (createOverpaint) {
        const repr_surface: StateObjectSelector = wholeResiduesSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
            type: 'gaussian-surface',
            typeParams: { alpha: alpha },
            color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
        }));

        pocketRepresentations.push({
            pocketId: pocket.name,
            type: PocketsViewType.Surface_Atoms_Color,
            representation: repr_surface,
            coloredPocket: false,
            overpaintRef: null
        });
    }

    //the second one selects the atoms and colors them
    const repr_surface2: StateObjectSelector = atomsSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'gaussian-surface',
        typeParams: { alpha: alpha },
        color: 'uniform', colorParams: { value: Color(color) },
        size: 'physical', sizeParams: { scale: 1.10 }
    }));

    pocketRepresentations.push({
        pocketId: pocket.name,
        type: PocketsViewType.Surface_Atoms_Color,
        representation: repr_surface2,
        coloredPocket: true,
        overpaintRef: null
    });

    //the third one selects the whole residues and colors them
    const repr_surface3: StateObjectSelector = wholeResiduesSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'gaussian-surface',
        typeParams: { alpha: alpha },
        color: 'uniform', colorParams: { value: Color(color) },
        size: 'physical', sizeParams: { scale: 1.10 }
    }));

    pocketRepresentations.push({
        pocketId: pocket.name,
        type: PocketsViewType.Surface_Residues_Color,
        representation: repr_surface3,
        coloredPocket: true,
        overpaintRef: null
    });

    //create the ball and stick representations
    //the first one selects the whole residues and does not color them -> again for overpaints
    if (createOverpaint) {
        const repr_ball_stick: StateObjectSelector = wholeResiduesSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
            type: 'ball-and-stick',
            typeParams: { alpha: alpha },
            color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
            size: 'physical', sizeParams: { scale: 1.10 }
        }));

        pocketRepresentations.push({
            pocketId: pocket.name,
            type: PocketsViewType.Ball_Stick_Residues_Color,
            representation: repr_ball_stick,
            coloredPocket: false,
            overpaintRef: null
        });
    }

    //the second one selects the atoms and colors them
    const repr_ball_stick2: StateObjectSelector = atomsSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'ball-and-stick',
        typeParams: { alpha: alpha },
        color: 'uniform', colorParams: { value: Color(color) },
        size: 'physical', sizeParams: { scale: 1.10 }
    }));

    pocketRepresentations.push({
        pocketId: pocket.name,
        type: PocketsViewType.Ball_Stick_Atoms_Color,
        representation: repr_ball_stick2,
        coloredPocket: true,
        overpaintRef: null
    });

    //the third one selects the whole residues and colors them
    const repr_ball_stick3: StateObjectSelector = wholeResiduesSelection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'ball-and-stick',
        typeParams: { alpha: alpha },
        color: 'uniform', colorParams: { value: Color(color) },
        size: 'physical', sizeParams: { scale: createOverpaint ? 1.50 : 1.10 }
    }));

    pocketRepresentations.push({
        pocketId: pocket.name,
        type: PocketsViewType.Ball_Stick_Residues_Color,
        representation: repr_ball_stick3,
        coloredPocket: true,
        overpaintRef: null
    });
}

/**
 * Method which sets the visibility of one pocket in the desired representation
 * @param plugin Mol* plugin
 * @param representationType Type of the representation to be shown
 * @param pocketRepresentations Array of pocket representations
 * @param pocketIndex Index of the pocket
 * @param isVisible Visibility of the pocket
 * @returns void
 */
export function showPocketInCurrentRepresentation(plugin: PluginUIContext, representationType: PocketsViewType, pocketRepresentations: PocketRepresentation[], pocketIndex: number, isVisible: boolean) {
    if (isVisible) {
        //show the pocket
        const currentPocketRepr = pocketRepresentations.filter(e => e.type === representationType && e.pocketId === `pocket${pocketIndex + 1}`);
        currentPocketRepr.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, false));

        //hide other representations
        const otherPocketRepr = pocketRepresentations.filter(e => e.type !== representationType && e.pocketId === `pocket${pocketIndex + 1}`);
        otherPocketRepr.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, true));

        return;
    }

    //else hide all representations
    const pocketRepr = pocketRepresentations.filter(e => e.pocketId === `pocket${pocketIndex + 1}`);
    pocketRepr.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, true));
}

/**
 * Method which sets the visibility of all the pockets in the desired representation
 * @param plugin Mol* plugin
 * @param representationType Type of the representation to be shown
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
export function showAllPocketsInRepresentation(plugin: PluginUIContext, representationType: PocketsViewType, pocketRepresentations: PocketRepresentation[]) {
    pocketRepresentations.forEach(element => setSubtreeVisibility(plugin.state.data, element.representation.ref, element.type !== representationType));
}

/**
 * Method which focuses on the residues loci specidfied by the user, can be called from anywhere
 * @param plugin Mol* plugin
 * @param chain Chain (letter) to be focused on
 * @param ids 
 * @returns void
 */
export function highlightInViewerLabelIdWithoutFocus(plugin: PluginUIContext, chain: string, ids: number[]) {
    const data = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!data) return;

    const sel = getSelectionFromChainAuthId(plugin, chain, ids);
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    //loci = StructureElement.Loci.firstResidue(loci);
    plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
}

/**
 * Highlights the selected surface atoms, if toggled, the method will focus on them as well
 * @param plugin Mol* plugin
 * @param ids Surface atoms ids
 * @param focus Focus on the surface atoms (if false, it will only highlight them)
 * @returns void
 */
export function highlightSurfaceAtomsInViewerLabelId(plugin: PluginUIContext, ids: string[], focus: boolean) {
    const data = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!data) return;

    const sel = getSurfaceAtomSelection(plugin, ids);
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    if (focus) plugin.managers.camera.focusLoci(loci);
}

/**
 * Method which gets selection from surface atom numbers
 * @param plugin Mol* plugin
 * @param ids Surface atoms ids
 * @returns StructureSelection of the surface atoms
 */
function getSurfaceAtomSelection(plugin: PluginUIContext, ids: string[]) {
    const query = MS.struct.generator.atomGroups({
        'atom-test': MS.core.set.has([MS.set(...ids.map(Number)), MS.struct.atomProperty.macromolecular.id()])
    });
    return Script.getStructureSelection(query, plugin.managers.structure.hierarchy.current.structures[0].cell.obj!.data);
}


/**
 * Method which gets selection from specified chainId and residues
 * @param plugin Mol* plugin
 * @param chainId Chain (letter) to be focused on
 * @param positions Residue ids
 * @returns StructureSelection of the desired residues
 */
function getSelectionFromChainAuthId(plugin: PluginUIContext, chainId: string, positions: number[]) {
    const query = MS.struct.generator.atomGroups({
        'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), chainId]),
        'residue-test': MS.core.set.has([MS.set(...positions), MS.struct.atomProperty.macromolecular.auth_seq_id()]),
        'group-by': MS.struct.atomProperty.macromolecular.residueKey()
    });
    return Script.getStructureSelection(query, plugin.managers.structure.hierarchy.current.structures[0].cell.obj!.data);
}

/**
 * Method which adds predicted structure representation to the viewer
 * @param plugin Mol* plugin
 * @param prediction Prediction data
 * @param structure Mol* structure (returned from the first call of loadStructureIntoMolstar())
 * @returns Array of predicted polymer representations
 */
export async function addPredictedPolymerRepresentation(plugin: PluginUIContext, prediction: PredictionData, structure: StateObjectSelector) {
    const predictedPolymerRepresentations: PolymerRepresentation[] = [];

    const builder = plugin.state.data.build();
    const group = builder.to(structure).apply(StateTransforms.Misc.CreateGroup, { label: "Confident Polymer 70" }, { ref: "Confident Polymer 70" });

    const confidentResiduesExpression = getConfidentResiduesFromPrediction(prediction);

    const selection = group.apply(StateTransforms.Model.StructureSelectionFromExpression, { expression: confidentResiduesExpression });

    const repr_ball_stick_predict = selection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'ball-and-stick',
        color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
    }));

    predictedPolymerRepresentations.push({
        type: PolymerViewType.Atoms,
        representation: repr_ball_stick_predict.selector,
        transparentRepresentationRef: null,
        overpaintRef: null
    });

    const repr_surface_predict = selection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'gaussian-surface',
        color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
    }));

    predictedPolymerRepresentations.push({
        type: PolymerViewType.Gaussian_Surface,
        representation: repr_surface_predict.selector,
        transparentRepresentationRef: null,
        overpaintRef: null
    });

    const repr_cartoon_predict = selection.apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(plugin, structure.data, {
        type: 'cartoon',
        color: 'uniform', colorParams: { value: Color(0xFFFFFF) },
    }));

    predictedPolymerRepresentations.push({
        type: PolymerViewType.Cartoon,
        representation: repr_cartoon_predict.selector,
        transparentRepresentationRef: null,
        overpaintRef: null
    });

    await builder.commit();

    //after creating the representations, hide them
    setSubtreeVisibility(plugin.state.data, repr_ball_stick_predict.ref, true);
    setSubtreeVisibility(plugin.state.data, repr_surface_predict.ref, true);
    setSubtreeVisibility(plugin.state.data, repr_cartoon_predict.ref, true);

    return predictedPolymerRepresentations;
}

/**
 * Method which gets selection of the confident residues (plddt > 70) for predicted structures
 * @param prediction Prediction data
 * @returns Expression with the selection of the confident residues
 */
export function getConfidentResiduesFromPrediction(prediction: PredictionData) {
    const queries: Expression[] = [];
    //for each chain create a query for the residues
    let totalIndex = 0;

    for (let i = 0; i < prediction.structure.regions.length; i++) {
        const chain = prediction.structure.regions[i].name;
        const positions = prediction.structure.indices.slice(totalIndex, prediction.structure.regions[i].end + 1);
        const newPositions: number[] = [];

        for (let y = 0; y < positions.length; y++) {
            if (prediction.structure.scores.plddt![totalIndex + y] > 70) {
                newPositions.push(Number(positions[y].split("_")[1]));
            }
        }

        const query = MS.struct.generator.atomGroups({
            'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), chain]),
            'residue-test': MS.core.set.has([MS.set(...newPositions), MS.struct.atomProperty.macromolecular.auth_seq_id()]),
            'group-by': MS.struct.atomProperty.macromolecular.residueKey()
        });

        totalIndex = prediction.structure.regions[i].end + 1;
        queries.push(query);
    }

    const finalQuery = MS.struct.modifier.union(queries);

    return finalQuery;
}

/**
 * Method which focuses on the loci specified by the user
 * @param plugin Mol* plugin
 * @param chain Chain (letter) to be focused on
 * @param ids Residue ids
 * @returns void
 */
export function highlightInViewerAuthId(plugin: PluginUIContext, chain: string, ids: number[]) {
    const data = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!data) return;

    const sel = getSelectionFromChainAuthId(plugin, chain, ids);
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    plugin.managers.camera.focusLoci(loci);
}

/**
 * Method which returns coordinates of the surface atoms
 * @param plugin Mol* plugin
 * @param ids Surface atom ids
 * @returns An array of coordinates
 */
export function getPocketAtomCoordinates(plugin: PluginUIContext, ids: string[]) {
    const coordinates: Point3D[] = [];

    //could this be potentially improved? not sure whether we can do it just with one selection
    for (let i of ids) {
        const sel = getSurfaceAtomSelection(plugin, [i]);
        const loci = getStructureElementLoci(StructureSelection.toLociWithSourceUnits(sel));

        if (loci) {
            const structureElement = StructureElement.Stats.ofLoci(loci);
            const location = structureElement.firstElementLoc;
            coordinates.push({ x: StructureProperties.atom.x(location), y: StructureProperties.atom.y(location), z: StructureProperties.atom.z(location) });
        }
    }

    return coordinates;
}

/**
 * Focuses the camera on the second loaded structure. Typically used for focusing on the ligand.
 * @param plugin Mol* plugin
 * @param extraRadius Extra radius for the focus (to zoom out)
 * @returns void
 */
export function focusOnSecondLoadedStructure(plugin: PluginUIContext, extraRadius: number = 0) {
    const data = plugin.managers.structure.hierarchy.current.structures[1]?.cell.obj?.data;
    if (!data) return;
    const query = MS.struct.generator.all;
    const sel = Script.getStructureSelection(query, data);
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    plugin.managers.camera.focusLoci(loci, { extraRadius: extraRadius });
}

/**
 * Focus the camera on the pocket
 * @param plugin Mol* plugin
 * @param pocket Pocket data
 * @returns void
 */
export function focusOnPocket(plugin: PluginUIContext, pocket: PocketData) {
    const data = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!data) return;

    const sel = getSurfaceAtomSelection(plugin, pocket.surface);
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    plugin.managers.camera.focusLoci(loci);
}

/**
 * Returns the residue information from a given surface atom id
 * @param plugin Mol* plugin
 * @param loci 
 * @returns Residue information
 */
export function getResidueFromSurfaceAtom(plugin: PluginUIContext, surfaceAtom: string) {
    const sel = getSurfaceAtomSelection(plugin, [surfaceAtom.toString()]);
    const loci = getStructureElementLoci(StructureSelection.toLociWithSourceUnits(sel));
    if (!loci) return null;

    const structureElement = StructureElement.Stats.ofLoci(loci);
    const location = structureElement.firstElementLoc;
    const residue: MolstarResidue = {
        authName: StructureProperties.atom.auth_comp_id(location),
        name: StructureProperties.atom.label_comp_id(location),
        isHet: StructureProperties.residue.hasMicroheterogeneity(location),
        insCode: StructureProperties.residue.pdbx_PDB_ins_code(location),
        index: StructureProperties.residue.key(location),
        seqNumber: StructureProperties.residue.label_seq_id(location),
        authSeqNumber: StructureProperties.residue.auth_seq_id(location),
        chain: {
            asymId: StructureProperties.chain.label_asym_id(location),
            authAsymId: StructureProperties.chain.auth_asym_id(location),
            entity: {
                entityId: StructureProperties.entity.id(location),
                index: StructureProperties.entity.key(location)
            },
            index: StructureProperties.chain.key(location)
        }
    };

    return residue;
}

/**
 * Create a bounding box for the pocket in all representations
 * @param plugin Mol* plugin
 * @param pocket Pocket data
 * @param pocketRepresentations Array of pocket representations
 * @returns References to the bounding boxes
 */
export async function createBoundingBoxForPocket(plugin: PluginUIContext, pocket: PocketData, pocketRepresentations: PocketRepresentation[]) {
    const builder = plugin.state.data.build();
    const pocketReprs = pocketRepresentations.filter(e => e.pocketId === pocket.name);

    const refs = [];
    for (const element of pocketReprs) {
        const r = builder.to(element.representation).apply(StateTransforms.Representation.StructureBoundingBox3D, {
            color: Color(0x000000),
        });
        refs.push(r.ref);
    }

    await builder.commit();

    return refs;
}

/**
 * Remove bounding box for the pocket in all representations
 * @param plugin Mol* plugin
 * @param refs References to the bounding boxes (strings returned from createBoundingBoxForPocket())
 * @param pocket Pocket data
 * @param pocketRepresentations Array of pocket representations
 * @returns void
 */
export async function removeBoundingBoxForPocket(plugin: PluginUIContext, refs: string[], pocket: PocketData, pocketRepresentations: PocketRepresentation[]) {
    const pocketReprs = pocketRepresentations.filter(e => e.pocketId === pocket.name);

    const builder = plugin.state.data.build();

    for (const element of pocketReprs) {
        for (const ref of refs) {
            builder.to(element.representation).delete(ref);
        }
    }

    await builder.commit();
}

//cc: https://github.com/scheuerv/molart/
function getStructureElementLoci(loci: Loci): StructureElement.Loci | undefined {
    if (loci.kind == "bond-loci") {
        return Bond.toStructureElementLoci(loci);
    } else if (loci.kind == "element-loci") {
        return loci;
    }
    return undefined;
}

/**
 * Method which connects Mol* viewer activity to the RCSB plugin
 * @param plugin Mol* plugin
 * @param predictionData Prediction data
 * @param rcsbPlugin Rcsb plugin
 * @returns void
 */
export function linkMolstarToRcsb(plugin: PluginUIContext, predictionData: PredictionData, rcsbPlugin: RcsbFv) {
    //cc: https://github.com/scheuerv/molart/
    //listens for hover event over anything on Mol* plugin and then it determines
    //if it is loci of type StructureElement. If it is StructureElement then it
    //propagates this event from MolstarPlugin transformed as MolstarResidue.
    //in our modification it also highlights the section in RCSB viewer
    plugin.canvas3d?.interaction.hover.subscribe((event: Canvas3D.HoverEvent) => {
        const structureElementLoci = getStructureElementLoci(event.current.loci);
        if (structureElementLoci) {
            const structureElement = StructureElement.Stats.ofLoci(structureElementLoci);
            const location = structureElement.firstElementLoc;
            const residue: MolstarResidue = {
                authName: StructureProperties.atom.auth_comp_id(location),
                name: StructureProperties.atom.label_comp_id(location),
                isHet: StructureProperties.residue.hasMicroheterogeneity(location),
                insCode: StructureProperties.residue.pdbx_PDB_ins_code(location),
                index: StructureProperties.residue.key(location),
                seqNumber: StructureProperties.residue.label_seq_id(location),
                authSeqNumber: StructureProperties.residue.auth_seq_id(location),
                chain: {
                    asymId: StructureProperties.chain.label_asym_id(location),
                    authAsymId: StructureProperties.chain.auth_asym_id(location),
                    entity: {
                        entityId: StructureProperties.entity.id(location),
                        index: StructureProperties.entity.key(location)
                    },
                    index: StructureProperties.chain.key(location)
                }
            };
            const toFind = residue.chain.authAsymId + "_" + residue.authSeqNumber;
            const element = predictionData.structure.indices.indexOf(toFind);
            rcsbPlugin.setSelection({
                elements: {
                    begin: element + 1
                },
                mode: 'hover'
            });
        }
    });
}