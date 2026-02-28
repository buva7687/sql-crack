import { initCanvas, updateCanvasTheme } from '../../../src/webview/rendering/canvasSetup';

type FakeElement = {
    tagName: string;
    style: {
        background: string;
        cursor: string;
        position: string;
        top: string;
        left: string;
        zIndex: string;
        outline: string;
        touchAction: string;
    };
    innerHTML: string;
    children: FakeElement[];
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
};

function createElement(tagName: string): FakeElement {
    const attrs = new Map<string, string>();
    const el: FakeElement = {
        tagName,
        style: {
            background: '',
            cursor: '',
            position: '',
            top: '',
            left: '',
            zIndex: '',
            outline: '',
            touchAction: '',
        },
        innerHTML: '',
        children: [] as any[],
        appendChild: jest.fn((child: any) => {
            el.children.push(child);
            return child;
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        querySelector: jest.fn((selector: string): FakeElement | null => {
            if (selector === 'defs') {
                return el.children.find((child: FakeElement) => child.tagName === 'defs') || null;
            }
            return null;
        }),
    };
    return el;
}

let element: ReturnType<typeof createElement>;

describe('canvasSetup', () => {
    beforeEach(() => {
        (global as any).document = {
            createElementNS: jest.fn((_ns: string, tag: string) => {
                element = createElement(tag);
                return element;
            }),
        };
    });

    afterEach(() => {
        delete (global as any).document;
    });

    it('initializes an accessible svg canvas with defs, background, and main group', () => {
        const container = { appendChild: jest.fn() } as any;

        const { svg, mainGroup, backgroundRect } = initCanvas(container, true, 'dots');
        const svgElement = svg as unknown as FakeElement;

        expect(svg.getAttribute('tabindex')).toBe('0');
        expect(svg.getAttribute('role')).toBe('group');
        expect(svg.getAttribute('aria-label')).toBe('SQL query flow diagram');
        expect(svg.style.background).toBe('#111111');
        expect(container.appendChild).toHaveBeenCalledWith(svg);
        expect(svgElement.children.some((child: FakeElement) => child.tagName === 'defs')).toBe(true);
        expect(backgroundRect.getAttribute('fill')).toBe('url(#grid-pattern)');
        expect(svgElement.children).toContain(mainGroup as unknown as FakeElement);
        const defs = svgElement.children.find((child: FakeElement) => child.tagName === 'defs');
        expect(defs).toBeDefined();
        expect(defs!.innerHTML).toContain('grid-pattern');
        expect(defs!.innerHTML).toContain('arrowhead');
    });

    it('updates background and defs when the theme or grid style changes', () => {
        const container = { appendChild: jest.fn() } as any;
        const { svg, backgroundRect } = initCanvas(container, true, 'dots');
        const defs = svg.querySelector('defs');
        expect(defs).not.toBeNull();

        updateCanvasTheme(svg, backgroundRect, false, 'none');

        expect(svg.style.background).toBe('#FAFAFA');
        expect(backgroundRect.getAttribute('fill')).toBe('#FAFAFA');
        expect(defs!.innerHTML).not.toContain('grid-pattern');
    });
});
