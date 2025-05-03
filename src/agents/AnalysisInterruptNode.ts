import { AppState } from "./graph";
import { interrupt } from "@langchain/langgraph";
import { dbg } from "../cli/shell"; // Corrected import path for dbg

/**
 * This node triggers the interrupt and, upon resuming,
 * captures the user's input and returns it in the state update.
 */
export async function analysisInterruptNode(state: AppState): Promise<Partial<AppState>> { // Change return type
    dbg("--- Analysis Interrupt Node Running ---");
    const queryToAsk = state.currentAnalysisQuery;
    dbg(`Interrupting with query: ${queryToAsk}`);

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