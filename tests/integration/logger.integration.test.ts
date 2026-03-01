import * as vscodeMock from '../__mocks__/vscode';

const { logger } = require('../../src/logger');

describe('Logger', () => {
    let mockOutputChannel: any;

    beforeEach(() => {
        jest.clearAllMocks();
        vscodeMock.__resetStorage();
        
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            clear: jest.fn(),
            append: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        };
        
        (vscodeMock.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
        
        const context = vscodeMock.createMockExtensionContext();
        logger.initialize(context);
    });

    describe('singleton pattern', () => {
        it('returns the same instance', () => {
            const { logger: logger2 } = require('../../src/logger');
            expect(logger).toBe(logger2);
        });
    });

    describe('info', () => {
        it('appends formatted message to output channel', () => {
            logger.info('test message');
            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[INFO]');
            expect(call).toContain('test message');
        });

        it('includes ISO timestamp', () => {
            logger.info('test');
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });

    describe('log', () => {
        it('delegates to info', () => {
            logger.log('test log');
            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[INFO]');
            expect(call).toContain('test log');
        });
    });

    describe('warn', () => {
        it('appends formatted warning message', () => {
            logger.warn('warning message');
            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[WARN]');
            expect(call).toContain('warning message');
        });
    });

    describe('error', () => {
        it('appends formatted error message', () => {
            logger.error('error message');
            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[ERROR]');
            expect(call).toContain('error message');
        });

        it('includes Error message and stack', () => {
            const error = new Error('test error');
            error.stack = 'test stack trace';
            logger.error('failed', error);
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('test error');
            expect(call).toContain('test stack trace');
        });

        it('stringifies non-Error error values', () => {
            logger.error('failed', 'string error');
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('string error');
        });

        it('handles undefined error parameter', () => {
            logger.error('failed', undefined);
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[ERROR]');
            expect(call).toContain('failed');
        });

        it('handles Error without stack', () => {
            const error = new Error('no stack');
            delete error.stack;
            logger.error('failed', error);
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('no stack');
        });

        it('handles number error values', () => {
            logger.error('failed', 42);
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('42');
        });

        it('handles null error values', () => {
            logger.error('failed', null);
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('null');
        });
    });

    describe('debug', () => {
        it('does not log when debug disabled', () => {
            vscodeMock.__setMockConfig('sqlCrack.advanced', { debugLogging: false });
            const context = vscodeMock.createMockExtensionContext();
            logger.initialize(context);
            logger.debug('debug message');
            expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
        });

        it('logs when debug enabled', () => {
            vscodeMock.__setMockConfig('sqlCrack.advanced', { debugLogging: true });
            const context = vscodeMock.createMockExtensionContext();
            logger.initialize(context);
            logger.debug('debug message');
            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
            const call = mockOutputChannel.appendLine.mock.calls[0][0];
            expect(call).toContain('[DEBUG]');
        });
    });

    describe('show', () => {
        it('shows the output channel', () => {
            logger.show();
            expect(mockOutputChannel.show).toHaveBeenCalled();
        });
    });

    describe('null safety', () => {
        it('handles calls before initialization gracefully', () => {
            jest.resetModules();
            const freshLogger = require('../../src/logger').logger;
            freshLogger.info('test');
            freshLogger.warn('test');
            freshLogger.error('test');
            freshLogger.debug('test');
            freshLogger.show();
        });
    });
});
