import { prepareSvgForExport } from '../../../src/webview/features/export/svgPreparation';

class FakeElement {
    public readonly attributes = new Map<string, string>();
    public readonly children: FakeElement[] = [];
    public readonly styleValues = new Map<string, string>();
    public parent: FakeElement | null = null;
    public textContent = '';

    constructor(
        public readonly tagName: string,
        public readonly classList: string[] = []
    ) {}

    get firstChild(): FakeElement | null {
        return this.children[0] || null;
    }

    get style() {
        return {
            setProperty: (property: string, value: string) => {
                this.styleValues.set(property, value);
            },
        };
    }

    appendChild(child: FakeElement): FakeElement {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
        child.parent = this;
        const index = reference ? this.children.indexOf(reference) : -1;
        if (index < 0) {
            this.children.push(child);
        } else {
            this.children.splice(index, 0, child);
        }
        return child;
    }

    remove(): void {
        if (!this.parent) {
            return;
        }
        const index = this.parent.children.indexOf(this);
        if (index >= 0) {
            this.parent.children.splice(index, 1);
        }
        this.parent = null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    cloneNode(deep: boolean): FakeElement {
        const clone = new FakeElement(this.tagName, [...this.classList]);
        this.attributes.forEach((value, key) => clone.attributes.set(key, value));
        this.styleValues.forEach((value, key) => clone.styleValues.set(key, value));
        clone.textContent = this.textContent;
        if (deep) {
            this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
        }
        return clone;
    }

    querySelector(selector: string): FakeElement | null {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector: string): FakeElement[] {
        const matches: FakeElement[] = [];
        const visit = (element: FakeElement) => {
            if (element.matches(selector)) {
                matches.push(element);
            }
            element.children.forEach(visit);
        };
        this.children.forEach(visit);
        return matches;
    }

    private matches(selector: string): boolean {
        if (selector === this.tagName || selector.toLowerCase() === this.tagName.toLowerCase()) {
            return true;
        }
        if (selector.startsWith('.')) {
            return this.classList.includes(selector.slice(1));
        }
        const dataIdMatch = selector.match(/^\[data-id="(.+)"\]$/);
        return Boolean(dataIdMatch && this.getAttribute('data-id') === dataIdMatch[1]);
    }
}

describe('prepareSvgForExport behavior', () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalCss = global.CSS;

    beforeEach(() => {
        (global as any).document = {
            createElementNS: (_namespace: string, tagName: string) => new FakeElement(tagName),
            querySelector: jest.fn(() => null),
        };
        (global as any).window = {
            debugLogging: false,
            getComputedStyle: (element: FakeElement) => ({
                getPropertyValue: (property: string) => (
                    property === 'fill' ? '#computed-fill' :
                    property === 'font-size' && element.getAttribute('data-id') === 'node-1' ? '14px' :
                    ''
                ),
            }),
        };
        (global as any).CSS = { escape: (value: string) => value };
    });

    afterEach(() => {
        (global as any).document = originalDocument;
        (global as any).window = originalWindow;
        (global as any).CSS = originalCss;
    });

    it('caps dimensions, resets transforms, strips foreign objects, and preserves SVG attributes', () => {
        const svg = new FakeElement('svg');
        const mainGroup = svg.appendChild(new FakeElement('g', ['main-group']));
        mainGroup.setAttribute('transform', 'translate(10,20) scale(2)');
        const node = mainGroup.appendChild(new FakeElement('rect', ['node-rect']));
        node.setAttribute('data-id', 'node-1');
        node.setAttribute('fill', '#123456');
        mainGroup.appendChild(new FakeElement('foreignObject'));

        const result = prepareSvgForExport(
            svg as unknown as SVGSVGElement,
            () => ({ minX: 0, minY: 0, width: 5000, height: 1000 })
        );
        const clone = result.svgClone as unknown as FakeElement;
        const clonedGroup = clone.querySelector('g')!;
        const clonedNode = clone.querySelector('[data-id="node-1"]')!;

        expect(result.width).toBe(4096);
        expect(result.height).toBeLessThan(1000);
        expect(clone.getAttribute('viewBox')).toBe('-40 -40 5080 1080');
        expect(clone.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
        expect(clonedGroup.getAttribute('transform')).toBeNull();
        expect(clone.querySelectorAll('foreignObject')).toHaveLength(0);
        expect(clone.firstChild?.tagName).toBe('style');
        expect(clonedNode.getAttribute('fill')).toBe('#123456');
        expect(clonedNode.styleValues.get('fill')).toBeUndefined();
        expect(clonedNode.styleValues.get('font-size')).toBe('14px');
    });
});
