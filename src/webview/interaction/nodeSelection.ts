import { EDGE_COLORS, UI_COLORS } from '../constants';
import { FlowNode, ViewState } from '../types';
import { escapeRegex } from '../../shared';

/** Recursively search for a node by ID, including inside children of cloud/CTE nodes. */
function findNodeById(nodes: FlowNode[], nodeId: string): FlowNode | undefined {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        if (node.children && node.children.length > 0) {
            const found = findNodeById(node.children, nodeId);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

export interface SelectNodeFeatureOptions {
    nodeId: string | null;
    skipNavigation?: boolean;
    state: ViewState;
    mainGroup: SVGGElement | null;
    currentNodes: FlowNode[];
    currentSql: string;
    highlightConnectedEdges: (nodeId: string, highlight: boolean) => void;
    onUpdateDetailsPanel: (nodeId: string | null) => void;
    onUpdateBreadcrumb: (nodeId: string | null) => void;
}

export function selectNodeFeature(options: SelectNodeFeatureOptions): void {
    const {
        nodeId,
        skipNavigation,
        state,
        mainGroup,
        currentNodes,
        currentSql,
        highlightConnectedEdges,
        onUpdateDetailsPanel,
        onUpdateBreadcrumb,
    } = options;

    state.selectedNodeId = nodeId;

    const nodeGroups = mainGroup?.querySelectorAll('.node');
    nodeGroups?.forEach(group => {
        const rect = group.querySelector('.node-rect');
        const id = group.getAttribute('data-id');
        if (!rect || !id) {
            return;
        }

        if (id === nodeId) {
            rect.setAttribute('stroke', UI_COLORS.white);
            rect.setAttribute('stroke-width', '3');
            rect.setAttribute('filter', 'url(#glow)');
            highlightConnectedEdges(id, true);
            return;
        }

        rect.removeAttribute('stroke');
        rect.removeAttribute('stroke-width');
        rect.setAttribute('filter', 'url(#shadow)');
    });

    if (!nodeId) {
        const edges = mainGroup?.querySelectorAll('.edge');
        edges?.forEach(edge => {
            edge.setAttribute('stroke', EDGE_COLORS.default);
            edge.setAttribute('stroke-width', '2');
            edge.setAttribute('marker-end', 'url(#arrowhead)');
        });
    }

    if (nodeId && !skipNavigation && typeof window !== 'undefined') {
        const node = findNodeById(currentNodes, nodeId);
        if (node) {
            const vscodeApi = (window as { vscodeApi?: { postMessage?: (message: unknown) => void } }).vscodeApi;
            if (vscodeApi?.postMessage) {
                let lineNumber = node.startLine;

                if (!lineNumber && node.type === 'table' && currentSql) {
                    const tableName = node.label.toLowerCase();
                    const escapedTableName = escapeRegex(tableName);
                    const tableRegex = new RegExp(`\\b${escapedTableName}\\b`);
                    const sqlLines = currentSql.split('\n');
                    for (let i = 0; i < sqlLines.length; i++) {
                        if (tableRegex.test(sqlLines[i].toLowerCase())) {
                            lineNumber = i + 1;
                            break;
                        }
                    }
                }

                if (lineNumber) {
                    vscodeApi.postMessage({ command: 'goToLine', line: lineNumber });
                }
            }
        }
    }

    onUpdateDetailsPanel(nodeId);
    onUpdateBreadcrumb(nodeId);
}
