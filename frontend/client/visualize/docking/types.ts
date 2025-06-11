export interface DockingTaskProps {
    ligandPDBQT: string;
    database: string;
    id: string;
    hash: string;
    structureName: string;
    dockingConfigurationURL: string;
}

export type Hetatm = {
    id: number;
    element: string;
    x: number;
    y: number;
    z: number;
};

export type Branch = {
    start: number;
    end: number;
};

export type Model = {
    number: number;
    vinaResult: number[];
    root: Hetatm[];
    branches: Branch[];
    torsdof: number;
    originalContent: string;
};
