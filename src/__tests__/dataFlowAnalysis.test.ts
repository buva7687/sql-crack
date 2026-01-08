import { analyzeDataFlow, getImpactColor, getTransformationIcon } from '../webview/dataFlowAnalysis';
import { parseSqlToGraph } from '../webview/sqlParser';
import { Parser } from 'node-sql-parser';

describe('Data Flow Analysis', () => {
  const parser = new Parser();

  describe('analyzeDataFlow', () => {
    it('should analyze SELECT query data flow', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1 LIMIT 10';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      expect(analysis.flowSummary).toBeDefined();
      expect(analysis.transformationPoints).toBeDefined();
      expect(analysis.dataVolumeEstimates).toBeDefined();
    });

    it('should detect JOIN transformations', () => {
      const sql = 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const joinTransform = analysis.transformationPoints.find(t => t.type === 'join');
      expect(joinTransform).toBeDefined();
      expect(joinTransform?.estimatedImpact).toBeDefined();
    });

    it('should detect FILTER transformations', () => {
      const sql = 'SELECT * FROM users WHERE active = 1 AND role = "admin"';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const filterTransform = analysis.transformationPoints.find(t => t.type === 'filter');
      expect(filterTransform).toBeDefined();
      expect(filterTransform?.description).toContain('WHERE');
    });

    it('should detect AGGREGATE transformations', () => {
      const sql = 'SELECT department_id, COUNT(*) FROM employees GROUP BY department_id';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const aggregateTransform = analysis.transformationPoints.find(t => t.type === 'aggregate');
      expect(aggregateTransform).toBeDefined();
      expect(aggregateTransform?.description).toContain('GROUP BY');
    });

    it('should detect SORT transformations', () => {
      const sql = 'SELECT * FROM users ORDER BY created_at DESC';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const sortTransform = analysis.transformationPoints.find(t => t.type === 'sort');
      expect(sortTransform).toBeDefined();
      expect(sortTransform?.description).toContain('ORDER BY');
    });

    it('should detect LIMIT transformations', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const limitTransform = analysis.transformationPoints.find(t => t.type === 'limit');
      expect(limitTransform).toBeDefined();
      expect(limitTransform?.description).toContain('LIMIT');
    });

    it('should estimate data volumes for SELECT', () => {
      const sql = 'SELECT * FROM users WHERE active = 1 LIMIT 10';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      expect(analysis.dataVolumeEstimates.length).toBeGreaterThan(0);

      const sourceEstimate = analysis.dataVolumeEstimates.find(e => e.stage.includes('Source'));
      expect(sourceEstimate?.estimatedRows).toBe('many');

      const afterFilter = analysis.dataVolumeEstimates.find(e => e.stage.includes('WHERE'));
      expect(afterFilter?.estimatedRows).toBe('reduced');

      const finalEstimate = analysis.dataVolumeEstimates.find(e => e.stage.includes('Final'));
      expect(finalEstimate?.estimatedRows).toBe('few');
    });

    it('should estimate data volumes for UPDATE', () => {
      const sql = 'UPDATE users SET active = 1 WHERE id = 123';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const updateEstimate = analysis.dataVolumeEstimates.find(e => e.stage.includes('Updated'));
      expect(updateEstimate).toBeDefined();
      expect(updateEstimate?.estimatedRows).toBe('reduced');
    });

    it('should estimate data volumes for DELETE', () => {
      const sql = 'DELETE FROM users WHERE id = 123';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const deleteEstimate = analysis.dataVolumeEstimates.find(e => e.stage.includes('Deleted'));
      expect(deleteEstimate).toBeDefined();
      expect(deleteEstimate?.estimatedRows).toBe('reduced');
    });

    it('should track column lineage for simple columns', () => {
      const sql = 'SELECT id, name, email FROM users';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      expect(analysis.columnLineage.length).toBeGreaterThan(0);

      const idLineage = analysis.columnLineage.find(l => l.outputColumn === 'id');
      expect(idLineage).toBeDefined();
      expect(idLineage?.transformationType).toBe('direct');
    });

    it('should track column lineage for aggregations', () => {
      const sql = 'SELECT COUNT(*) as total, AVG(price) as avg_price FROM products';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const countLineage = analysis.columnLineage.find(l => l.outputColumn === 'total');
      expect(countLineage).toBeDefined();
      expect(countLineage?.transformationType).toBe('aggregation');
      expect(countLineage?.expression).toContain('COUNT');

      const avgLineage = analysis.columnLineage.find(l => l.outputColumn === 'avg_price');
      expect(avgLineage).toBeDefined();
      expect(avgLineage?.transformationType).toBe('aggregation');
      expect(avgLineage?.expression).toContain('AVG');
    });

    it('should track column lineage for calculations', () => {
      const sql = 'SELECT price * quantity as total FROM order_items';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const calcLineage = analysis.columnLineage.find(l => l.outputColumn === 'total');
      expect(calcLineage?.transformationType).toBe('calculation');
      expect(calcLineage?.sourceColumns.length).toBeGreaterThan(0);
    });

    it('should identify multiple transformation points', () => {
      const sql = `
        SELECT u.name, COUNT(o.id) as order_count
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE u.active = 1
        GROUP BY u.id
        HAVING COUNT(o.id) > 5
        ORDER BY order_count DESC
        LIMIT 10
      `;
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      expect(analysis.transformationPoints.length).toBeGreaterThanOrEqual(5);
      expect(analysis.transformationPoints.some(t => t.type === 'join')).toBe(true);
      expect(analysis.transformationPoints.some(t => t.type === 'filter')).toBe(true);
      expect(analysis.transformationPoints.some(t => t.type === 'aggregate')).toBe(true);
      expect(analysis.transformationPoints.some(t => t.type === 'sort')).toBe(true);
      expect(analysis.transformationPoints.some(t => t.type === 'limit')).toBe(true);
    });

    it('should generate meaningful flow summaries', () => {
      const simpleSQL = 'SELECT id FROM users';
      const { nodes: simpleNodes, edges: simpleEdges, ast: simpleAST } = parseSqlToGraph(simpleSQL, 'MySQL');
      const simpleAnalysis = analyzeDataFlow(simpleAST, simpleNodes, simpleEdges);

      expect(simpleAnalysis.flowSummary).toBeTruthy();

      const complexSQL = 'SELECT u.name, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id ORDER BY COUNT(*) DESC';
      const { nodes: complexNodes, edges: complexEdges, ast: complexAST } = parseSqlToGraph(complexSQL, 'MySQL');
      const complexAnalysis = analyzeDataFlow(complexAST, complexNodes, complexEdges);

      expect(complexAnalysis.flowSummary).toContain('combines');
      expect(complexAnalysis.flowSummary).toContain('filters');
      expect(complexAnalysis.flowSummary).toContain('aggregates');
      expect(complexAnalysis.flowSummary).toContain('sorts');
    });

    it('should handle INSERT queries', () => {
      const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      expect(analysis.transformationPoints.length).toBeGreaterThan(0);
      expect(analysis.flowSummary).toBeDefined();
    });

    it('should handle queries without AST gracefully', () => {
      const analysis = analyzeDataFlow({ type: 'unknown' }, [], []);

      expect(analysis.flowSummary).toBeDefined();
      expect(analysis.transformationPoints).toEqual([]);
      expect(analysis.columnLineage).toEqual([]);
    });

    it('should assess impact levels correctly', () => {
      const sql = 'SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id JOIN order_items oi ON o.id = oi.order_id';
      const { nodes, edges, ast } = parseSqlToGraph(sql, 'MySQL');
      const analysis = analyzeDataFlow(ast, nodes, edges);

      const joinTransform = analysis.transformationPoints.find(t => t.type === 'join');
      expect(joinTransform?.estimatedImpact).toBe('high'); // 2+ joins should be high impact
    });
  });

  describe('getImpactColor', () => {
    it('should return red for high impact', () => {
      expect(getImpactColor('high')).toBe('#f56565');
    });

    it('should return orange for medium impact', () => {
      expect(getImpactColor('medium')).toBe('#ed8936');
    });

    it('should return green for low impact', () => {
      expect(getImpactColor('low')).toBe('#48bb78');
    });

    it('should return default color for unknown impact', () => {
      expect(getImpactColor('unknown')).toBe('#888');
    });
  });

  describe('getTransformationIcon', () => {
    it('should return correct icon for join', () => {
      expect(getTransformationIcon('join')).toBe('🔗');
    });

    it('should return correct icon for filter', () => {
      expect(getTransformationIcon('filter')).toBe('🔍');
    });

    it('should return correct icon for aggregate', () => {
      expect(getTransformationIcon('aggregate')).toBe('📊');
    });

    it('should return correct icon for sort', () => {
      expect(getTransformationIcon('sort')).toBe('⬆️');
    });

    it('should return correct icon for limit', () => {
      expect(getTransformationIcon('limit')).toBe('✂️');
    });

    it('should return default icon for unknown type', () => {
      expect(getTransformationIcon('unknown')).toBe('⚙️');
    });
  });
});
