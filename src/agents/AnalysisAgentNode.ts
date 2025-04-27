import { AppState } from "./graph";
import { interrupt } from "@langchain/langgraph";

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

export async function analysisAgentNode(state: AppState): Promise<Partial<AppState>> {
    console.log("--- Analysis Agent Node Running ---");
    const currentUserInput = state.userInput; // Get the input potentially resuming from interrupt
    let currentHistory = state.analysisHistory || [];

    // 1. Add user's resumed input to history (if it exists)
    if (currentUserInput && state.currentAnalysisQuery) {
        console.log("Analysis Agent: Resuming with user input:", currentUserInput);
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
    } else if (currentUserInput && currentHistory.length === 0) {
         // Initial trigger, add the first user query
         console.log("Analysis Agent: Starting with initial user input:", currentUserInput);
         currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
    }

    // 2. Check for approval keyword in the *last user message*
    const lastUserMessage = currentHistory.filter(m => m.role === 'user').pop()?.content || "";
    if (lastUserMessage.toUpperCase().includes("SOLUTION APPROVED")) {
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

    // 3. Normal conversational turn: call LLM, add response, interrupt
    console.log("Analysis Agent: Continuing conversation.");
    // Simple prompt construction for placeholder
    const prompt = `Current history (${currentHistory.length === 0 ? 'history is empty' : currentHistory.length + ' messages'}): ${JSON.stringify(currentHistory)}. Files: ${Object.keys(state.fileContents).join(', ')}. What is the next step or question?`;
    const agentResponse = await callLLM(prompt);
    const agentMsg = { role: 'agent' as const, content: agentResponse };

    // Interrupt and wait for the next user input
    interrupt({ query: agentResponse }); // The value passed here is surfaced to the user

    return {
        analysisHistory: [agentMsg], // Add agent's response to history for next turn
        currentAnalysisQuery: agentResponse, // Store the question we asked
        userInput: "" // Clear the input used in this turn
    };
} 