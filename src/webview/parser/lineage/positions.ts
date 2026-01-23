// Calculate column positions on nodes for visual rendering

import { FlowNode } from '../../types';

/**
 * Calculate column positions on nodes for visual rendering
 * Positions are stored as RELATIVE offsets from the node's origin (node.x, node.y)
 */
export function calculateColumnPositions(nodes: FlowNode[]): void {
    for (const node of nodes) {
        if (!node.columns || node.columns.length === 0) {
            continue;
        }

        const positions = new Map<string, { x: number; y: number }>();
        const visibleColumns: string[] = [];

        switch (node.type) {
            case 'table': {
                const spacing = 18;
                node.columns.forEach((col, index) => {
                    if (index < 10) {
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: node.width,
                            y: 20 + index * spacing
                        });
                    }
                });
                break;
            }

            case 'select': {
                const hSpacing = 80;
                node.columns.forEach((col, index) => {
                    if (index < 8) {
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: 10 + (index % 4) * hSpacing,
                            y: node.height + Math.floor(index / 4) * 15
                        });
                    }
                });
                break;
            }

            case 'aggregate':
                if (node.aggregateDetails) {
                    node.aggregateDetails.functions.forEach((func, index) => {
                        const colName = func.alias || func.name;
                        visibleColumns.push(colName);
                        positions.set(colName, {
                            x: node.width / 2,
                            y: node.height + (index * 15)
                        });
                    });
                }
                break;

            case 'window':
                if (node.windowDetails) {
                    node.windowDetails.functions.forEach((func, index) => {
                        visibleColumns.push(func.name);
                        positions.set(func.name, {
                            x: node.width / 2,
                            y: node.height + (index * 15)
                        });
                    });
                }
                break;

            default:
                node.columns.slice(0, 5).forEach((col, index) => {
                    visibleColumns.push(col.name);
                    positions.set(col.name, {
                        x: node.width / 2,
                        y: node.height + (index * 12)
                    });
                });
                break;
        }

        node.columnPositions = positions;
        node.visibleColumns = visibleColumns;
    }
}
