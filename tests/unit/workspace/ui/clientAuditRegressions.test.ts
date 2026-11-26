import { createFakeElement } from '../../../helpers/fakeDom';
import { getDirectionButtonsScriptFragment } from '../../../../src/workspace/ui/scripts/directionButtons';
import { getGraphInteractionsScriptFragment } from '../../../../src/workspace/ui/scripts/graphInteractions';
import { getImpactFormScriptFragment } from '../../../../src/workspace/ui/scripts/impactForm';
import { getLineageGraphScriptFragment } from '../../../../src/workspace/ui/scripts/lineageGraph';
import { getVisualLineageSearchScriptFragment } from '../../../../src/workspace/ui/scripts/lineageSearch';

const pressEnter = (input: ReturnType<typeof createFakeElement>) => input.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    preventDefault: jest.fn(),
});

function tableRow(name: string) {
    const row = createFakeElement('button');
    row.setAttribute('data-name', name);
    row.setAttribute('data-type', 'table');
    row.setAttribute('data-node-id', `table:${name}`);
    return Object.assign(row, {
        click: () => row.dispatchEvent({ type: 'click', preventDefault: jest.fn() }),
    });
}

function createImpactForm() {
    const input = Object.assign(createFakeElement('input'), { value: '' });
    const id = Object.assign(createFakeElement('input'), { value: '', dataset: {} });
    const results = createFakeElement('div');
    results.querySelectorAll.mockReturnValue(['orders', 'payments'].map(tableRow));
    const elements = new Map([
        ['impact-table-input', input],
        ['impact-table-id', id],
        ['impact-typeahead-results', results],
    ]);
    return { elements, input, id, results };
}

function createImpactRuntime() {
    const document = Object.assign(createFakeElement('document'), { getElementById: jest.fn() });
    const setupImpactForm = new Function('document', `
        ${getImpactFormScriptFragment()}
        return setupImpactForm;
    `)(document);
    const renderForm = () => {
        const form = createImpactForm();
        document.getElementById.mockImplementation((id: string) => form.elements.get(id) ?? null);
        setupImpactForm();
        return form;
    };
    return { document, renderForm };
}

describe('Workspace client audit regressions', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('restores surviving path endpoints when restoring the selection writes Graph state', () => {
        const ordersId = 'graph:table:orders';
        const removedId = 'graph:table:accounts';
        const orders = tableRow('orders');
        orders.setAttribute('data-id', ordersId);
        const document = createFakeElement('document');
        document.querySelector.mockReturnValue(orders);
        document.querySelectorAll.mockReturnValue([orders]);
        const script = getGraphInteractionsScriptFragment();
        const restore = script.slice(script.indexOf('const persistedGraphUiState ='));
        const state = new Function('document', 'ordersId', 'removedId', `
            let state = { pathStartNodeId: ordersId, pathEndNodeId: removedId };
            let pathStartNodeId = null, pathEndNodeId = null, selectedNodeId = null;
            const initialSearchQuery = '';
            const getPersistedGraphUiState = () => state;
            const getPersistedGraphSelectionId = () => ordersId;
            const persistActiveGraphUiState = () => { state = { pathStartNodeId, pathEndNodeId }; };
            const updateSelectionPanel = node => {
                selectedNodeId = node.getAttribute('data-id');
                persistActiveGraphUiState();
            };
            function updatePathBuilderUi() {}
            function updateGraphActionButtons() {}
            function syncGraphContextUi() {}
            ${restore}
            return { ...state, selectedNodeId };
        `)(document, ordersId, removedId);

        expect(state).toEqual({ selectedNodeId: ordersId, pathStartNodeId: ordersId, pathEndNodeId: null });
    });

    it('filters the current Impact query before selecting with Enter', () => {
        const { input, id } = createImpactRuntime().renderForm();
        input.value = 'payments';
        input.dispatchEvent({ type: 'input' });
        pressEnter(input);
        expect(id.value).toBe('table:payments');

        input.value = 'missing';
        input.dispatchEvent({ type: 'input' });
        pressEnter(input);
        expect(id.value).toBe('');
    });

    it('closes only the current Impact typeahead after form replacement', () => {
        const { document, renderForm } = createImpactRuntime();
        const forms = [renderForm(), renderForm(), renderForm()];
        forms.forEach(form => { form.results.style.display = 'block'; });

        document.dispatchEvent({ type: 'click', target: { closest: () => null } });

        expect(document.addEventListener).toHaveBeenCalledTimes(1);
        expect(forms.map(form => form.results.style.display)).toEqual(['block', 'block', 'none']);
    });

    it('enables the direction buttons in an empty Lineage view with no SVG', () => {
        const document = createFakeElement('document');
        const buttons = ['both', 'downstream'].map(direction => {
            const button = tableRow('orders');
            button.setAttribute('data-direction', direction);
            return button;
        });
        document.querySelectorAll.mockReturnValue(buttons);
        const postMessage = jest.fn();

        new Function('document', 'localStorage', 'postWorkspaceMessage', `
            const lineageDepth = 5;
            ${getDirectionButtonsScriptFragment()}
            ${getLineageGraphScriptFragment()}
            setupLineageGraphInteractions();
        `)(Object.assign(document, { getElementById: () => null }), { getItem: () => null }, postMessage);
        buttons.forEach(button => button.dispatchEvent({
            type: 'click', preventDefault: jest.fn(), stopPropagation: jest.fn(),
        }));

        expect(postMessage.mock.calls.map(([request]) => request)).toEqual(
            ['both', 'downstream'].map(direction => ({
                command: 'getLineageGraph', nodeId: 'table:orders', direction, depth: 5, expandedNodes: [],
            })),
        );
    });

    it('filters the current Lineage query before Enter and keeps quoted names in the grid', () => {
        const document = createFakeElement('document');
        const input = Object.assign(createFakeElement('input'), { value: '' });
        const showAll = tableRow('');
        const rows = ['Orders', 'orders', 'payments'].map(tableRow);
        const labels = rows.map(row => {
            const element = createFakeElement('span');
            element.setAttribute('class', 'table-item-name');
            row.appendChild(element);
            return element;
        });
        const grid = createFakeElement('div');
        grid.querySelectorAll.mockReturnValue(rows);
        grid.querySelector.mockImplementation(() => rows.find(row => row.style.display !== 'none') ?? null);
        document.querySelectorAll.mockImplementation((selector: string) =>
            selector === '.lineage-table-item, .popular-item' ? rows : []);
        const elements = new Map([
            ['lineage-search-input', input],
            ['lineage-show-all-btn', showAll],
            ['lineage-tables-grid', grid],
        ]);
        const postMessage = jest.fn();

        new Function('document', 'window', 'postWorkspaceMessage', `
            const lineageContent = null, lineageDepth = 5, lineageCurrentDirection = 'both';
            function persistLineageSearchState() {}
            function escapeHtml(value) { return value; }
            ${getVisualLineageSearchScriptFragment()}
            setupVisualLineageSearch();
        `)(Object.assign(document, { getElementById: (id: string) => elements.get(id) ?? null }), {}, postMessage);
        showAll.click();
        expect(labels.map(label => label.textContent)).toEqual(['Orders', 'orders', 'payments']);

        input.value = 'PAYMENTS';
        input.dispatchEvent({ type: 'input' });
        pressEnter(input);
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'table:payments' }));

        input.value = 'missing';
        input.dispatchEvent({ type: 'input' });
        pressEnter(input);
        expect(postMessage).toHaveBeenCalledTimes(1);
    });
});
