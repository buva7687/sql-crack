import { getStateStyles } from '../ui/sharedStyles';
import { escapeHtmlText } from './text';

export interface StatePageBaseOptions {
    isDarkTheme: boolean;
    nonce: string;
}

export interface ManualIndexPageOptions extends StatePageBaseOptions {
    fileCount: number;
}

export interface ErrorPageOptions extends StatePageBaseOptions {
    message: string;
    detail?: string;
    statusLine: string;
}

export function createLoadingHtml(options: StatePageBaseOptions): string {
    const styles = getStateStyles(options.isDarkTheme);
    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
    <style>${styles}</style>
</head>
<body>
    <div class="loader-container">
        <div class="loader"></div>
        <div class="loader-title">Analyzing Workspace</div>
        <div class="loader-subtitle">Scanning SQL files...</div>
    </div>
</body>
</html>`;
}

export function createManualIndexHtml(options: ManualIndexPageOptions): string {
    const styles = getStateStyles(options.isDarkTheme);
    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
        </div>
        <div class="file-count">${options.fileCount}</div>
        <div class="title">SQL Files Found</div>
        <div class="subtitle">Large workspace detected. This may take a moment to analyze all dependencies.</div>
        <button class="btn" id="manual-refresh-btn">
            Start Analysis
        </button>
    </div>
    <script nonce="${options.nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('manual-refresh-btn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });
    </script>
</body>
</html>`;
}

export function createEmptyWorkspaceHtml(options: StatePageBaseOptions): string {
    const styles = getStateStyles(options.isDarkTheme);
    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M12 18v-6M9 15h6"/>
            </svg>
        </div>
        <div class="title">No SQL Files Found</div>
        <div class="subtitle">No <code>.sql</code> files were found in the scanned folder. If your SQL files use a different extension, add it via <code>sqlCrack.additionalFileExtensions</code> in Settings.</div>
        <button class="btn" id="empty-refresh-btn">
            Refresh
        </button>
    </div>
    <script nonce="${options.nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('empty-refresh-btn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });
    </script>
</body>
</html>`;
}

export function createErrorHtml(options: ErrorPageOptions): string {
    const styles = getStateStyles(options.isDarkTheme);
    const safeMessage = escapeHtmlText(options.message);
    const safeDetail = options.detail ? escapeHtmlText(options.detail) : '';
    const safeStatusLine = escapeHtmlText(options.statusLine);

    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        </div>
        <div class="title error">Something went wrong</div>
        <div class="message">${safeMessage}</div>
        ${safeDetail ? `<div class="message" style="opacity: 0.7; font-size: 0.9em; margin-top: 4px;">${safeDetail}</div>` : ''}
        <div class="message" style="opacity: 0.5; font-size: 0.8em; margin-top: 8px;">${safeStatusLine}</div>
        <button class="btn secondary" id="error-refresh-btn">
            Refresh Index
        </button>
    </div>
    <script nonce="${options.nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('error-refresh-btn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });
    </script>
</body>
</html>`;
}
