// UI Module - Exports all UI components

// Types
export type {
    ViewMode,
    TableExplorerData,
    LineageViewOptions,
    ImpactViewData,
    UIAction,
    UIState
} from './types';

// Classes
export { TableExplorer } from './tableExplorer';
export { LineageView } from './lineageView';
export { ImpactView } from './impactView';

// Graph View
export {
    generateGraphBody,
    getGraphViewHtml,
    GraphBodyParams
} from './graphView';

// Styles
export {
    getCssVariables,
    getBaseStyles,
    getContextMenuStyles,
    getLineagePanelStyles,
    getTableListStyles,
    getImpactFormStyles,
    getLineageVisualStyles,
    getLineageGraphStyles,
    getLineageNodeStyles,
    getGraphStyles,
    getIssuesPanelStyles,
    getStateStyles,
    getWebviewStyles,
    getIssuesStyles
} from './sharedStyles';

// Scripts
export type { WebviewScriptParams } from './clientScripts';
export {
    getWebviewScript,
    getIssuesScript,
    getMinimalScript
} from './clientScripts';
