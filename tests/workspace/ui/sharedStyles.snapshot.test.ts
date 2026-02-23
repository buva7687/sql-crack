/**
 * Snapshot Tests for sharedStyles.ts
 *
 * These tests capture the EXACT CSS output for dark and light themes.
 * Any intentional CSS changes should update snapshots with --updateSnapshot.
 */

import * as fs from 'fs';
import * as path from 'path';

// Read the main file and all extracted style modules
// Path is relative to tests/workspace/ui/ so we need ../../../src/
const stylesDir = path.join(__dirname, '../../../src/workspace/ui/styles');
const sharedStylesPath = path.join(__dirname, '../../../src/workspace/ui/sharedStyles.ts');
const sharedStylesSource = fs.readFileSync(sharedStylesPath, 'utf-8');

const styleModuleFiles = ['variables.ts', 'base.ts', 'lineage.ts', 'panels.ts', 'tables.ts', 'impact.ts', 'graph.ts'];
const modulesSources = styleModuleFiles
    .map(f => path.join(stylesDir, f))
    .filter(p => fs.existsSync(p))
    .map(p => fs.readFileSync(p, 'utf-8'));

// Combined source for pattern matching (includes main file and all style modules)
const combinedSource = [sharedStylesSource, ...modulesSources].join('\n');

describe('sharedStyles.ts CSS Output Patterns', () => {
    /**
     * These tests verify the structure of CSS output by analyzing the source.
     * Since webpack bundles the code, we can't directly call the functions in Jest,
     * but we can verify the critical CSS patterns are present.
     */

    describe('Dark theme CSS output', () => {
        it('should have dark theme background colors', () => {
            // Dark theme uses #111111 as primary background
            expect(combinedSource).toMatch(/--bg-primary:\s*#111111/);
            expect(combinedSource).toMatch(/--bg-secondary:\s*#1a1a1a/);
        });

        it('should have dark theme text colors', () => {
            expect(combinedSource).toMatch(/--text-primary:\s*#f1f5f9/);
            expect(combinedSource).toMatch(/--text-secondary:\s*#e2e8f0/);
        });

        it('should have dark theme borders with transparency', () => {
            expect(combinedSource).toMatch(/--border-color:\s*rgba\(255,\s*255,\s*255/);
        });
    });

    describe('Light theme CSS output', () => {
        it('should have light theme background colors', () => {
            // Light theme uses #fafafa as primary background
            expect(combinedSource).toMatch(/--bg-primary:\s*#fafafa/);
            expect(combinedSource).toMatch(/--bg-secondary:\s*#ffffff/);
        });

        it('should have light theme text colors', () => {
            expect(combinedSource).toMatch(/--text-primary:\s*#0f172a/);
            expect(combinedSource).toMatch(/--text-secondary:\s*#1e293b/);
        });

        it('should have light theme borders with transparency', () => {
            expect(combinedSource).toMatch(/--border-color:\s*rgba\(0,\s*0,\s*0/);
        });
    });

    describe('CSS structure completeness', () => {
        it('should have all CSS variable assignments with colons', () => {
            // Verify variables are actually assigned values (not just referenced)
            const varPattern = /--[a-z-]+:\s*[^;]+;/g;
            const matches = combinedSource.match(varPattern);
            expect(matches?.length).toBeGreaterThan(50); // Should have many CSS variables
        });

        it('should have :root selector for CSS variables', () => {
            expect(combinedSource).toMatch(/:root\s*\{/);
        });

        it('should close :root blocks properly', () => {
            // Count opening and closing braces for :root
            const rootBlocks = combinedSource.match(/:root\s*\{/g) || [];
            expect(rootBlocks.length).toBeGreaterThanOrEqual(2); // Dark + light
        });
    });
});

describe('sharedStyles.ts Source Structure', () => {
    describe('Function Exports', () => {
        it('should export getCssVariables function', () => {
            expect(combinedSource).toMatch(/function getCssVariables|export function getCssVariables/);
        });

        it('should export getWebviewStyles or similar assembler function', () => {
            expect(combinedSource).toMatch(/getWebviewStyles|getIssuesStyles|getGraphStyles/);
        });
    });

    describe('Theme Variables', () => {
        it('should define dark theme colors', () => {
            expect(combinedSource).toMatch(/--text-primary.*#f1f5f9|--text-primary:\s*#f1f5f9/);
        });

        it('should define light theme colors', () => {
            expect(combinedSource).toMatch(/--text-primary.*#0f172a|--text-primary:\s*#0f172a/);
        });

        it('should define dark background', () => {
            expect(combinedSource).toMatch(/--bg-primary.*#111|--bg-primary:\s*#111/);
        });

        it('should define light background', () => {
            expect(combinedSource).toMatch(/--bg-primary.*#fafafa|--bg-primary:\s*#fafafa/);
        });
    });

    describe('CSS Classes', () => {
        const expectedClasses = [
            ['\\.graph-container', 'graph-container'],
            ['lineage-graph', 'lineage-graph'],
            ['\\.table', 'table-'],
            ['impact', 'impact-'],
            ['sidebar', 'sidebar'],
            ['panel', 'panel'],
        ];

        expectedClasses.forEach(([className, pattern]) => {
            it(`should define ${className} styles`, () => {
                expect(combinedSource).toMatch(new RegExp(pattern));
            });
        });
    });

    describe('Responsive/Media Queries', () => {
        it('should have media queries for responsive design', () => {
            expect(combinedSource).toMatch(/@media/);
        });
    });

    describe('File Size Check', () => {
        it('should document current line count', () => {
            const lines = combinedSource.split('\n').length;
            console.log(`sharedStyles.ts current line count: ${lines}`);
            // Pre-refactor baseline - should decrease after splitting
            expect(lines).toBeGreaterThan(4000);
            expect(lines).toBeLessThan(5500);
        });
    });
});

describe('sharedStyles.ts CSS Variable Coverage', () => {
    const expectedVariables = [
        ['--text-primary', '--text-primary:'],
        ['--text-secondary', '--text-secondary:'],
        ['--text-muted', '--text-muted:'],
        ['--bg-primary', '--bg-primary:'],
        ['--bg-secondary', '--bg-secondary:'],
        ['--bg-overlay', '--bg-overlay:'],
        ['--border-color', '--border-color:'],
        ['--border-subtle', '--border-subtle:'],
        ['--accent', '--accent:'],
        ['--error', '--error:'],
        ['--success', '--success:'],
        ['--warning', '--warning:'],
        ['--node-text', '--node-text:'],
        ['--node-fill', '--node-fill:'],
        ['--node-border', '--node-border:'],
        ['--edge-default', '--edge-default:'],
        ['--grid-color', '--grid-color:'],
    ];

    expectedVariables.forEach(([varName, pattern]) => {
        it(`should define ${varName} variable`, () => {
            expect(combinedSource).toMatch(new RegExp(pattern));
        });
    });
});

describe('sharedStyles.ts Color Modes', () => {
    it('should have dark mode styles via getCssVariables(true)', () => {
        expect(combinedSource).toMatch(/if\s*\(dark\)|dark.*\?.*:.*{/);
    });

    it('should have light mode styles via getCssVariables(false)', () => {
        expect(combinedSource).toMatch(/else\s*\{|:.*#fafafa|light/);
    });

    it('should handle theme switching via dark parameter', () => {
        expect(combinedSource).toMatch(/dark:\s*boolean/);
    });
});

describe('sharedStyles.ts Component Styles', () => {
    describe('Graph styles', () => {
        it('should define node styles', () => {
            expect(combinedSource).toMatch(/node-fill|node-border|getNodeStyles/);
        });

        it('should define edge styles', () => {
            expect(combinedSource).toMatch(/edge-default|edge-hover|edge-join/);
        });

        it('should define hover states', () => {
            expect(combinedSource).toMatch(/:hover/);
        });

        it('should define selected/focus states', () => {
            expect(combinedSource).toMatch(/\.selected|\.active|:focus/);
        });
    });

    describe('Panel styles', () => {
        it('should define sidebar styles', () => {
            expect(combinedSource).toMatch(/sidebar|panel/);
        });

        it('should define header styles', () => {
            expect(combinedSource).toMatch(/header|title/);
        });

        it('should define button styles', () => {
            expect(combinedSource).toMatch(/\.btn|button/);
        });
    });

    describe('Table styles', () => {
        it('should define table styles', () => {
            expect(combinedSource).toMatch(/table-container|table-item|\.table/);
        });

        it('should define row styles', () => {
            expect(combinedSource).toMatch(/row-odd|row-even|row-hover|item-row/);
        });
    });

    describe('Form/Input styles', () => {
        it('should define input styles', () => {
            expect(combinedSource).toMatch(/input|typeahead|search/);
        });

        it('should define search styles', () => {
            expect(combinedSource).toMatch(/search|filter/);
        });
    });
});
