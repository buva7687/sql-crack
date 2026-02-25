import type { SqlDialect } from './types';

export const HINT_ACTION_EVENT_NAME = 'sql-crack-hint-action';
const SWITCH_DIALECT_PREFIX = 'switchDialect:';

export interface HintActionEventDetail {
    command: string;
}

export type ParsedHintAction =
    | { type: 'switchDialect'; dialect: SqlDialect }
    | { type: 'unsupported' };

export function dispatchHintAction(command: string, eventTarget: EventTarget): void {
    const trimmed = command.trim();
    if (!trimmed) {
        return;
    }

    eventTarget.dispatchEvent(new CustomEvent<HintActionEventDetail>(HINT_ACTION_EVENT_NAME, {
        detail: { command: trimmed },
    }));
}

export function parseHintActionCommand(
    command: string,
    normalizeDialect: (token: string) => SqlDialect | null
): ParsedHintAction {
    const trimmed = command.trim();
    if (!trimmed.startsWith(SWITCH_DIALECT_PREFIX)) {
        return { type: 'unsupported' };
    }

    const dialectToken = trimmed.slice(SWITCH_DIALECT_PREFIX.length).trim();
    const dialect = normalizeDialect(dialectToken);
    if (!dialect) {
        return { type: 'unsupported' };
    }

    return { type: 'switchDialect', dialect };
}
