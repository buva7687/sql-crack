import { getDisplayName } from '../identifiers';
import { formatRelativeTime } from '../../shared/time';
import {
    DefinitionDetail,
    DetailedWorkspaceStats,
    MissingDefinitionDetail,
    WorkspaceDependencyGraph,
    WorkspaceIndex,
} from '../types';

export interface IndexStatus {
    text: string;
    title: string;
    level: 'fresh' | 'stale' | 'old' | 'missing';
}

export function buildIndexStatus(index: WorkspaceIndex | null): IndexStatus {
    if (!index) {
        return {
            text: 'Index not ready',
            title: 'No index available yet. Open SQL files and click Refresh to scan your workspace.',
            level: 'missing',
        };
    }

    const ageMs = Date.now() - index.lastUpdated;
    const relative = formatRelativeTime(index.lastUpdated);
    const fileCount = index.fileCount || 0;

    let level: 'fresh' | 'stale' | 'old' = 'fresh';
    if (ageMs > 60 * 60 * 1000) {
        level = 'old';
    } else if (ageMs > 10 * 60 * 1000) {
        level = 'stale';
    }

    return {
        text: `Indexed ${relative}`,
        title: `Last indexed ${relative} • ${fileCount} file${fileCount === 1 ? '' : 's'}`,
        level,
    };
}

export function buildDetailedWorkspaceStats(
    graph: WorkspaceDependencyGraph,
    index: WorkspaceIndex | null
): DetailedWorkspaceStats {
    if (!index) {
        return {
            ...graph.stats,
            orphanedDetails: [],
            missingDetails: [],
        };
    }

    const orphanedDetails: DefinitionDetail[] = [];
    for (const tableKey of graph.stats.orphanedDefinitions) {
        const defs = index.definitionMap.get(tableKey);
        if (!defs) {
            continue;
        }
        for (const def of defs) {
            orphanedDetails.push({
                name: getDisplayName(def.name, def.schema),
                type: def.type,
                filePath: def.filePath,
                lineNumber: def.lineNumber,
            });
        }
    }

    const missingDetails: MissingDefinitionDetail[] = [];
    for (const tableKey of graph.stats.missingDefinitions) {
        const refs = index.referenceMap.get(tableKey) || [];
        const referencingFiles = [...new Set(refs.map(r => r.filePath))];
        const displayName = refs[0]
            ? getDisplayName(refs[0].tableName, refs[0].schema)
            : tableKey;

        missingDetails.push({
            tableName: displayName,
            references: refs,
            referenceCount: refs.length,
            referencingFiles,
        });
    }

    return {
        ...graph.stats,
        orphanedDetails,
        missingDetails,
    };
}
