import * as React from 'react';
import Box from '@mui/material/Box';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import Collapse from '@mui/material/Collapse';

import "bootstrap-icons/font/bootstrap-icons.css";
import "./data-table.css";
import { PocketData } from '../../custom-types';
import { calculateColorWithAlpha } from './tools';
import DataTableRowDetails from "./data-table-row-details";
import { PredictionInfo } from "../../prankweb-api";

export default class DataTableRow extends React.Component<{
    pocket: PocketData,
    emptyRows: number,
    hasConservation: boolean,
    hasAlphaFold: boolean,
    setPocketVisibility: (index: number, isVisible: boolean) => void,
    showOnlyPocket: (index: number) => void,
    focusPocket: (index: number) => void,
    highlightPocket: (index: number, isHighlighted: boolean) => void,
    setTab: (tab: number, initialPocket?: number) => void,
    predictionInfo: PredictionInfo,
    headCellsLength: number;
}, {
    open: boolean,
    index: number,
}> {

    constructor(props: any) {
        super(props);

        this.state = {
            open: false,
            index: Number(this.props.pocket.rank) - 1,
        };

        this.setOpen = this.setOpen.bind(this);
        this.onPocketMouseEnter = this.onPocketMouseEnter.bind(this);
        this.onPocketMouseLeave = this.onPocketMouseLeave.bind(this);
        this.onPocketClick = this.onPocketClick.bind(this);
        this.togglePocketVisibility = this.togglePocketVisibility.bind(this);
    }

    setOpen() {
        this.setState({ open: !this.state.open });
    }

    onPocketMouseEnter() {
        if (!this.props.pocket.isVisible) {
            return;
        }
        this.props.highlightPocket(this.state.index, true);
    }

    onPocketMouseLeave() {
        if (!this.props.pocket.isVisible) {
            return;
        }
        this.props.highlightPocket(this.state.index, false);
    }

    onPocketClick() {
        // Cannot focus on hidden pocket.
        if (!this.props.pocket.isVisible) {
            return;
        }
        this.props.focusPocket(this.state.index);
    }

    togglePocketVisibility() {
        this.props.setPocketVisibility(this.state.index, !this.props.pocket.isVisible);
        //this changes the pocket visibility, so we have to render again
        this.forceUpdate();
    }

    render() {
        const pocket = this.props.pocket;
        if (pocket.isVisible === undefined) { //for pockets that load for the first time
            pocket.isVisible = true;
        }

        return (
            <React.Fragment>
                <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                    <TableCell>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            style={{ "padding": "0.25rem" }}
                            onClick={() => this.setOpen()}
                        >
                            {this.state.open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                    </TableCell>
                    <TableCell component="th" scope="row">
                        <button
                            type="button"
                            title="Show / Hide pocket."
                            className="btn btn-outline-secondary btnIcon"
                            style={{ "padding": "0.25rem" }}
                            onClick={this.togglePocketVisibility}>
                            {pocket.isVisible ?
                                <i className="bi bi-eye-fill" style={{ "display": "block", "fontSize": "small" }}></i>
                                :
                                <i className="bi bi-eye" style={{ "display": "block", "fontSize": "small" }}></i>
                            }
                        </button>
                        &nbsp;
                        <button
                            type="button"
                            style={{
                                "display": pocket.isVisible ? "inline" : "none",
                                "padding": "0.25rem"
                            }}
                            title="Focus/highlight to this pocket."
                            className="btn btn-outline-secondary btnIcon"
                            onClick={this.onPocketClick}
                            onMouseEnter={this.onPocketMouseEnter}
                            onMouseLeave={this.onPocketMouseLeave}
                        >
                            <i className="bi bi-search" style={{ "display": "block", "fontSize": "small" }}></i>
                        </button>
                    </TableCell>
                    <TableCell component="th" scope="row" align="center" style={{
                        "backgroundColor": (pocket.isVisible || pocket.isVisible === undefined) ? calculateColorWithAlpha(0.75, this.props.pocket.color!) : "#ffffff"
                    }}>
                        {pocket.rank}
                    </TableCell>
                    <TableCell align="right">{pocket.score}</TableCell>
                    <TableCell align="right">{pocket.probability}</TableCell>
                    <TableCell align="right">{pocket.residues.length}</TableCell>
                    {this.props.hasConservation && <TableCell align="right">{pocket.avgConservation}</TableCell>}
                    {this.props.hasAlphaFold && <TableCell align="right">{pocket.avgAlphaFold}</TableCell>}
                </TableRow>
                <TableRow style={{ background: "linear-gradient(0deg, rgba(204,204,204,1) 0%, rgba(255,255,255,1) 50%" }}>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={this.props.headCellsLength + 1}>
                        <Collapse in={this.state.open} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 1 }}>
                                <DataTableRowDetails pocket={pocket} setTab={this.props.setTab} predictionInfo={this.props.predictionInfo} />
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow>
            </React.Fragment >
        );
    }
}
