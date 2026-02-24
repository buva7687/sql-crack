// Typed message protocol for SQL Flow webview panel
// Discriminated unions on the `command` field for compile-time safety.

import type { ViewLocation } from '../../visualizationPanel';

// ─── Pinned visualization (mirrors the private interface in visualizationPanel.ts) ───

export interface PinnedVisualizationInfo {
    id: string;
    name: string;
    sql: string;
    dialect: string;
    timestamp: number;
}

// ─── Webview → Host messages ───

export type SqlFlowWebviewMessage =
    | { command: 'error'; text: string }
    | { command: 'info'; text: string }
    | { command: 'requestRefresh' }
    | { command: 'persistUiState'; state: unknown }
    | { command: 'goToLine'; line: number }
    | { command: 'requestFullscreen'; enable: boolean }
    | { command: 'pinVisualization'; sql?: string; dialect?: string; name?: string }
    | { command: 'changeViewLocation'; location: ViewLocation }
    | { command: 'getViewLocationOptions' }
    | { command: 'openPinnedTab'; pinId: string }
    | { command: 'unpinTab'; pinId: string }
    | { command: 'savePng'; data: string; filename: string };

// ─── Host → Webview messages ───

export type SqlFlowHostMessage =
    | { command: 'refresh'; sql: string; options: { dialect: string; fileName: string } }
    | { command: 'cursorPosition'; line: number }
    | { command: 'switchToQuery'; queryIndex: number }
    | { command: 'markStale' }
    | { command: 'setEditorActivity'; isSqlLikeActiveEditor: boolean }
    | { command: 'viewLocationOptions'; currentLocation: ViewLocation; pinnedTabs: PinnedVisualizationInfo[] }
    | { command: 'pinCreated'; pinId: string };
