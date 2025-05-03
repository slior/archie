import { app as agentApp, AppState } from "../agents/graph";
import { MemoryService } from '../memory/MemoryService'; 
import * as uuid from 'uuid'; 
import { dbg, say } from '../utils';

// --- Helper Functions (Adapted/Moved) ---

// export function dbg(s: string) {
//     console.debug(`[Ask] ${s}`);
// }

// export function say(s: string) {
//     console.log(s);
// }

export function newGraphConfig() {
    const thread_id = uuid.v4();
    return { configurable: { thread_id } };
}

// --- Core Logic ---

/**
 * Handles the 'ask' command by passing the user input directly to the agent graph
 * for a single-turn response.
 *
 * @param inputText The raw text input/question from the user.
 * @param modelName The AI model name to use.
 * @param memoryService The memory service instance (currently unused here).
 * @throws Error if the agent graph fails to execute.
 */
export async function runAsk(
    inputText: string,
    modelName: string,
    memoryService: MemoryService // Keep signature consistent, though save is handled in main
) {
    if (!agentApp) {
        say("Error: Agent graph is not compiled or available.");
        return; // Or throw error
    }
    if (!inputText) {
        say("Error: No input provided for the 'ask' command.");
        return;
    }

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