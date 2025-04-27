import { AppState } from "./graph"; // Use the actual AppState
import { END } from "@langchain/langgraph"; // Import END

// Define node names as constants locally or import them if defined centrally
const ANALYSIS_AGENT = "analysisAgent";
const ECHO_AGENT = "echoAgent";

/**
 * The supervisor node decides which agent node to route to next based on user input.
 */
export async function supervisorNode(state: AppState): Promise<{ nextNode: string }> {
    console.log("--- Supervisor Node Running ---");
    const userInput = state.userInput.toLowerCase();

    // Define keywords for routing
    // TODO: Define more robust keywords or a command structure
    const analysisKeywords = ["analyze", "analysis", "review requirement", "start analysis"];
    const triggerAnalysis = analysisKeywords.some(keyword => userInput.includes(keyword));

    if (triggerAnalysis) {
        console.log("Supervisor: Routing to Analysis Agent");
        return { nextNode: ANALYSIS_AGENT };
    } else if (userInput.startsWith("echo")) { // Keep echo for simple testing
         console.log("Supervisor: Routing to Echo Agent");
         return { nextNode: ECHO_AGENT };
    } else {
        // Default to ending the graph if no specific route is matched
        console.log("Supervisor: No specific route matched, routing to End");
        return { nextNode: END };
    }
} 