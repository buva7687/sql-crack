export interface UndoManagerOptions<T> {
    maxEntries?: number;
    serialize?: (snapshot: T) => string;
}

export interface UndoManagerState<T> {
    history: T[];
    index: number;
}

function defaultSerialize<T>(snapshot: T): string {
    return JSON.stringify(snapshot);
}

export class UndoManager<T> {
    private readonly maxEntries: number;
    private readonly serialize: (snapshot: T) => string;
    private history: T[] = [];
    private serializedHistory: string[] = [];
    private index = -1;

    constructor(options: UndoManagerOptions<T> = {}) {
        this.maxEntries = Math.max(1, options.maxEntries ?? 50);
        this.serialize = options.serialize ?? defaultSerialize;
    }

    clear(): void {
        this.history = [];
        this.serializedHistory = [];
        this.index = -1;
    }

    initialize(snapshot: T): void {
        this.history = [snapshot];
        this.serializedHistory = [this.serialize(snapshot)];
        this.index = 0;
    }

    record(snapshot: T): void {
        const snapshotSerialized = this.serialize(snapshot);

        if (this.index >= 0) {
            const currentSerialized = this.serializedHistory[this.index];
            if (currentSerialized === snapshotSerialized) {
                return;
            }
        }

        // New action after undo should clear redo branch.
        if (this.index < this.history.length - 1) {
            this.history = this.history.slice(0, this.index + 1);
            this.serializedHistory = this.serializedHistory.slice(0, this.index + 1);
        }

        this.history.push(snapshot);
        this.serializedHistory.push(snapshotSerialized);

        if (this.history.length > this.maxEntries) {
            const overflow = this.history.length - this.maxEntries;
            this.history.splice(0, overflow);
            this.serializedHistory.splice(0, overflow);
            this.index = this.history.length - 1;
            return;
        }

        this.index = this.history.length - 1;
    }

    canUndo(): boolean {
        return this.index > 0;
    }

    canRedo(): boolean {
        return this.index >= 0 && this.index < this.history.length - 1;
    }

    undo(): T | null {
        if (!this.canUndo()) {
            return null;
        }
        this.index -= 1;
        return this.history[this.index] ?? null;
    }

    redo(): T | null {
        if (!this.canRedo()) {
            return null;
        }
        this.index += 1;
        return this.history[this.index] ?? null;
    }

    size(): number {
        return this.history.length;
    }

    getCurrent(): T | null {
        if (this.index < 0) {
            return null;
        }
        return this.history[this.index] ?? null;
    }

    getInitial(): T | null {
        return this.history[0] ?? null;
    }

    exportState(): UndoManagerState<T> {
        return {
            history: [...this.history],
            index: this.index,
        };
    }

    importState(state: UndoManagerState<T>): void {
        if (!Array.isArray(state.history) || !Number.isInteger(state.index)) {
            return;
        }

        this.history = [...state.history];
        this.serializedHistory = this.history.map(snapshot => this.serialize(snapshot));
        this.index = Math.max(-1, Math.min(state.index, this.history.length - 1));
    }
}
