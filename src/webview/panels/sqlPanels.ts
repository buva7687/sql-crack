import type { FlowEdge } from '../types';
import { UI_COLORS } from '../constants';

export interface SqlPreviewPanelOptions {
    panel: HTMLDivElement | null;
    currentSql: string;
    isDarkTheme: boolean;
    formatSql: (sql: string) => string;
    highlightSql: (sql: string) => string;
    onToggleVisible: (show: boolean) => void;
}

export function toggleSqlPreviewPanel(options: SqlPreviewPanelOptions, show?: boolean): void {
    const { panel } = options;
    if (!panel) {
        return;
    }
    const isHidden = panel.style.visibility === 'hidden' || panel.style.opacity === '0';
    const shouldShow = show ?? isHidden;

    if (shouldShow) {
        updateSqlPreviewPanelContent(options);
        panel.style.opacity = '1';
        panel.style.visibility = 'visible';
        panel.style.transform = 'translateY(0)';
        return;
    }

    panel.style.opacity = '0';
    panel.style.visibility = 'hidden';
    panel.style.transform = 'translateY(16px)';
}

export function updateSqlPreviewPanelContent(options: SqlPreviewPanelOptions): void {
    const { panel, currentSql, isDarkTheme, formatSql, highlightSql, onToggleVisible } = options;
    if (!panel || !currentSql) {
        return;
    }

    const formattedSql = formatSql(currentSql);
    const highlightedSql = highlightSql(formattedSql);
    const sqlHeaderColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;
    const sqlBodyColor = isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight;
    const sqlCopyButtonBg = isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.12)';
    const sqlCopyButtonBorder = isDarkTheme ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.22)';
    const sqlCopyButtonText = isDarkTheme ? UI_COLORS.focusText : UI_COLORS.focusTextLight;
    const sqlCloseButtonText = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightMuted;

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: ${sqlHeaderColor}; font-size: 12px;">SQL Query</span>
            <div style="display: flex; gap: 8px;">
                <button id="copy-sql" style="
                    background: ${sqlCopyButtonBg};
                    border: 1px solid ${sqlCopyButtonBorder};
                    border-radius: 4px;
                    color: ${sqlCopyButtonText};
                    padding: 4px 10px;
                    font-size: 10px;
                    cursor: pointer;
                ">Copy</button>
                <button id="close-sql-preview" style="
                    background: none;
                    border: none;
                    color: ${sqlCloseButtonText};
                    cursor: pointer;
                    font-size: 16px;
                ">&times;</button>
            </div>
        </div>
        <pre style="
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
            max-height: 150px;
            overflow-y: auto;
            color: ${sqlBodyColor};
        ">${highlightedSql}</pre>
    `;

    panel.querySelector('#copy-sql')?.addEventListener('click', () => {
        navigator.clipboard.writeText(formattedSql).then(() => {
            const btn = panel.querySelector('#copy-sql');
            if (!btn) {
                return;
            }
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy';
            }, 1500);
        });
    });

    panel.querySelector('#close-sql-preview')?.addEventListener('click', () => {
        onToggleVisible(false);
    });
}

interface SqlClausePanelColorOptions {
    panelBg: string;
    panelBorder: string;
    panelShadow: string;
    mutedText: string;
    headingText: string;
    clauseBg: string;
    clauseBorder: string;
    clauseText: string;
    monoFontStack: string;
}

export interface SqlClausePanelOptions {
    edge: FlowEdge;
    containerElement: HTMLElement | null;
    isDarkTheme: boolean;
    zIndex: number;
    pinIcon: string;
    escapeHtml: (value: string) => string;
    getClauseTypeColor: (clauseType: string) => string;
    monoFontStack: string;
}

function getClausePanelColors(isDarkTheme: boolean, monoFontStack: string): SqlClausePanelColorOptions {
    return {
        panelBg: isDarkTheme ? UI_COLORS.backgroundPanelSolid : UI_COLORS.backgroundPanelLightSolid,
        panelBorder: isDarkTheme ? UI_COLORS.borderMedium : 'rgba(15, 23, 42, 0.14)',
        panelShadow: isDarkTheme ? UI_COLORS.shadowMedium : '0 8px 24px rgba(15, 23, 42, 0.12)',
        mutedText: isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted,
        headingText: isDarkTheme ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle,
        clauseBg: isDarkTheme ? UI_COLORS.backgroundSubtleDark : 'rgba(15, 23, 42, 0.04)',
        clauseBorder: isDarkTheme ? UI_COLORS.border : 'rgba(15, 23, 42, 0.1)',
        clauseText: isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight,
        monoFontStack,
    };
}

export function showSqlClausePanelContent(options: SqlClausePanelOptions): void {
    const { edge, containerElement, isDarkTheme, zIndex, pinIcon, escapeHtml, getClauseTypeColor, monoFontStack } = options;
    let clausePanel = document.getElementById('sql-clause-panel') as HTMLDivElement | null;
    const colors = getClausePanelColors(isDarkTheme, monoFontStack);

    if (!clausePanel) {
        clausePanel = document.createElement('div');
        clausePanel.id = 'sql-clause-panel';
        containerElement?.appendChild(clausePanel);
    }

    clausePanel.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors.panelBg};
        border: 1px solid ${colors.panelBorder};
        border-radius: 12px;
        padding: 16px 20px;
        max-width: 600px;
        z-index: ${zIndex};
        box-shadow: ${colors.panelShadow};
        font-family: ${colors.monoFontStack};
    `;

    const clauseType = edge.clauseType || 'flow';
    const clauseTypeLabel = clauseType.toUpperCase();
    const clauseColor = getClauseTypeColor(clauseType);

    clausePanel.innerHTML = `
        <button style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: ${colors.mutedText};
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        " class="clause-panel-close-btn">✕</button>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="
                background: ${clauseColor};
                color: white;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.5px;
            ">${clauseTypeLabel}</div>
            <div style="color: ${colors.headingText}; font-size: 13px; font-weight: 600;">
                ${escapeHtml(edge.label || 'Data Flow')}
            </div>
        </div>
        <div style="
            background: ${colors.clauseBg};
            border: 1px solid ${colors.clauseBorder};
            border-radius: 8px;
            padding: 12px;
            color: ${colors.clauseText};
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        ">${escapeHtml(edge.sqlClause || 'No SQL clause information available')}</div>
        ${edge.startLine ? `
            <div style="color: ${colors.mutedText}; font-size: 11px; margin-top: 8px;">
                <span style="display: inline-flex; width: 12px; height: 12px; vertical-align: text-bottom;">${pinIcon}</span>
                Line ${edge.startLine}${edge.endLine && edge.endLine !== edge.startLine ? `-${edge.endLine}` : ''}
            </div>
        ` : ''}
    `;

    clausePanel.querySelector<HTMLButtonElement>('.clause-panel-close-btn')?.addEventListener('click', () => {
        clausePanel!.style.display = 'none';
    });

    clausePanel.style.display = 'block';
}
