// Polyfill for process in webview environment
import process from 'process/browser';
(window as any).process = process;

import React from 'react';
import { createRoot } from 'react-dom/client';
import AppClean from './AppClean';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<AppClean />);
}
