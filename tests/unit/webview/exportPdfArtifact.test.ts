import {
    buildPdfArrayBufferFromJpegData,
    getPdfPageDimensions,
} from '../../../src/webview/features/export/pdf';
import { readFileSync } from 'fs';
import { join } from 'path';

const TINY_JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFhUVFRUVFRUVFRUVFRUQFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGysmICYtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAgMBEQACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB6A//xAAVEAEBAAAAAAAAAAAAAAAAAAABAP/aAAgBAQABBQJf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPwEf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPwEf/8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQAGPwJf/8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPyFf/9k=';

describe('PDF export helpers', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/features/export/pdf.ts'),
        'utf8'
    );

    it('returns landscape dimensions for A4 pages', () => {
        expect(getPdfPageDimensions({
            pageSize: 'A4',
            orientation: 'landscape',
        })).toEqual({
            widthPoints: 841.89,
            heightPoints: 595.28,
        });
    });

    it('builds a single-page PDF array buffer via jsPDF', () => {
        const buffer = buildPdfArrayBufferFromJpegData({
            jpegDataUrl: TINY_JPEG_DATA_URL,
            pageWidthPoints: 612,
            pageHeightPoints: 792,
            orientation: 'portrait',
        });
        const bytes = new Uint8Array(buffer);
        const header = new TextDecoder().decode(bytes.slice(0, 8));

        expect(header.startsWith('%PDF-')).toBe(true);
        expect(buffer.byteLength).toBeGreaterThan(500);
    });

    it('uses jsPDF for image-backed PDF generation', () => {
        expect(source).toContain("import * as jspdfUmd from 'jspdf/dist/jspdf.umd.min.js';");
        expect(source).toContain("const { jsPDF } = jspdfUmd");
        expect(source).toContain('new jsPDF({');
        expect(source).toContain("pdf.addImage(");
        expect(source).toContain("pdf.output('arraybuffer')");
    });
});
