/**
 * Performance Benchmark for SQL Parser
 *
 * Run with: npm run benchmark
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { Parser } = require('node-sql-parser');

interface BenchmarkResult {
    name: string;
    fileSize: number;
    lineCount: number;
    parseTime: number;
    parseTimeAvg: number;
    iterations: number;
    success: boolean;
    error?: string;
}

const ITERATIONS = 10;
const FIXTURES_DIR = path.join(__dirname, '../fixtures/performance');

function readFixture(filename: string): string {
    const filePath = path.join(FIXTURES_DIR, filename);
    return fs.readFileSync(filePath, 'utf-8');
}

function countLines(sql: string): number {
    return sql.split('\n').length;
}

function benchmarkParse(name: string, sql: string, dialect: string = 'MySQL'): BenchmarkResult {
    const parser = new Parser();
    const fileSize = Buffer.byteLength(sql, 'utf-8');
    const lineCount = countLines(sql);

    const times: number[] = [];
    let success = true;
    let error: string | undefined;

    // Warm-up run
    try {
        parser.astify(sql, { database: dialect.toLowerCase() });
    } catch (e) {
        // Try without database option
        try {
            parser.astify(sql);
        } catch (e2) {
            success = false;
            error = (e2 as Error).message;
        }
    }

    if (success) {
        // Benchmark runs
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            try {
                parser.astify(sql, { database: dialect.toLowerCase() });
            } catch {
                parser.astify(sql);
            }
            const end = performance.now();
            times.push(end - start);
        }
    }

    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = times.length > 0 ? totalTime / times.length : 0;

    return {
        name,
        fileSize,
        lineCount,
        parseTime: totalTime,
        parseTimeAvg: avgTime,
        iterations: ITERATIONS,
        success,
        error
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(1)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

async function runBenchmarks() {
    console.log('='.repeat(70));
    console.log('SQL Parser Performance Benchmark');
    console.log('='.repeat(70));
    console.log(`Iterations per test: ${ITERATIONS}`);
    console.log(`Date: ${new Date().toISOString()}`);
    console.log('');

    const fixtures = [
        { file: 'small-query.sql', name: 'Small Query' },
        { file: 'medium-query.sql', name: 'Medium Query' },
        { file: 'large-query.sql', name: 'Large Query' }
    ];

    const results: BenchmarkResult[] = [];

    for (const fixture of fixtures) {
        try {
            const sql = readFixture(fixture.file);
            console.log(`\nBenchmarking: ${fixture.name}`);
            console.log('-'.repeat(40));

            const result = benchmarkParse(fixture.name, sql);
            results.push(result);

            console.log(`  File size:    ${formatBytes(result.fileSize)}`);
            console.log(`  Line count:   ${result.lineCount}`);
            console.log(`  Parse status: ${result.success ? '✓ Success' : '✗ Failed'}`);
            if (result.success) {
                console.log(`  Avg parse:    ${formatTime(result.parseTimeAvg)}`);
                console.log(`  Total (${ITERATIONS}x): ${formatTime(result.parseTime)}`);
            } else {
                console.log(`  Error: ${result.error}`);
            }
        } catch (e) {
            console.log(`  Error loading fixture: ${(e as Error).message}`);
        }
    }

    // Summary table
    console.log('\n' + '='.repeat(70));
    console.log('Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log('| Query        | Size     | Lines | Avg Parse Time | Status |');
    console.log('|--------------|----------|-------|----------------|--------|');

    for (const r of results) {
        const status = r.success ? '✓' : '✗';
        const time = r.success ? formatTime(r.parseTimeAvg) : 'N/A';
        console.log(`| ${r.name.padEnd(12)} | ${formatBytes(r.fileSize).padEnd(8)} | ${r.lineCount.toString().padEnd(5)} | ${time.padEnd(14)} | ${status.padEnd(6)} |`);
    }

    console.log('');
    console.log('Note: Render time must be measured in browser DevTools.');
    console.log('Open extension, press F12, and check console for render timings.');
}

runBenchmarks().catch(console.error);
