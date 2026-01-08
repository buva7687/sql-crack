# SQL Crack Test Suite

Comprehensive test suite for all features implemented in SQL Crack VS Code extension.

## Test Coverage

### Core Features (Implemented Before)

### 1. **SQL Parser Tests** (`sqlParser.test.ts`)
- ✅ Parse SELECT queries (simple, with WHERE, JOIN, GROUP BY, ORDER BY, LIMIT)
- ✅ Parse INSERT queries (simple, multiple values, with SELECT)
- ✅ Parse UPDATE queries (with/without WHERE, multiple SET clauses)
- ✅ Parse DELETE queries (with/without WHERE)
- ✅ Support all SQL dialects (MySQL, PostgreSQL, SQL Server, SQLite, MariaDB)
- ✅ Parse CTEs (Common Table Expressions)
- ✅ Parse window functions (ROW_NUMBER, PARTITION BY)
- ✅ Parse subqueries
- ✅ Parse set operations (UNION, INTERSECT, EXCEPT)
- ✅ Parse all JOIN types (INNER, LEFT, RIGHT, FULL OUTER)
- ✅ Parse CASE statements
- ✅ Node and edge creation
- ✅ Node styling and positioning
- ✅ Error handling for invalid SQL
- ✅ Schema mode detection
- ✅ AST structure validation

### 2. **Schema Parser Tests** (`schemaParser.test.ts`)
- ✅ Parse simple CREATE TABLE statements
- ✅ Detect primary keys
- ✅ Parse tables with multiple columns
- ✅ Detect AUTO_INCREMENT/SERIAL/IDENTITY
- ✅ Detect NOT NULL, DEFAULT, UNIQUE constraints
- ✅ Detect foreign key constraints (inline and separate)
- ✅ Create edges for foreign key relationships
- ✅ Handle multiple foreign keys
- ✅ Parse multiple CREATE TABLE statements
- ✅ Support all SQL dialects
- ✅ Node styling with gradients and borders
- ✅ Handle all data types (INT, VARCHAR, TEXT, DECIMAL, TIMESTAMP, BOOLEAN)
- ✅ Complex schemas with relationships
- ✅ Composite primary keys
- ✅ CHECK constraints
- ✅ Node layout and positioning
- ✅ AST structure for CREATE TABLE

### 3. **Themes Tests** (`themes.test.ts`)
- ✅ All 5 themes present (Dark, Light, Ocean, Forest, Sunset)
- ✅ Theme structure validation
- ✅ All required color properties (background, panel, node, dotColor)
- ✅ Valid hex color formats
- ✅ Theme uniqueness (no duplicate colors)
- ✅ Color accessibility and contrast
- ✅ Type safety and interface compliance
- ✅ Color consistency (lowercase, 6-digit hex)
- ✅ Brightness levels (dark vs light)
- ✅ Theme export and accessibility

### High-Value Features (Implemented Today)

### 4. **Optimization Hints Tests** (`optimizationHints.test.ts`)
- ✅ Detection of `SELECT *` usage
- ✅ Detection of missing `LIMIT` clause
- ✅ Detection of `UPDATE` without `WHERE`
- ✅ Detection of `DELETE` without `WHERE`
- ✅ Detection of `NOT IN` usage
- ✅ Detection of `OR` in WHERE clause
- ✅ Hint severity levels (error, warning, info)
- ✅ Hint colors and icons
- ✅ Multiple issues detection
- ✅ Well-optimized query validation

### 5. **Query Storage Tests** (`queryStorage.test.ts`)
- ✅ Save query with auto-generated ID and timestamps
- ✅ Retrieve all saved queries
- ✅ Update existing query
- ✅ Delete query by ID
- ✅ Query history management (max 20)
- ✅ Search queries by name, SQL content, and tags
- ✅ Export queries as JSON
- ✅ Import queries from JSON
- ✅ Storage statistics
- ✅ localStorage integration
- ✅ Error handling for corrupted data

### 6. **Batch Processing Tests** (`batchProcessor.test.ts`)
- ✅ Split queries by semicolon
- ✅ Remove empty queries
- ✅ Trim whitespace
- ✅ Handle single query
- ✅ Detect multiple queries
- ✅ Process multiple valid queries
- ✅ Handle queries with errors
- ✅ Generate query IDs
- ✅ Include nodes, edges, and AST
- ✅ Support different SQL dialects
- ✅ Handle mixed query types (SELECT, INSERT, UPDATE, DELETE)
- ✅ Query preview generation

### 7. **Documentation Generator Tests** (`documentationGenerator.test.ts`)
- ✅ Generate documentation for SELECT queries
- ✅ Generate documentation for INSERT queries
- ✅ Generate documentation for UPDATE queries
- ✅ Generate documentation for DELETE queries
- ✅ Detect tables with aliases
- ✅ Detect JOIN operations
- ✅ Detect aggregations (COUNT, AVG, SUM, etc.)
- ✅ Detect filters and conditions
- ✅ Detect ORDER BY clauses
- ✅ Warning for missing LIMIT
- ✅ Warning for UPDATE/DELETE without WHERE
- ✅ Generate data flow steps
- ✅ Assess query complexity
- ✅ Export as Markdown
- ✅ Include all documentation sections
- ✅ Error handling

### 8. **Data Flow Analysis Tests** (`dataFlowAnalysis.test.ts`)
- ✅ Analyze SELECT query data flow
- ✅ Detect JOIN transformations
- ✅ Detect FILTER transformations
- ✅ Detect AGGREGATE transformations
- ✅ Detect SORT transformations
- ✅ Detect LIMIT transformations
- ✅ Estimate data volumes at each stage
- ✅ Track column lineage for simple columns
- ✅ Track column lineage for aggregations
- ✅ Track column lineage for calculations
- ✅ Identify multiple transformation points
- ✅ Generate meaningful flow summaries
- ✅ Handle INSERT/UPDATE/DELETE queries
- ✅ Assess transformation impact levels
- ✅ Impact colors and icons

### 9. **Query Statistics Tests** (`queryStats.test.ts`)
- ✅ Count total nodes
- ✅ Count tables
- ✅ Count joins
- ✅ Count CTEs
- ✅ Count window functions
- ✅ Count subqueries
- ✅ Count set operations (UNION, INTERSECT, EXCEPT)
- ✅ Calculate complexity for simple queries
- ✅ Calculate complexity for moderate queries
- ✅ Calculate complexity for complex queries
- ✅ Complexity colors
- ✅ Handle empty inputs

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

## Test Structure

```
src/__tests__/
├── setup.ts                        # Test setup and mocks
├── sqlParser.test.ts               # Core SQL parser tests (60 tests)
├── schemaParser.test.ts            # Schema parser tests (50 tests)
├── themes.test.ts                  # Theme tests (32 tests)
├── optimizationHints.test.ts       # Optimization hints tests (10 tests)
├── queryStorage.test.ts            # Local storage tests (23 tests)
├── batchProcessor.test.ts          # Batch processing tests (19 tests)
├── documentationGenerator.test.ts  # Documentation tests (19 tests)
├── dataFlowAnalysis.test.ts        # Data flow analysis tests (24 tests)
├── queryStats.test.ts              # Query statistics tests (15 tests)
└── README.md                       # This file
```

## Test Coverage Goals

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## Technologies Used

- **Jest**: Testing framework
- **ts-jest**: TypeScript support for Jest
- **@testing-library/jest-dom**: DOM matchers
- **@testing-library/react**: React component testing
- **jest-environment-jsdom**: Browser-like environment

## Mocked Dependencies

- `localStorage`: Mocked in `setup.ts`
- `window.prompt`: Mocked in `setup.ts`
- `window.confirm`: Mocked in `setup.ts`
- `URL.createObjectURL`: Mocked in `setup.ts`

## Writing New Tests

When adding new features, follow this pattern:

```typescript
import { yourFunction } from '../webview/yourModule';

describe('Your Module', () => {
  beforeEach(() => {
    // Setup before each test
    jest.clearAllMocks();
  });

  describe('yourFunction', () => {
    it('should do something', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = yourFunction(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge cases', () => {
      // Test edge cases
      expect(yourFunction('')).toBe('default');
      expect(yourFunction(null)).toBeUndefined();
    });
  });
});
```

## Continuous Integration

Tests should be run on every commit to ensure:
1. All features work as expected
2. No regressions are introduced
3. Code quality is maintained
4. Coverage thresholds are met

## Test Validation Summary

| Feature | Tests | Status |
|---------|-------|--------|
| **Core Features** | | |
| SQL Parser | 60 | ✅ Ready |
| Schema Parser | 50 | ✅ Ready |
| Themes | 32 | ✅ Ready |
| **High-Value Features** | | |
| Optimization Hints | 10 | ✅ Ready |
| Query Storage | 23 | ✅ Ready |
| Batch Processing | 19 | ✅ Ready |
| Documentation Generator | 19 | ✅ Ready |
| Data Flow Analysis | 24 | ✅ Ready |
| Query Statistics | 15 | ✅ Ready |
| **Total** | **252** | ✅ Ready |

## Next Steps

1. Run `npm install` to install test dependencies
2. Run `npm test` to execute all tests
3. Review coverage report in `coverage/` directory
4. Fix any failing tests
5. Ensure 70%+ coverage on all metrics

---

**All features have comprehensive test coverage and are ready for validation!**
