import * as vscode from 'vscode';
import { logger } from '../../logger';
import type { WorkspaceUxMetricMetadata, WorkspaceUxMetricValue } from '../../shared/messages/workspaceMessages';

const UX_METRICS_CONFIG_SECTION = 'sqlCrack.advanced';
const UX_METRICS_CONFIG_KEY = 'workspaceUxInstrumentation';
const SUMMARY_INTERVAL = 12;
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_METADATA_KEYS = 8;
const MAX_STRING_VALUE_LENGTH = 96;

export interface WorkspaceUxMetricsSnapshot {
    instrumentationEnabled: boolean;
    totalEvents: number;
    elapsedSeconds: number;
    topEvents: Array<{ event: string; count: number }>;
}

function sanitizeMetricValue(value: WorkspaceUxMetricValue): WorkspaceUxMetricValue {
    if (typeof value === 'string') {
        return value.length > MAX_STRING_VALUE_LENGTH
            ? value.slice(0, MAX_STRING_VALUE_LENGTH) + '...'
            : value;
    }
    return value;
}

export class WorkspaceUxMetrics {
    private sessionStartedAt = Date.now();
    private totalEvents = 0;
    private readonly counts = new Map<string, number>();

    private isEnabled(): boolean {
        return vscode.workspace
            .getConfiguration(UX_METRICS_CONFIG_SECTION)
            .get<boolean>(UX_METRICS_CONFIG_KEY, false);
    }

    public isInstrumentationEnabled(): boolean {
        return this.isEnabled();
    }

    private sanitizeEventName(event: string): string {
        if (typeof event !== 'string') {
            return '';
        }
        const trimmed = event.trim();
        if (!trimmed) {
            return '';
        }
        const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
        return normalized.slice(0, MAX_EVENT_NAME_LENGTH);
    }

    private sanitizeMetadata(metadata?: WorkspaceUxMetricMetadata): WorkspaceUxMetricMetadata | undefined {
        if (!metadata || typeof metadata !== 'object') {
            return undefined;
        }

        const sanitized: WorkspaceUxMetricMetadata = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (Object.keys(sanitized).length >= MAX_METADATA_KEYS) {
                break;
            }
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = sanitizeMetricValue(value);
            }
        }

        return Object.keys(sanitized).length > 0 ? sanitized : undefined;
    }

    record(event: string, metadata?: WorkspaceUxMetricMetadata): void {
        if (!this.isEnabled()) {
            return;
        }

        const eventName = this.sanitizeEventName(event);
        if (!eventName) {
            return;
        }

        this.totalEvents += 1;
        this.counts.set(eventName, (this.counts.get(eventName) || 0) + 1);

        const safeMetadata = this.sanitizeMetadata(metadata);
        if (safeMetadata) {
            logger.info(`[Workspace UX] event=${eventName} meta=${JSON.stringify(safeMetadata)}`);
        } else {
            logger.info(`[Workspace UX] event=${eventName}`);
        }

        if (this.totalEvents % SUMMARY_INTERVAL === 0) {
            this.logSummary();
        }
    }

    getSnapshot(): WorkspaceUxMetricsSnapshot {
        const elapsedSeconds = Math.max(0, Math.round((Date.now() - this.sessionStartedAt) / 1000));
        const topEvents = Array.from(this.counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([event, count]) => ({ event, count }));

        return {
            instrumentationEnabled: this.isEnabled(),
            totalEvents: this.totalEvents,
            elapsedSeconds,
            topEvents,
        };
    }

    reset(): void {
        this.sessionStartedAt = Date.now();
        this.totalEvents = 0;
        this.counts.clear();
        logger.info('[Workspace UX] session metrics reset');
    }

    private logSummary(): void {
        const snapshot = this.getSnapshot();
        const topEvents = snapshot.topEvents
            .map(({ event, count }) => `${event}:${count}`)
            .join(', ');

        logger.info(`[Workspace UX] summary events=${snapshot.totalEvents} elapsed=${snapshot.elapsedSeconds}s top=[${topEvents}]`);
    }
}
