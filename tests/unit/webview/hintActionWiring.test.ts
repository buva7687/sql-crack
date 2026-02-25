import { dispatchHintAction, parseHintActionCommand, HINT_ACTION_EVENT_NAME } from '../../../src/webview/hintActions';
import { SqlDialect } from '../../../src/webview/types';

describe('hint action wiring', () => {
    beforeAll(() => {
        if (typeof globalThis.CustomEvent === 'undefined') {
            class TestCustomEvent<T = unknown> extends Event {
                detail: T;

                constructor(type: string, eventInitDict?: CustomEventInit<T>) {
                    super(type, eventInitDict);
                    this.detail = eventInitDict?.detail as T;
                }
            }
            (globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = TestCustomEvent as unknown as typeof CustomEvent;
        }
    });

    const normalizeDialect = (token: string): SqlDialect | null => {
        const map: Record<string, SqlDialect> = {
            mysql: 'MySQL',
            postgresql: 'PostgreSQL',
            postgres: 'PostgreSQL',
            transactsql: 'TransactSQL',
            'sql server': 'TransactSQL',
            sqlserver: 'TransactSQL',
            snowflake: 'Snowflake',
            bigquery: 'BigQuery',
            redshift: 'Redshift',
            hive: 'Hive',
            athena: 'Athena',
            trino: 'Trino',
            mariadb: 'MariaDB',
            sqlite: 'SQLite',
            oracle: 'Oracle',
            teradata: 'Teradata',
        };
        return map[token.trim().toLowerCase()] ?? null;
    };

    it('parses switchDialect commands into a typed action', () => {
        const parsed = parseHintActionCommand('switchDialect: PostgreSQL', normalizeDialect);
        expect(parsed).toEqual({ type: 'switchDialect', dialect: 'PostgreSQL' });
    });

    it('treats unknown commands as unsupported', () => {
        expect(parseHintActionCommand('focusNode:users', normalizeDialect)).toEqual({ type: 'unsupported' });
        expect(parseHintActionCommand('switchDialect: unknown', normalizeDialect)).toEqual({ type: 'unsupported' });
    });

    it('dispatches normalized hint action events to the provided event target', () => {
        const dispatchEvent = jest.fn((event: Event) => Boolean(event));
        const target = { dispatchEvent } as unknown as EventTarget;

        dispatchHintAction('  switchDialect:MySQL  ', target);

        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        const event = dispatchEvent.mock.calls[0]?.[0] as unknown as CustomEvent<{ command: string }>;
        expect(event.type).toBe(HINT_ACTION_EVENT_NAME);
        expect(event.detail.command).toBe('switchDialect:MySQL');
    });
});
