import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically strong CSP nonce.
 *
 * Node-only: this uses the `crypto` module and must only be imported from
 * extension-host code (panels, HTML generation). It must NOT be pulled into the
 * webview/browser bundle, whose webpack target has no `crypto` polyfill. Webview
 * code that needs randomness should use the Web Crypto `crypto` global directly.
 *
 * 16 random bytes (128 bits) hex-encoded → a 32-character alphanumeric token,
 * valid in both the `nonce` attribute and the CSP `'nonce-…'` source, and far
 * stronger than the previous Math.random()-based generators which were neither
 * unique nor unpredictable.
 */
export function createCspNonce(): string {
    return randomBytes(16).toString('hex');
}
