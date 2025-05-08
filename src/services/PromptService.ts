import * as fs from 'fs/promises';
import * as path from 'path';
import { FullPromptsConfig } from './promptTypes';

// --- Type Definitions ---
// export interface PromptConfigEntry {
//     inputs: string[];
//     path: string;
// }

// export interface AgentPromptsConfig {
//     [promptKey: string]: PromptConfigEntry;
// }

// export interface FullPromptsConfig {
//     prompts: {
//         [agentName: string]: AgentPromptsConfig;
//     };
// }

// --- PromptService Class ---
export class PromptService {
    private loadedConfig?: FullPromptsConfig;
    private readonly configFilePath?: string;
    private readonly configDir?: string;

    constructor(configFilePath?: string) {
        if (configFilePath) {
            this.configFilePath = path.resolve(configFilePath);
            this.configDir = path.dirname(this.configFilePath);
        } else {
            this.configFilePath = undefined;
            this.configDir = undefined;
        }
    }

    private async _ensureConfigLoaded(): Promise<void> {
        if (this.configFilePath && !this.loadedConfig) {
            try {
                const fileContent = await this._readFile(this.configFilePath);
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
        // let promptInputs: string[] = []; // As per plan, though might not be used if direct replacement occurs

        const customPromptConfig = this.loadedConfig?.prompts?.[agentName]?.[promptKey];

        if (customPromptConfig) {
            const customPath = this._resolvePath(customPromptConfig.path);
            try {
                promptText = await this._readFile(customPath);
                // promptInputs = customPromptConfig.inputs; // Store if validation against context keys is needed later
            } catch (error: any) {
                throw new Error(`Error loading custom prompt file ${customPath} for agent ${agentName}, prompt ${promptKey}. Original error: ${error.message}`);
            }
        } else {
            // Default prompt logic
            const defaultPromptPath = `src/agents/prompts/${agentName}/${promptKey}.txt`;
            const resolvedDefaultPath = this._resolvePath(defaultPromptPath);
            try {
                promptText = await this._readFile(resolvedDefaultPath);
            } catch (error: any) {
                throw new Error(`Error loading default prompt file ${resolvedDefaultPath} for agent ${agentName}, prompt ${promptKey}. Original error: ${error.message}`);
            }
        }

        // Perform Replacement
        for (const key in context) {
            if (Object.prototype.hasOwnProperty.call(context, key)) {
                const placeholder = `{{${key}}}`;
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
            return await fs.readFile(filePath, 'utf-8');
        } catch (error: any) {
            // Re-throw to be caught by _ensureConfigLoaded, which adds more context
            throw new Error(`Reading file ${filePath} failed: ${error.message}`);
        }
    }

    private _resolvePath(promptPath: string): string {
        if (path.isAbsolute(promptPath)) {
            return promptPath;
        }
        // If configDir is set (meaning a config file was loaded) and promptPath is relative,
        // resolve relative to the config file's directory.
        if (this.configDir) {
            return path.resolve(this.configDir, promptPath);
        }
        // Otherwise (no config file, or promptPath is still relative for some reason),
        // resolve relative to the project root (current working directory).
        // Assuming process.cwd() is the project root for default prompts or improperly configured relative paths.
        return path.resolve(process.cwd(), promptPath);
    }
}