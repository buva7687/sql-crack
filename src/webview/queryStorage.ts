export interface SavedQuery {
    id: string;
    name: string;
    sql: string;
    dialect: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
}

const STORAGE_KEY = 'sql-crack-saved-queries';
const HISTORY_KEY = 'sql-crack-query-history';
const MAX_HISTORY = 20;

// Save a query
export function saveQuery(query: Omit<SavedQuery, 'id' | 'createdAt' | 'updatedAt'>): SavedQuery {
    const queries = getSavedQueries();
    const now = new Date().toISOString();

    const newQuery: SavedQuery = {
        ...query,
        id: generateId(),
        createdAt: now,
        updatedAt: now
    };

    queries.push(newQuery);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));

    return newQuery;
}

// Get all saved queries
export function getSavedQueries(): SavedQuery[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading saved queries:', error);
        return [];
    }
}

// Update a query
export function updateQuery(id: string, updates: Partial<Omit<SavedQuery, 'id' | 'createdAt'>>): boolean {
    const queries = getSavedQueries();
    const index = queries.findIndex(q => q.id === id);

    if (index === -1) return false;

    queries[index] = {
        ...queries[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
    return true;
}

// Delete a query
export function deleteQuery(id: string): boolean {
    const queries = getSavedQueries();
    const filtered = queries.filter(q => q.id !== id);

    if (filtered.length === queries.length) return false;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
}

// Add to query history
export function addToHistory(sql: string, dialect: string): void {
    const history = getQueryHistory();

    // Don't add duplicates
    const existing = history.findIndex(h => h.sql === sql && h.dialect === dialect);
    if (existing !== -1) {
        history.splice(existing, 1);
    }

    history.unshift({
        sql,
        dialect,
        timestamp: new Date().toISOString()
    });

    // Keep only recent queries
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

// Get query history
export function getQueryHistory(): Array<{ sql: string; dialect: string; timestamp: string }> {
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading query history:', error);
        return [];
    }
}

// Clear history
export function clearHistory(): void {
    localStorage.removeItem(HISTORY_KEY);
}

// Search queries
export function searchQueries(searchTerm: string): SavedQuery[] {
    const queries = getSavedQueries();
    const term = searchTerm.toLowerCase();

    return queries.filter(q =>
        q.name.toLowerCase().includes(term) ||
        q.sql.toLowerCase().includes(term) ||
        q.tags?.some(tag => tag.toLowerCase().includes(term))
    );
}

// Export queries as JSON
export function exportQueries(): string {
    const queries = getSavedQueries();
    return JSON.stringify(queries, null, 2);
}

// Import queries from JSON
export function importQueries(jsonData: string): number {
    try {
        const imported = JSON.parse(jsonData) as SavedQuery[];
        const existing = getSavedQueries();

        // Merge, avoiding duplicates by ID
        const merged = [...existing];
        let count = 0;

        imported.forEach(query => {
            if (!merged.find(q => q.id === query.id)) {
                merged.push(query);
                count++;
            }
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return count;
    } catch (error) {
        console.error('Error importing queries:', error);
        return 0;
    }
}

// Generate a unique ID
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get storage stats
export function getStorageStats(): {
    savedCount: number;
    historyCount: number;
    storageUsed: number
} {
    const saved = getSavedQueries();
    const history = getQueryHistory();
    const savedStr = localStorage.getItem(STORAGE_KEY) || '';
    const historyStr = localStorage.getItem(HISTORY_KEY) || '';

    return {
        savedCount: saved.length,
        historyCount: history.length,
        storageUsed: (savedStr.length + historyStr.length) / 1024 // KB
    };
}
