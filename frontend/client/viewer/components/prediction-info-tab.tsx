import React from "react";
import { PredictionInfo } from "../../prankweb-api";
import { Button, Paper, Table, TableRow, TableCell, TableBody } from "@mui/material";
import { getApiDownloadUrl } from "../../prankweb-api";
import { PredictionData } from "../../custom-types";

export default function PredictionInfoTab(props: { predictionInfo: PredictionInfo; predictionData: PredictionData; }) {
    const pInfo = props.predictionInfo;
    const isUserProvided = pInfo.database.includes("user-upload");
    const isPredicted = pInfo.metadata.predictedStructure === true;

    let url = "";

    if (isPredicted) {
        url = `https://alphafold.ebi.ac.uk/entry/AF-${pInfo.metadata.predictionName}-F1`;
    }
    else if (!isUserProvided) { //this means that the structure is experimental
        url = `https://www.rcsb.org/structure/${pInfo.metadata.predictionName}`;
    }

    const downloadAs = `prankweb-${props.predictionInfo.metadata.predictionName}.zip`;
    const downloadUrl = getApiDownloadUrl(props.predictionInfo);

    type shownProperty = {
        name: string;
        value: any;
    };

    const shownProperties: shownProperty[] = [
        {
            name: "Structure ID",
            value: pInfo.id.toUpperCase(),
        },
        {
            name: "Prediction name",
            value: isUserProvided ? <span>{pInfo.metadata.predictionName}</span> : <a href={url} target="_blank" rel="nofollow noopener noreferrer">{pInfo.metadata.predictionName}</a>
        },
        {
            name: "Database",
            value: pInfo.database
        },
        {
            name: "Created at (YYYY-MM-DD, UTC)",
            value: pInfo.created.replace("T", " ").replace("Z", "")
        },
        {
            name: "Structure provided by the user",
            value: isUserProvided ? "yes" : "no"
        },
        {
            name: "Structure is predicted (AlphaFold)",
            value: isPredicted ? "yes" : "no"
        },
        {
            name: "P2Rank version",
            value: props.predictionData.metadata.p2rank_version || "< 2.4"
        },
        {
            name: "",
            value: (
                <Button variant="contained" color="primary" className="visualization-toolbox-button">
                    <a href={downloadUrl} download={downloadAs} className="visualization-toolbox-option-link">
                        Download prediction data
                    </a>
                </Button>
            )
        }
    ];

    return (
        <Paper>
            <Table>
                <TableBody>
                    {shownProperties.map((p, i) =>
                        <TableRow key={i}>
                            <TableCell>{p.name}</TableCell>
                            <TableCell>{p.value}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </Paper>
    );
}