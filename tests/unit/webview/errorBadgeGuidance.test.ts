import { readFileSync } from 'fs';
import { join } from 'path';

describe('error badge guidance wiring', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar/errorBadge.ts'),
        'utf8'
    );

    it('reuses error guidance lines in the badge tooltip', () => {
        expect(source).toContain("import { getErrorGuidanceLines } from '../errorRenderer';");
        expect(source).toContain('function buildErrorBadgeTooltipText(');
        expect(source).toContain('const guidance = getErrorGuidanceLines(e.message);');
        expect(source).toContain('text += `\\n${guidance[0]}`;');
    });

    it('explains badge click behavior in the tooltip when parse errors are present', () => {
        expect(source).toContain('Click the badge to jump through failed queries.');
        expect(source).toContain('badge.title = buildErrorBadgeTooltipText(errorCount, errors);');
        expect(source).toContain('return errors?.length');
        expect(source).not.toContain('return currentBadgeErrors.length > 0');
    });
});
