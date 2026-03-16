import { getPdfPageDimensions } from '../../../src/webview/features/export/pdf';

describe('getPdfPageDimensions', () => {
    it('returns A4 portrait dimensions', () => {
        const dims = getPdfPageDimensions({ pageSize: 'A4', orientation: 'portrait' });
        expect(dims.widthPoints).toBeCloseTo(595.28, 1);
        expect(dims.heightPoints).toBeCloseTo(841.89, 1);
    });

    it('returns A4 landscape dimensions (swapped)', () => {
        const dims = getPdfPageDimensions({ pageSize: 'A4', orientation: 'landscape' });
        expect(dims.widthPoints).toBeCloseTo(841.89, 1);
        expect(dims.heightPoints).toBeCloseTo(595.28, 1);
    });

    it('returns Letter portrait dimensions', () => {
        const dims = getPdfPageDimensions({ pageSize: 'Letter', orientation: 'portrait' });
        expect(dims.widthPoints).toBe(612);
        expect(dims.heightPoints).toBe(792);
    });

    it('returns Letter landscape dimensions (swapped)', () => {
        const dims = getPdfPageDimensions({ pageSize: 'Letter', orientation: 'landscape' });
        expect(dims.widthPoints).toBe(792);
        expect(dims.heightPoints).toBe(612);
    });

    it('landscape width is always greater than height', () => {
        for (const pageSize of ['A4', 'Letter'] as const) {
            const dims = getPdfPageDimensions({ pageSize, orientation: 'landscape' });
            expect(dims.widthPoints).toBeGreaterThan(dims.heightPoints);
        }
    });

    it('portrait height is always greater than width', () => {
        for (const pageSize of ['A4', 'Letter'] as const) {
            const dims = getPdfPageDimensions({ pageSize, orientation: 'portrait' });
            expect(dims.heightPoints).toBeGreaterThan(dims.widthPoints);
        }
    });
});
