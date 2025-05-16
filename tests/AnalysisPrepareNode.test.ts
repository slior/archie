import { expect } from 'chai';
import { describe, it } from 'mocha';
import { summarizeFiles } from '../src/agents/AnalysisPrepareNode';
// path.basename is used by summarizeFiles, so its behavior is implicitly tested.


describe('summarizeFiles from AnalysisPrepareNode', () => {

    const FILE_SIZE_THRESHOLD = 1000;  

    it('should return "No files provided." for an empty input object', () => {
        expect(summarizeFiles({})).to.equal("No files provided.");
    });

    it('should correctly summarize a single file with content less than 1000 characters', () => {
        const files = { "file1.txt": "This is short content." };
        const expected = "--- File: file1.txt ---\nThis is short content.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should correctly summarize and truncate a single file with content more than 1000 characters', () => {
        const longContent = "a".repeat(FILE_SIZE_THRESHOLD + 1);
        const files = { "file2.txt": longContent };
        const expectedTruncatedContent = "a".repeat(FILE_SIZE_THRESHOLD) + "...";
        const expected = `--- File: file2.txt ---\n${expectedTruncatedContent}`;
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should correctly summarize multiple files with mixed content lengths', () => {
        const longContent = "b".repeat(FILE_SIZE_THRESHOLD + 1);
        const files = {
            "alpha.txt": "Content of alpha.",
            "beta/gamma.md": "Content of gamma, which is a bit longer.",
            "delta.log": longContent
        };
        const expectedTruncatedLongContent = "b".repeat(FILE_SIZE_THRESHOLD) + "...";
        const expected = `--- File: alpha.txt ---\nContent of alpha.

--- File: gamma.md ---
Content of gamma, which is a bit longer.

--- File: delta.log ---
${expectedTruncatedLongContent}`;
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should use the basename of the file path for the file name in the summary', () => {
        const files = { "/some/complex/path/to/document.pdf": "PDF content here." };
        const expected = "--- File: document.pdf ---\nPDF content here.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should handle filenames with spaces or special characters if path.basename handles them', () => {
        const files = { "my file with spaces.txt": "Content." };
        const expected = "--- File: my file with spaces.txt ---\nContent.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should handle an empty file content string', () => {
        const files = { "empty.txt": "" };
        const expected = "--- File: empty.txt ---\n";
        expect(summarizeFiles(files)).to.equal(expected);
    });
}); 