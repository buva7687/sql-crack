import { getCycledNode } from '../navigation/keyboardNavigation';
import type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export function registerSvgKeyboardListeners(
    context: EventListenerContext,
    callbacks: EventListenerCallbacks
): void {
    const { state, getSvg, getSearchBox } = context;
    const svg = getSvg();
    if (!svg) {
        return;
    }

    svg.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const orderedNodes = callbacks.getKeyboardNavigationNodes();
            if (orderedNodes.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const seedId = state.selectedNodeId
                    || (e.shiftKey ? orderedNodes[0].id : orderedNodes[orderedNodes.length - 1].id);
                const target = getCycledNode(orderedNodes, seedId, e.shiftKey ? 'prev' : 'next');
                if (target) {
                    callbacks.moveKeyboardFocusToNode(target);
                }
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (callbacks.isZeroGravityModeActive()) {
                callbacks.toggleZeroGravityMode(false);
                return;
            }
            if (state.showColumnFlows) {
                callbacks.toggleColumnFlows(false);
                return;
            }
            callbacks.selectNode(null);
            callbacks.clearFocusMode();
            callbacks.hideContextMenu();
            const searchBox = getSearchBox();
            if (searchBox) {
                searchBox.value = '';
                callbacks.clearSearch();
            }
            requestAnimationFrame(() => {
                callbacks.resetView();
            });
        }
    });
}

export function registerDocumentKeyboardListeners(
    context: EventListenerContext,
    callbacks: EventListenerCallbacks
): void {
    const { state, getCurrentNodes, getSearchBox, documentListeners } = context;
    const KONAMI_SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let konamiProgress: string[] = [];
    const matrixChordKeys = new Set<string>();
    let matrixLastTriggeredAt = 0;

    function normalizeKey(key: string): string {
        return (key || '').toLowerCase();
    }

    function recordKonamiKey(key: string): boolean {
        const normalized = normalizeKey(key);
        if (!normalized) {
            return false;
        }
        konamiProgress.push(normalized);
        if (konamiProgress.length > KONAMI_SEQUENCE.length) {
            konamiProgress = konamiProgress.slice(-KONAMI_SEQUENCE.length);
        }
        const matched = KONAMI_SEQUENCE.every((expected, index) => konamiProgress[index] === expected);
        if (!matched) {
            return false;
        }
        konamiProgress = [];
        callbacks.toggleZeroGravityMode();
        return true;
    }

    function isMatrixChordActive(): boolean {
        return matrixChordKeys.has('shift') && matrixChordKeys.has('s') && matrixChordKeys.has('q') && matrixChordKeys.has('l');
    }

    function handleMatrixChordKeydown(e: KeyboardEvent): 'none' | 'captured' | 'triggered' {
        const normalized = normalizeKey(e.key);
        if (!normalized) {
            return 'none';
        }
        const isMatrixChordKey = normalized === 'shift' || normalized === 's' || normalized === 'q' || normalized === 'l';
        if (!isMatrixChordKey) {
            return 'none';
        }
        if (normalized !== 'shift' && !e.shiftKey) {
            return 'none';
        }
        matrixChordKeys.add(normalized);
        if (!isMatrixChordActive()) {
            return 'captured';
        }
        const now = Date.now();
        if (now - matrixLastTriggeredAt < 800) {
            return 'captured';
        }
        matrixLastTriggeredAt = now;
        callbacks.triggerMatrixRainOverlay();
        return 'triggered';
    }

    const keydownHandler = (e: KeyboardEvent) => {
        const isInputFocused = document.activeElement?.tagName === 'INPUT' ||
            document.activeElement?.tagName === 'TEXTAREA';

        if (!isInputFocused && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            if (e.shiftKey) {
                callbacks.redoLayoutChange();
            } else {
                callbacks.undoLayoutChange();
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            callbacks.toggleCommandBar();
            return;
        }

        if (e.key === 'Escape' && callbacks.isCommandBarVisible()) {
            e.preventDefault();
            callbacks.hideCommandBar();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            getSearchBox()?.focus();
            return;
        }

        if (e.key === 'Escape') {
            if (callbacks.isZeroGravityModeActive()) {
                e.preventDefault();
                callbacks.toggleZeroGravityMode(false);
                return;
            }
            if (state.showColumnFlows) {
                callbacks.toggleColumnFlows(false);
                return;
            }
            if (state.isFullscreen) {
                callbacks.toggleFullscreen(false);
            }
            callbacks.selectNode(null);
            callbacks.clearFocusMode();
            callbacks.hideContextMenu();
            const searchBox = getSearchBox();
            if (searchBox) {
                searchBox.value = '';
                callbacks.clearSearch();
            }
            requestAnimationFrame(() => {
                callbacks.resetView();
            });
            return;
        }

        if (e.key === 'Enter' && document.activeElement === getSearchBox()) {
            callbacks.navigateSearch(1);
            return;
        }

        if (!isInputFocused) {
            const matrixChordResult = handleMatrixChordKeydown(e);
            if (matrixChordResult !== 'none') {
                e.preventDefault();
                return;
            }
        }

        if (!isInputFocused && recordKonamiKey(e.key)) {
            e.preventDefault();
            return;
        }

        if (isInputFocused) {return;}
        if (e.metaKey || e.ctrlKey || e.altKey) {return;}

        if (e.key === '1') { e.preventDefault(); callbacks.switchLayout('vertical'); return; }
        if (e.key === '2') { e.preventDefault(); callbacks.switchLayout('horizontal'); return; }
        if (e.key === '3') { e.preventDefault(); callbacks.switchLayout('compact'); return; }
        if (e.key === '4') { e.preventDefault(); callbacks.switchLayout('force'); return; }
        if (e.key === '5') { e.preventDefault(); callbacks.switchLayout('radial'); return; }

        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            callbacks.zoomIn();
        }
        if (e.key === '-') {
            e.preventDefault();
            callbacks.zoomOut();
        }
        if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            callbacks.resetView();
        }
        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            callbacks.toggleFullscreen();
        }
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            callbacks.toggleTheme();
        }
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            callbacks.toggleLayout();
        }
        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            callbacks.toggleSqlPreview();
        }
        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            callbacks.toggleColumnFlows();
        }
        if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            callbacks.toggleStats();
        }
        if (e.key === 'o' || e.key === 'O') {
            e.preventDefault();
            callbacks.toggleHints();
        }
        if (e.key === 'u' || e.key === 'U') {
            e.preventDefault();
            callbacks.setFocusMode('upstream');
        }
        if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            callbacks.setFocusMode('downstream');
        }
        if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            callbacks.setFocusMode('all');
        }
        if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            callbacks.toggleExpandAll();
        }
        if (e.key === '/') {
            e.preventDefault();
            getSearchBox()?.focus();
        }
        if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            callbacks.toggleLegend();
        }
        if (e.key === '?') {
            e.preventDefault();
            callbacks.showKeyboardShortcutsHelp(callbacks.getKeyboardShortcuts(), state.isDarkTheme);
        }

        if (e.key === 'ArrowUp' && state.selectedNodeId) {
            e.preventDefault();
            callbacks.navigateToConnectedNode('upstream', state.selectedNodeId);
        }
        if (e.key === 'ArrowDown' && state.selectedNodeId) {
            e.preventDefault();
            callbacks.navigateToConnectedNode('downstream', state.selectedNodeId);
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selectedNodeId) {
            const selectedNode = getCurrentNodes().find(node => node.id === state.selectedNodeId);
            if (selectedNode) {
                e.preventDefault();
                callbacks.navigateToSiblingNode(selectedNode, e.key === 'ArrowRight' ? 'next' : 'prev');
            }
        }
    };

    const keyupHandler = (e: KeyboardEvent) => {
        const normalized = normalizeKey(e.key);
        if (!normalized) {
            return;
        }
        if (normalized === 'shift' || normalized === 's' || normalized === 'q' || normalized === 'l') {
            matrixChordKeys.delete(normalized);
        }
    };

    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    documentListeners.push({ type: 'keydown', handler: keydownHandler as EventListener });
    documentListeners.push({ type: 'keyup', handler: keyupHandler as EventListener });
}
