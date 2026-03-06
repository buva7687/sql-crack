import { readFileSync } from 'fs';
import { join } from 'path';

describe('Tooltip SQL snippet theme awareness', () => {
    const source = readFileSync(
        join(__dirname, '../../../../src/webview/ui/tooltip.ts'),
        'utf8'
    );

    it('does not hardcode dark-only background for SQL snippet', () => {
        // Previously: background: rgba(30, 41, 59, 0.6) — always dark
        // Now should be gated on isDarkTheme
        expect(source).not.toMatch(/background:\s*rgba\(30, 41, 59/);
        expect(source).toContain("isDarkTheme ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)'");
    });

    it('does not hardcode dark-only text color for SQL snippet', () => {
        // Previously: color: #f8fafc — always white text
        // Now should be gated on isDarkTheme
        expect(source).not.toMatch(/color:\s*#f8fafc/);
        expect(source).toContain("isDarkTheme ? '#f8fafc' : '#1e293b'");
    });
});
