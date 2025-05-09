import * as fs from 'fs/promises';
import * as path from 'path';
import { FullPromptsConfig } from './promptTypes';

export interface PromptServiceDependencies {
    readFileFn?: (path: string, encoding: BufferEncoding) => Promise<string>;
    resolvePathFn?: (...paths: string[]) => string;
    dirnameFn?: (p: string) => string;
    isAbsoluteFn?: (p: string) => boolean;
    // We don't explicitly mock process.cwd() here as path.resolve handles it implicitly
    // when its first argument isn't absolute and no other base is effectively given.
}

// --- PromptService Class ---
export class PromptService {
    private loadedConfig?: FullPromptsConfig;
    private readonly configFilePath?: string;
    private readonly configDir?: string;

    // Store injected dependencies or defaults
    private readonly readFileFn: (path: string, encoding: BufferEncoding) => Promise<string>;
    private readonly resolvePathFn: (...paths: string[]) => string;
    private readonly dirnameFn: (p: string) => string;
    private readonly isAbsoluteFn: (p: string) => boolean;

    constructor(configFilePath?: string, deps?: PromptServiceDependencies) {
        this.readFileFn = deps?.readFileFn || fs.readFile;
        this.resolvePathFn = deps?.resolvePathFn || path.resolve;
        this.dirnameFn = deps?.dirnameFn || path.dirname;
        this.isAbsoluteFn = deps?.isAbsoluteFn || path.isAbsolute;

        if (configFilePath) {
            // Use injected dependencies for path operations
            this.configFilePath = this.resolvePathFn(configFilePath);
            this.configDir = this.dirnameFn(this.configFilePath);
        } else {
            this.configFilePath = undefined;
            this.configDir = undefined;
        }
    }

    private async _ensureConfigLoaded(): Promise<void> {
        if (this.configFilePath && !this.loadedConfig) {
            try {
                const fileContent = await this._readFile(this.configFilePath); // Will use this.readFileFn via _readFile
                this.loadedConfig = JSON.parse(fileContent) as FullPromptsConfig;
            } catch (error: any) {
                // Catch errors from _readFile (e.g., file not found) and JSON.parse (e.g., malformed JSON)
                throw new Error(`Failed to load or parse prompt configuration file: ${this.configFilePath}. Original error: ${error.message}`);
            }
        }
    }

    public async getFormattedPrompt(
        agentName: string,
        promptKey: string,
        context: Record<string, any>
    ): Promise<string> {
        await this._ensureConfigLoaded();
        
        let promptText: string = ''; // Initialize to empty, will be set by custom or default logic

        const customPromptConfig = this.loadedConfig?.prompts?.[agentName]?.[promptKey];

        if (customPromptConfig) {
            const customPath = this._resolvePath(customPromptConfig.path); // Will use this.resolvePathFn, this.isAbsoluteFn via _resolvePath
            try {
                promptText = await this._readFile(customPath); // Will use this.readFileFn via _readFile
            } catch (error: any) {
                throw new Error(`Error loading custom prompt file ${customPath} for agent ${agentName}, prompt ${promptKey}. Original error: ${error.message}`);
            }
        } else { // No custom prompt found, use default.
            
            const defaultPromptPath = `src/agents/prompts/${agentName}/${promptKey}.txt`;
            
            const resolvedDefaultPath = this._resolvePath(defaultPromptPath);
            try {
                promptText = await this._readFile(resolvedDefaultPath);
            } catch (error: any) {
                throw new Error(`Error loading default prompt file ${resolvedDefaultPath} for agent ${agentName}, prompt ${promptKey}. Original error: ${error.message}`);
            }
        }

        if (!promptText) {
            throw new Error(`Failed to load prompt for agent ${agentName}, prompt ${promptKey}.`);
        }

        // Perform Replacement
        for (const key in context) {
            if (Object.prototype.hasOwnProperty.call(context, key)) {
                // Using a RegExp for global replacement. Escape special characters in the key.
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`{{${escapedKey}}}`, 'g');
                promptText = promptText.replace(regex, String(context[key]));
            }
        }

        return promptText;
    }

    private async _readFile(filePath: string): Promise<string> {
        try {
            return await this.readFileFn(filePath, 'utf-8');
        } catch (error: any) {
            throw new Error(`Reading file ${filePath} failed: ${error.message}`);
        }
    }

    private _resolvePath(promptPath: string): string {
        if (this.isAbsoluteFn(promptPath)) {
            return promptPath;
        }
        // If configDir is set (meaning a config file was loaded) and promptPath is relative,
        // resolve relative to the config file's directory.
        if (this.configDir) {
            return this.resolvePathFn(this.configDir, promptPath);
        }
        // Otherwise (no config file, or promptPath is still relative for some reason),
        // resolve relative to the project root (current working directory).
        // Assuming process.cwd() is the project root for default prompts or improperly configured relative paths.
        return this.resolvePathFn(promptPath);
    }
}