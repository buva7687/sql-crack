import * as vscode from 'vscode';

/**
 * Logger utility using VS Code's OutputChannel for proper extension logging.
 * Provides log, info, warn, error, and debug methods.
 */
class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel | null = null;
    private debugEnabled: boolean = false;
    private preInitBuffer: string[] = [];

    private constructor() {}

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Initialize the logger with an OutputChannel.
     * Call this in the extension's activate function.
     */
    initialize(context: vscode.ExtensionContext): void {
        if (this.outputChannel) {
            return;
        }
        this.outputChannel = vscode.window.createOutputChannel('SQL Crack');
        context.subscriptions.push(this.outputChannel);
        this.updateDebugSetting();

        // Flush any messages logged before initialization
        if (this.preInitBuffer.length > 0) {
            for (const msg of this.preInitBuffer) {
                this.outputChannel.appendLine(msg);
            }
            this.preInitBuffer = [];
        }

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('sqlCrack.advanced.debugLogging')) {
                    this.updateDebugSetting();
                }
            })
        );
    }

    private updateDebugSetting(): void {
        const config = vscode.workspace.getConfiguration('sqlCrack.advanced');
        this.debugEnabled = config.get<boolean>('debugLogging', false);
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    private appendOrBuffer(formatted: string): void {
        if (this.outputChannel) {
            this.outputChannel.appendLine(formatted);
        } else {
            this.preInitBuffer.push(formatted);
        }
    }

    /**
     * Log an info message
     */
    info(message: string): void {
        this.appendOrBuffer(this.formatMessage('INFO', message));
    }

    /**
     * Log a general message (alias for info)
     */
    log(message: string): void {
        this.info(message);
    }

    /**
     * Log a warning message
     */
    warn(message: string): void {
        this.appendOrBuffer(this.formatMessage('WARN', message));
    }

    /**
     * Log an error message
     */
    error(message: string, error?: unknown): void {
        let fullMessage = message;
        if (error instanceof Error) {
            fullMessage += `: ${error.message}`;
            if (error.stack) {
                fullMessage += `\n${error.stack}`;
            }
        } else if (error !== undefined) {
            fullMessage += `: ${String(error)}`;
        }
        this.appendOrBuffer(this.formatMessage('ERROR', fullMessage));
    }

    /**
     * Log a debug message (only when debug logging is enabled)
     */
    debug(message: string): void {
        if (this.debugEnabled) {
            this.appendOrBuffer(this.formatMessage('DEBUG', message));
        }
    }

    /**
     * Show the output channel to the user
     */
    show(): void {
        this.outputChannel?.show();
    }

    /** Reset internal state. Intended for test isolation only. */
    _reset(): void {
        this.outputChannel = null;
        this.debugEnabled = false;
        this.preInitBuffer = [];
    }
}

export const logger = Logger.getInstance();
