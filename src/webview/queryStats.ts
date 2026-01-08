import { Node as FlowNode, Edge } from 'reactflow';

export interface QueryStatistics {
    totalNodes: number;
    totalEdges: number;
    tableCount: number;
    joinCount: number;
    whereClauseCount: number;
    cteCount: number;
    windowFunctionCount: number;
    subqueryCount: number;
    setOperationCount: number;
    complexityScore: number;
    complexityLevel: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';
}

export function calculateQueryStats(nodes: FlowNode[], edges: Edge[]): QueryStatistics {
    const stats: QueryStatistics = {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        tableCount: 0,
        joinCount: 0,
        whereClauseCount: 0,
        cteCount: 0,
        windowFunctionCount: 0,
        subqueryCount: 0,
        setOperationCount: 0,
        complexityScore: 0,
        complexityLevel: 'Simple'
    };

    // Count different node types based on ID prefixes and labels
    nodes.forEach(node => {
        const label = typeof node.data.label === 'string' ? node.data.label : '';
        const id = node.id || '';

        if (id.startsWith('from_')) {
            stats.tableCount++;
        }

        if (id.startsWith('join_')) {
            stats.joinCount++;
        }

        if (id.startsWith('where_')) {
            stats.whereClauseCount++;
        }

        if (id.startsWith('cte_')) {
            stats.cteCount++;
        }

        if (id.startsWith('window_')) {
            stats.windowFunctionCount++;
        }

        if (label.includes('subquery')) {
            stats.subqueryCount++;
        }

        if (id.startsWith('setop_')) {
            stats.setOperationCount++;
        }
    });

    // Calculate complexity score
    stats.complexityScore = calculateComplexityScore(stats);
    stats.complexityLevel = getComplexityLevel(stats.complexityScore);

    return stats;
}

function calculateComplexityScore(stats: Omit<QueryStatistics, 'complexityScore' | 'complexityLevel'>): number {
    let score = 0;

    // Base complexity from node count
    score += stats.totalNodes * 1;

    // Tables add minimal complexity
    score += stats.tableCount * 2;

    // JOINs add moderate complexity
    score += stats.joinCount * 5;

    // WHERE clauses add some complexity
    score += stats.whereClauseCount * 3;

    // CTEs add moderate complexity
    score += stats.cteCount * 8;

    // Window functions add significant complexity
    score += stats.windowFunctionCount * 10;

    // Subqueries add significant complexity
    score += stats.subqueryCount * 12;

    // Set operations add moderate complexity
    score += stats.setOperationCount * 7;

    return score;
}

function getComplexityLevel(score: number): 'Simple' | 'Moderate' | 'Complex' | 'Very Complex' {
    if (score < 20) return 'Simple';
    if (score < 50) return 'Moderate';
    if (score < 100) return 'Complex';
    return 'Very Complex';
}

export function getComplexityColor(level: string): string {
    switch (level) {
        case 'Simple':
            return '#48bb78';
        case 'Moderate':
            return '#4299e1';
        case 'Complex':
            return '#ed8936';
        case 'Very Complex':
            return '#f56565';
        default:
            return '#888';
    }
}
