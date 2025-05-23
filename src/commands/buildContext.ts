import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { app as agentApp, AppState, BUILD_CONTEXT_FLOW } from '../agents/graph';
import { MemoryService } from '../memory/MemoryService';
import { PromptService } from '../services/PromptService';
import { dbg, say, newGraphConfig, AppRunnableConfig, persistOutput, createConfigWithPromptService } from '../utils';
import { DEFAULT_CONTEXT_FILE_PATH } from '../config';

/**
 * Runs the context building process for a given system.
 * It initializes the application state, invokes the agent graph to process input documents
 * and generate a context summary, and then persists this summary to a file.
 *
 * @param systemName The name of the system for which to build context. This is used in prompts and output filenames.
 * @param inputsDir The path to the directory containing input documents (e.g., .txt, .md files) for context generation.
 * @param modelName The identifier of the AI model to be used by the context building agent.
 * @param memoryService The memory service instance for system context.
 * @param promptService The service responsible for providing formatted prompts to the AI agents.
 * @param newGraphConfigFn Injected dependency for creating a new graph configuration object. Defaults to `newGraphConfig`.
 * @param persistOutputFn Injected dependency for persisting the generated context to a file. Defaults to `persistOutput`.
 * @param createConfigFn Injected dependency for creating a runnable configuration that includes the prompt service. Defaults to `createConfigWithPromptService`.
 * @returns A Promise that resolves when the context building process is complete, or if an error occurs.
 */
export async function runBuildContext(
    systemName: string,
    inputsDir: string,
    modelName: string,
    memoryService: MemoryService,
    promptService: PromptService,
    // Injected dependencies for testability
    newGraphConfigFn: typeof newGraphConfig = newGraphConfig,
    persistOutputFn: typeof persistOutput = persistOutput,
    createConfigFn: typeof createConfigWithPromptService = createConfigWithPromptService
): Promise<Partial<AppState>> {
    if (!systemName || !inputsDir) {
        say("Error: Context Building requires a system name (--name) and an input directory (--inputs).");
        return {};
    }

    try {


        const initialAppState: Partial<AppState> = {
            userInput: `build context: ${systemName}`,
            inputDirectoryPath: inputsDir,
            systemName: systemName,
            modelName: modelName,
            currentFlow: BUILD_CONTEXT_FLOW, // Critical for routing 
            // Initialize other relevant fields from AppState to defaults if necessary
            analysisHistory: [], // Ensure all AppState fields have initial values if non-optional in definition
            analysisOutput: "",
            currentAnalysisQuery: "",
            response: "",
            fileContents: {}, // Assuming this might still be part of AppState internally
            inputs: {},       // Initialize as empty, will be populated by DocumentRetrievalNode
            contextBuilderOutputContent: "",
            contextBuilderOutputFileName: "",
            system_context: memoryService.getCurrentState() // Add memory state to initial state
        };

        const baseConfig = newGraphConfigFn();
        const graphConfig = createConfigFn(baseConfig, promptService);

        dbg(`Starting context building for system: ${systemName} with thread ID: ${graphConfig.configurable.thread_id}`);
        const finalState = await agentApp.invoke(initialAppState as AppState, graphConfig);

        const outputContent = finalState.contextBuilderOutputContent;
        const outputFileName = finalState.contextBuilderOutputFileName;
        const outputDir = initialAppState.inputDirectoryPath;

        if (outputContent && outputFileName && outputDir) {
            await persistOutputFn(outputContent, outputDir, outputFileName);
            say(`Context built successfully for ${systemName}. Output at: ${path.join(outputDir, outputFileName)}`);
        } else {
            say(`Error: Context building completed, but output content or filename was not generated properly.`);
            if (!outputContent) say("- Output content is missing from final graph state.");
            if (!outputFileName) say("- Output filename is missing from final graph state.");
            if (!outputDir) say("- Output directory is missing (was not in initial state or final state).");
        }


        return finalState;
    } catch (error) {
        console.error(`Error during context building graph execution for ${systemName}:`, error);
        say(`Error: Failed to build context for ${systemName}. Check logs for details. Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to be handled by the caller
    }
    dbg(`runBuildContext for ${systemName} completed.`);
} 