// Barrel re-export for typed message protocols

export type {
    SqlFlowWebviewMessage,
    SqlFlowHostMessage,
    PinnedVisualizationInfo,
} from './sqlFlowMessages';

export type {
    WorkspaceWebviewMessage,
    WorkspaceHostMessage,
    LineageNodeResult,
    ImpactEntry,
    ImpactReportResult,
    SearchResultEntry,
} from './workspaceMessages';
