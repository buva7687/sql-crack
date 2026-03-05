import type { ColorblindMode } from '../theme';

export type ViewLocation = 'beside' | 'tab';

export interface SqlFlowRuntimeConfig {
    vscodeTheme: 'light' | 'dark';
    isHighContrast: boolean;
    defaultDialect: string;
    autoDetectDialect: boolean;
    viewLocation: ViewLocation;
    defaultLayout: string;
    flowDirection: string;
    showDeadColumnHints: boolean;
    combineDdlStatements: boolean;
    gridStyle: string;
    nodeAccentPosition: string;
    showMinimap: string;
    colorblindMode: ColorblindMode;
    maxFileSizeKB: number;
    maxStatements: number;
    deferredQueryThreshold: number;
    parseTimeoutSeconds: number;
    debugLogging: boolean;
}
