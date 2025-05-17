import path from 'path';


const CONTENT_TRUNCATION_LIMIT = 1000;
/**
 * Summarizes the contents of multiple files into a single formatted string.
 * 
 * @param files - An object mapping file paths to their contents
 * @returns A formatted string containing summaries of all files, with each file's content
 *          truncated to 1000 characters if needed. Returns "No file content provided" if
 *          the files object is empty. Returns "No files provided." if files is undefined or null.
 * 
 * Each file summary is formatted as:
 * --- File: filename.ext ---
 * [file contents]
 * 
 * Files are separated by double newlines in the output.
 */
export function summarizeFiles(files?: Record<string, string>): string {
    if (!files || Object.keys(files).length === 0) return "No files provided.";

    const summaries = Object.entries(files).map(([filePath, content]) => {
        const fileName = path.basename(filePath);
        const truncatedContent = content.length > CONTENT_TRUNCATION_LIMIT ? content.substring(0, CONTENT_TRUNCATION_LIMIT) + "..." : content;
        return `--- File: ${fileName} ---
${truncatedContent}`;
    });

    return summaries.join("\n\n");
} 