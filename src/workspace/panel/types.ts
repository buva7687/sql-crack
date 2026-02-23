export interface IndexStatus {
    text: string;
    title: string;
    level: 'fresh' | 'stale' | 'old' | 'missing';
}
