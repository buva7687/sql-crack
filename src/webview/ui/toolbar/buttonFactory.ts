export interface CreateToolbarButtonOptions {
    label: string;
    onClick: () => void;
    getBtnStyle: (dark: boolean) => string;
    listenerOptions?: AddEventListenerOptions;
    ariaLabel?: string;
    isDark?: boolean;
}

export function createToolbarButton(options: CreateToolbarButtonOptions): HTMLButtonElement {
    const {
        label,
        onClick,
        getBtnStyle,
        listenerOptions,
        ariaLabel,
        isDark = true,
    } = options;

    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.style.cssText = getBtnStyle(isDark);
    btn.addEventListener('click', onClick, listenerOptions);
    btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(148, 163, 184, 0.1)';
    }, listenerOptions);
    btn.addEventListener('mouseleave', () => {
        if (!btn.style.background.includes('102, 241')) {
            btn.style.background = 'transparent';
        }
    }, listenerOptions);

    if (ariaLabel) {
        btn.setAttribute('aria-label', ariaLabel);
    }
    btn.setAttribute('role', 'button');
    return btn;
}
