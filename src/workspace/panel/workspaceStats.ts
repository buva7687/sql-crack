import { getDisplayName } from '../identifiers';
import { formatRelativeTime } from '../../shared/time';
import { IndexStatus } from './types';
import * as path from 'path';
import {
    DefinitionDetail,
    DetailedWorkspaceStats,
    MissingDefinitionDetail,
    ParseErrorDetail,
    ParseWarningDetail,
    WorkspaceDependencyGraph,
    WorkspaceIndex,
} from '../types';

export function buildIndexStatus(index: WorkspaceIndex | null, changesSinceIndex: number = 0): IndexStatus {
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

    // Override to stale if workspace has changed since last index
    if (changesSinceIndex > 0 && level === 'fresh') {
        level = 'stale';
    }

    const dirtyNote = changesSinceIndex > 0
        ? ` • ${changesSinceIndex} file change${changesSinceIndex === 1 ? '' : 's'} since last index`
        : '';

    return {
        text: changesSinceIndex > 0 ? `Indexed ${relative} (${changesSinceIndex} changed)` : `Indexed ${relative}`,
        title: `Last indexed ${relative} • ${fileCount} file${fileCount === 1 ? '' : 's'}${dirtyNote}`,
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
            parseErrorDetails: [],
            parseWarningDetails: [],
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
                name: getDisplayName(def.name, def.schema, def.catalog),
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
            ? getDisplayName(refs[0].tableName, refs[0].schema, refs[0].catalog)
            : tableKey;

        missingDetails.push({
            tableName: displayName,
            references: refs,
            referenceCount: refs.length,
            referencingFiles,
        });
    }

    const parseErrorDetails: ParseErrorDetail[] = [];
    const parseWarningDetails: ParseWarningDetail[] = [];
    for (const [, file] of index.files) {
        if (file.parseError) {
            parseErrorDetails.push({
                filePath: file.filePath,
                fileName: path.basename(file.filePath),
                error: file.parseError,
            });
        }
        if (file.parseWarnings && file.parseWarnings.length > 0) {
            parseWarningDetails.push({
                filePath: file.filePath,
                fileName: path.basename(file.filePath),
                warnings: file.parseWarnings,
            });
        }
    }

    return {
        ...graph.stats,
        orphanedDetails,
        missingDetails,
        parseErrorDetails,
        parseWarningDetails,
    };
}
