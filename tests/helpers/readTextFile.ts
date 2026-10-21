import { readFileSync } from 'fs';

/**
 * Read a text file with LF line endings. A Windows checkout can convert
 * sources to CRLF, which breaks source-reading assertions that match `\n`.
 */
export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
    return readFileSync(filePath, encoding).replace(/\r\n/g, '\n');
}
