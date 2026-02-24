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

    it('reuses cached serialization for current state comparisons', () => {
        const serialize = jest.fn((snapshot: Snapshot) => JSON.stringify(snapshot));
        const manager = new UndoManager<Snapshot>({ serialize });

        manager.initialize(snap(0));
        manager.record(snap(1));
        manager.record(snap(2));

        expect(serialize).toHaveBeenCalledTimes(3);
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

    describe('getInitial()', () => {
        it('returns the first snapshot recorded via initialize()', () => {
            const manager = new UndoManager<Snapshot>();
            manager.initialize(snap(0));
            manager.record(snap(1));
            manager.record(snap(2));

            expect(manager.getInitial()).toEqual(snap(0));
        });

        it('returns the first snapshot even after undo/redo', () => {
            const manager = new UndoManager<Snapshot>();
            manager.initialize(snap(0));
            manager.record(snap(1));
            manager.undo();
            manager.record(snap(2));

            expect(manager.getInitial()).toEqual(snap(0));
        });

        it('returns null when history is empty', () => {
            const manager = new UndoManager<Snapshot>();
            expect(manager.getInitial()).toBeNull();
        });

        it('returns null after clear()', () => {
            const manager = new UndoManager<Snapshot>();
            manager.initialize(snap(0));
            manager.clear();

            expect(manager.getInitial()).toBeNull();
        });

        it('returns oldest surviving entry after max history eviction', () => {
            const manager = new UndoManager<Snapshot>({ maxEntries: 2 });
            manager.initialize(snap(0));
            manager.record(snap(1));
            manager.record(snap(2));

            // snap(0) was evicted, snap(1) is now the oldest
            expect(manager.getInitial()).toEqual(snap(1));
        });
    });

    describe('state import/export', () => {
        it('round-trips history and cursor position via exportState/importState', () => {
            const sourceManager = new UndoManager<Snapshot>();
            sourceManager.initialize(snap(0));
            sourceManager.record(snap(1));
            sourceManager.record(snap(2));
            sourceManager.undo(); // cursor at snap(1)

            const state = sourceManager.exportState();

            const restoredManager = new UndoManager<Snapshot>();
            restoredManager.importState(state);

            expect(restoredManager.getInitial()).toEqual(snap(0));
            expect(restoredManager.getCurrent()).toEqual(snap(1));
            expect(restoredManager.canUndo()).toBe(true);
            expect(restoredManager.canRedo()).toBe(true);
            expect(restoredManager.redo()).toEqual(snap(2));
        });

        it('clamps imported index to valid range', () => {
            const manager = new UndoManager<Snapshot>();

            manager.importState({
                history: [snap(0), snap(1)],
                index: 999,
            });
            expect(manager.getCurrent()).toEqual(snap(1));

            manager.importState({
                history: [snap(0), snap(1)],
                index: -999,
            });
            expect(manager.getCurrent()).toBeNull();
        });

        it('ignores invalid imported state payloads', () => {
            const manager = new UndoManager<Snapshot>();
            manager.initialize(snap(0));

            manager.importState({ history: null as unknown as Snapshot[], index: 0 });
            expect(manager.getCurrent()).toEqual(snap(0));

            manager.importState({ history: [snap(0)], index: 1.5 });
            expect(manager.getCurrent()).toEqual(snap(0));
        });
    });
});
