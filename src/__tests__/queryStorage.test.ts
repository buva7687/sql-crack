import {
  saveQuery,
  getSavedQueries,
  updateQuery,
  deleteQuery,
  addToHistory,
  getQueryHistory,
  searchQueries,
  exportQueries,
  importQueries,
  getStorageStats,
  SavedQuery
} from '../webview/queryStorage';

describe('Query Storage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('saveQuery', () => {
    it('should save a query with auto-generated ID and timestamps', () => {
      const query = {
        name: 'Test Query',
        sql: 'SELECT * FROM users',
        dialect: 'MySQL'
      };

      const saved = saveQuery(query);

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Test Query');
      expect(saved.sql).toBe('SELECT * FROM users');
      expect(saved.dialect).toBe('MySQL');
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should save query to localStorage', () => {
      const query = {
        name: 'Test Query',
        sql: 'SELECT * FROM users',
        dialect: 'MySQL'
      };

      saveQuery(query);

      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should handle queries with tags', () => {
      const query = {
        name: 'Test Query',
        sql: 'SELECT * FROM users',
        dialect: 'MySQL',
        tags: ['reporting', 'users']
      };

      const saved = saveQuery(query);

      expect(saved.tags).toEqual(['reporting', 'users']);
    });
  });

  describe('getSavedQueries', () => {
    it('should return empty array when no queries saved', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const queries = getSavedQueries();

      expect(queries).toEqual([]);
    });

    it('should return all saved queries', () => {
      const mockQueries: SavedQuery[] = [
        {
          id: '1',
          name: 'Query 1',
          sql: 'SELECT * FROM users',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockQueries));

      const queries = getSavedQueries();

      expect(queries).toHaveLength(1);
      expect(queries[0].name).toBe('Query 1');
    });

    it('should handle corrupted localStorage data', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue('invalid json');

      const queries = getSavedQueries();

      expect(queries).toEqual([]);
    });
  });

  describe('updateQuery', () => {
    it('should update an existing query', () => {
      const existingQuery: SavedQuery = {
        id: '1',
        name: 'Old Name',
        sql: 'SELECT * FROM users',
        dialect: 'MySQL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([existingQuery]));

      const result = updateQuery('1', { name: 'New Name' });

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should return false for non-existent query', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([]));

      const result = updateQuery('non-existent', { name: 'New Name' });

      expect(result).toBe(false);
    });

    it('should update updatedAt timestamp', () => {
      const existingQuery: SavedQuery = {
        id: '1',
        name: 'Test',
        sql: 'SELECT * FROM users',
        dialect: 'MySQL',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([existingQuery]));

      updateQuery('1', { name: 'Updated' });

      const setItemCall = (localStorage.setItem as jest.Mock).mock.calls[0];
      const updatedQueries = JSON.parse(setItemCall[1]);
      expect(new Date(updatedQueries[0].updatedAt).getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00.000Z').getTime()
      );
    });
  });

  describe('deleteQuery', () => {
    it('should delete an existing query', () => {
      const queries: SavedQuery[] = [
        {
          id: '1',
          name: 'Query 1',
          sql: 'SELECT * FROM users',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(queries));

      const result = deleteQuery('1');

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should return false for non-existent query', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([]));

      const result = deleteQuery('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('Query History', () => {
    it('should add queries to history', () => {
      addToHistory('SELECT * FROM users', 'MySQL');

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'sql-crack-history',
        expect.any(String)
      );
    });

    it('should limit history to 20 queries', () => {
      // Add 25 queries to history
      for (let i = 0; i < 25; i++) {
        addToHistory(`SELECT * FROM table${i}`, 'MySQL');
      }

      const history = getQueryHistory();
      expect(history.length).toBeLessThanOrEqual(20);
    });

    it('should return empty array when no history', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const history = getQueryHistory();

      expect(history).toEqual([]);
    });
  });

  describe('searchQueries', () => {
    beforeEach(() => {
      const queries: SavedQuery[] = [
        {
          id: '1',
          name: 'User Query',
          sql: 'SELECT * FROM users WHERE active = 1',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['users', 'reporting']
        },
        {
          id: '2',
          name: 'Order Query',
          sql: 'SELECT * FROM orders',
          dialect: 'PostgreSQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['orders']
        }
      ];

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(queries));
    });

    it('should search by name', () => {
      const results = searchQueries('User');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('User Query');
    });

    it('should search by SQL content', () => {
      const results = searchQueries('orders');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Order Query');
    });

    it('should search by tags', () => {
      const results = searchQueries('reporting');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('User Query');
    });

    it('should be case insensitive', () => {
      const results = searchQueries('USER');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('User Query');
    });

    it('should return empty array for no matches', () => {
      const results = searchQueries('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('Export/Import', () => {
    it('should export queries as JSON', () => {
      const queries: SavedQuery[] = [
        {
          id: '1',
          name: 'Test Query',
          sql: 'SELECT * FROM users',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(queries));

      const exported = exportQueries();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Test Query');
    });

    it('should import queries from JSON', () => {
      const queries = [
        {
          id: '1',
          name: 'Imported Query',
          sql: 'SELECT * FROM users',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      const count = importQueries(JSON.stringify(queries));

      expect(count).toBe(1);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should return 0 for invalid JSON import', () => {
      const count = importQueries('invalid json');

      expect(count).toBe(0);
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', () => {
      const queries: SavedQuery[] = [
        {
          id: '1',
          name: 'Query 1',
          sql: 'SELECT * FROM users',
          dialect: 'MySQL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      (localStorage.getItem as jest.Mock)
        .mockReturnValueOnce(JSON.stringify(queries)) // saved queries
        .mockReturnValueOnce(JSON.stringify([{ sql: 'SELECT 1', dialect: 'MySQL', timestamp: new Date().toISOString() }])); // history

      const stats = getStorageStats();

      expect(stats.savedCount).toBe(1);
      expect(stats.historyCount).toBe(1);
      expect(stats.storageUsed).toBeGreaterThan(0);
    });

    it('should handle empty storage', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const stats = getStorageStats();

      expect(stats.savedCount).toBe(0);
      expect(stats.historyCount).toBe(0);
      expect(stats.storageUsed).toBe(0);
    });
  });
});
