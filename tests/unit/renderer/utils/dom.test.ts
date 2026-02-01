/**
 * DOM Utility Tests
 *
 * Tests for DOM manipulation utilities.
 */

import { truncate, escapeHtml, createSvgElement, setAttributes } from '../../../../src/webview/renderer/utils/dom';

// Mock document for DOM functions
const mockDiv = {
    textContent: '',
    innerHTML: ''
};

const mockElement = {
    setAttribute: jest.fn()
};

const mockSvgElement = {
    tagName: 'svg'
};

// Setup document mock before tests
beforeAll(() => {
    (global as any).document = {
        createElement: jest.fn().mockImplementation((tag: string) => {
            if (tag === 'div') {
                // Return a new mock each time to simulate real DOM behavior
                return {
                    set textContent(value: string) {
                        this._textContent = value;
                        // Simulate HTML escaping
                        this._innerHTML = value
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;');
                    },
                    get textContent() {
                        return this._textContent;
                    },
                    get innerHTML() {
                        return this._innerHTML;
                    },
                    _textContent: '',
                    _innerHTML: ''
                };
            }
            return mockElement;
        }),
        createElementNS: jest.fn().mockReturnValue(mockSvgElement)
    };
});

afterAll(() => {
    delete (global as any).document;
});

describe('DOM Utilities', () => {
    describe('truncate', () => {
        it('returns original string if shorter than maxLen', () => {
            expect(truncate('hello', 10)).toBe('hello');
            expect(truncate('test', 4)).toBe('test');
        });

        it('returns original string if exactly maxLen', () => {
            expect(truncate('hello', 5)).toBe('hello');
        });

        it('truncates and adds ellipsis if longer than maxLen', () => {
            expect(truncate('hello world', 5)).toBe('hell…');
            expect(truncate('testing', 4)).toBe('tes…');
        });

        it('handles empty string', () => {
            expect(truncate('', 5)).toBe('');
        });

        it('handles maxLen of 1', () => {
            expect(truncate('hello', 1)).toBe('…');
        });

        it('handles maxLen of 0', () => {
            // Edge case - substring(0, -1) returns empty string
            expect(truncate('hello', 0)).toBe('…');
        });

        it('handles very long strings', () => {
            const longString = 'a'.repeat(1000);
            const result = truncate(longString, 10);
            expect(result).toHaveLength(10);
            expect(result.endsWith('…')).toBe(true);
        });

        it('handles unicode characters', () => {
            expect(truncate('héllo wörld', 6)).toBe('héllo…');
        });

        it('uses ellipsis character (…) not three dots', () => {
            const result = truncate('hello world', 8);
            expect(result).toContain('…');
            expect(result).not.toContain('...');
        });
    });

    describe('escapeHtml', () => {
        it('escapes HTML special characters', () => {
            const result = escapeHtml('<script>alert("xss")</script>');
            expect(result).not.toContain('<script>');
            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
        });

        it('escapes ampersands', () => {
            const result = escapeHtml('foo & bar');
            expect(result).toContain('&amp;');
        });

        it('escapes quotes', () => {
            const result = escapeHtml('say "hello"');
            expect(result).toContain('&quot;');
        });

        it('returns plain text unchanged', () => {
            const result = escapeHtml('Hello World');
            expect(result).toBe('Hello World');
        });

        it('handles empty string', () => {
            const result = escapeHtml('');
            expect(result).toBe('');
        });
    });

    describe('createSvgElement', () => {
        it('creates SVG element using createElementNS', () => {
            const result = createSvgElement('svg');

            expect(document.createElementNS).toHaveBeenCalledWith(
                'http://www.w3.org/2000/svg',
                'svg'
            );
            expect(result).toBeDefined();
        });

        it('creates different SVG element types', () => {
            createSvgElement('path');
            expect(document.createElementNS).toHaveBeenCalledWith(
                'http://www.w3.org/2000/svg',
                'path'
            );

            createSvgElement('rect');
            expect(document.createElementNS).toHaveBeenCalledWith(
                'http://www.w3.org/2000/svg',
                'rect'
            );
        });
    });

    describe('setAttributes', () => {
        it('sets multiple attributes on element', () => {
            const element = {
                setAttribute: jest.fn()
            };

            setAttributes(element as any, {
                width: 100,
                height: 50,
                class: 'my-class'
            });

            expect(element.setAttribute).toHaveBeenCalledWith('width', '100');
            expect(element.setAttribute).toHaveBeenCalledWith('height', '50');
            expect(element.setAttribute).toHaveBeenCalledWith('class', 'my-class');
        });

        it('converts numbers to strings', () => {
            const element = {
                setAttribute: jest.fn()
            };

            setAttributes(element as any, { x: 10, y: 20 });

            expect(element.setAttribute).toHaveBeenCalledWith('x', '10');
            expect(element.setAttribute).toHaveBeenCalledWith('y', '20');
        });

        it('handles empty attributes object', () => {
            const element = {
                setAttribute: jest.fn()
            };

            setAttributes(element as any, {});

            expect(element.setAttribute).not.toHaveBeenCalled();
        });
    });
});
