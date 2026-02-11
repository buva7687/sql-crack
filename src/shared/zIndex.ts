/**
 * Shared layering scale used by webview/workspace UI.
 * Keep values centralized so layering changes are predictable and reviewable.
 */
export const Z_INDEX = {
    base: 0,
    edge: 10,
    node: 20,
    legend: 100,
    toolbar: 100,
    badge: 101,
    breadcrumb: 99,
    compareOverlay: 130,
    floatingPanel: 140,
    panel: 150,
    panelTop: 200,
    commandBar: 2000,
    firstRunOverlay: 3000,
    toast: 9999,
    dropdown: 10000,
    dropdownTop: 11000,
    fullscreenOverlay: 10000,
    debugTop: 99999,
} as const;

