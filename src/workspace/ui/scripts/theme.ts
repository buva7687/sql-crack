/**
 * Script fragment: workspace theme toggle button click handler.
 */
export function getThemeToggleScript(): string {
    return `
        document.getElementById('btn-theme')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'toggleTheme' });
        });
    `;
}

/**
 * Script fragment: themeChanged message case for webview hot-swap.
 */
export function getThemeChangedMessageCaseScript(): string {
    return `
                case 'themeChanged':
                    // Hot-swap CSS variables without full page reload to avoid flicker
                    if (message.css) {
                        let themeStyle = document.getElementById('theme-vars');
                        if (!themeStyle) {
                            themeStyle = document.createElement('style');
                            themeStyle.id = 'theme-vars';
                            document.head.appendChild(themeStyle);
                        }
                        themeStyle.textContent = message.css;
                        // Update theme toggle button icon
                        const themeBtn = document.getElementById('btn-theme');
                        if (themeBtn) {
                            const isDark = !!message.isDark;
                            themeBtn.title = 'Toggle theme (' + (isDark ? 'Light' : 'Dark') + ')';
                            themeBtn.setAttribute('aria-label', 'Toggle theme to ' + (isDark ? 'light' : 'dark') + ' mode');
                            themeBtn.innerHTML = isDark
                                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
                                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
                        }
                    }
                    break;
    `;
}
