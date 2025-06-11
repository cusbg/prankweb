import React, { useEffect } from "react";
import "./right-panel.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { Model, DockingTaskProps } from "./types";

import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Box, Collapse, Typography, Button, Tooltip } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { StateObjectSelector } from "molstar/lib/mol-state";
import { setSubtreeVisibility } from "molstar/lib/mol-plugin/behavior/static/state";

function Row(props: { row: Model; models: number[]; handleClick: (models: number) => void; }) {
    const { row, handleClick, models } = props;
    const [open, setOpen] = React.useState(false);

    const rowVisible = models.find(e => e === row.number) !== undefined;

    return (
        <React.Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                <TableCell>
                    <IconButton size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                    &nbsp;
                    <button
                        type="button"
                        style={{
                            "display": "inline",
                            "padding": "0.25rem",
                            "backgroundColor": rowVisible ? "#007bff" : "transparent", // highlight the current model
                            "color": rowVisible ? "#ffffff" : "#000000"
                        }}
                        title="Focus/highlight to this model."
                        className="btn btn-outline-secondary btnIcon"
                        onClick={() => handleClick(row.number)}
                    >
                        {rowVisible ? <i className="bi bi-check" style={{ "display": "block", "fontSize": "small" }}></i>
                            : <i className="bi bi-x" style={{ "display": "block", "fontSize": "small" }}></i>}
                    </button>
                </TableCell>
                <TableCell align="center">{row.number}</TableCell>
                <TableCell align="right">{row.vinaResult[0]}</TableCell>
                <TableCell align="right">{row.vinaResult[1]}</TableCell>
                <TableCell align="right">{row.vinaResult[2]}</TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1, whiteSpace: "pre-line" }}>
                            <p>
                                <i>AutoDock Vina <a href="https://userguide.mdanalysis.org/1.0.1/formats/reference/pdbqt.html#pdbqt-specification">PDBQT</a> result for model {row.number}</i>
                            </p>
                            <pre>
                                {row.originalContent}
                            </pre>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
}

export function DockingTaskRightPanel({ pdbqtModels, dp, plugin, ligandRepresentations }: { pdbqtModels: Model[], dp: DockingTaskProps, plugin: PluginUIContext, ligandRepresentations: StateObjectSelector[]; }) {
    const handleResultDownload = () => {
        const element = document.createElement("a");
        const file = new Blob([dp.ligandPDBQT], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `result-${new Date().toISOString()}.pdbqt`;
        document.body.appendChild(element); // Required for this to work in Firefox
        element.click();
    };

    const handleConfigurationDownload = async () => {
        await fetch(dp.dockingConfigurationURL)
            .then(response => response.text())
            .then(content => {
                const element = document.createElement("a");
                const file = new Blob([content], { type: 'text/plain' });
                element.href = URL.createObjectURL(file);
                element.download = `docking-configuration-${new Date().toISOString()}.json`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
            })
            .catch(error => console.error("Error downloading docking configuration:", error));
    };

    const [models, setModels] = React.useState<number[]>([1]);

    const handleClick = (model: number) => {
        if (models.find(e => e === model) === undefined) {
            setModels([...models, model]);
        } else {
            setModels(models.filter(e => e !== model));
        }
    };

    useEffect(() => {
        const updateModel = async () => {
            if (plugin === undefined) {
                return;
            }

            // for each model, if the index is in the models array, show it, otherwise hide it
            ligandRepresentations.forEach((representation, idx) => {
                setSubtreeVisibility(plugin.state.data, representation.ref, models.find(e => e === idx + 1) === undefined);
            });
        };

        updateModel();
    }, [models]);

    const tableLabels: { name: string, tooltip: string, align: "left" | "center" | "right"; }[] = [
        {
            name: "Rank",
            tooltip: "Rank of the Vina result",
            align: "center"
        },
        {
            name: "Energy (kcal/mol)",
            tooltip: "Predicted binding affinity",
            align: "right"
        },
        {
            name: "rmsd/lb (Å)",
            tooltip: "RMSD lower bound relative to the first model",
            align: "right"
        },
        {
            name: "rmsd/ub (Å)",
            tooltip: "RMSD upper bound relative to the first model",
            align: "right"
        }
    ];

    return (
        <>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            {tableLabels.map((cell) => (
                                <TableCell key={cell.name} align={cell.align}>
                                    {cell.tooltip === "" ?
                                        <span>{cell.name}</span> :
                                        <Tooltip title={cell.tooltip} placement="top">
                                            <span>{cell.name}</span>
                                        </Tooltip>
                                    }
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pdbqtModels.map((row) => (
                            <Row key={row.number + row.vinaResult.join(", ")} row={row} handleClick={handleClick} models={models} />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Button style={{ marginTop: "1em" }} variant="contained" onClick={handleConfigurationDownload}>Download docking configuration</Button>
            &nbsp;
            <Button style={{ marginTop: "1em" }} variant="contained" onClick={handleResultDownload}>Download results</Button>
        </>
    );
}