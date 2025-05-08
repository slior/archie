import { app as agentApp, AppState } from "../agents/graph";
import { MemoryService } from '../memory/MemoryService'; 
import { PromptService } from '../services/PromptService';
import { dbg, say, newGraphConfig } from '../utils';

// --- Core Logic ---

/**
 * Handles the 'ask' command by passing user input to the agent graph for processing.
 * 
 * @param inputText - The text input/question from the user to send to the agent
 * @param modelName - The name of the AI model to use for processing the input
 * @param memoryService - Memory service instance for state persistence (saving handled in main.ts)
 * @param promptService - Prompt service instance for handling prompts
 * @returns Promise<void> 
 * @throws Error if the agent graph fails to execute or is not available
 */
export async function runAsk(
    inputText: string,
    modelName: string,
    memoryService: MemoryService, // Keep signature consistent, though save is handled in main.ts
    promptService: PromptService // Added promptService
) {
    if (!agentApp) {
        say("Error: Agent graph is not compiled or available.");
        return; // Or throw error
    }
    if (!inputText) {
        say("Error: No input provided for the 'ask' command.");
        return;
    }

    // TODO: promptService will be used here or passed to the graph (Step 12)
    dbg('Running ask command with promptService defined: ' + (promptService !== undefined));

    try {
        dbg(`Invoking agent graph with input: "${inputText}"`);

        // Define the initial state for this single-turn invocation
        const initialState: Partial<AppState> = {
            userInput: inputText,
            response: "", // Start with an empty response
            // Initialize other potential state fields expected by the graph
            fileContents: {},
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
            modelName: modelName,
        };
        const config = newGraphConfig();
        dbg(`Using thread ID: ${config.configurable.thread_id}`);

        // Pass promptService via config.configurable
        config.configurable.promptService = promptService;

        // Invoke the graph for a single turn
        const result = await agentApp.invoke(initialState, config);

        // Ensure result and response exist before accessing
        const response = result?.response ?? "No response generated.";
        say(`Agent: ${response}`);

        // No memoryService.saveMemory() call here - handled in main.ts
        dbg("runAsk completed.");

    } catch (error) {
        console.error(`Error during agent graph execution for 'ask' command:`, error);
        // Rethrow the error so it can be caught by the action handler in main.ts
        throw error;
    }
} 