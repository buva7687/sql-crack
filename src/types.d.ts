declare module 'process/browser' {
    const process: NodeJS.Process;
    export default process;
}

declare module 'dagre' {
    export const graphlib: {
        Graph: new () => Graph;
    };

    export interface Graph {
        setGraph(config: GraphConfig): void;
        setDefaultEdgeLabel(fn: () => object): void;
        setNode(id: string, config: NodeConfig): void;
        setEdge(source: string, target: string): void;
        node(id: string): NodeConfig | undefined;
    }

    export interface GraphConfig {
        rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
        nodesep?: number;
        ranksep?: number;
        marginx?: number;
        marginy?: number;
    }

    export interface NodeConfig {
        width: number;
        height: number;
        x?: number;
        y?: number;
    }

    export function layout(graph: Graph): void;
}
