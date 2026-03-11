import { readFileSync } from 'fs';
import { join } from 'path';

describe('logger.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/logger.ts'), 'utf8');

    describe('singleton pattern', () => {
        it('uses getInstance() for singleton access', () => {
            expect(source).toContain('static getInstance(): Logger');
            expect(source).toContain('if (!Logger.instance)');
            expect(source).toContain('Logger.instance = new Logger()');
        });

        it('exports singleton instance', () => {
            expect(source).toContain('export const logger = Logger.getInstance()');
        });

        it('has private constructor', () => {
            expect(source).toContain('private constructor()');
        });
    });

    describe('log levels', () => {
        it('has info method', () => {
            expect(source).toContain('info(message: string): void');
        });

        it('has log method (alias for info)', () => {
            expect(source).toContain('log(message: string): void');
            expect(source).toContain('this.info(message)');
        });

        it('has warn method', () => {
            expect(source).toContain('warn(message: string): void');
        });

        it('has error method with optional error parameter', () => {
            expect(source).toContain('error(message: string, error?: unknown): void');
        });

        it('has debug method gated by debugEnabled flag', () => {
            expect(source).toContain('debug(message: string): void');
            expect(source).toContain('if (this.debugEnabled)');
        });
    });

    describe('message formatting', () => {
        it('formats messages with timestamp and level', () => {
            expect(source).toContain('formatMessage(level: string, message: string)');
            expect(source).toContain('new Date().toISOString()');
            expect(source).toContain('[${timestamp}] [${level}] ${message}');
        });
    });

    describe('error handling', () => {
        it('extracts error message from Error instances', () => {
            expect(source).toContain('error instanceof Error');
            expect(source).toContain('error.message');
        });

        it('includes stack trace when available', () => {
            expect(source).toContain('if (error.stack)');
            expect(source).toContain('error.stack');
        });

        it('stringifies non-Error error values', () => {
            expect(source).toContain('else if (error !== undefined)');
            expect(source).toContain('String(error)');
        });
    });

    describe('debug logging configuration', () => {
        it('reads debug setting from sqlCrack.advanced.debugLogging', () => {
            expect(source).toContain("getConfiguration('sqlCrack.advanced')");
            expect(source).toContain("get<boolean>('debugLogging', false)");
        });

        it('listens for configuration changes', () => {
            expect(source).toContain('onDidChangeConfiguration');
            expect(source).toContain("e.affectsConfiguration('sqlCrack.advanced.debugLogging')");
            expect(source).toContain('updateDebugSetting()');
        });

        it('updates debug setting when config changes', () => {
            expect(source).toContain('updateDebugSetting(): void');
            expect(source).toContain('this.debugEnabled =');
        });
    });

    describe('initialization', () => {
        it('creates output channel on initialize', () => {
            expect(source).toContain('initialize(context: vscode.ExtensionContext)');
            expect(source).toContain("createOutputChannel('SQL Crack')");
        });

        it('pushes output channel to subscriptions', () => {
            expect(source).toContain('context.subscriptions.push(this.outputChannel)');
        });

        it('updates debug setting on initialize', () => {
            expect(source).toContain('this.updateDebugSetting()');
        });
    });

    describe('show method', () => {
        it('shows the output channel', () => {
            expect(source).toContain('show(): void');
            expect(source).toContain('this.outputChannel?.show()');
        });
    });

    describe('null safety', () => {
        it('checks outputChannel before use in info', () => {
            expect(source).toMatch(/if\s*\(\s*this\.outputChannel\s*\)\s*\{[^}]*appendLine.*INFO/s);
        });

        it('checks outputChannel before use in warn', () => {
            expect(source).toMatch(/if\s*\(\s*this\.outputChannel\s*\)\s*\{[^}]*appendLine.*WARN/s);
        });

        it('checks outputChannel before use in error', () => {
            expect(source).toMatch(/if\s*\(\s*this\.outputChannel\s*\)\s*\{[^}]*appendLine.*ERROR/s);
        });

        it('uses optional chaining in show', () => {
            expect(source).toContain('this.outputChannel?.show()');
        });
    });
});

describe('logger formatMessage output format', () => {
    const source = readFileSync(join(__dirname, '../../src/logger.ts'), 'utf8');

    it('uses ISO timestamp format', () => {
        expect(source).toContain('new Date().toISOString()');
    });

    it('brackets timestamp and level', () => {
        expect(source).toContain('[${timestamp}] [${level}]');
    });

    it('appends message after level', () => {
        expect(source).toContain('${message}');
    });
});

describe('logger error handling edge cases', () => {
    const source = readFileSync(join(__dirname, '../../src/logger.ts'), 'utf8');

    it('handles Error with no stack', () => {
        expect(source).toContain('if (error.stack)');
    });

    it('handles undefined error parameter', () => {
        expect(source).toContain('else if (error !== undefined)');
    });

    it('concatenates error to message with colon separator', () => {
        expect(source).toContain("fullMessage += `: ${error.message}`");
    });
});
