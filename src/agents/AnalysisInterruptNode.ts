import { AppState } from "./graph";
import { interrupt } from "@langchain/langgraph";
import { dbg } from "../utils"; // Corrected import path for dbg

/**
 * A node in the analysis workflow that interrupts execution to get user input.
 * 
 * This node:
 * 1. Checks the current analysis query in the state
 * 2. Interrupts the workflow to ask the user the query
 * 3. Waits for and captures the user's response
 * 4. Returns the response in the state for the next node
 *
 * @param state - The current application state containing the query to ask
 * @returns A Promise resolving to a partial state update with the user's input
 * @throws Will not throw, but returns empty input if no query exists
 *
 * @example
 * // State contains query: "What file should I analyze?"
 * const result = await analysisInterruptNode(state);
 * // Interrupts, waits for user input "src/main.ts"
 * // Returns { userInput: "src/main.ts" }
 */
export async function analysisInterruptNode(state: AppState): Promise<Partial<AppState>> { // Change return type
    dbg("--- Analysis Interrupt Node Running ---");
    const queryToAsk = state.currentAnalysisQuery;
    // dbg(`Interrupting with query: ${queryToAsk}`);

    if (!queryToAsk) {
        dbg("AnalysisInterruptNode: No query found in state to ask the user.");
        return { userInput: "" }; // Return empty input if no query
    }

    // Trigger the interrupt and wait for the resumed value
    const resumedUserInput = await interrupt({ query: queryToAsk });

    dbg(`Resumed from interrupt with input: ${resumedUserInput}`);

    // Return the user's input in the userInput channel
    // This explicitly updates the state for the next node (analysisPrepareNode)
    return { 
        userInput: resumedUserInput as string // Cast needed as interrupt returns any
    }; 
}