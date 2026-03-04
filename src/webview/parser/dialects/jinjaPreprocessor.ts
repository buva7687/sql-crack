function createCommentMask(sql: string): boolean[] {
    const mask = new Array<boolean>(sql.length).fill(false);
    let i = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inBracketIdentifier = false;

    while (i < sql.length) {
        const char = sql[i];
        const next = sql[i + 1];

        if (inSingleQuote) {
            if (char === '\'' && next === '\'') {
                i += 2;
                continue;
            }
            if (char === '\'') {
                inSingleQuote = false;
            }
            i++;
            continue;
        }

        if (inDoubleQuote) {
            if (char === '"') {
                inDoubleQuote = false;
            }
            i++;
            continue;
        }

        if (inBacktick) {
            if (char === '`') {
                inBacktick = false;
            }
            i++;
            continue;
        }

        if (inBracketIdentifier) {
            if (char === ']') {
                inBracketIdentifier = false;
            }
            i++;
            continue;
        }

        if (char === '\'') {
            inSingleQuote = true;
            i++;
            continue;
        }

        if (char === '"') {
            inDoubleQuote = true;
            i++;
            continue;
        }

        if (char === '`') {
            inBacktick = true;
            i++;
            continue;
        }

        if (char === '[') {
            inBracketIdentifier = true;
            i++;
            continue;
        }

        if (char === '-' && next === '-') {
            mask[i] = true;
            mask[i + 1] = true;
            i += 2;
            while (i < sql.length && sql[i] !== '\n') {
                mask[i] = true;
                i++;
            }
            continue;
        }

        if (char === '/' && next === '*') {
            mask[i] = true;
            mask[i + 1] = true;
            i += 2;
            while (i < sql.length) {
                mask[i] = true;
                if (sql[i] === '*' && sql[i + 1] === '/') {
                    mask[i + 1] = true;
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        if (char === '#' && sql[i - 1] !== '{' && next !== '}') {
            mask[i] = true;
            i++;
            while (i < sql.length && sql[i] !== '\n') {
                mask[i] = true;
                i++;
            }
            continue;
        }

        i++;
    }

    return mask;
}

function whitespacePreserving(segment: string): string {
    return segment.replace(/[^\n]/g, ' ');
}

function replacePreservingNewlines(segment: string, replacement: string): string {
    if (!segment.includes('\n')) {
        return replacement.padEnd(segment.length, ' ').slice(0, segment.length);
    }

    const chars = whitespacePreserving(segment).split('');
    let replacementIndex = 0;

    for (let i = 0; i < chars.length && replacementIndex < replacement.length; i++) {
        if (chars[i] === '\n') {
            continue;
        }
        chars[i] = replacement[replacementIndex];
        replacementIndex++;
    }

    return chars.join('');
}

function applyReplacement(
    output: string[],
    ignored: boolean[],
    start: number,
    end: number,
    replacement?: string
): void {
    if (start >= end) {
        return;
    }

    const segment = output.slice(start, end).join('');
    const rewritten = replacement === undefined
        ? whitespacePreserving(segment)
        : replacePreservingNewlines(segment, replacement);

    for (let i = start; i < end; i++) {
        output[i] = rewritten[i - start];
        ignored[i] = true;
    }
}

function canStartTag(sql: string, ignored: boolean[], index: number, opener: string): boolean {
    if (!sql.startsWith(opener, index)) {
        return false;
    }

    for (let i = 0; i < opener.length; i++) {
        if (ignored[index + i]) {
            return false;
        }
    }

    if (sql[index - 1] === '$') {
        return false;
    }

    if (opener === '{{') {
        const recentPrefix = sql.slice(Math.max(0, index - 32), index);
        if (/\$\{[^}]*\}$/.test(recentPrefix)) {
            return false;
        }
    }

    return true;
}

function findClosingTag(sql: string, ignored: boolean[], start: number, closer: string): number {
    for (let i = start; i <= sql.length - closer.length; i++) {
        let available = true;
        for (let j = 0; j < closer.length; j++) {
            if (ignored[i + j]) {
                available = false;
                break;
            }
        }
        if (!available) {
            continue;
        }
        if (sql.startsWith(closer, i)) {
            return i;
        }
    }

    return -1;
}

type BlockKind = 'if' | 'for' | 'macro';

interface BlockFrame {
    type: BlockKind;
    keeping?: boolean;
}

interface BlockTag {
    start: number;
    end: number;
    keyword: string;
}

function parseBlockTags(sql: string, ignored: boolean[]): BlockTag[] {
    const tags: BlockTag[] = [];

    for (let i = 0; i < sql.length - 1; i++) {
        if (!canStartTag(sql, ignored, i, '{%')) {
            continue;
        }

        const close = findClosingTag(sql, ignored, i + 2, '%}');
        if (close === -1) {
            continue;
        }

        const inner = sql.slice(i + 2, close).trim();
        const keyword = inner.match(/^([A-Za-z_]+)/)?.[1]?.toLowerCase() ?? 'other';
        tags.push({ start: i, end: close + 2, keyword });
        i = close + 1;
    }

    return tags;
}

function isDiscarding(stack: BlockFrame[]): boolean {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === 'macro') {
            return true;
        }
        if (stack[i].type === 'if' && stack[i].keeping === false) {
            return true;
        }
    }
    return false;
}

function topIf(stack: BlockFrame[]): BlockFrame | null {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === 'if') {
            return stack[i];
        }
    }
    return null;
}

function popBlock(stack: BlockFrame[], type: BlockKind): void {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === type) {
            stack.splice(i, 1);
            return;
        }
    }
}

function rewriteExpression(expr: string): string {
    const trimmed = expr.trim();
    if (!trimmed) {
        return '__dbt_expr';
    }

    const refMatch = trimmed.match(/^ref\s*\(\s*(['"])([^'"]+)\1\s*\)$/i);
    if (refMatch) {
        return refMatch[2];
    }

    const sourceMatch = trimmed.match(/^source\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)$/i);
    if (sourceMatch) {
        return `${sourceMatch[2]}.${sourceMatch[4]}`;
    }

    if (/^config\s*\(/i.test(trimmed)) {
        return '';
    }

    if (/^this$/i.test(trimmed)) {
        return '__dbt_this';
    }

    const varMatch = trimmed.match(/^var\s*\(\s*(['"])([^'"]+)\1(?:\s*,[\s\S]*)?\)$/i);
    if (varMatch) {
        const normalizedName = varMatch[2].replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
        return `__dbt_var_${normalizedName}__`;
    }

    if (/^\w+$/.test(trimmed)) {
        return trimmed;
    }

    return '__dbt_expr';
}

function stripJinjaComments(sql: string, output: string[], ignored: boolean[]): boolean {
    let found = false;

    for (let i = 0; i < sql.length - 1; i++) {
        if (!canStartTag(sql, ignored, i, '{#')) {
            continue;
        }

        const close = findClosingTag(sql, ignored, i + 2, '#}');
        if (close === -1) {
            continue;
        }

        applyReplacement(output, ignored, i, close + 2);
        found = true;
        i = close + 1;
    }

    return found;
}

function processBlockTags(sql: string, output: string[], ignored: boolean[]): boolean {
    const tags = parseBlockTags(sql, ignored);
    if (tags.length === 0) {
        return false;
    }

    let found = false;
    let previousEnd = 0;
    const stack: BlockFrame[] = [];

    for (const tag of tags) {
        if (isDiscarding(stack) && tag.start > previousEnd) {
            applyReplacement(output, ignored, previousEnd, tag.start);
        }

        applyReplacement(output, ignored, tag.start, tag.end);
        found = true;

        switch (tag.keyword) {
        case 'if':
            stack.push({ type: 'if', keeping: true });
            break;
        case 'elif':
        case 'else': {
            const frame = topIf(stack);
            if (frame) {
                frame.keeping = false;
            }
            break;
        }
        case 'endif':
            popBlock(stack, 'if');
            break;
        case 'for':
            stack.push({ type: 'for' });
            break;
        case 'endfor':
            popBlock(stack, 'for');
            break;
        case 'macro':
            stack.push({ type: 'macro' });
            break;
        case 'endmacro':
            popBlock(stack, 'macro');
            break;
        case 'set':
            break;
        default:
            break;
        }

        previousEnd = tag.end;
    }

    if (isDiscarding(stack) && previousEnd < sql.length) {
        applyReplacement(output, ignored, previousEnd, sql.length);
    }

    return found;
}

function processExpressions(sql: string, output: string[], ignored: boolean[]): boolean {
    let found = false;

    for (let i = 0; i < sql.length - 1; i++) {
        if (!canStartTag(sql, ignored, i, '{{')) {
            continue;
        }

        const close = findClosingTag(sql, ignored, i + 2, '}}');
        if (close === -1) {
            continue;
        }

        const expr = sql.slice(i + 2, close);
        const replacement = rewriteExpression(expr);
        applyReplacement(output, ignored, i, close + 2, replacement);
        found = true;
        i = close + 1;
    }

    return found;
}

/** Returns true if the SQL contains Jinja/DBT template syntax outside SQL comments. */
export function containsJinjaTemplates(sql: string): boolean {
    const ignored = createCommentMask(sql);

    for (let i = 0; i < sql.length - 1; i++) {
        if (canStartTag(sql, ignored, i, '{{') || canStartTag(sql, ignored, i, '{%') || canStartTag(sql, ignored, i, '{#')) {
            return true;
        }
    }

    return false;
}

/**
 * Rewrites Jinja templates to plain SQL identifiers/placeholders while preserving
 * line count and character offsets.
 */
export function preprocessJinjaTemplates(sql: string): { rewritten: string; hadJinja: boolean } {
    const ignored = createCommentMask(sql);
    const output = sql.split('');

    let hadJinja = false;

    hadJinja = stripJinjaComments(sql, output, ignored) || hadJinja;
    hadJinja = processBlockTags(sql, output, ignored) || hadJinja;
    hadJinja = processExpressions(sql, output, ignored) || hadJinja;

    return {
        rewritten: output.join(''),
        hadJinja,
    };
}
