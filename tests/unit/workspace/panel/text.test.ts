import {
    formatDurationText,
    escapeHtmlText,
    escapeForInlineScriptValue,
    generateNonce,
} from '../../../../src/workspace/panel/text';

describe('workspace/panel/text.ts', () => {
    describe('formatDurationText', () => {
        it('returns <1s for values under 1 second', () => {
            expect(formatDurationText(0)).toBe('<1s');
            expect(formatDurationText(1)).toBe('<1s');
            expect(formatDurationText(500)).toBe('<1s');
            expect(formatDurationText(999)).toBe('<1s');
        });

        it('returns seconds for values under 1 minute', () => {
            expect(formatDurationText(1000)).toBe('1s');
            expect(formatDurationText(5000)).toBe('5s');
            expect(formatDurationText(30000)).toBe('30s');
            expect(formatDurationText(59000)).toBe('59s');
        });

        it('returns minutes for values 1 minute and above', () => {
            expect(formatDurationText(60000)).toBe('1m');
            expect(formatDurationText(120000)).toBe('2m');
            expect(formatDurationText(300000)).toBe('5m');
            expect(formatDurationText(3600000)).toBe('60m');
        });

        it('rounds seconds correctly', () => {
            expect(formatDurationText(1500)).toBe('2s');
            expect(formatDurationText(2500)).toBe('3s');
            expect(formatDurationText(55000)).toBe('55s');
        });

        it('rounds minutes correctly', () => {
            expect(formatDurationText(90000)).toBe('2m');
            expect(formatDurationText(150000)).toBe('3m');
        });
    });

    describe('escapeHtmlText', () => {
        it('escapes ampersand', () => {
            expect(escapeHtmlText('a & b')).toBe('a &amp; b');
        });

        it('escapes less than', () => {
            expect(escapeHtmlText('a < b')).toBe('a &lt; b');
        });

        it('escapes greater than', () => {
            expect(escapeHtmlText('a > b')).toBe('a &gt; b');
        });

        it('escapes double quotes', () => {
            expect(escapeHtmlText('say "hello"')).toBe('say &quot;hello&quot;');
        });

        it('escapes single quotes', () => {
            expect(escapeHtmlText("it's")).toBe('it&#039;s');
        });

        it('escapes multiple special characters', () => {
            expect(escapeHtmlText('<script>alert("xss")</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
            );
        });

        it('returns plain text unchanged', () => {
            expect(escapeHtmlText('hello world')).toBe('hello world');
        });

        it('handles empty string', () => {
            expect(escapeHtmlText('')).toBe('');
        });

        it('handles already-escaped entities', () => {
            expect(escapeHtmlText('&amp;')).toBe('&amp;amp;');
        });
    });

    describe('escapeForInlineScriptValue', () => {
        it('uses JSON.stringify for base escaping', () => {
            const result = escapeForInlineScriptValue('hello');
            expect(result).toBe('"hello"');
        });

        it('escapes closing script tags', () => {
            const result = escapeForInlineScriptValue('</script>');
            expect(result).toBe('"<\\/script>"');
        });

        it('escapes script tags case-insensitively', () => {
            const result = escapeForInlineScriptValue('</SCRIPT>');
            expect(result).toBe('"<\\/script>"');
        });

        it('escapes HTML comment start', () => {
            const result = escapeForInlineScriptValue('<!--');
            expect(result).toBe('"<\\!--"');
        });

        it('escapes HTML comment end', () => {
            const result = escapeForInlineScriptValue('-->');
            expect(result).toBe('"--\\>"');
        });

        it('escapes CDATA section end', () => {
            const result = escapeForInlineScriptValue(']]>');
            expect(result).toBe('"]\\]>"');
        });

        it('handles objects', () => {
            const result = escapeForInlineScriptValue({ key: 'value' });
            expect(result).toContain('"key"');
            expect(result).toContain('"value"');
        });

        it('handles arrays', () => {
            const result = escapeForInlineScriptValue([1, 2, 3]);
            expect(result).toBe('[1,2,3]');
        });

        it('handles null', () => {
            const result = escapeForInlineScriptValue(null);
            expect(result).toBe('null');
        });

        it('handles numbers', () => {
            const result = escapeForInlineScriptValue(42);
            expect(result).toBe('42');
        });

        it('handles boolean', () => {
            expect(escapeForInlineScriptValue(true)).toBe('true');
            expect(escapeForInlineScriptValue(false)).toBe('false');
        });

        it('escapes multiple patterns in one string', () => {
            const result = escapeForInlineScriptValue('</script><!-- -->]]>');
            expect(result).toContain('<\\/script');
            expect(result).toContain('<\\!--');
            expect(result).toContain('--\\>');
            expect(result).toContain(']\\]>');
        });
    });

    describe('generateNonce', () => {
        it('returns 32 character string', () => {
            const nonce = generateNonce();
            expect(nonce.length).toBe(32);
        });

        it('contains only alphanumeric characters', () => {
            const nonce = generateNonce();
            expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
        });

        it('generates different values on multiple calls', () => {
            const nonces = new Set<string>();
            for (let i = 0; i < 10; i++) {
                nonces.add(generateNonce());
            }
            expect(nonces.size).toBeGreaterThan(1);
        });

        it('generates unique nonces statistically', () => {
            const nonces = new Set<string>();
            for (let i = 0; i < 100; i++) {
                nonces.add(generateNonce());
            }
            expect(nonces.size).toBe(100);
        });
    });
});
