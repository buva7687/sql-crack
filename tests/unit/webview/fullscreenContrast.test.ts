import * as fs from 'fs';
import * as path from 'path';
import { getComponentUiColors } from '../../../src/webview/constants/colors';

describe('fullscreen exit button contrast', () => {
    it('uses the accessible accent surface when hovered in dark mode', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../src/webview/features/fullscreen.ts'),
            'utf8'
        );
        const theme = getComponentUiColors(true);

        expect(theme.accentSurface).toBe('#4f46e5');
        expect(source).toContain('button.style.background = theme.accentSurface;');
        expect(source).not.toContain('button.style.background = theme.accent;');
    });
});
