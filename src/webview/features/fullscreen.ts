export interface FullscreenTheme {
    accent: string;
    border: string;
    text: string;
}

export interface ToggleFullscreenOptions {
    columnLineageBanner: HTMLElement | null;
    currentIsFullscreen: boolean;
    enable?: boolean;
    getTheme: (isDark: boolean) => FullscreenTheme;
    hideIds: readonly string[];
    hideSelectors: readonly string[];
    isDarkTheme: boolean;
    onExitRequested: () => void;
    onRequestFullscreen?: (enable: boolean) => void;
    rootElement: HTMLElement | null;
    svgElement: SVGSVGElement | null;
    zIndex: number;
}

let fullscreenMouseMoveHandler: ((event: MouseEvent) => void) | null = null;
let fullscreenFadeTimeout: ReturnType<typeof setTimeout> | null = null;

export function toggleFullscreen(options: ToggleFullscreenOptions): boolean {
    const {
        columnLineageBanner,
        currentIsFullscreen,
        enable,
        getTheme,
        hideIds,
        hideSelectors,
        isDarkTheme,
        onExitRequested,
        onRequestFullscreen,
        rootElement,
        svgElement,
        zIndex,
    } = options;

    const nextIsFullscreen = enable ?? !currentIsFullscreen;
    const body = document.body;
    const html = document.documentElement;

    if (!rootElement) {
        return currentIsFullscreen;
    }

    const uiElements = [
        ...hideIds.map(id => document.getElementById(id) as HTMLElement),
        ...hideSelectors.map(sel => document.querySelector(sel) as HTMLElement),
        columnLineageBanner as HTMLElement,
        ...Array.from(document.querySelectorAll('[data-fullscreen-hide]')),
    ];

    if (nextIsFullscreen) {
        rootElement.dataset.originalPosition = rootElement.style.position || '';
        rootElement.dataset.originalTop = rootElement.style.top || '';
        rootElement.dataset.originalLeft = rootElement.style.left || '';
        rootElement.dataset.originalWidth = rootElement.style.width || '';
        rootElement.dataset.originalHeight = rootElement.style.height || '';
        rootElement.dataset.originalMargin = rootElement.style.margin || '';
        rootElement.dataset.originalPadding = rootElement.style.padding || '';
        rootElement.dataset.originalOverflow = rootElement.style.overflow || '';
        rootElement.dataset.originalZIndex = rootElement.style.zIndex || '';

        if (svgElement) {
            svgElement.dataset.originalWidth = svgElement.style.width || '';
            svgElement.dataset.originalHeight = svgElement.style.height || '';
            svgElement.dataset.originalPosition = svgElement.style.position || '';
            svgElement.dataset.originalTop = svgElement.style.top || '';
            svgElement.dataset.originalLeft = svgElement.style.left || '';
        }

        body.dataset.originalMargin = body.style.margin || '';
        body.dataset.originalPadding = body.style.padding || '';
        body.dataset.originalOverflow = body.style.overflow || '';
        body.dataset.originalWidth = body.style.width || '';
        body.dataset.originalHeight = body.style.height || '';

        html.dataset.originalMargin = html.style.margin || '';
        html.dataset.originalPadding = html.style.padding || '';
        html.dataset.originalOverflow = html.style.overflow || '';
        html.dataset.originalWidth = html.style.width || '';
        html.dataset.originalHeight = html.style.height || '';

        uiElements.forEach(el => {
            if (!el) {
                return;
            }
            (el as HTMLElement).dataset.originalDisplay = (el as HTMLElement).style.display || '';
            (el as HTMLElement).style.display = 'none';
        });

        rootElement.style.position = 'fixed';
        rootElement.style.top = '0';
        rootElement.style.left = '0';
        rootElement.style.width = '100vw';
        rootElement.style.height = '100vh';
        rootElement.style.margin = '0';
        rootElement.style.padding = '0';
        rootElement.style.overflow = 'hidden';
        rootElement.style.zIndex = String(zIndex);

        if (svgElement) {
            svgElement.style.width = '100vw';
            svgElement.style.height = '100vh';
            svgElement.style.position = 'absolute';
            svgElement.style.top = '0';
            svgElement.style.left = '0';
        }

        body.style.margin = '0';
        body.style.padding = '0';
        body.style.overflow = 'hidden';
        body.style.width = '100vw';
        body.style.height = '100vh';

        html.style.margin = '0';
        html.style.padding = '0';
        html.style.overflow = 'hidden';
        html.style.width = '100vw';
        html.style.height = '100vh';

        onRequestFullscreen?.(true);
        createFullscreenExitButton(rootElement, isDarkTheme, getTheme, onExitRequested);
        createFullscreenToast(rootElement, isDarkTheme, getTheme);
    } else {
        onRequestFullscreen?.(false);
        removeFullscreenOverlays();

        uiElements.forEach(el => {
            if (el && (el as HTMLElement).dataset.originalDisplay !== undefined) {
                (el as HTMLElement).style.display = (el as HTMLElement).dataset.originalDisplay || '';
                delete (el as HTMLElement).dataset.originalDisplay;
            }
        });

        rootElement.style.position = rootElement.dataset.originalPosition || '';
        rootElement.style.top = rootElement.dataset.originalTop || '';
        rootElement.style.left = rootElement.dataset.originalLeft || '';
        rootElement.style.width = rootElement.dataset.originalWidth || '';
        rootElement.style.height = rootElement.dataset.originalHeight || '';
        rootElement.style.margin = rootElement.dataset.originalMargin || '';
        rootElement.style.padding = rootElement.dataset.originalPadding || '';
        rootElement.style.overflow = rootElement.dataset.originalOverflow || '';
        rootElement.style.zIndex = rootElement.dataset.originalZIndex || '';

        if (svgElement) {
            svgElement.style.width = svgElement.dataset.originalWidth || '';
            svgElement.style.height = svgElement.dataset.originalHeight || '';
            svgElement.style.position = svgElement.dataset.originalPosition || '';
            svgElement.style.top = svgElement.dataset.originalTop || '';
            svgElement.style.left = svgElement.dataset.originalLeft || '';
        }

        body.style.margin = body.dataset.originalMargin || '';
        body.style.padding = body.dataset.originalPadding || '';
        body.style.overflow = body.dataset.originalOverflow || '';
        body.style.width = body.dataset.originalWidth || '';
        body.style.height = body.dataset.originalHeight || '';

        html.style.margin = html.dataset.originalMargin || '';
        html.style.padding = html.dataset.originalPadding || '';
        html.style.overflow = html.dataset.originalOverflow || '';
        html.style.width = html.dataset.originalWidth || '';
        html.style.height = html.dataset.originalHeight || '';

        if (document.fullscreenElement) {
            document.exitFullscreen().catch((e: unknown) => {
                console.debug('[sql-crack] exitFullscreen failed:', e);
            });
        }
    }

    return nextIsFullscreen;
}

export function removeFullscreenOverlays(): void {
    const button = document.getElementById('fullscreen-exit-btn');
    if (button) {
        button.remove();
    }

    const toast = document.getElementById('fullscreen-toast');
    if (toast) {
        toast.remove();
    }

    if (fullscreenMouseMoveHandler) {
        document.removeEventListener('mousemove', fullscreenMouseMoveHandler);
        fullscreenMouseMoveHandler = null;
    }

    if (fullscreenFadeTimeout) {
        clearTimeout(fullscreenFadeTimeout);
        fullscreenFadeTimeout = null;
    }
}

function createFullscreenExitButton(
    container: HTMLElement,
    isDarkTheme: boolean,
    getTheme: (isDark: boolean) => FullscreenTheme,
    onExitRequested: () => void
): void {
    const theme = getTheme(isDarkTheme);
    const button = document.createElement('button');
    button.id = 'fullscreen-exit-btn';
    button.textContent = '✕ Exit Fullscreen';
    Object.assign(button.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '100000',
        padding: '8px 16px',
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        background: isDarkTheme ? 'rgba(20,20,20,0.9)' : 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: theme.text,
        fontSize: '13px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        opacity: '0',
        transition: 'opacity 300ms ease',
        boxShadow: `0 2px 8px ${isDarkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)'}`,
    });

    button.addEventListener('click', onExitRequested);
    button.addEventListener('mouseenter', () => {
        button.style.background = theme.accent;
        button.style.color = '#fff';
    });
    button.addEventListener('mouseleave', () => {
        button.style.background = isDarkTheme ? 'rgba(20,20,20,0.9)' : 'rgba(255,255,255,0.9)';
        button.style.color = theme.text;
    });

    container.appendChild(button);

    const showButton = () => {
        button.style.opacity = '1';
        if (fullscreenFadeTimeout) {
            clearTimeout(fullscreenFadeTimeout);
        }
        fullscreenFadeTimeout = setTimeout(() => {
            button.style.opacity = '0';
        }, 2000);
    };

    fullscreenMouseMoveHandler = showButton;
    document.addEventListener('mousemove', fullscreenMouseMoveHandler);
    showButton();
}

function createFullscreenToast(
    container: HTMLElement,
    isDarkTheme: boolean,
    getTheme: (isDark: boolean) => FullscreenTheme
): void {
    const theme = getTheme(isDarkTheme);
    const toast = document.createElement('div');
    toast.id = 'fullscreen-toast';
    toast.textContent = 'Press ESC or F to exit fullscreen';
    Object.assign(toast.style, {
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '100000',
        padding: '10px 20px',
        borderRadius: '8px',
        background: isDarkTheme ? 'rgba(20,20,20,0.9)' : 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${theme.border}`,
        color: theme.text,
        fontSize: '13px',
        fontFamily: 'inherit',
        opacity: '0',
        transition: 'opacity 400ms ease',
        boxShadow: `0 2px 8px ${isDarkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)'}`,
    });

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 3000);
}
