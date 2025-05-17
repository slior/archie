import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { app as agentApp, AppState } from '../agents/graph';
import { MemoryService } from '../memory/MemoryService';
import { PromptService } from '../services/PromptService';
import { dbg, say, newGraphConfig, AppRunnableConfig, persistOutput, createConfigWithPromptService } from '../utils';

// Placeholder for runBuildContext function to be implemented in Step 11
// export async function runBuildContext(...) { ... } 

export async function runBuildContext(
    systemName: string,
    inputsDir: string,
    modelName: string,
    memoryService: MemoryService, // For consistency, though may not be used directly here for saving
    promptService: PromptService,
    // Injected dependencies for testability
    newGraphConfigFn: typeof newGraphConfig = newGraphConfig,
    // getGraphStateFn: (config: any) => Promise<{ values: Partial<AppState> }> = agentApp.getState.bind(agentApp), // Not needed for .invoke typically
    persistOutputFn: typeof persistOutput = persistOutput,
    createConfigFn: typeof createConfigWithPromptService = createConfigWithPromptService
) {
    if (!systemName || !inputsDir) {
        say("Error: Context Building requires a system name (--name) and an input directory (--inputs).");
        return;
    }

    const initialAppState: Partial<AppState> = {
        userInput: `build_context: ${systemName}`, // For START node routing
        inputDirectoryPath: inputsDir,
        systemName: systemName,
        modelName: modelName,
        currentFlow: 'build_context', // Critical for routing after DocumentRetrievalNode
        // Initialize other relevant fields from AppState to defaults if necessary
        analysisHistory: [], // Ensure all AppState fields have initial values if non-optional in definition
        analysisOutput: "",
        currentAnalysisQuery: "",
        response: "",
        fileContents: {}, // Assuming this might still be part of AppState internally
        inputs: {},       // Initialize as empty, will be populated by DocumentRetrievalNode
        contextBuilderOutputContent: "",
        contextBuilderOutputFileName: ""
    };

    const baseConfig = newGraphConfigFn();
    const graphConfig = createConfigFn(baseConfig, promptService);

    dbg(`Starting context building for system: ${systemName} with thread ID: ${graphConfig.configurable.thread_id}`);
    try {
        const finalState = await agentApp.invoke(initialAppState as AppState, graphConfig); // Cast to AppState if confident all required fields are present

        const outputContent = finalState.contextBuilderOutputContent;
        const outputFileName = finalState.contextBuilderOutputFileName;
        // Ensure inputDirectoryPath is correctly sourced if needed, it was set in initialAppState
        // If DocumentRetrievalNode or another node could modify it, retrieve from finalState.inputDirectoryPath
        const outputDir = initialAppState.inputDirectoryPath; // Assuming it doesn't change

        if (outputContent && outputFileName && outputDir) {
            await persistOutputFn(outputContent, outputDir, outputFileName);
            say(`Context built successfully for ${systemName}. Output at: ${path.join(outputDir, outputFileName)}`);
        } else {
            say(`Error: Context building completed, but output content or filename was not generated properly.`);
            if (!outputContent) say("- Output content is missing from final graph state.");
            if (!outputFileName) say("- Output filename is missing from final graph state.");
            if (!outputDir) say("- Output directory is missing (was not in initial state or final state).");
        }

    } catch (error) {
        console.error(`Error during context building graph execution for ${systemName}:`, error);
        say(`Error: Failed to build context for ${systemName}. Check logs for details. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    dbg(`runBuildContext for ${systemName} completed.`);
} 