import * as React from 'react';
import Table from '@mui/material/Table';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import { Button, Paper, TableBody } from '@mui/material';
import { PocketData } from "../../custom-types";
import { TasksTable } from "./tasks-table";
import { PredictionInfo } from "../../prankweb-api";

export default function DataTableRowDetails(props: { pocket: PocketData; setTab: (tab: number, initialPocket?: number) => void, predictionInfo: PredictionInfo; }) {
    const pocket = props.pocket;

    const handleCreateTask = () => {
        //the tab index is 2
        props.setTab(2, Number(props.pocket.rank));
    };

    type shownProperty = {
        name: string;
        value: any;
        tooltip?: string;
    };

    const shownProperties: shownProperty[] = [
        {
            name: "Rank",
            value: pocket.rank
        },
        {
            name: "Score",
            value: pocket.score
        },
        {
            name: "Probability",
            value: pocket.probability
        },
        {
            name: "Number of residues",
            value: pocket.residues.length
        },
        {
            name: "Pocket center",
            value: `(${pocket.center[0]}, ${pocket.center[1]}, ${pocket.center[2]})`
        },
        {
            name: "Residues",
            value: pocket.residues.join(", ")
        },
    ];

    if (pocket.avgAlphaFold) shownProperties.push({
        name: "Average AlphaFold score",
        value: pocket.avgAlphaFold!
    });

    if (pocket.avgConservation) shownProperties.push({
        name: "Average conservation score",
        value: pocket.avgConservation!
    });

    if (pocket.ahojDBElement) shownProperties.push({
        name: "Ligand-bound/free PDB structures",
        value: pocket.ahojDBElement!,
        tooltip: "Prefills the query in the AHoJ webserver to identify other apo (ligand-free) and holo (ligand-bound) PDB structures of the protein."
    });

    const isURL = (url: any) => { return typeof url === 'string' && (url.startsWith("http://") || url.startsWith("https://")); };

    return (
        <div>
            <Paper>
                <Table size="small">
                    <TableBody>
                        {shownProperties.map((property, index) =>
                            <TableRow key={index}>
                                <TableCell>{property.tooltip ?
                                    <Tooltip title={property.tooltip} placement="top">
                                        <span>{property.name}</span>
                                    </Tooltip> :
                                    <span>{property.name}</span>}
                                </TableCell>
                                <TableCell>{isURL(property.value) ? <a href={property.value} target="_blank" style={{ "color": "blue" }}>{property.value}</a> : property.value}</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Paper>
            &nbsp;
            <Paper>
                {/*<span style={{ padding: 10, paddingTop: 15, fontSize: "1.25rem", display: "block" }}>Tasks for pocket {pocket.rank}</span>*/}
                <TasksTable pocket={props.pocket} predictionInfo={props.predictionInfo} />
                <Button variant="outlined" onClick={handleCreateTask} style={{ margin: 10 }}>Create task</Button>
            </Paper>
        </div>
    );
}