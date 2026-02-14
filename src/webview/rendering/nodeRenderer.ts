import type { FlowNode, ViewState } from '../types';
import {
    BADGE_COLORS,
    GLOW_COLORS,
    NODE_STROKE_COLORS,
    getSeverityIcon,
} from '../constants';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { getNodeAccentColor, NODE_SURFACE } from '../constants/colors';
import { getWarningIndicatorState } from '../warningIndicator';

export interface NodeVisualRendererDeps {
    state: ViewState;
    getNodeAccentPosition: () => 'left' | 'bottom';
    getNodeVisualIcon: (node: FlowNode) => string;
    getJoinColor: (joinType: string) => string;
    getJoinVennDiagram: (joinType: string, isDark?: boolean) => string;
    getWarningColor: (severity: string) => string;
    truncate: (value: string, maxLen: number) => string;
}

export function renderClusterNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    const isDark = deps.state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'node-rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', getNodeAccentColor('cluster', isDark));
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '6,3');
    rect.setAttribute('filter', 'url(#shadow)');
    group.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + node.width / 2));
    label.setAttribute('y', String(node.y + node.height / 2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('fill', surface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = node.label;
    group.appendChild(label);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + node.width - 16));
    icon.setAttribute('y', String(node.y + 16));
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'middle');
    icon.setAttribute('fill', getNodeAccentColor('cluster', isDark));
    icon.setAttribute('font-size', '14');
    icon.setAttribute('font-weight', '700');
    icon.textContent = '+';
    group.appendChild(icon);
}

export function renderStandardNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    const isTable = node.type === 'table';
    const tableCategory = node.tableCategory || 'physical';
    const isDark = deps.state.isDarkTheme;
    const accentPosition = deps.getNodeAccentPosition();
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor(node.type, isDark);
    const textColor = surface.text;
    const textColorMuted = surface.textMuted;
    const textColorDim = isDark ? '#64748B' : '#94A3B8';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');

    if (isTable) {
        if (node.accessMode === 'write') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.write);
            rect.setAttribute('stroke-width', '2');
        } else if (node.accessMode === 'read') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.read);
            rect.setAttribute('stroke-width', '2');
        } else if (tableCategory === 'cte_reference') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.cte);
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('stroke-dasharray', '8,4');
        } else if (tableCategory === 'derived' || node.accessMode === 'derived') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.derived);
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('stroke-dasharray', '5,3');
        }
    }

    if (node.complexityLevel && node.complexityLevel !== 'low') {
        const complexityColor = node.complexityLevel === 'high' ? GLOW_COLORS.high : GLOW_COLORS.medium;
        rect.setAttribute('stroke', complexityColor.replace('0.4', '0.8'));
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '4,2');
    }

    group.appendChild(rect);

    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('rx', '0');
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 0 0 6px 6px)');
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('rx', '0');
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
    }
    accentStrip.setAttribute('fill', accentColor);
    accentStrip.setAttribute('class', 'node-accent');
    group.appendChild(accentStrip);

    const badges: Array<{ text: string; color: string }> = [];

    if (node.accessMode === 'read') {
        badges.push({ text: 'READ', color: BADGE_COLORS.read });
    } else if (node.accessMode === 'write') {
        badges.push({ text: 'WRITE', color: BADGE_COLORS.write });
    } else if (node.accessMode === 'derived') {
        badges.push({ text: 'DERIVED', color: BADGE_COLORS.derived });
    }

    if (isTable && tableCategory === 'cte_reference' && !node.accessMode) {
        badges.push({ text: 'CTE', color: BADGE_COLORS.cte });
    } else if (isTable && tableCategory === 'derived' && !node.accessMode) {
        badges.push({ text: 'DERIVED', color: BADGE_COLORS.derivedAlt });
    }

    if (node.operationType && node.operationType !== 'SELECT') {
        const opColors: Record<string, string> = {
            INSERT: BADGE_COLORS.insert,
            UPDATE: BADGE_COLORS.update,
            DELETE: BADGE_COLORS.delete,
            MERGE: BADGE_COLORS.merge,
            CREATE_TABLE_AS: BADGE_COLORS.createTableAs,
        };
        badges.push({ text: node.operationType, color: opColors[node.operationType] || '#6B7280' });
    }

    badges.forEach((badge, index) => {
        const badgeWidth = badge.text.length * 7 + 10;
        const badgeX = node.x + node.width - badgeWidth - (index * (badgeWidth + 4));

        const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        badgeRect.setAttribute('x', String(badgeX));
        badgeRect.setAttribute('y', String(node.y - 8));
        badgeRect.setAttribute('width', String(badgeWidth));
        badgeRect.setAttribute('height', '16');
        badgeRect.setAttribute('rx', '4');
        badgeRect.setAttribute('fill', badge.color);
        group.appendChild(badgeRect);

        const badgeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badgeLabel.setAttribute('x', String(badgeX + badgeWidth / 2));
        badgeLabel.setAttribute('y', String(node.y + 4));
        badgeLabel.setAttribute('text-anchor', 'middle');
        badgeLabel.setAttribute('fill', 'white');
        badgeLabel.setAttribute('font-size', '9');
        badgeLabel.setAttribute('font-weight', '700');
        badgeLabel.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        badgeLabel.textContent = badge.text;
        group.appendChild(badgeLabel);
    });

    const warningIndicator = getWarningIndicatorState(node.warnings);
    if (warningIndicator) {
        const triangleSize = 14;
        const triangleLeft = node.x + node.width - triangleSize - 6;
        const triangleTop = node.y + 6;

        const warningTriangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        warningTriangle.setAttribute('class', 'node-warning-triangle');
        warningTriangle.setAttribute('d', `M ${triangleLeft} ${triangleTop + triangleSize} L ${triangleLeft + triangleSize / 2} ${triangleTop} L ${triangleLeft + triangleSize} ${triangleTop + triangleSize} Z`);
        warningTriangle.setAttribute('fill', deps.getWarningColor(warningIndicator.severity));
        warningTriangle.setAttribute('opacity', '0.95');
        warningTriangle.setAttribute('filter', 'url(#shadow)');
        group.appendChild(warningTriangle);

        const exclamation = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        exclamation.setAttribute('class', 'node-warning-icon');
        exclamation.setAttribute('x', String(triangleLeft + triangleSize / 2));
        exclamation.setAttribute('y', String(triangleTop + triangleSize - 2));
        exclamation.setAttribute('text-anchor', 'middle');
        exclamation.setAttribute('fill', 'white');
        exclamation.setAttribute('font-size', '9');
        exclamation.setAttribute('font-weight', '700');
        exclamation.textContent = getSeverityIcon(warningIndicator.severity);
        group.appendChild(exclamation);

        if (warningIndicator.count > 1) {
            const countBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            countBadge.setAttribute('x', String(triangleLeft - 2));
            countBadge.setAttribute('y', String(triangleTop + 8));
            countBadge.setAttribute('text-anchor', 'end');
            countBadge.setAttribute('fill', deps.getWarningColor(warningIndicator.severity));
            countBadge.setAttribute('font-size', '9');
            countBadge.setAttribute('font-weight', '700');
            countBadge.textContent = `+${warningIndicator.count - 1}`;
            group.appendChild(countBadge);
        }
    }

    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('class', 'node-main-icon');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 24));
    iconText.setAttribute('fill', textColorMuted);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = deps.getNodeVisualIcon(node);
    group.appendChild(iconText);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 32));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', textColor);
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = deps.truncate(node.label, 14);
    group.appendChild(label);

    if (node.description) {
        const desc = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        desc.setAttribute('x', String(node.x + 12));
        desc.setAttribute('y', String(node.y + 44));
        desc.setAttribute('fill', textColorDim);
        desc.setAttribute('font-size', '10');
        desc.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        desc.textContent = deps.truncate(node.description, 20);
        group.appendChild(desc);
    }
}

export function renderJoinNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    const joinType = node.label || 'INNER JOIN';
    const joinColor = deps.getJoinColor(joinType);
    const isDark = deps.state.isDarkTheme;
    const accentPosition = deps.getNodeAccentPosition();
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const textColor = surface.text;
    const textColorMuted = surface.textMuted;
    const textColorDim = isDark ? '#64748B' : '#94A3B8';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 0 0 6px 6px)');
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
    }
    accentStrip.setAttribute('fill', joinColor);
    group.appendChild(accentStrip);

    const vennContainer = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    vennContainer.setAttribute('x', String(node.x + 8));
    vennContainer.setAttribute('y', String(node.y + 6));
    vennContainer.setAttribute('width', '32');
    vennContainer.setAttribute('height', '20');
    const vennDiv = document.createElement('div');
    vennDiv.innerHTML = deps.getJoinVennDiagram(joinType, isDark);
    vennDiv.style.cssText = 'display: flex; align-items: center; justify-content: center;';
    vennContainer.appendChild(vennDiv);
    group.appendChild(vennContainer);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 44));
    label.setAttribute('y', String(node.y + 20));
    label.setAttribute('fill', textColor);
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = deps.truncate(joinType, 12);
    group.appendChild(label);

    if (node.details && node.details.length > 0) {
        const condition = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        condition.setAttribute('x', String(node.x + 8));
        condition.setAttribute('y', String(node.y + 38));
        condition.setAttribute('fill', textColorMuted);
        condition.setAttribute('font-size', '9');
        condition.setAttribute('font-family', MONO_FONT_STACK);
        condition.textContent = deps.truncate(node.details[0], 18);
        group.appendChild(condition);

        if (node.details.length > 1) {
            const tableName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tableName.setAttribute('x', String(node.x + 8));
            tableName.setAttribute('y', String(node.y + 52));
            tableName.setAttribute('fill', textColorDim);
            tableName.setAttribute('font-size', '9');
            tableName.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            tableName.textContent = deps.truncate(node.details[1], 18);
            group.appendChild(tableName);
        }
    }
}

export function renderWindowNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    renderAnalyticalNodeVisual(node, group, deps, {
        accentType: 'window',
        icon: '▦',
        titleText: (count) => `WINDOW (${count})`,
        maxItems: 4,
    });
}

export function renderAggregateNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    renderAnalyticalNodeVisual(node, group, deps, {
        accentType: 'aggregate',
        icon: 'Σ',
        titleText: (count) => `AGGREGATE (${count})`,
        maxItems: 4,
    });
}

export function renderCaseNodeVisual(node: FlowNode, group: SVGGElement, deps: NodeVisualRendererDeps): void {
    const caseDetails = node.caseDetails!;
    const isDark = deps.state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('case', isDark);
    const accentPosition = deps.getNodeAccentPosition();
    const pillBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';
    const headerHeight = 32;
    const padding = 10;
    const caseHeight = 40;

    const rect = createStandardRect(node, surface);
    group.appendChild(rect);
    group.appendChild(createAccentStrip(node, accentColor, accentPosition));
    group.appendChild(createHeaderSeparator(node, surface, headerHeight));
    group.appendChild(createHeaderIcon(node, accentColor, '?'));
    group.appendChild(createHeaderTitle(node, surface.text, `CASE (${caseDetails.cases.length})`));

    let yOffset = node.y + headerHeight + 8;
    for (const caseStmt of caseDetails.cases.slice(0, 3)) {
        const casePill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        casePill.setAttribute('x', String(node.x + padding));
        casePill.setAttribute('y', String(yOffset));
        casePill.setAttribute('width', String(node.width - padding * 2));
        casePill.setAttribute('height', String(caseHeight));
        casePill.setAttribute('rx', '4');
        casePill.setAttribute('fill', pillBg);
        group.appendChild(casePill);

        const caseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        caseText.setAttribute('x', String(node.x + padding + 6));
        caseText.setAttribute('y', String(yOffset + 18));
        caseText.setAttribute('fill', accentColor);
        caseText.setAttribute('font-size', '10');
        caseText.setAttribute('font-weight', '600');
        caseText.setAttribute('font-family', MONO_FONT_STACK);
        caseText.textContent = `${caseStmt.conditions.length} WHEN condition${caseStmt.conditions.length > 1 ? 's' : ''}`;
        group.appendChild(caseText);

        if (caseStmt.elseValue) {
            const elseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            elseText.setAttribute('x', String(node.x + padding + 6));
            elseText.setAttribute('y', String(yOffset + 32));
            elseText.setAttribute('fill', surface.textMuted);
            elseText.setAttribute('font-size', '9');
            const truncatedElse = caseStmt.elseValue.length > 20 ? `${caseStmt.elseValue.substring(0, 17)}...` : caseStmt.elseValue;
            elseText.textContent = `ELSE: ${truncatedElse}`;
            group.appendChild(elseText);
        }

        yOffset += caseHeight + 4;
    }

    if (caseDetails.cases.length > 3) {
        const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moreText.setAttribute('x', String(node.x + node.width / 2));
        moreText.setAttribute('y', String(node.y + node.height - 8));
        moreText.setAttribute('text-anchor', 'middle');
        moreText.setAttribute('fill', surface.textMuted);
        moreText.setAttribute('font-size', '9');
        moreText.textContent = `+${caseDetails.cases.length - 3} more`;
        group.appendChild(moreText);
    }
}

function renderAnalyticalNodeVisual(
    node: FlowNode,
    group: SVGGElement,
    deps: NodeVisualRendererDeps,
    options: {
        accentType: 'window' | 'aggregate';
        icon: string;
        titleText: (count: number) => string;
        maxItems: number;
    }
): void {
    const isDark = deps.state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor(options.accentType, isDark);
    const accentPosition = deps.getNodeAccentPosition();
    const pillBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';
    const padding = 10;
    const headerHeight = 32;
    const funcHeight = 24;

    group.appendChild(createStandardRect(node, surface));
    group.appendChild(createAccentStrip(node, accentColor, accentPosition));
    group.appendChild(createHeaderSeparator(node, surface, headerHeight));
    if (options.accentType === 'window') {
        const details = node.windowDetails!;
        group.appendChild(createHeaderIcon(node, accentColor, options.icon));
        group.appendChild(createHeaderTitle(node, surface.text, options.titleText(details.functions.length)));

        let yOffset = node.y + headerHeight + 8;
        for (const func of details.functions.slice(0, options.maxItems)) {
            const funcPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            funcPill.setAttribute('x', String(node.x + padding));
            funcPill.setAttribute('y', String(yOffset));
            funcPill.setAttribute('width', String(node.width - padding * 2));
            funcPill.setAttribute('height', String(funcHeight));
            funcPill.setAttribute('rx', '4');
            funcPill.setAttribute('fill', pillBg);
            group.appendChild(funcPill);

            const funcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            funcText.setAttribute('x', String(node.x + padding + 6));
            funcText.setAttribute('y', String(yOffset + 16));
            funcText.setAttribute('fill', accentColor);
            funcText.setAttribute('font-size', '10');
            funcText.setAttribute('font-weight', '600');
            funcText.setAttribute('font-family', MONO_FONT_STACK);
            funcText.textContent = func.name;
            group.appendChild(funcText);

            let badgeX = node.x + padding + 6 + func.name.length * 6.5 + 8;

            if (func.partitionBy && func.partitionBy.length > 0) {
                const partBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                partBadge.setAttribute('x', String(badgeX));
                partBadge.setAttribute('y', String(yOffset + 4));
                partBadge.setAttribute('width', '16');
                partBadge.setAttribute('height', '14');
                partBadge.setAttribute('rx', '3');
                partBadge.setAttribute('fill', BADGE_COLORS.partitionBy);
                group.appendChild(partBadge);

                const partText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                partText.setAttribute('x', String(badgeX + 4));
                partText.setAttribute('y', String(yOffset + 14));
                partText.setAttribute('fill', 'white');
                partText.setAttribute('font-size', '8');
                partText.setAttribute('font-weight', '600');
                partText.textContent = 'P';
                group.appendChild(partText);
                badgeX += 20;
            }

            if (func.orderBy && func.orderBy.length > 0) {
                const orderBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                orderBadge.setAttribute('x', String(badgeX));
                orderBadge.setAttribute('y', String(yOffset + 4));
                orderBadge.setAttribute('width', '16');
                orderBadge.setAttribute('height', '14');
                orderBadge.setAttribute('rx', '3');
                orderBadge.setAttribute('fill', BADGE_COLORS.orderBy);
                group.appendChild(orderBadge);

                const orderText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                orderText.setAttribute('x', String(badgeX + 4));
                orderText.setAttribute('y', String(yOffset + 14));
                orderText.setAttribute('fill', 'white');
                orderText.setAttribute('font-size', '8');
                orderText.setAttribute('font-weight', '600');
                orderText.textContent = 'O';
                group.appendChild(orderText);
            }

            yOffset += funcHeight + 4;
        }

        if (details.functions.length > options.maxItems) {
            const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            moreText.setAttribute('x', String(node.x + node.width / 2));
            moreText.setAttribute('y', String(node.y + node.height - 8));
            moreText.setAttribute('text-anchor', 'middle');
            moreText.setAttribute('fill', surface.textMuted);
            moreText.setAttribute('font-size', '9');
            moreText.textContent = `+${details.functions.length - options.maxItems} more`;
            group.appendChild(moreText);
        }
        return;
    }

    const details = node.aggregateDetails!;
    group.appendChild(createHeaderIcon(node, accentColor, options.icon));
    group.appendChild(createHeaderTitle(node, surface.text, options.titleText(details.functions.length)));

    let yOffset = node.y + headerHeight + 8;
    for (const func of details.functions.slice(0, options.maxItems)) {
        const funcPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        funcPill.setAttribute('x', String(node.x + padding));
        funcPill.setAttribute('y', String(yOffset));
        funcPill.setAttribute('width', String(node.width - padding * 2));
        funcPill.setAttribute('height', String(funcHeight));
        funcPill.setAttribute('rx', '4');
        funcPill.setAttribute('fill', pillBg);
        group.appendChild(funcPill);

        const funcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcText.setAttribute('x', String(node.x + padding + 6));
        funcText.setAttribute('y', String(yOffset + 16));
        funcText.setAttribute('fill', accentColor);
        funcText.setAttribute('font-size', '10');
        funcText.setAttribute('font-weight', '600');
        funcText.setAttribute('font-family', MONO_FONT_STACK);
        const expr = func.expression || '';
        funcText.textContent = expr.length > 25 ? `${expr.substring(0, 22)}...` : expr;
        group.appendChild(funcText);

        yOffset += funcHeight + 4;
    }

    if (details.functions.length > options.maxItems) {
        const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moreText.setAttribute('x', String(node.x + node.width / 2));
        moreText.setAttribute('y', String(node.y + node.height - 8));
        moreText.setAttribute('text-anchor', 'middle');
        moreText.setAttribute('fill', surface.textMuted);
        moreText.setAttribute('font-size', '9');
        moreText.textContent = `+${details.functions.length - options.maxItems} more`;
        group.appendChild(moreText);
    }
}

function createStandardRect(node: FlowNode, surface: { fill: string; border: string }): SVGRectElement {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    return rect;
}

function createAccentStrip(node: FlowNode, accentColor: string, accentPosition: 'left' | 'bottom'): SVGRectElement {
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 0 0 6px 6px)');
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
    }
    accentStrip.setAttribute('fill', accentColor);
    return accentStrip;
}

function createHeaderSeparator(node: FlowNode, surface: { border: string }, headerHeight: number): SVGLineElement {
    const headerSep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerSep.setAttribute('x1', String(node.x + 8));
    headerSep.setAttribute('y1', String(node.y + headerHeight));
    headerSep.setAttribute('x2', String(node.x + node.width - 8));
    headerSep.setAttribute('y2', String(node.y + headerHeight));
    headerSep.setAttribute('stroke', surface.border);
    headerSep.setAttribute('stroke-width', '1');
    return headerSep;
}

function createHeaderIcon(node: FlowNode, accentColor: string, iconText: string): SVGTextElement {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', accentColor);
    icon.setAttribute('font-size', '12');
    icon.textContent = iconText;
    return icon;
}

function createHeaderTitle(node: FlowNode, textColor: string, titleText: string): SVGTextElement {
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', textColor);
    title.setAttribute('font-size', '12');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    title.textContent = titleText;
    return title;
}
