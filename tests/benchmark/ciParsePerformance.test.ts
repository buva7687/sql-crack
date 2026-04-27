import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_VALIDATION_LIMITS, parseSql, parseSqlBatch } from '../../src/webview/sqlParser';
import type { SqlDialect } from '../../src/webview/types/parser';

type FixtureMode = 'single' | 'batch';

interface PerformanceFixture {
    name: string;
    fixturePath: string;
    mode: FixtureMode;
    dialect: SqlDialect;
    baselineMs: number;
    minSuccessRate?: number;
}

interface PerformanceRunResult {
    medianMs: number;
    durationsMs: number[];
    successRate: number;
    queryCount: number;
}

const SAMPLE_COUNT = 3;
const PERF_BUDGET_MULTIPLIER = Number(process.env.SQL_CRACK_PERF_MAX_MULTIPLIER ?? '1.2');

const FIXTURES: PerformanceFixture[] = [
    {
        name: 'small query fixture',
        fixturePath: path.join(__dirname, '../fixtures/performance/small-query.sql'),
        mode: 'single',
        dialect: 'MySQL',
        baselineMs: 80,
    },
    {
        name: 'medium query fixture',
        fixturePath: path.join(__dirname, '../fixtures/performance/medium-query.sql'),
        mode: 'single',
        dialect: 'PostgreSQL',
        baselineMs: 140,
    },
    {
        name: 'large query fixture',
        fixturePath: path.join(__dirname, '../fixtures/performance/large-query.sql'),
        mode: 'single',
        dialect: 'PostgreSQL',
        baselineMs: 260,
    },
    {
        name: 'batch fixture',
        fixturePath: path.join(__dirname, '../fixtures/refactor/diverse-queries.sql'),
        mode: 'batch',
        dialect: 'PostgreSQL',
        baselineMs: 900,
        minSuccessRate: 0.95,
    },
    {
        name: 'dbt model fixture',
        fixturePath: path.join(__dirname, '../fixtures/performance/dbt-model.sql'),
        mode: 'single',
        dialect: 'MySQL',
        baselineMs: 120,
    },
];

function readFixture(fixturePath: string): string {
    return fs.readFileSync(fixturePath, 'utf8');
}

function median(values: number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
}

function runFixtureOnce(fixture: PerformanceFixture, sql: string): { successRate: number; queryCount: number } {
    if (fixture.mode === 'batch') {
        const result = parseSqlBatch(sql, fixture.dialect, DEFAULT_VALIDATION_LIMITS, {});
        const successCount = result.queries.filter((query) => !query.error).length;
        const queryCount = result.queries.length;
        return {
            successRate: queryCount === 0 ? 0 : successCount / queryCount,
            queryCount,
        };
    }

    const result = parseSql(sql, fixture.dialect);
    return {
        successRate: result.error ? 0 : 1,
        queryCount: 1,
    };
}

function benchmarkFixture(fixture: PerformanceFixture): PerformanceRunResult {
    const sql = readFixture(fixture.fixturePath);

    // Warm up the parser path once before timing to reduce cold-start noise.
    runFixtureOnce(fixture, sql);

    const durationsMs: number[] = [];
    let latestResult = runFixtureOnce(fixture, sql);

    for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
        const start = performance.now();
        latestResult = runFixtureOnce(fixture, sql);
        durationsMs.push(performance.now() - start);
    }

    return {
        medianMs: median(durationsMs),
        durationsMs,
        successRate: latestResult.successRate,
        queryCount: latestResult.queryCount,
    };
}

function getBudgetMs(fixture: PerformanceFixture): number {
    return Math.round(fixture.baselineMs * PERF_BUDGET_MULTIPLIER);
}

describe('CI parse performance gate', () => {
    jest.setTimeout(30000);

    FIXTURES.forEach((fixture) => {
        it(`${fixture.name} stays within the CI performance budget`, () => {
            const run = benchmarkFixture(fixture);
            const budgetMs = getBudgetMs(fixture);
            const minSuccessRate = fixture.minSuccessRate ?? 1;

            console.log(
                `[perf] ${fixture.name}: median ${run.medianMs.toFixed(2)}ms `
                + `(samples: ${run.durationsMs.map((value) => value.toFixed(2)).join(', ')}; `
                + `budget: ${budgetMs}ms; success: ${(run.successRate * 100).toFixed(1)}%)`
            );

            expect(run.queryCount).toBeGreaterThan(0);
            expect(run.successRate).toBeGreaterThanOrEqual(minSuccessRate);
            expect(run.medianMs).toBeLessThanOrEqual(budgetMs);
        });
    });
});
