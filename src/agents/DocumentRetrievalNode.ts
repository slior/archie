import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { AppState } from "./graph"; 
import { dbg } from '../utils';

/**
 * Node to retrieve document contents from a specified directory.
 * Reads .txt and .md files, stores their basenames and content in AppState.inputs.
 * Warns on read errors for individual files but continues processing others.
 *
 * @param state The current application state, expecting `inputDirectoryPath` to be set.
 * @returns A Promise resolving to a partial AppState containing the `inputs` record.
 */
export async function documentRetrievalNode(state: AppState): Promise<Partial<AppState>> {
    const { inputDirectoryPath } = state;
    const inputs: Record<string, string> = {};

    if (!inputDirectoryPath) {
        console.warn("Warning: `inputDirectoryPath` is not set in AppState. Skipping document retrieval.");
        return { inputs };
    }

    dbg(`DocumentRetrievalNode: Reading files from directory: ${inputDirectoryPath}`);

    try {
        const dirents = await fsPromises.readdir(inputDirectoryPath, { withFileTypes: true });
        const filesToRead = dirents
            .filter(dirent => dirent.isFile() && (dirent.name.endsWith('.txt') || dirent.name.endsWith('.md')))
            .map(dirent => dirent.name);

        if (filesToRead.length === 0) {
            console.warn(`DocumentRetrievalNode: No .txt or .md files found in ${inputDirectoryPath}`);
        }

        for (const filename of filesToRead) {
            const resolvedPath = path.resolve(inputDirectoryPath, filename);
            dbg(`DocumentRetrievalNode: Attempting to read file: ${resolvedPath}`);
            try {
                const content = await fsPromises.readFile(resolvedPath, 'utf-8');
                inputs[filename] = content; // Use basename (filename) as key
                dbg(`DocumentRetrievalNode: Successfully read file: ${filename}`);
            } catch (readError: any) {
                console.warn(`Warning: Error reading file ${resolvedPath}: ${readError.message}. Skipping file.`);
            }
        }
    } catch (error: any) {
        console.warn(`Warning: Error reading input directory ${inputDirectoryPath}: ${error.message}. Returning empty inputs.`);
        // If the directory itself can't be read, return empty inputs but don't crash the graph.
        return { inputs: {} }; 
    }

    return { inputs };
} 