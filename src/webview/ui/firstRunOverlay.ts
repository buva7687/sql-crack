// First Run Overlay — Semi-transparent onboarding overlay
// Shows on first visualization open with callout hotspots

export interface FirstRunOverlayCallbacks {
    isDarkTheme: () => boolean;
    onDismiss: () => void;
}

/**
 * Show the first-run onboarding overlay.
 * Displays key callouts to help new users get oriented.
 */
export function showFirstRunOverlay(
    container: HTMLElement,
    callbacks: FirstRunOverlayCallbacks
): void {
    const isDark = callbacks.isDarkTheme();

    const overlay = document.createElement('div');
    overlay.id = 'sql-crack-first-run-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Welcome to SQL Crack');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
    `;

    const card = document.createElement('div');
    card.style.cssText = `
        max-width: 420px;
        width: 90%;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.5' : '0.2'});
        background: ${isDark ? '#1A1A1A' : '#FFFFFF'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const textColor = isDark ? '#F1F5F9' : '#1E293B';
    const mutedColor = isDark ? '#94A3B8' : '#64748B';
    const accentColor = isDark ? '#818CF8' : '#6366F1';
    const accentBg = isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)';

    const tips = [
        { icon: '\u2328', title: 'Keyboard shortcuts', desc: 'Press ? to see all shortcuts. Use 1-5 for quick layouts.' },
        { icon: '\u2502', title: 'Column lineage', desc: 'Press C to trace how columns flow through your query.' },
        { icon: '\u2318P', title: 'Command palette', desc: 'Ctrl+Shift+P opens the command palette for quick actions.' },
        { icon: 'L', title: 'Legend bar', desc: 'Press L to toggle the color legend at the bottom.' },
    ];

    card.innerHTML = `
        <div style="padding: 24px 24px 16px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">\u26A1</div>
            <h2 style="margin: 0 0 4px; font-size: 18px; font-weight: 600; color: ${textColor};">
                Welcome to SQL Crack
            </h2>
            <p style="margin: 0; font-size: 13px; color: ${mutedColor};">
                Your SQL query is now visualized. Here are a few tips to get started:
            </p>
        </div>
        <div style="padding: 0 24px 16px;">
            ${tips.map(tip => `
                <div style="
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 10px 0;
                    border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
                ">
                    <div style="
                        min-width: 32px;
                        height: 32px;
                        border-radius: 6px;
                        background: ${accentBg};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        font-weight: 600;
                        color: ${accentColor};
                        font-family: monospace;
                    ">${tip.icon}</div>
                    <div>
                        <div style="font-size: 13px; font-weight: 500; color: ${textColor};">${tip.title}</div>
                        <div style="font-size: 12px; color: ${mutedColor}; margin-top: 2px;">${tip.desc}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div style="padding: 12px 24px 20px; text-align: center;">
            <button id="first-run-dismiss" style="
                background: ${accentColor};
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 24px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: opacity 0.15s;
            ">Got it</button>
        </div>
    `;

    overlay.appendChild(card);
    container.appendChild(overlay);

    const dismiss = () => {
        overlay.remove();
        callbacks.onDismiss();
    };

    // Dismiss on button click
    const dismissBtn = card.querySelector('#first-run-dismiss') as HTMLButtonElement;
    if (dismissBtn) {
        dismissBtn.addEventListener('click', dismiss);
        dismissBtn.addEventListener('mouseenter', () => { dismissBtn.style.opacity = '0.9'; });
        dismissBtn.addEventListener('mouseleave', () => { dismissBtn.style.opacity = '1'; });
    }

    // Dismiss on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { dismiss(); }
    });

    // Dismiss on Escape
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            document.removeEventListener('keydown', escHandler);
            dismiss();
        }
    };
    document.addEventListener('keydown', escHandler);

    // Auto-focus the dismiss button
    requestAnimationFrame(() => { dismissBtn?.focus(); });
}
