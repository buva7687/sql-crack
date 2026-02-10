import { UndoManager } from '../../../../src/webview/ui/undoManager';

describe('UndoManager', () => {
    interface Snapshot {
        step: number;
        x: number;
    }

    function snap(step: number): Snapshot {
        return { step, x: step * 10 };
    }

    it('walks backwards and forwards through recorded states', () => {
        const manager = new UndoManager<Snapshot>({ maxEntries: 50 });
        manager.initialize(snap(0));
        manager.record(snap(1));
        manager.record(snap(2));

        expect(manager.canUndo()).toBe(true);
        expect(manager.undo()).toEqual(snap(1));
        expect(manager.undo()).toEqual(snap(0));
        expect(manager.canUndo()).toBe(false);

        expect(manager.canRedo()).toBe(true);
        expect(manager.redo()).toEqual(snap(1));
        expect(manager.redo()).toEqual(snap(2));
        expect(manager.canRedo()).toBe(false);
    });

    it('clears redo branch when recording a new action after undo', () => {
        const manager = new UndoManager<Snapshot>();
        manager.initialize(snap(0));
        manager.record(snap(1));
        manager.record(snap(2));

        expect(manager.undo()).toEqual(snap(1));
        manager.record(snap(3));

        expect(manager.canRedo()).toBe(false);
        expect(manager.getCurrent()).toEqual(snap(3));
    });

    it('drops oldest entries after max history limit is exceeded', () => {
        const manager = new UndoManager<Snapshot>({ maxEntries: 3 });
        manager.initialize(snap(0));
        manager.record(snap(1));
        manager.record(snap(2));
        manager.record(snap(3));

        expect(manager.size()).toBe(3);
        expect(manager.undo()).toEqual(snap(2));
        expect(manager.undo()).toEqual(snap(1));
        expect(manager.undo()).toBeNull();
    });

    it('does not add duplicate snapshots', () => {
        const manager = new UndoManager<Snapshot>();
        manager.initialize(snap(0));
        manager.record(snap(0));
        expect(manager.size()).toBe(1);
    });

    it('clears all history', () => {
        const manager = new UndoManager<Snapshot>();
        manager.initialize(snap(0));
        manager.record(snap(1));
        manager.clear();

        expect(manager.size()).toBe(0);
        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(false);
    });
});
