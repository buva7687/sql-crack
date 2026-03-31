import { readFileSync } from 'fs';
import { join } from 'path';

describe('IndexManager queue race guards', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/workspace/indexManager.ts'),
        'utf8'
    );

    it('claims queued file paths one by one instead of clearing the entire queue snapshot', () => {
        expect(source).toContain('if (!this.updateQueue.delete(filePath))');
        expect(source).not.toContain('this.updateQueue.clear();');
    });
});
