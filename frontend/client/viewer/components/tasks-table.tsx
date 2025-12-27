import React from "react";
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import { visuallyHidden } from '@mui/utils';
import { useInterval } from "./tools";

import "bootstrap-icons/font/bootstrap-icons.css";
import { PocketData, ServerTaskTypeVisualizationDescriptors } from "../../custom-types";
import { ClientTaskLocalStorageData, ServerTaskLocalStorageData, ServerTaskTypeDescriptors, ClientTaskTypeDescriptors, ClientTaskType, ServerTaskType, getLocalStorageKey } from "../../custom-types";
import { dockingHash, downloadDockingResult, pollForDockingTask } from "../../tasks/server-docking-task";
import { tunnelsHash } from "../../tasks/server-mole-tunnels";
import { downloadTunnelsResult, pollForTunnelsTask } from "../../tasks/server-mole-tunnels";
import { Order, getComparator, isInstanceOfClientTaskLocalStorageData, isInstanceOfServerTaskLocalStorageData } from "./tools";
import { PredictionInfo } from "../../prankweb-api";
import ConfirmDialog from "./confirm-dialog";

interface HeadCell {
    id: keyof ClientTaskLocalStorageData | keyof ServerTaskLocalStorageData | null;
    label: string;
    tooltip: string;
}

const headCells: HeadCell[] = [
    {
        id: 'type',
        label: 'Type',
        tooltip: 'Task type'
    },
    {
        id: 'name',
        label: 'Name',
        tooltip: 'Task name provided by the user'
    },
    {
        id: 'created',
        label: 'Timestamp',
        tooltip: 'Task creation timestamp'
    },
    {
        id: null,
        label: 'Status/result',
        tooltip: 'Task status or result'
    },
    {
        id: null,
        label: '',
        tooltip: 'Delete task from the list'
    }
    //more are added dynamically, if needed
];

interface EnhancedTableProps {
    onRequestSort: (event: React.MouseEvent<unknown>, property: keyof ClientTaskLocalStorageData | keyof ServerTaskLocalStorageData) => void;
    order: Order;
    orderBy: string;
}

function EnhancedTableHead(props: EnhancedTableProps) {
    const { order, orderBy, onRequestSort } =
        props;
    const createSortHandler =
        (property: keyof ClientTaskLocalStorageData | keyof ServerTaskLocalStorageData | null) => (event: React.MouseEvent<unknown>) => {
            if (property === null) return;
            onRequestSort(event, property);
        };

    return (
        <TableHead>
            <TableRow>
                {headCells.map((headCell, i) => (
                    <TableCell
                        key={i + "_head"}
                        align={'center'}
                        padding={'none'}
                        sortDirection={orderBy === headCell.id ? order : false}
                    >
                        <TableSortLabel
                            active={orderBy === headCell.id}
                            direction={orderBy === headCell.id ? order : 'asc'}
                            onClick={createSortHandler(headCell.id)}
                        >
                            {headCell.tooltip === "" ?
                                <span>{headCell.label}</span> :
                                <Tooltip title={headCell.tooltip} placement="top">
                                    <span>{headCell.label}</span>
                                </Tooltip>
                            }
                            {orderBy === headCell.id ? (
                                <Box component="span" sx={visuallyHidden}>
                                    {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                </Box>
                            ) : null}
                        </TableSortLabel>
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
}

export function TasksTable(props: { pocket: PocketData | null, predictionInfo: PredictionInfo; }) {

    const localStorageServerKey = getLocalStorageKey(props.predictionInfo, "serverTasks");
    const localStorageClientKey = getLocalStorageKey(props.predictionInfo, "clientTasks");

    let serverTasks = localStorage.getItem(localStorageServerKey);
    if (!serverTasks) serverTasks = "[]";
    let serverTasksParsed: ServerTaskLocalStorageData[] = JSON.parse(serverTasks);
    if (props.pocket !== null) serverTasksParsed = serverTasksParsed.filter((task: ServerTaskLocalStorageData) => task.pocket === Number(props.pocket!.rank));

    let clientTasks = localStorage.getItem(localStorageClientKey);
    if (!clientTasks) clientTasks = "[]";
    let clientTasksParsed: ClientTaskLocalStorageData[] = JSON.parse(clientTasks);
    if (props.pocket !== null) clientTasksParsed = clientTasksParsed.filter((task: ClientTaskLocalStorageData) => task.pocket === Number(props.pocket!.rank));

    const handleResultClick = (serverTask: ServerTaskLocalStorageData) => {
        switch (serverTask.type) {
            case ServerTaskType.Docking:
                downloadDockingResult(serverTask.responseData[0].url);
                break;
            case ServerTaskType.Tunnels:
                downloadTunnelsResult(serverTask.responseData[0].url);
                break;
            default:
                break;
        }
    };

    if (props.pocket === null) {
        if (headCells.find((headCell: HeadCell) => headCell.id === 'pocket') === undefined) {
            headCells.unshift({
                id: 'pocket',
                label: 'Pocket',
                tooltip: 'Pocket number'
            });
        }
    }
    else if (headCells.find((headCell: HeadCell) => headCell.id === 'pocket') !== undefined) {
        headCells.shift();
    }

    const [order, setOrder] = React.useState<Order>('asc');
    const [orderBy, setOrderBy] = React.useState<keyof ClientTaskLocalStorageData | keyof ServerTaskLocalStorageData>('name');
    const [numRenders, setRender] = React.useState<number>(0);

    const [openConfirmDialogServerTasks, setOpenConfirmDialogServerTasks] = React.useState<boolean>(false);
    const [serverTaskToDelete, setServerTaskToDelete] = React.useState<ServerTaskLocalStorageData | null>(null);

    const handleRequestSort = (
        event: React.MouseEvent<unknown>,
        property: keyof ClientTaskLocalStorageData | keyof ServerTaskLocalStorageData,
    ) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const allTasks = [...clientTasksParsed, ...serverTasksParsed];

    const visibleRows = React.useMemo(
        () => allTasks.slice().sort(getComparator(order, orderBy)),
        [order, orderBy, clientTasksParsed, serverTasksParsed],
    );


    // start polling for server tasks
    const pollServerTasks = async () => {
        const tasksChanged = await pollForDockingTask(props.predictionInfo);
        if (serverTasks !== tasksChanged) {
            setRender(numRenders + 1);
        }

        const tasksChanged2 = await pollForTunnelsTask(props.predictionInfo);
        if (serverTasks !== tasksChanged2) {
            setRender(numRenders + 1);
        }
    };
    useInterval(pollServerTasks, 1000 * 7);

    const removeClientTaskFromLocalStorage = (task: ClientTaskLocalStorageData) => () => {
        const clientTasksParsed: ClientTaskLocalStorageData[] = JSON.parse(localStorage.getItem(localStorageClientKey) || "[]");
        const newClientTasks = clientTasksParsed.filter((t: ClientTaskLocalStorageData) => t.created !== task.created);
        localStorage.setItem(localStorageClientKey, JSON.stringify(newClientTasks));
        setRender(numRenders + 1);
    };

    const removeServerTaskFromLocalStorage = (task: ServerTaskLocalStorageData) => () => {
        const serverTasksParsed: ServerTaskLocalStorageData[] = JSON.parse(localStorage.getItem(localStorageServerKey) || "[]");
        const newServerTasks = serverTasksParsed.filter((t: ServerTaskLocalStorageData) => t.created !== task.created);
        localStorage.setItem(localStorageServerKey, JSON.stringify(newServerTasks));
        setRender(numRenders + 1);
    };

    const makeDateMoreReadable = (date: string) => {
        // expected format: "2023-10-07T14:00:00.000Z"
        date = date.replace("T", " ");
        // remove .000Z
        return date.slice(0, -5);
    };

    const redirectToDockingVisualization = async (task: ServerTaskLocalStorageData) => {
        const hash = await dockingHash(task.pocket.toString(), task.params[0], task.params[1]);
        window.open(`./visualize?type=${ServerTaskTypeVisualizationDescriptors[task.type]}&id=${props.predictionInfo.id}&database=${props.predictionInfo.database}&hash=${hash}&structureName=${props.predictionInfo.metadata.structureName}`, "_blank")?.focus();
    };

    const redirectToTunnelsVisualization = async (task: ServerTaskLocalStorageData) => {
        const hash = await tunnelsHash(task.pocket.toString());
        window.open(`./visualize?type=${ServerTaskTypeVisualizationDescriptors[task.type]}&id=${props.predictionInfo.id}&database=${props.predictionInfo.database}&hash=${hash}&structureName=${props.predictionInfo.metadata.structureName}`, "_blank")?.focus();
    };

    const handleServerTaskDeleteRequest = (task: ServerTaskLocalStorageData) => {
        if (task === null) return;
        setServerTaskToDelete(task);
        setOpenConfirmDialogServerTasks(true);
    };

    const handleFailedTaskClick = async (task: ServerTaskLocalStorageData) => {
        if (task.type === ServerTaskType.Docking) {
            const hash = await dockingHash(task.pocket.toString(), task.params[0], task.params[1]);
            const logUrl = `./api/v2/docking/${props.predictionInfo.database}/${props.predictionInfo.id}/${hash}/log`;
            window.open(logUrl, "_blank");
        } else if (task.type === ServerTaskType.Tunnels) {
            const hash = await tunnelsHash(task.pocket.toString());
            const logUrl = `./api/v2/tunnels/${props.predictionInfo.database}/${props.predictionInfo.id}/${hash}/log`;
            window.open(logUrl, "_blank");
        }
    };

    const isUrl = (url: any) => { return typeof url === 'string' && (url.startsWith("http://") || url.startsWith("https://")); };

    const renderTaskStatus = (task: ServerTaskLocalStorageData) => {
        const linkStyle = { textDecoration: "underline", cursor: "pointer" };
        
        switch (task.status) {
            case "successful":
                return <span onClick={() => handleResultClick(task)} style={{ color: "blue", ...linkStyle }}>successful</span>;
            case "failed":
                return <span onClick={() => handleFailedTaskClick(task)} style={{ color: "red", ...linkStyle }}>failed (view log)</span>;
            default:
                return task.status;
        }
    };

    return (
        <>
            {openConfirmDialogServerTasks && <ConfirmDialog setOpenDialog={setOpenConfirmDialogServerTasks} callback={removeServerTaskFromLocalStorage(serverTaskToDelete!)} task={serverTaskToDelete!} />}
            <Table size="small">
                <EnhancedTableHead
                    order={order}
                    orderBy={orderBy}
                    onRequestSort={handleRequestSort}
                />
                <TableBody>
                    {visibleRows.map((task: ClientTaskLocalStorageData | ServerTaskLocalStorageData, i: number) => {
                        if (isInstanceOfClientTaskLocalStorageData(task)) {
                            return (
                                <TableRow key={i + "_client"}>
                                    {props.pocket === null && <TableCell>{task.pocket}</TableCell>}
                                    <TableCell>{ClientTaskTypeDescriptors[task.type]}</TableCell>
                                    <TableCell>{"-"}</TableCell>
                                    <TableCell>{makeDateMoreReadable(task.created)}</TableCell>
                                    <TableCell>
                                        {isUrl(task.data) ? <a href={task.data} target="_blank" rel="noreferrer" style={{ "color": "blue" }}>successful</a> :
                                            (!isNaN(task.data)) ? task.data.toFixed(1) : task.data}
                                        {task.type === ClientTaskType.Volume && " Å³"}
                                    </TableCell>
                                    <TableCell>
                                        <button type="button" title="Delete task" className="btn btn-outline-secondary btnIcon" style={{ "padding": "0.25rem" }} onClick={removeClientTaskFromLocalStorage(task)}>
                                            <i className="bi bi-trash" style={{ "display": "block", "fontSize": "small" }}></i>
                                        </button>
                                    </TableCell>
                                </TableRow>
                            );
                        }

                        if (isInstanceOfServerTaskLocalStorageData(task)) {
                            return (
                                <TableRow key={i + "_server"}>
                                    {props.pocket === null && <TableCell>{task.pocket}</TableCell>}
                                    <TableCell>{ServerTaskTypeDescriptors[task.type]}</TableCell>
                                    <TableCell>{task.name}</TableCell>
                                    <TableCell>{makeDateMoreReadable(task.created)}</TableCell>
                                    <TableCell>{renderTaskStatus(task)}</TableCell>
                                    <TableCell>
                                        <button type="button" className="btn btn-outline-secondary btnIcon" title="Delete task" style={{ "padding": "0.25rem" }} onClick={() => handleServerTaskDeleteRequest(task)}>
                                            <i className="bi bi-trash" style={{ "display": "block", "fontSize": "small" }}></i>
                                        </button>
                                        &nbsp;
                                        {task.status === "successful" && task.type === ServerTaskType.Docking &&
                                            <button type="button" className="btn btn-outline-secondary btnIcon" title="Visualize task result" style={{ "padding": "0.25rem" }} onClick={() => redirectToDockingVisualization(task)}>
                                                <i className="bi bi-eye" style={{ "display": "block", "fontSize": "small" }}></i>
                                            </button>
                                        }
                                        {task.status === "successful" && task.type === ServerTaskType.Tunnels &&
                                            <button type="button" className="btn btn-outline-secondary btnIcon" title="Visualize task result" style={{ "padding": "0.25rem" }} onClick={() => redirectToTunnelsVisualization(task)}>
                                                <i className="bi bi-eye" style={{ "display": "block", "fontSize": "small" }}></i>
                                            </button>
                                        }
                                    </TableCell>
                                </TableRow>
                            );
                        }
                    })
                    }
                </TableBody>
            </Table>
        </>
    );
};