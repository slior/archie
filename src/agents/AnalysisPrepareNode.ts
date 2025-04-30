import { AppState } from "./graph";
// No longer need interrupt here
// import { interrupt } from "@langchain/langgraph"; 
import { say,dbg } from "../cli/shell";

// Placeholder for LLM interaction
async function callLLM(prompt: string): Promise<string> {
    console.log("\n--- LLM Call (Placeholder) ---");
    console.log("Prompt:", prompt);
    console.log("--- End LLM Call ---");
    // Simulate LLM response based on prompt content
    if (prompt.includes("final summary")) {
        return "Based on our conversation, the final approved solution involves [detailed description placeholder].";
    } else if (prompt.includes("history is empty")) {
        return "Okay, I see the file contents. What is the primary goal for this analysis?";
    } else {
        return "That's interesting. Could you elaborate on [some point]?";
    }
}


async function returnFinalOutput(currentHistory: any[], lastUserMessage: string, state: AppState) : Promise<Partial<AppState>> {
    console.log("Analysis Agent: Solution approved by user.");
    // Generate final output
    const finalPrompt = `Generate a final summary based on this conversation history: ${JSON.stringify(currentHistory)} and files: ${Object.keys(state.fileContents).join(', ')}`;
    const finalOutput = await callLLM(finalPrompt);
    const finalAgentMsg = { role: 'agent' as const, content: "Okay, generating the final solution description." };

    return {
        analysisOutput: finalOutput,
        analysisHistory: [finalAgentMsg, { role: 'user', content: lastUserMessage }], // Log final messages
        userInput: "", // Clear input
        currentAnalysisQuery: "" // Clear query
    };
}

// RENAME this function
export async function analysisPrepareNode(state: AppState): Promise<Partial<AppState>> { // Return type no longer includes interrupt
    console.log("--- Analysis Prepare Node Running ---"); // Updated log
    const currentUserInput = state.userInput;
    let currentHistory = state.analysisHistory || [];
    dbg(`currentUserInput: ${currentUserInput}, currentHistory: ${JSON.stringify(currentHistory)}, currentAnalysisQuery: ${state.currentAnalysisQuery}`);
    
    // 1. Add user's resumed input to history (if applicable)
    if (currentUserInput && state.currentAnalysisQuery) {
        console.log("Analysis Prepare: Resuming with user input:", currentUserInput);
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
        // Clear the query now that we've consumed the input for it
        // state.currentAnalysisQuery = ""; // State is immutable, clear in return value
    } else if (currentUserInput && currentHistory.length === 0) {
         console.log("Analysis Prepare: Starting with initial user input:", currentUserInput);
         currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
    }

    // 2. Check for approval keyword
    const lastUserMessage = currentHistory.filter(m => m.role === 'user').pop()?.content || "";
    if (lastUserMessage.toUpperCase().includes("SOLUTION APPROVED")) {
        // If approved, we return the final output and don't proceed to interrupt
        return await returnFinalOutput(currentHistory, lastUserMessage, state);
    }

    // 3. Normal conversational turn - Prepare state for interrupt node
    console.log("Analysis Prepare: Preparing for interrupt.");
    const prompt = `Current history (${currentHistory.length === 0 ? 'history is empty' : currentHistory.length + ' messages'}): ${JSON.stringify(currentHistory)}. Files: ${Object.keys(state.fileContents).join(', ')}. What is the next step or question?`;
    const agentResponse = await callLLM(prompt);
    const agentMsg = { role: 'agent' as const, content: agentResponse };

    dbg(`Agent response generated: ${agentResponse}`);

    // Prepare the state update to be returned
    const stateUpdate: Partial<AppState> = {
        analysisHistory: [agentMsg], // Add agent's response
        currentAnalysisQuery: agentResponse, // Store the question we asked
        userInput: "" // Clear the input used in this turn
    };
    
    // No interrupt call here - just return the state update
    return stateUpdate;
} 