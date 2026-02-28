import { pulseNodeFeature, pulseNodeInCloudFeature } from '../../../src/webview/interaction/nodePulse';

function createRect(initial: Record<string, string> = {}) {
    const attrs = new Map<string, string>(Object.entries(initial));
    return {
        style: {
            animation: '',
            transition: '',
        },
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        removeAttribute: jest.fn((name: string) => {
            attrs.delete(name);
        }),
    };
}

function createGroup(rect: any) {
    return {
        querySelector: jest.fn((selector: string) => {
            if (selector === '.node-rect' || selector === 'rect') {
                return rect;
            }
            return null;
        }),
    };
}

describe('nodePulse interaction helpers', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        (global as any).document = {
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => ({
                id: '',
                textContent: '',
            })),
            head: {
                appendChild: jest.fn(),
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
        delete (global as any).document;
        delete (global as any).window;
    });

    it('pulses a selected node and restores selected styling after animation', () => {
        const rect = createRect({ stroke: '#123456', 'stroke-width': '2' });
        const mainGroup = {
            querySelector: jest.fn((selector: string) => {
                if (selector === '.node[data-id="n1"]') {
                    return createGroup(rect);
                }
                return null;
            }),
        } as any;

        pulseNodeFeature({
            nodeId: 'n1',
            mainGroup,
            selectedNodeId: 'n1',
            isDarkTheme: true,
        });

        expect(rect.style.animation).toContain('node-pulse');
        jest.advanceTimersByTime(600);
        expect(rect.style.animation).toBe('');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke', '#ffffff');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke-width', '3');
        expect(rect.setAttribute).toHaveBeenCalledWith('filter', 'url(#glow)');
    });

    it('restores original stroke attributes for unselected nodes', () => {
        const rect = createRect({ stroke: '#123456', 'stroke-width': '2' });
        const mainGroup = {
            querySelector: jest.fn(() => createGroup(rect)),
        } as any;

        pulseNodeFeature({
            nodeId: 'n2',
            mainGroup,
            selectedNodeId: null,
            isDarkTheme: false,
        });

        jest.advanceTimersByTime(600);
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke', '#123456');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke-width', '2');
        expect(rect.setAttribute).toHaveBeenCalledWith('filter', 'url(#shadow)');
    });

    it('skips animation and restores immediately when reduced motion is enabled', () => {
        (global as any).window = {
            matchMedia: jest.fn(() => ({ matches: true })),
        };

        const rect = createRect({ stroke: '#123456', 'stroke-width': '2' });
        const mainGroup = {
            querySelector: jest.fn(() => createGroup(rect)),
        } as any;

        pulseNodeFeature({
            nodeId: 'n3',
            mainGroup,
            selectedNodeId: null,
            isDarkTheme: true,
        });

        expect(rect.style.animation).toBe('');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke', '#123456');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke-width', '2');
    });

    it('pulses cloud subnodes and restores their original styling after both timers', () => {
        const rect = createRect({ stroke: '#999999', 'stroke-width': '2', filter: 'url(#shadow)' });
        const cloudGroup = {
            querySelector: jest.fn((selector: string) => {
                if (selector === '.cloud-subflow-node[data-node-id="child"]') {
                    return createGroup(rect);
                }
                return null;
            }),
        };
        const mainGroup = {
            querySelector: jest.fn((selector: string) => {
                if (selector === '.cloud-container[data-node-id="parent"]') {
                    return cloudGroup;
                }
                return null;
            }),
        } as any;

        pulseNodeInCloudFeature({
            subNodeId: 'child',
            parentNodeId: 'parent',
            mainGroup,
            isDarkTheme: true,
        });

        expect(rect.style.animation).toBe('cloud-node-pulse 1.5s ease-in-out');
        jest.advanceTimersByTime(1500);
        expect(rect.style.animation).toBe('');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke-width', '3');

        jest.advanceTimersByTime(2000);
        expect(rect.style.transition).toContain('stroke 0.5s ease');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke', '#999999');
        expect(rect.setAttribute).toHaveBeenCalledWith('stroke-width', '2');
        expect(rect.setAttribute).toHaveBeenCalledWith('filter', 'url(#shadow)');

        jest.advanceTimersByTime(500);
        expect(rect.style.transition).toBe('');
    });
});
