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

const SETTINGS_KEY = 'sql-crack-privacy-settings';

export interface PrivacySettings {
    enableHistory: boolean;
    enableSavedQueries: boolean;
}

const defaultPrivacySettings: PrivacySettings = {
    enableHistory: false,
    enableSavedQueries: false
};

export function getPrivacySettings(): PrivacySettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            return { ...defaultPrivacySettings };
        }
        const parsed = JSON.parse(raw) as Partial<PrivacySettings>;
        return {
            enableHistory: !!parsed.enableHistory,
            enableSavedQueries: !!parsed.enableSavedQueries
        };
    } catch {
        return { ...defaultPrivacySettings };
    }
}

export function updatePrivacySettings(partial: Partial<PrivacySettings>): PrivacySettings {
    const current = getPrivacySettings();
    const updated: PrivacySettings = {
        ...current,
        ...partial
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    // If history was just disabled, clear it proactively
    if (current.enableHistory && !updated.enableHistory) {
        clearHistory();
    }
    // If saved queries were just disabled, clear them proactively
    if (current.enableSavedQueries && !updated.enableSavedQueries) {
        clearSavedQueries();
    }
    return updated;
}

// Basic guard to avoid writing pathological amounts of data
function isStoragePayloadTooLarge(payload: string, maxKb: number): boolean {
    const bytes = payload.length; // 1 char ~= 1 byte for our expected content
    return bytes / 1024 > maxKb;
}

// Save a query
export function saveQuery(query: Omit<SavedQuery, 'id' | 'createdAt' | 'updatedAt'>): SavedQuery {
    const settings = getPrivacySettings();
    if (!settings.enableSavedQueries) {
        throw new Error('Saving queries is disabled by privacy settings');
    }

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
    const settings = getPrivacySettings();
    if (!settings.enableSavedQueries) {
        return [];
    }

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
    const settings = getPrivacySettings();
    if (!settings.enableSavedQueries) {
        return false;
    }

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
    const settings = getPrivacySettings();
    if (!settings.enableSavedQueries) {
        return false;
    }

    const queries = getSavedQueries();
    const filtered = queries.filter(q => q.id !== id);

    if (filtered.length === queries.length) return false;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
}

// Add to query history
export function addToHistory(sql: string, dialect: string): void {
    const settings = getPrivacySettings();
    if (!settings.enableHistory) {
        return;
    }

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
    const settings = getPrivacySettings();
    if (!settings.enableHistory) {
        return [];
    }

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

// Clear saved queries
export function clearSavedQueries(): void {
    localStorage.removeItem(STORAGE_KEY);
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
    const payload = JSON.stringify(queries, null, 2);
    // Hard cap export size to ~512KB to avoid accidental huge blobs
    if (isStoragePayloadTooLarge(payload, 512)) {
        throw new Error('Export data is too large');
    }
    return payload;
}

// Import queries from JSON
export function importQueries(jsonData: string): number {
    try {
        const settings = getPrivacySettings();
        if (!settings.enableSavedQueries) {
            throw new Error('Importing queries is disabled by privacy settings');
        }

        // Reject extremely large payloads (~512KB+)
        if (isStoragePayloadTooLarge(jsonData, 512)) {
            throw new Error('Import data is too large');
        }

        const parsed = JSON.parse(jsonData);
        if (!Array.isArray(parsed)) {
            throw new Error('Invalid import format: expected an array');
        }

        // Validate and normalize each entry
        const imported: SavedQuery[] = parsed
            .filter((item: any) => item && typeof item === 'object')
            .map((item: any) => {
                const candidate: SavedQuery = {
                    id: String(item.id || generateId()),
                    name: String(item.name || 'Imported query'),
                    sql: String(item.sql || ''),
                    dialect: String(item.dialect || 'Unknown'),
                    createdAt: String(item.createdAt || new Date().toISOString()),
                    updatedAt: String(item.updatedAt || new Date().toISOString()),
                    tags: Array.isArray(item.tags)
                        ? item.tags.map((t: any) => String(t)).slice(0, 10)
                        : undefined
                };

                // Truncate pathological values
                if (candidate.sql.length > 5000) {
                    candidate.sql = candidate.sql.slice(0, 5000);
                }
                if (candidate.name.length > 200) {
                    candidate.name = candidate.name.slice(0, 200);
                }
                return candidate;
            });

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
