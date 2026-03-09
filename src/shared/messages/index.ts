// Barrel re-export for typed message protocols

export type {
    SqlFlowWebviewMessage,
    SqlFlowHostMessage,
    PinnedVisualizationInfo,
} from './sqlFlowMessages';

export type {
    ViewLocation,
    SqlFlowRuntimeConfig,
} from './sqlFlowRuntimeConfig';

export type {
    WorkspaceWebviewMessage,
    WorkspaceHostMessage,
    LineageNodeResult,
    ImpactEntry,
    ImpactReportResult,
    SearchResultEntry,
    WorkspaceUxMetricMetadata,
    WorkspaceUxMetricValue,
} from './workspaceMessages';

export type {
    WorkspaceRequestId,
    WorkspaceRecoveryReason,
    WorkspaceErrorPayload,
} from './workspaceViewState';
