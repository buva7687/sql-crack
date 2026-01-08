export interface Theme {
    name: string;
    background: string;
    panelBackground: string;
    panelBorder: string;
    textPrimary: string;
    textSecondary: string;
    rootNode: string;
    selectNode: string;
    fromNode: string;
    joinNode: string;
    whereNode: string;
    cteNode: string;
    windowNode: string;
    subqueryNode: string;
    setOpNode: string;
    schemaNode: string;
    dotColor: string;
    minimapBackground: string;
}

export const themes: Record<string, Theme> = {
    dark: {
        name: 'Dark',
        background: '#1e1e1e',
        panelBackground: 'rgba(30, 30, 30, 0.95)',
        panelBorder: '#404040',
        textPrimary: '#fff',
        textSecondary: '#888',
        rootNode: '#667eea',
        selectNode: '#48bb78',
        fromNode: '#4299e1',
        joinNode: '#ed8936',
        whereNode: '#9f7aea',
        cteNode: '#805ad5',
        windowNode: '#d53f8c',
        subqueryNode: '#38b2ac',
        setOpNode: '#f6ad55',
        schemaNode: '#667eea',
        dotColor: '#404040',
        minimapBackground: '#2d2d2d'
    },
    light: {
        name: 'Light',
        background: '#f7fafc',
        panelBackground: 'rgba(255, 255, 255, 0.95)',
        panelBorder: '#e2e8f0',
        textPrimary: '#1a202c',
        textSecondary: '#718096',
        rootNode: '#5a67d8',
        selectNode: '#38a169',
        fromNode: '#3182ce',
        joinNode: '#dd6b20',
        whereNode: '#805ad5',
        cteNode: '#6b46c1',
        windowNode: '#b83280',
        subqueryNode: '#2c7a7b',
        setOpNode: '#dd6b20',
        schemaNode: '#5a67d8',
        dotColor: '#cbd5e0',
        minimapBackground: '#edf2f7'
    },
    ocean: {
        name: 'Ocean',
        background: '#0a192f',
        panelBackground: 'rgba(10, 25, 47, 0.95)',
        panelBorder: '#1e3a5f',
        textPrimary: '#ccd6f6',
        textSecondary: '#8892b0',
        rootNode: '#64ffda',
        selectNode: '#00d9ff',
        fromNode: '#4a9eff',
        joinNode: '#ff6b9d',
        whereNode: '#c792ea',
        cteNode: '#82aaff',
        windowNode: '#ff6b9d',
        subqueryNode: '#64ffda',
        setOpNode: '#ffcb6b',
        schemaNode: '#64ffda',
        dotColor: '#1e3a5f',
        minimapBackground: '#0d1b2a'
    },
    forest: {
        name: 'Forest',
        background: '#1a1f1a',
        panelBackground: 'rgba(26, 31, 26, 0.95)',
        panelBorder: '#2d4a2d',
        textPrimary: '#e8f5e9',
        textSecondary: '#81c784',
        rootNode: '#66bb6a',
        selectNode: '#4caf50',
        fromNode: '#26a69a',
        joinNode: '#ffa726',
        whereNode: '#ab47bc',
        cteNode: '#7e57c2',
        windowNode: '#ec407a',
        subqueryNode: '#26c6da',
        setOpNode: '#ffca28',
        schemaNode: '#66bb6a',
        dotColor: '#2d4a2d',
        minimapBackground: '#0f140f'
    },
    sunset: {
        name: 'Sunset',
        background: '#1a1625',
        panelBackground: 'rgba(26, 22, 37, 0.95)',
        panelBorder: '#3d2d54',
        textPrimary: '#ffd7e5',
        textSecondary: '#c4a7d7',
        rootNode: '#ff6b9d',
        selectNode: '#ffafcc',
        fromNode: '#c77dff',
        joinNode: '#ff9770',
        whereNode: '#e0aaff',
        cteNode: '#b185db',
        windowNode: '#ff6ba9',
        subqueryNode: '#8ecae6',
        setOpNode: '#ffb347',
        schemaNode: '#ff6b9d',
        dotColor: '#3d2d54',
        minimapBackground: '#0d0a14'
    }
};

export function applyTheme(theme: Theme): void {
    document.documentElement.style.setProperty('--background-color', theme.background);
    document.documentElement.style.setProperty('--panel-background', theme.panelBackground);
    document.documentElement.style.setProperty('--panel-border', theme.panelBorder);
    document.documentElement.style.setProperty('--text-primary', theme.textPrimary);
    document.documentElement.style.setProperty('--text-secondary', theme.textSecondary);
}
