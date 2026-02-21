import type { FlowNode, Severity } from '../types';
import { EDGE_DASH_PATTERNS } from '../constants/colors';

export interface ApplyColorblindModeOptions {
    getEdgeDashPattern: (clauseType?: string) => string | null;
    getNodeColor: (nodeType: FlowNode['type']) => string;
    getNodeVisualIcon: (node: FlowNode) => string;
    getSeverityIcon: (severity: Severity) => string;
    getWarningColor: (severity: string) => string;
    getWarningIndicatorState: (warnings: FlowNode['warnings']) => { severity: Severity } | null;
    mainGroup: SVGGElement | null;
    nodes: FlowNode[];
}

export function applyColorblindModeToRenderedGraph(options: ApplyColorblindModeOptions): void {
    const {
        getEdgeDashPattern,
        getNodeColor,
        getNodeVisualIcon,
        getSeverityIcon,
        getWarningColor,
        getWarningIndicatorState,
        mainGroup,
        nodes,
    } = options;

    if (!mainGroup) {
        return;
    }

    const allNodeGroups = mainGroup.querySelectorAll('.node');
    allNodeGroups.forEach(group => {
        const nodeId = group.getAttribute('data-id');
        if (!nodeId) {
            return;
        }
        const node = nodes.find(candidate => candidate.id === nodeId);
        if (!node) {
            return;
        }

        const accent = group.querySelector('.node-accent') as SVGRectElement | null;
        if (accent) {
            accent.setAttribute('fill', getNodeColor(node.type));
        }

        const nodeIcon = group.querySelector('.node-main-icon') as SVGTextElement | null;
        if (nodeIcon) {
            nodeIcon.textContent = getNodeVisualIcon(node);
        }

        const warningIndicator = getWarningIndicatorState(node.warnings);
        const warningTriangle = group.querySelector('.node-warning-triangle') as SVGPathElement | null;
        if (warningTriangle && warningIndicator) {
            warningTriangle.setAttribute('fill', getWarningColor(warningIndicator.severity));
        }

        const warningIcon = group.querySelector('.node-warning-icon') as SVGTextElement | null;
        if (warningIcon && warningIndicator) {
            warningIcon.textContent = getSeverityIcon(warningIndicator.severity);
        }
    });

    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edge => {
        const clauseType = edge.getAttribute('data-clause-type') || undefined;
        // SQ edges always keep their dash pattern regardless of colorblind mode
        if (clauseType === 'subquery_flow') {
            edge.setAttribute('stroke-dasharray', EDGE_DASH_PATTERNS.subquery_flow!);
            return;
        }
        const dashPattern = getEdgeDashPattern(clauseType || undefined);
        if (dashPattern) {
            edge.setAttribute('stroke-dasharray', dashPattern);
        } else {
            edge.removeAttribute('stroke-dasharray');
        }
    });
}
