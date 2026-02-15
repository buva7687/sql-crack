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
                const scale = 2; // 2x for retina quality
                canvas.width = width * scale;
                canvas.height = height * scale;
                ctx.scale(scale, scale);

                const img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(svgUrl);

                    // Convert to PNG and either copy or send to extension for save
                    const pngDataUrl = canvas.toDataURL('image/png');
                    const base64Data = pngDataUrl.split(',')[1];

                    if (copyToClipboard && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                        fetch(pngDataUrl)
                            .then(res => res.blob())
                            .then(blob => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]))
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
                                vscode.postMessage({ command: 'savePng', data: base64Data, filename: 'workspace-dependencies-' + Date.now() + '.png' });
                            });
                    } else {
                        vscode.postMessage({
                            command: 'savePng',
                            data: base64Data,
                            filename: 'workspace-dependencies-' + Date.now() + '.png'
                        });
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
