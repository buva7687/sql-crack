import { createCspNonce } from '../../src/nonce';

describe('createCspNonce', () => {
    it('returns a 32-character hex token (128 bits)', () => {
        const nonce = createCspNonce();
        expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    });

    it('is alphanumeric and CSP/attribute safe (no +, /, =, quotes, spaces)', () => {
        const nonce = createCspNonce();
        expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('produces unique, unpredictable values across many calls', () => {
        const nonces = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            nonces.add(createCspNonce());
        }
        expect(nonces.size).toBe(1000);
    });
});
