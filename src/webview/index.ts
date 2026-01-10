// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseSql, SqlDialect } from './sqlParser';
import { initRenderer, render, zoomIn, zoomOut, resetView, exportToPng } from './renderer';

declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
    }
}

// Current state
let currentDialect: SqlDialect = 'MySQL';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init(): void {
    const container = document.getElementById('root');
    if (!container) {return;}

    // Setup container styles
    container.style.cssText = `
        width: 100%;
        height: 100vh;
        position: relative;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Initialize SVG renderer
    initRenderer(container);

    // Create toolbar
    createToolbar(container);

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        visualize(sql);
    }
}

function createToolbar(container: HTMLElement): void {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        position: absolute;
        top: 16px;
        left: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Title
    const title = document.createElement('div');
    title.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 16px;
        color: #f1f5f9;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
    `;
    title.innerHTML = `
        <span>SQL Flow</span>
        <select id="dialect-select" style="
            background: #1e293b;
            color: #f1f5f9;
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
            outline: none;
        ">
            <option value="MySQL">MySQL</option>
            <option value="PostgreSQL">PostgreSQL</option>
            <option value="Transact-SQL">SQL Server</option>
            <option value="MariaDB">MariaDB</option>
            <option value="SQLite">SQLite</option>
        </select>
    `;
    toolbar.appendChild(title);

    container.appendChild(toolbar);

    // Action buttons (top right)
    const actions = document.createElement('div');
    actions.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Zoom controls
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const btnStyle = `
        background: transparent;
        border: none;
        color: #f1f5f9;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
    `;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '−';
    zoomOutBtn.style.cssText = btnStyle;
    zoomOutBtn.addEventListener('click', zoomOut);
    zoomOutBtn.addEventListener('mouseenter', () => zoomOutBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    zoomOutBtn.addEventListener('mouseleave', () => zoomOutBtn.style.background = 'transparent');
    zoomGroup.appendChild(zoomOutBtn);

    const fitBtn = document.createElement('button');
    fitBtn.innerHTML = '⊡';
    fitBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2); border-right: 1px solid rgba(148, 163, 184, 0.2);';
    fitBtn.addEventListener('click', resetView);
    fitBtn.addEventListener('mouseenter', () => fitBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    fitBtn.addEventListener('mouseleave', () => fitBtn.style.background = 'transparent');
    zoomGroup.appendChild(fitBtn);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '+';
    zoomInBtn.style.cssText = btnStyle;
    zoomInBtn.addEventListener('click', zoomIn);
    zoomInBtn.addEventListener('mouseenter', () => zoomInBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    zoomInBtn.addEventListener('mouseleave', () => zoomInBtn.style.background = 'transparent');
    zoomGroup.appendChild(zoomInBtn);

    actions.appendChild(zoomGroup);

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '↓ PNG';
    exportBtn.style.cssText = `
        background: rgba(99, 102, 241, 0.9);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: background 0.2s;
    `;
    exportBtn.addEventListener('click', exportToPng);
    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = 'rgba(79, 70, 229, 1)');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = 'rgba(99, 102, 241, 0.9)');
    actions.appendChild(exportBtn);

    container.appendChild(actions);

    // Dialect change handler
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    dialectSelect?.addEventListener('change', (e) => {
        currentDialect = (e.target as HTMLSelectElement).value as SqlDialect;
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualize(sql);
        }
    });
}

function visualize(sql: string): void {
    const result = parseSql(sql, currentDialect);
    render(result);
}
