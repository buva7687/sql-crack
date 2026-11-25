import type { FlowEdge, FlowNode, SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import { dialectSupportsBackslashEscapes, dialectSupportsHashComments, escapeRegex, getSqlIdentifierKey, getSqlRelationIdentifiers, maskSqlCommentsPreservingPositions, stripSqlComments, tokenizeSqlIdentifiers } from '../../../shared';
import type { SqlIdentifier } from '../../../shared';
import { maskStringsAndComments } from '../dialects/preprocessing';

/** Extract the bare CTE name from a label like "WITH foo" or "WITH RECURSIVE foo" */
function extractCteName(label: string): string {
    let name = label.toLowerCase();
    if (name.startsWith('with recursive ')) {
        name = name.substring('with recursive '.length).trim();
    } else if (name.startsWith('with ')) {
        name = name.substring('with '.length).trim();
    }
    return name;
}

function findNodeById(nodes: FlowNode[], id: string): FlowNode | undefined {
    for (const node of nodes) {
        if (node.id === id) {
            return node;
        }
        if (node.children) {
            const child = findNodeById(node.children, id);
            if (child) {
                return child;
            }
        }
    }
    return undefined;
}

function collectSelectNodes(nodes: FlowNode[]): FlowNode[] {
    const selectNodes: FlowNode[] = [];
    const seen = new Set<string>();

    function collect(nodeList: FlowNode[]): void {
        for (const node of nodeList) {
            if (node.type === 'select' && node.columns && !seen.has(node.id)) {
                selectNodes.push(node);
                seen.add(node.id);
            }
            if (node.children) {
                collect(node.children);
            }
        }
    }

    collect(nodes);
    return selectNodes;
}

function extractCteBodyScope(fullNormalizedSql: string, maskedSql: string, cteName: string, _dialect: SqlDialect): { bodySql: string; bodyEnd: number } | null {
    const ctePattern = new RegExp(`\\b${escapeRegex(cteName)}\\b\\s+as\\s*\\(`, 'i');
    const cteMatch = ctePattern.exec(maskedSql);
    if (!cteMatch) {
        return null;
    }

    const bodyStart = cteMatch.index + cteMatch[0].length;
    let depth = 1;
    let bodyEnd = bodyStart;
    for (let ci = bodyStart; ci < fullNormalizedSql.length && depth > 0; ci++) {
        if (maskedSql[ci] === '(') { depth++; }
        else if (maskedSql[ci] === ')') { depth--; }
        if (depth === 0) { bodyEnd = ci; }
    }
    if (depth !== 0) {
        return null;
    }

    const normalizedSql = fullNormalizedSql.substring(bodyStart, bodyEnd).trim();
    return {
        bodySql: normalizedSql,
        bodyEnd,
    };
}

function collectCteReferenceQualifiers(
    relations: ReadonlyArray<{ table?: SqlIdentifier; alias?: SqlIdentifier; offset?: number }>,
    bodyEnd: number,
    cteName: string
): SqlIdentifier[] {
    const cteNameLower = cteName.toLowerCase();
    return relations
        .filter(source => (source.offset ?? Number.POSITIVE_INFINITY) > bodyEnd
            && source.table?.value.toLowerCase() === cteNameLower)
        .flatMap(source => source.alias ? [source.alias] : source.table ? [source.table] : []);
}

const SIMPLE_IDENTIFIER_RE = /^\w+$/;
const QUALIFIED_REF_STRIP_RE = /\b[a-z_][\w$]*\s*\.\s*[a-z_][\w$]*\b/gi;
const QUALIFIED_PAIR_RE = /\b(\w+)\s*\.\s*(\w+)\b/g;
const WORD_TOKEN_RE = /\w+/g;

interface IndexedClauseText {
    raw: string;
    withoutQualifiedRefs: string;
    words: Set<string>;
    qualifiedPairs: Set<string>;
}

interface StarCoverage {
    unrestricted: boolean;
    excludedKeySets: Set<string>[];
    cleanedSelectClause: string;
}

interface PreparedSqlUsage {
    hasUnrestrictedStar: boolean;
    starExcludedKeySets: Set<string>[];
    clauses: IndexedClauseText[];
    qualifiers?: SqlIdentifier[];
    qualifierValuesLower?: string[];
    dialect: SqlDialect;
}

function indexClauseText(text: string, hasQualifiers: boolean): IndexedClauseText {
    const withoutQualifiedRefs = hasQualifiers ? text.replace(QUALIFIED_REF_STRIP_RE, ' ') : text;
    const words = new Set<string>();
    for (const match of withoutQualifiedRefs.toLowerCase().matchAll(WORD_TOKEN_RE)) {
        words.add(match[0]);
    }
    const qualifiedPairs = new Set<string>();
    if (hasQualifiers) {
        for (const match of text.toLowerCase().matchAll(QUALIFIED_PAIR_RE)) {
            qualifiedPairs.add(`${match[1]}.${match[2]}`);
        }
    }
    return { raw: text, withoutQualifiedRefs, words, qualifiedPairs };
}

function clauseContainsColumn(clause: IndexedClauseText, columnName: string, qualifiers?: SqlIdentifier[], qualifierValuesLower?: string[]): boolean {
    const colLower = columnName.toLowerCase();
    const isSimpleCol = SIMPLE_IDENTIFIER_RE.test(columnName);

    if (qualifiers && qualifiers.length > 0) {
        for (let i = 0; i < qualifiers.length; i++) {
            const qualifierValue = qualifiers[i].value;
            if (isSimpleCol && SIMPLE_IDENTIFIER_RE.test(qualifierValue)) {
                if (clause.qualifiedPairs.has(`${qualifierValuesLower![i]}.${colLower}`)) {
                    return true;
                }
            } else {
                const qualifiedPattern = new RegExp(`\\b${escapeRegex(qualifierValue)}\\s*\\.\\s*${escapeRegex(columnName)}\\b`, 'i');
                if (qualifiedPattern.test(clause.raw)) {
                    return true;
                }
            }
        }
        if (isSimpleCol) {
            return clause.words.has(colLower);
        }
        return new RegExp(`\\b${escapeRegex(columnName)}\\b`, 'i').test(clause.withoutQualifiedRefs);
    }

    if (isSimpleCol) {
        return clause.words.has(colLower);
    }
    return new RegExp(`\\b${escapeRegex(columnName)}\\b`, 'i').test(clause.raw);
}

function analyzeSelectClauseStar(
    selectClause: string,
    qualifiers: SqlIdentifier[] | undefined,
    dialect: SqlDialect
): StarCoverage {
    if (!selectClause.includes('*')) {
        return { unrestricted: false, excludedKeySets: [], cleanedSelectClause: selectClause };
    }

    const tokens = tokenizeSqlIdentifiers(selectClause, dialect);
    const qualifierKeys = qualifiers?.map(qualifier => getSqlIdentifierKey(qualifier, dialect));
    const excludedKeySets: Set<string>[] = [];
    const stripRanges: Array<[number, number]> = [];
    let unrestricted = false;

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.quoted || token.value !== '*' || token.depth !== 0) { continue; }

        const prev = tokens[index - 1];
        const prevPrev = tokens[index - 2];
        let matchesTarget = false;
        if (prev && !prev.quoted && prev.value === '.') {
            if (prevPrev && qualifierKeys?.includes(getSqlIdentifierKey(prevPrev, dialect))) {
                matchesTarget = true;
            }
        } else if (!prev || (!prev.quoted && (prev.value === ',' || prev.value.toUpperCase() === 'DISTINCT' || prev.value.toUpperCase() === 'ALL'))) {
            matchesTarget = true;
        }

        const next = tokens[index + 1];
        const modifier = next && !next.quoted ? next.value.toUpperCase() : '';
        if (modifier === 'EXCEPT' || modifier === 'EXCLUDE') {
            const excluded = new Set<string>();
            let cursor = index + 2;
            const afterModifier = tokens[cursor];
            let endOffset = next.offset + next.value.length;
            if (afterModifier && !afterModifier.quoted && afterModifier.value === '(') {
                cursor++;
                while (cursor < tokens.length && (tokens[cursor].quoted || tokens[cursor].value !== ')')) {
                    const entry = tokens[cursor];
                    if (entry.quoted || entry.value !== ',') {
                        excluded.add(getSqlIdentifierKey(entry, dialect));
                    }
                    cursor++;
                }
                if (cursor < tokens.length) {
                    endOffset = tokens[cursor].offset + tokens[cursor].value.length;
                }
            } else if (afterModifier) {
                excluded.add(getSqlIdentifierKey(afterModifier, dialect));
                endOffset = afterModifier.offset + afterModifier.value.length;
            }
            stripRanges.push([next.offset, endOffset]);
            if (matchesTarget && excluded.size > 0) {
                excludedKeySets.push(excluded);
            }
        } else if (matchesTarget && (!next || (!next.quoted && next.value === ','))) {
            unrestricted = true;
        }
    }

    let cleanedSelectClause = selectClause;
    if (stripRanges.length > 0) {
        let out = '';
        let pos = 0;
        for (const [start, end] of stripRanges) {
            out += selectClause.slice(pos, start) + ' ';
            pos = end;
        }
        cleanedSelectClause = out + selectClause.slice(pos);
    }

    return { unrestricted, excludedKeySets, cleanedSelectClause };
}

function prepareSqlUsage(
    sql: string,
    options: { includeSelectClause?: boolean; qualifiers?: SqlIdentifier[]; dialect?: SqlDialect } = {}
): PreparedSqlUsage {
    const dialect = options.dialect ?? 'MySQL';
    const qualifiers = options.qualifiers;
    const hasQualifiers = Boolean(qualifiers && qualifiers.length > 0);
    const qualifierValuesLower = hasQualifiers ? qualifiers!.map(q => q.value.toLowerCase()) : undefined;
    const clauses: IndexedClauseText[] = [];
    const starExcludedKeySets: Set<string>[] = [];
    let hasUnrestrictedStar = false;

    if (!sql) {
        return { hasUnrestrictedStar, starExcludedKeySets, clauses, qualifiers, qualifierValuesLower, dialect };
    }

    if (options.includeSelectClause) {
        for (const select of sql.matchAll(/\bselect\b\s+(.+?)\s+\bfrom\b/gi)) {
            const star = analyzeSelectClauseStar(select[1], qualifiers, dialect);
            if (star.unrestricted) {
                hasUnrestrictedStar = true;
                return { hasUnrestrictedStar, starExcludedKeySets, clauses, qualifiers, qualifierValuesLower, dialect };
            }
            if (star.excludedKeySets.length > 0) {
                starExcludedKeySets.push(...star.excludedKeySets);
            }
            clauses.push(indexClauseText(star.cleanedSelectClause, hasQualifiers));
        }
    }

    const sqlLower = sql.toLowerCase();

    const whereMatch = sqlLower.match(/\bwhere\b\s+(.+?)(?:\s+(?:order|group|having|limit)\s+by|\s+limit|\s*;|\s*$)/i);
    if (whereMatch) {
        clauses.push(indexClauseText(whereMatch[1], hasQualifiers));
    }

    const orderByMatch = sqlLower.match(/\border\s+by\b\s+(.+?)(?:\s+limit|\s*;|\s*$)/i);
    if (orderByMatch) {
        clauses.push(indexClauseText(orderByMatch[1], hasQualifiers));
    }

    const groupByMatch = sqlLower.match(/\bgroup\s+by\b\s+(.+?)(?:\s+(?:having|order|limit)|\s*;|\s*$)/i);
    if (groupByMatch) {
        clauses.push(indexClauseText(groupByMatch[1], hasQualifiers));
    }

    const havingMatch = sqlLower.match(/\bhaving\b\s+(.+?)(?:\s+(?:order|limit)|\s*;|\s*$)/i);
    if (havingMatch) {
        clauses.push(indexClauseText(havingMatch[1], hasQualifiers));
    }

    // Check JOIN ON clauses: find all "JOIN table ON condition" patterns
    // The terminator is a lookahead so the next JOIN starts its own match.
    const joinOnPattern = /\bjoin\b\s+[\w.$]+(?:\s+(?:as\s+)?\w+)?\s+\bon\b\s+(.+?)(?=\s+(?:join|where|group|having|order|limit)\b|\s*;|\s*$)/gi;
    let joinMatch: RegExpExecArray | null;
    while ((joinMatch = joinOnPattern.exec(sqlLower)) !== null) {
        clauses.push(indexClauseText(joinMatch[1], hasQualifiers));
    }

    return { hasUnrestrictedStar, starExcludedKeySets, clauses, qualifiers, qualifierValuesLower, dialect };
}

function extractOutputColumnIdentifiers(selectClause: string, dialect: SqlDialect): Array<SqlIdentifier | undefined> {
    const tokens = tokenizeSqlIdentifiers(selectClause, dialect);
    const outputs: Array<SqlIdentifier | undefined> = [];
    let current: SqlIdentifier | undefined;
    let hasTokens = false;
    for (const token of tokens) {
        if (token.depth !== 0) { continue; }
        if (!token.quoted && token.value === ',') {
            if (hasTokens) {
                outputs.push(current);
            }
            current = undefined;
            hasTokens = false;
            continue;
        }
        hasTokens = true;
        current = token.quoted || /^[\p{L}_#$@]/u.test(token.value) ? token : undefined;
    }
    if (hasTokens) {
        outputs.push(current);
    }
    return outputs;
}

function isColumnUsedInPreparedSql(
    prepared: PreparedSqlUsage,
    columnNames: string[],
    outputIdentifier?: SqlIdentifier
): boolean {
    if (prepared.hasUnrestrictedStar) {
        return true;
    }

    if (prepared.starExcludedKeySets.length > 0 && outputIdentifier) {
        const outputKey = getSqlIdentifierKey(outputIdentifier, prepared.dialect);
        for (const excluded of prepared.starExcludedKeySets) {
            if (!excluded.has(outputKey)) {
                return true;
            }
        }
    }

    for (const nameToCheck of columnNames) {
        for (const clause of prepared.clauses) {
            if (clauseContainsColumn(clause, nameToCheck, prepared.qualifiers, prepared.qualifierValuesLower)) {
                return true;
            }
        }
    }

    return false;
}

export function detectAdvancedIssues(context: ParserContext, nodes: FlowNode[], sql: string, edges: FlowEdge[] = []): void {
    // Detect unused CTEs
    // Fix: Properly match CTE names by removing "WITH " prefix and checking all table references
    const cteNodes = nodes.filter(n => n.type === 'cte');
    const referencedCTEs = new Set<string>();
    
    // Build a set of all CTE names (without "WITH " / "WITH RECURSIVE " prefix for accurate matching)
    const allCteNames = new Set<string>();
    cteNodes.forEach(cteNode => {
        const cteName = extractCteName(cteNode.label);
        allCteNames.add(cteName);
    });

    // Track which CTEs are actually referenced in the query
    // Check all table nodes AND join nodes (including those nested inside CTE children)
    function collectCteReferences(nodeList: FlowNode[]): void {
        for (const node of nodeList) {
            if (node.type === 'table') {
                const tableName = node.label.toLowerCase().trim();
                if (allCteNames.has(tableName)) {
                    referencedCTEs.add(tableName);
                }
                if (node.tableCategory === 'cte_reference') {
                    referencedCTEs.add(tableName);
                }
            }
            // Inside CTE children, join nodes have labels like "JOIN table_name" or "LEFT JOIN table_name"
            // Extract the table name from the join label to check for CTE references
            if (node.type === 'join') {
                const joinLabel = node.label.toLowerCase().trim();
                // Extract table name: last word after JOIN keyword(s)
                const parts = joinLabel.split(/\s+/);
                if (parts.length >= 2) {
                    const joinedTable = parts[parts.length - 1];
                    if (allCteNames.has(joinedTable)) {
                        referencedCTEs.add(joinedTable);
                    }
                }
            }
            // Recurse into CTE/subquery children to find nested references
            if (node.children && node.children.length > 0) {
                collectCteReferences(node.children);
            }
        }
    }
    collectCteReferences(nodes);

    cteNodes.forEach(cteNode => {
        const cteName = extractCteName(cteNode.label);
        
        if (!referencedCTEs.has(cteName)) {
            // CTE is defined but never used
            if (!cteNode.warnings) {cteNode.warnings = [];}
            cteNode.warnings.push({
                type: 'unused',
                severity: 'medium',
                message: 'This CTE is never referenced in the query'
            });

            context.hints.push({
                type: 'warning',
                message: `Unused CTE: "${cteNode.label}"`,
                suggestion: 'Remove this CTE as it is not used anywhere in the query',
                category: 'quality',
                nodeId: cteNode.id,
                severity: 'medium'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Duplicate Subquery Detection
    // ============================================================
    // Detects duplicate or similar subqueries that could be extracted to CTEs
    // for better maintainability and performance.
    //
    // Detection Strategy:
    // 1. Collect FROM subqueries (already have nodes in the graph)
    // 2. Extract subqueries from WHERE/SELECT/HAVING clauses using SQL parsing
    // 3. Normalize subqueries for comparison (remove whitespace, aliases)
    // 4. Group by similarity (same FROM table, same aggregate, same WHERE presence)
    // 5. Add warnings to nodes and hints to the hints panel
    // ============================================================
    
    interface SubqueryMatch {
        sql: string;           // The subquery SQL
        normalized: string;    // Normalized signature for comparison
        location: 'from' | 'where' | 'select' | 'having';
        node?: FlowNode;       // For FROM subqueries that have nodes
        parentNodeId?: string; // For WHERE/SELECT subqueries
    }
    
    const allSubqueries: SubqueryMatch[] = [];
    // Keep offsets aligned with the original SQL while ensuring SELECT/FROM
    // tokens and parentheses inside comments or literals cannot look like
    // executable subqueries.
    const maskedSql = maskStringsAndComments(sql);
    const sqlLower = maskedSql.toLowerCase();
    
    // FROM nodes have generic descriptions (such as "Derived table with 2
    // operations"), which are not comparable SQL. Associate them only after
    // extracting the actual subquery text below.
    const subqueryNodes = nodes.filter(n => n.type === 'subquery');
    let fromSubqueryIndex = 0;
    
    // 2. Extract subqueries from SQL using balanced parentheses matching
    // This handles nested subqueries correctly by tracking parenthesis depth
    const extractSubquery = (startIndex: number): { sql: string; masked: string; endIndex: number } | null => {
        if (maskedSql[startIndex] !== '(') {return null;}
        
        let depth = 0;
        let i = startIndex;
        const start = i + 1; // Skip opening (
        
        while (i < maskedSql.length) {
            if (maskedSql[i] === '(') {depth++;}
            if (maskedSql[i] === ')') {
                depth--;
                if (depth === 0) {
                    return {
                        sql: sql.substring(start, i).trim(),
                        masked: maskedSql.substring(start, i).trim(),
                        endIndex: i
                    };
                }
            }
            i++;
        }
        return null;
    };
    
    // Find all (SELECT ...) patterns
    let searchIndex = 0;
    
    while (searchIndex < sql.length) {
        // Look for SELECT keyword
        const selectPos = sqlLower.indexOf('select', searchIndex);
        if (selectPos === -1) {break;}
        
        // Check if it's inside parentheses (subquery)
        // Look backwards for opening parenthesis
        let parenPos = -1;
        for (let i = selectPos - 1; i >= 0 && i >= selectPos - 100; i--) {
            if (maskedSql[i] === '(') {
                parenPos = i;
                break;
            }
            if (maskedSql[i] === ')' || maskedSql[i] === ';') {break;} // Not a subquery
        }
        
        if (parenPos >= 0) {
            const subquery = extractSubquery(parenPos);
            if (subquery && subquery.masked.toLowerCase().includes('from')) {
                // Normalize: remove extra whitespace, lowercase, remove table aliases for comparison
                let normalized = subquery.masked.replace(/\s+/g, ' ').toLowerCase();
                // Remove table aliases (e.g., "orders o" -> "orders"), but not SQL keywords
                normalized = normalized.replace(/\b(from|join|,)\s+(\w+)\s+(?:as\s+)?(\w+)\b/g, (match, clause, table, alias) => {
                    const sqlKeywords = new Set(['inner', 'outer', 'left', 'right', 'full', 'cross', 'natural', 'join', 'on', 'where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'select', 'from', 'set', 'into', 'values']);
                    if (sqlKeywords.has(alias)) {
                        return match;
                    }
                    return `${clause} ${table}`;
                });
                
                // Determine location based on context
                const beforeMatch = sql.substring(Math.max(0, parenPos - 100), parenPos).toLowerCase();
                let location: SubqueryMatch['location'] = 'where';
                if (/\b(?:from|join)\s*$/.test(beforeMatch)) {
                    location = 'from';
                } else if (beforeMatch.includes('select') && !beforeMatch.includes('where') && !beforeMatch.includes('having') && !beforeMatch.includes('from')) {
                    location = 'select';
                } else if (beforeMatch.includes('having')) {
                    location = 'having';
                }
                const node = location === 'from' ? subqueryNodes[fromSubqueryIndex++] : undefined;
                
                allSubqueries.push({
                    sql: subquery.sql,
                    normalized: normalized,
                    location: location,
                    node,
                    parentNodeId: node?.parentId
                });
                
                searchIndex = subquery.endIndex + 1;
            } else {
                searchIndex = selectPos + 6;
            }
        } else {
            searchIndex = selectPos + 6;
        }
    }
    
    // 3. Group subqueries by normalized signature for exact duplicate detection
    const subqueryGroups = new Map<string, SubqueryMatch[]>();
    allSubqueries.forEach(subq => {
        if (!subqueryGroups.has(subq.normalized)) {
            subqueryGroups.set(subq.normalized, []);
        }
        subqueryGroups.get(subq.normalized)!.push(subq);
    });
    
    // 4. Detect similar subqueries (not just identical)
    // Similarity criteria: same FROM table, same aggregate function, same WHERE presence
    const similarGroups: SubqueryMatch[][] = [];
    const processed = new Set<string>();
    const candidatesBySignature = new Map<string, SubqueryMatch[]>();

    for (const subquery of allSubqueries) {
        const fromTable = subquery.normalized.match(/from\s+(\w+)/)?.[1];
        if (!fromTable) {continue;}
        const aggregate = subquery.normalized.match(/(avg|count|sum|max|min)\s*\(/)?.[1] || '';
        const hasWhere = subquery.normalized.includes('where');
        const signature = `${fromTable}\u0000${aggregate}\u0000${hasWhere ? '1' : '0'}`;
        const group = candidatesBySignature.get(signature) || [];
        group.push(subquery);
        candidatesBySignature.set(signature, group);
    }

    for (const group of candidatesBySignature.values()) {
        if (group.length <= 1) {continue;}
        similarGroups.push(group);
        for (const subquery of group) {
            processed.add(subquery.normalized);
        }
    }
    
    // Add warnings for similar groups
    similarGroups.forEach(group => {
        group.forEach(subq => {
            if (subq.node) {
                if (!subq.node.warnings) {subq.node.warnings = [];}
                subq.node.warnings.push({
                    type: 'complex',
                    severity: 'low',
                    message: `Similar subquery (${group.length} duplicates detected)`
                });
            } else {
                let targetNode: FlowNode | undefined;
                if (subq.location === 'where' || subq.location === 'having') {
                    targetNode = nodes.find(n => 
                        n.type === 'filter' && 
                        n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                    );
                } else if (subq.location === 'select') {
                    targetNode = nodes.find(n => n.type === 'select');
                }
                
                if (targetNode) {
                    if (!targetNode.warnings) {targetNode.warnings = [];}
                    targetNode.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                    });
                }
            }
        });
        context.hints.push({
            type: 'info',
            message: `${group.length} similar subqueries detected`,
            suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
            category: 'quality',
            severity: 'low'
        });
    });
    
    // Also check exact matches (original logic)
    subqueryGroups.forEach((group, signature) => {
        // Only flag if we have 2+ identical subqueries and signature is meaningful (at least 15 chars)
        if (group.length > 1 && signature.length > 15 && !processed.has(signature)) {
            group.forEach(subq => {
                if (subq.node) {
                    // FROM subquery - has a node, add warning to it
                    if (!subq.node.warnings) {subq.node.warnings = [];}
                    subq.node.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Similar subquery (${group.length} duplicates detected)`
                    });
                } else {
                    // WHERE/SELECT subquery - find the appropriate node to warn
                    let targetNode: FlowNode | undefined;
                    
                    if (subq.location === 'where' || subq.location === 'having') {
                        // Find WHERE or HAVING filter node
                        targetNode = nodes.find(n => 
                            n.type === 'filter' && 
                            n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                        );
                    } else if (subq.location === 'select') {
                        // Find SELECT node
                        targetNode = nodes.find(n => n.type === 'select');
                    }
                    
                    if (targetNode) {
                        if (!targetNode.warnings) {targetNode.warnings = [];}
                        targetNode.warnings.push({
                            type: 'complex',
                            severity: 'low',
                            message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                        });
                    }
                }
            });
            
            // Add hint
            context.hints.push({
                type: 'info',
                message: `${group.length} similar subqueries detected`,
                suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
                category: 'quality',
                severity: 'low'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Dead Column Detection
    // ============================================================
    // Detects columns that are selected but never used in WHERE/ORDER BY/
    // GROUP BY/HAVING/JOIN clauses. These "dead columns" add unnecessary
    // data transfer and reduce query clarity.
    //
    // Detection Strategy:
    // 1. Extract column names from SELECT node (from AST) and SQL string (fallback)
    // 2. For each column, check if it appears in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses
    // 3. Use word boundary regex to ensure exact column name matches
    // 4. Add warnings to SELECT node and hints to the hints panel
    // ============================================================
    
    const selectNodes = collectSelectNodes(nodes);
    // Every intermediate SELECT checks the same source statement. Normalize
    // it once; large CTE chains otherwise repeat this full scan per CTE.
    const fullNormalizedSql = stripSqlComments(sql).replace(/\s+/g, ' ').trim();
    let maskedNormalizedSql: string | undefined;
    let maskedDownstreamFullSql: string | undefined;
    let allQueryRelations: ReturnType<typeof getSqlRelationIdentifiers> | undefined;
    selectNodes.forEach(selectNode => {
        if (!selectNode.columns || selectNode.columns.length === 0) {return;}

        // Skip dead column detection for top-level SELECT nodes (final query output)
        // A SELECT with no parentId is a top-level query - all its columns are output columns
        // Dead column detection should only apply to intermediate SELECTs (CTEs/subqueries)
        // where columns might be selected but not used downstream
        if (!selectNode.parentId) {
            // This is a top-level SELECT - all columns are valid output, skip dead column detection
            return;
        }

        // Without a known relation binding, an intermediate projection could
        // be used by the surrounding query. Only diagnose scoped CTE outputs.
        const parentNode = findNodeById(nodes, selectNode.parentId);
        if (parentNode?.type !== 'cte' || !parentNode.label) { return; }
        // Deeper SELECTs are scalar or nested subqueries inside the CTE body;
        // their columns are consumed by the body, not exported by the CTE.
        if (selectNode.depth !== undefined && selectNode.depth > (parentNode.depth ?? 0) + 1) { return; }

        const cteName = extractCteName(parentNode.label);
        maskedNormalizedSql ??= maskStringsAndComments(fullNormalizedSql);
        const cteScope = extractCteBodyScope(fullNormalizedSql, maskedNormalizedSql, cteName, context.dialect);
        if (!cteScope) { return; }
        const normalizedSql = cteScope.bodySql;
        maskedDownstreamFullSql ??= maskSqlCommentsPreservingPositions(fullNormalizedSql, {
            maskStringLiterals: true,
            backslashEscapes: dialectSupportsBackslashEscapes(context.dialect),
            hashComments: dialectSupportsHashComments(context.dialect),
            dollarQuotes: context.dialect !== 'MySQL' && context.dialect !== 'MariaDB',
        });
        const downstreamSql = maskedDownstreamFullSql.slice(cteScope.bodyEnd + 1).trim();
        allQueryRelations ??= getSqlRelationIdentifiers(maskedDownstreamFullSql, context.dialect);
        const downstreamQualifiers = collectCteReferenceQualifiers(allQueryRelations, cteScope.bodyEnd, cteName);
        if (downstreamQualifiers.length === 0) { return; }

        const preparedDownstream = prepareSqlUsage(downstreamSql, {
            includeSelectClause: true,
            qualifiers: downstreamQualifiers,
            dialect: context.dialect,
        });
        if (preparedDownstream.hasUnrestrictedStar) { return; }
        const preparedBody = prepareSqlUsage(normalizedSql);
        const downstreamQualifiedPairs = new Set<string>();
        for (const match of downstreamSql.toLowerCase().matchAll(QUALIFIED_PAIR_RE)) {
            downstreamQualifiedPairs.add(`${match[1]}.${match[2]}`);
        }

        // Extract column names directly from SQL SELECT clause as fallback
        // This ensures we have the actual column names as they appear in SQL,
        // which may differ from AST-extracted names (handles aliases, expressions)
        const selectClauseMatch = normalizedSql.match(/select\s+(.+?)\s+from/i);
        const cteSelectListMatch = preparedDownstream.starExcludedKeySets.length > 0
            ? (selectClauseMatch ?? normalizedSql.match(/select\s+(.+?)$/i))
            : null;
        const cteOutputIdentifiers = cteSelectListMatch
            ? extractOutputColumnIdentifiers(cteSelectListMatch[1], context.dialect)
            : undefined;
        const sqlColumnNamesMap = new Map<string, string[]>(); // column name -> [all variations]
        if (selectClauseMatch) {
            const selectClause = selectClauseMatch[1];
            // Split by comma, handling potential commas in expressions
            const columnParts: string[] = [];
            let current = '';
            let parenDepth = 0;
            for (let i = 0; i < selectClause.length; i++) {
                const char = selectClause[i];
                if (char === '(') {parenDepth++;}
                else if (char === ')') {parenDepth--;}
                else if (char === ',' && parenDepth === 0) {
                    columnParts.push(current.trim());
                    current = '';
                    continue;
                }
                current += char;
            }
            if (current.trim()) {columnParts.push(current.trim());}
            
            columnParts.forEach(part => {
                const trimmed = part.trim();
                // Extract column name and alias
                // Pattern: "column_name" or "column_name AS alias" or "table.column" or just "column"
                const aliasMatch = trimmed.match(/\s+as\s+(\w+)$/i);
                const columnMatch = trimmed.match(/(?:^|\s)(\w+)(?:\s|$)/);
                
                if (aliasMatch) {
                    const alias = aliasMatch[1];
                    const colName = columnMatch ? columnMatch[1] : null;
                    if (colName && colName !== alias) {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias, colName]);
                    } else {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias]);
                    }
                } else if (columnMatch) {
                    const colName = columnMatch[1];
                    sqlColumnNamesMap.set(colName.toLowerCase(), [colName]);
                }
            });
        }

        selectNode.columns.forEach((col, colIndex) => {
            const colName = col.name;
            // '*' is not a column, and 'expr' is the placeholder for an unnamed
            // expression, which downstream SQL can only reach by position.
            if (colName === '*' || colName === 'expr') { return; }
            // Build list of all possible column name variations to check
            const colNamesToCheck = new Set<string>();
            colNamesToCheck.add(colName);
            if (col.sourceColumn && col.sourceColumn !== colName) {
                colNamesToCheck.add(col.sourceColumn);
            }
            // Add SQL-extracted names that match this column
            const colNameLower = colName.toLowerCase();
            if (sqlColumnNamesMap.has(colNameLower)) {
                sqlColumnNamesMap.get(colNameLower)!.forEach(name => colNamesToCheck.add(name));
            }
            // Also check if any SQL column name matches (case-insensitive)
            sqlColumnNamesMap.forEach((names, key) => {
                if (key === colNameLower) {
                    names.forEach(name => colNamesToCheck.add(name));
                }
            });
            
            const colNames = Array.from(colNamesToCheck);
            const matchedOutput = cteOutputIdentifiers?.[colIndex];
            const outputIdentifier: SqlIdentifier = matchedOutput && matchedOutput.value.toLowerCase() === colNameLower
                ? matchedOutput
                : { value: colName, quoted: false };
            let isUsed = isColumnUsedInPreparedSql(preparedBody, colNames);
            if (!isUsed && downstreamSql) {
                isUsed = isColumnUsedInPreparedSql(preparedDownstream, colNames, outputIdentifier);
            }
            // A qualified reference anywhere downstream is a use, including
            // table-function arguments such as UNNEST(o.items).
            if (!isUsed) {
                isUsed = downstreamQualifiers.some(qualifier => colNames.some(name => {
                    if (SIMPLE_IDENTIFIER_RE.test(qualifier.value) && SIMPLE_IDENTIFIER_RE.test(name)) {
                        return downstreamQualifiedPairs.has(`${qualifier.value.toLowerCase()}.${name.toLowerCase()}`);
                    }
                    return new RegExp(`\\b${escapeRegex(qualifier.value)}\\s*\\.\\s*${escapeRegex(name)}\\b`, 'i').test(downstreamSql);
                }));
            }

            // If column is not used in any clause, it's a dead column
            if (!isUsed) {
                if (!selectNode.warnings) {selectNode.warnings = [];}
                selectNode.warnings.push({
                    type: 'dead-column',
                    severity: 'low',
                    message: `Column "${colName}" is not used in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses`
                });
            }
        });
        
        // Add optimization hint to hints panel if dead columns are detected
        // This provides a summary in the hints panel for better visibility
        const deadColumns = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
        if (deadColumns.length > 0) {
            const deadColNames = deadColumns.map(w => {
                const match = w.message.match(/Column "([^"]+)"/);
                return match ? match[1] : '';
            }).filter(Boolean);
            
            context.hints.push({
                type: 'info',
                message: `${deadColumns.length} dead column${deadColumns.length > 1 ? 's' : ''} detected: ${deadColNames.slice(0, 3).join(', ')}${deadColNames.length > 3 ? ` and ${deadColNames.length - 3} more` : ''}`,
                suggestion: 'Remove unused columns from SELECT clause to improve query clarity and reduce data transfer',
                category: 'quality',
                nodeId: selectNode.id,
                severity: 'low'
            });
        }
    });

    // Detect repeated table scans
    const tableUsage = new Map<string, FlowNode[]>();
    nodes.filter(n => n.type === 'table' && (n.tableCategory === 'physical' || n.tableCategory === 'subquery_source')).forEach(node => {
        const tableName = node.label.toLowerCase();
        if (!tableUsage.has(tableName)) {
            tableUsage.set(tableName, []);
        }
        tableUsage.get(tableName)!.push(node);
    });

    tableUsage.forEach((usages, tableName) => {
        if (usages.length > 1) {
            const bindings = new Set(usages.map(node => node.alias || node.label));
            if (bindings.size === usages.length && sharesJoinChain(usages, nodes, edges)) {
                context.hints.push({
                    type: 'info',
                    message: `Table "${tableName}" is accessed ${usages.length} times with distinct aliases`,
                    suggestion: 'Distinct aliases can represent intentional self-joins. Check the database execution plan before changing these references.',
                    category: 'performance',
                    severity: 'low'
                });
                return;
            }
            usages.forEach(node => {
                if (!node.warnings) {node.warnings = [];}
                node.warnings.push({
                    type: 'repeated-scan',
                    severity: 'medium',
                    message: `Table "${tableName}" is scanned ${usages.length} times`
                });
            });

            context.hints.push({
                type: 'warning',
                message: `Table "${tableName}" scanned ${usages.length} times`,
                suggestion: 'Consider using a CTE or subquery to scan the table once',
                category: 'performance',
                severity: 'medium'
            });
        }
    });
}

/**
 * True when every usage feeds the same chain of JOIN nodes, i.e. the table is
 * joined to itself within one FROM clause. Separate UNION branches, CTEs or
 * subqueries read the table independently and remain repeated scans.
 */
function sharesJoinChain(usages: FlowNode[], nodes: FlowNode[], edges: FlowEdge[]): boolean {
    const joinIds = new Set(nodes.filter(node => node.type === 'join').map(node => node.id));
    const chainOf = new Map<string, string>();
    const find = (id: string): string => {
        let root = id;
        while (chainOf.has(root) && chainOf.get(root) !== root) {
            root = chainOf.get(root)!;
        }
        return root;
    };
    edges.forEach(edge => {
        if (joinIds.has(edge.target)) {
            chainOf.set(find(edge.source), find(edge.target));
        }
    });
    const chains = new Set(usages.map(node => find(node.id)));
    return chains.size === 1 && joinIds.has([...chains][0]);
}

// Calculate enhanced complexity metrics
