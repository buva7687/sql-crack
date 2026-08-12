/**
 * Script fragment: workspace export dropdown interactions.
 */
export function getExportDropdownScript(): string {
    return `
        // ========== Export Dropdown ==========
        const exportTrigger = document.getElementById('workspace-export-trigger');
        const exportMenu = document.getElementById('workspace-export-menu');
        exportTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!exportMenu) { return; }
            const isOpen = exportMenu.style.display !== 'none';
            exportMenu.style.display = isOpen ? 'none' : 'block';
            exportTrigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        });
        exportMenu?.querySelectorAll('.export-option[data-format]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = btn.getAttribute('data-format');
                if (format) {
                    vscode.postMessage({ command: 'export', format });
                }
                if (exportMenu) {
                    exportMenu.style.display = 'none';
                    exportTrigger?.setAttribute('aria-expanded', 'false');
                }
            });
        });
        document.addEventListener('click', (e) => {
            if (!exportMenu || !exportTrigger) { return; }
            if (e.target.closest('#workspace-export-trigger') || e.target.closest('#workspace-export-menu')) { return; }
            exportMenu.style.display = 'none';
            exportTrigger.setAttribute('aria-expanded', 'false');
        });
    `;
}

/**
 * Script fragment: message switch cases for PNG export.
 */
export function getExportMessageCasesScript(): string {
    return `
                case 'exportPng':
                    // Handle PNG export request from extension
                    exportToPng();
                    break;
                case 'exportPngClipboard':
                    exportToPng(true);
                    break;
    `;
}

/**
 * Script fragment: PNG export implementation.
 */
export function getExportToPngScript(): string {
    return `
        // ========== PNG Export Function ==========
        const MAX_RASTER_DIMENSION = 16384;
        const MAX_RASTER_PIXELS = 16 * 1024 * 1024;
        function getRasterScale(width, height, preferredScale = 2) {
            const safeWidth = Math.max(1, Number(width) || 1);
            const safeHeight = Math.max(1, Number(height) || 1);
            const widthLimitScale = MAX_RASTER_DIMENSION / safeWidth;
            const heightLimitScale = MAX_RASTER_DIMENSION / safeHeight;
            const pixelLimitScale = Math.sqrt(MAX_RASTER_PIXELS / safeWidth / safeHeight);
            const effectiveScale = Math.min(preferredScale, widthLimitScale, heightLimitScale, pixelLimitScale);
            if (Number.isFinite(effectiveScale) && effectiveScale > 0) {
                return effectiveScale;
            }
            // Preserve a bounded result even when hostile/corrupt SVG geometry
            // overflows the area calculation above.
            return Math.min(1, Math.sqrt(MAX_RASTER_PIXELS) / Math.max(safeWidth, safeHeight));
        }

        function exportToPng(copyToClipboard = false) {
            const svgElement = document.getElementById('graph-svg');
            if (!svgElement) {
                vscode.postMessage({ command: 'exportPngError', error: 'No SVG element found' });
                return;
            }

            try {
                // Clone SVG to avoid modifying the original
                const svgClone = svgElement.cloneNode(true);
                
                // Get computed styles and dimensions
                const bbox = mainGroup ? mainGroup.getBBox() : { x: 0, y: 0, width: 1200, height: 800 };
                const padding = 50;
                const width = Math.max(1200, bbox.width + padding * 2);
                const height = Math.max(800, bbox.height + padding * 2);

                // Set proper dimensions on clone
                svgClone.setAttribute('width', width);
                svgClone.setAttribute('height', height);
                svgClone.setAttribute('viewBox', (bbox.x - padding) + ' ' + (bbox.y - padding) + ' ' + width + ' ' + height);

                // Reset transform on main-group for export
                const cloneMainGroup = svgClone.getElementById('main-group');
                if (cloneMainGroup) {
                    cloneMainGroup.setAttribute('transform', 'translate(0,0) scale(1)');
                }

                // Add background
                const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('x', bbox.x - padding);
                bgRect.setAttribute('y', bbox.y - padding);
                bgRect.setAttribute('width', width);
                bgRect.setAttribute('height', height);
                bgRect.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim());
                svgClone.insertBefore(bgRect, svgClone.firstChild);

                // Serialize SVG
                const svgData = new XMLSerializer().serializeToString(svgClone);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const svgUrl = URL.createObjectURL(svgBlob);

                // Create canvas and draw
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(svgUrl);
                    vscode.postMessage({ command: 'exportPngError', error: 'Canvas 2D context unavailable' });
                    return;
                }
                const scale = getRasterScale(width, height, 2);
                canvas.width = Math.max(1, Math.min(MAX_RASTER_DIMENSION, Math.floor(width * scale)));
                canvas.height = Math.max(1, Math.min(MAX_RASTER_DIMENSION, Math.floor(height * scale)));
                ctx.scale(scale, scale);

                const img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(svgUrl);

                    const filename = 'workspace-dependencies-' + Date.now() + '.png';

                    // Encode once as a Blob. This avoids a synchronous, full-size
                    // canvas data URL allocation. The host message remains base64
                    // because webview messages must stay JSON-serializable.
                    try {
                        canvas.toBlob(function(blob) {
                            if (!blob) {
                                vscode.postMessage({ command: 'exportPngError', error: 'Failed to encode PNG image' });
                                return;
                            }

                            const saveViaDialog = function() {
                                blob.arrayBuffer()
                                    .then(function(data) {
                                        const bytes = new Uint8Array(data);
                                        const chunkSize = 0x8000;
                                        let binary = '';
                                        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                                            binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
                                        }
                                        vscode.postMessage({ command: 'savePng', data: btoa(binary), filename: filename });
                                    })
                                    .catch(function() {
                                        vscode.postMessage({ command: 'exportPngError', error: 'Failed to prepare PNG image for saving' });
                                    });
                            };

                            if (!(copyToClipboard && navigator.clipboard && typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function')) {
                                saveViaDialog();
                                return;
                            }

                            // Guard the synchronous parts too: new ClipboardItem() and
                            // navigator.clipboard.write() can throw synchronously (e.g.
                            // unsupported type, permissions), which a .catch() alone would
                            // miss — fall back to the save dialog in that case as well.
                            try {
                                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                                    .then(() => {
                                        const existing = document.getElementById('copy-feedback-toast');
                                        if (existing) existing.remove();
                                        const toast = document.createElement('div');
                                        toast.id = 'copy-feedback-toast';
                                        toast.textContent = 'PNG copied to clipboard';
                                        toast.style.cssText = 'position: fixed; top: 60px; right: 20px; background: var(--bg-secondary); color: var(--text-primary); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--accent); font-size: 12px; z-index: 9999; opacity: 0; transition: ' + (prefersReducedMotion ? 'none' : 'opacity 0.2s') + '; box-shadow: var(--shadow-md);';
                                        document.body.appendChild(toast);
                                        requestAnimationFrame(() => {
                                            toast.style.opacity = '1';
                                            setTimeout(() => {
                                                toast.style.opacity = '0';
                                                setTimeout(() => toast.remove(), prefersReducedMotion ? 0 : 200);
                                            }, 1500);
                                        });
                                    })
                                    .catch(() => {
                                        saveViaDialog();
                                    });
                            } catch (clipboardErr) {
                                saveViaDialog();
                            }
                        }, 'image/png');
                    } catch (encodeErr) {
                        vscode.postMessage({ command: 'exportPngError', error: 'Failed to encode PNG image' });
                    }
                };

                img.onerror = function() {
                    URL.revokeObjectURL(svgUrl);
                    vscode.postMessage({ command: 'exportPngError', error: 'Failed to load SVG for PNG conversion' });
                };

                img.src = svgUrl;
            } catch (e) {
                vscode.postMessage({ command: 'exportPngError', error: 'PNG export failed: ' + e.message });
            }
        }
    `;
}
