import * as uuid from 'uuid'; 
import { PromptService } from './services/PromptService';
import { RunnableConfig } from '@langchain/core/runnables';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface AppGraphConfigurable  {
    thread_id: string;
    promptService?: PromptService;
}

export interface AppRunnableConfig extends RunnableConfig {
    configurable: AppGraphConfigurable;
}

export function dbg(s: string) {
    console.debug(s);
}

export function say(s: string) {
    console.log(s);
}

export function newGraphConfig(): AppRunnableConfig {
    const thread_id = uuid.v4();
    const configurable: AppGraphConfigurable = { thread_id };
    return { configurable };
}

// New persistOutput utility function
/**
 * Persists the given content to a file in the specified directory with the specified filename.
 * 
 * @param content - The string content to save to file.
 * @param outputDir - The directory path where the output file should be created.
 * @param outputFileName - The name of the file to be created (e.g., 'analysis_result.md').
 * @param resolveFn - Function to resolve file paths (defaults to path.resolve).
 * @param writeFileFn - Function to write files (defaults to fs.promises.writeFile).
 * @returns Promise<void>
 * @throws Logs error and re-throws it to allow the caller to handle it.
 */
export async function persistOutput(
    content: string,
    outputDir: string,
    outputFileName: string,
    resolveFn = path.resolve,
    writeFileFn = fsPromises.writeFile
): Promise<void> {
    const outputPath = resolveFn(outputDir, outputFileName);
    try {
        await writeFileFn(outputPath, content || "", 'utf-8'); // Write empty string if content is null/undefined
        say(`Output saved to: ${outputPath}`);
    } catch (error) {
        console.error(`Error saving output to ${outputPath}:`, error);
        throw error; // Re-throw the error
    }
}

/**
 * Creates a new AppRunnableConfig object by embedding the provided PromptService
 * into the configurable property of the baseConfig.
 *
 * @param baseConfig The base AppRunnableConfig object.
 * @param promptService The PromptService instance to add to the config.
 * @returns A new AppRunnableConfig object with the PromptService included.
 */
export function createConfigWithPromptService(baseConfig: AppRunnableConfig, promptService: PromptService): AppRunnableConfig {
    return {
        ...baseConfig,
        configurable: {
            ...baseConfig.configurable,
            promptService: promptService,
        },
    };
}