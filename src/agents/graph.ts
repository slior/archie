import { StateGraph, END, START } from "@langchain/langgraph";
import { echoAgentNode } from "./EchoAgentNode";
import { supervisorNode } from "./SupervisorNode";

// Define node names as constants
const SUPERVISOR = "supervisor";
const ECHO_AGENT = "echoAgent";

// Define the state interface that will flow through the graph
export interface AppState {
  userInput: string;
  response: string; // Stores the latest response from an agent
  // TODO: Add conversation history, memory access, etc.
}

// Instantiate the graph
const workflow = new StateGraph<AppState>({
        channels: {
            // The input channel lets us specify the type and assign responsibility for updating it
            userInput: { value: (x, y) => y ?? x, default: () => "" }, // Persist userInput across steps, allow override
            // The response channel will be updated by the echo agent
            response: { value: (x, y) => y, default: () => "" }, // Take the new response
        },
    })
    .addNode(SUPERVISOR, supervisorNode)
    .addNode(ECHO_AGENT, echoAgentNode)
    .addEdge(START, SUPERVISOR)
    .addConditionalEdges(SUPERVISOR, async (state: AppState) => {
            const { nextNode } = await supervisorNode(state);
            // Ensure the returned value is one of the expected keys
            if (nextNode === ECHO_AGENT) {
                return ECHO_AGENT;
            }
            // Add checks for other valid nodes or END
            return END;
        },
        // {
        //     [ECHO_AGENT as string]: ECHO_AGENT,
        //     [END as string]: END,
        // } as Record<string, string>[]
    )
    .addEdge(ECHO_AGENT, END)
;

// Add the nodes
// workflow.addNode(SUPERVISOR, supervisorNode);
// workflow.addNode(ECHO_AGENT, echoAgentNode);

// Define the edges

// Entry point is the supervisor
// workflow.setEntryPoint(SUPERVISOR);
// workflow.setEntryPoint(START);
// workflow.addEdge(START, "supervisor");

// The supervisor decides the next step.
// workflow.addConditionalEdges(
//     SUPERVISOR,
//     async (state: AppState) => {
//         const { nextNode } = await supervisorNode(state);
//         // Ensure the returned value is one of the expected keys
//         if (nextNode === ECHO_AGENT) {
//             return ECHO_AGENT;
//         }
//         // Add checks for other valid nodes or END
//         return END;
//     },
//     {
//         // Explicitly map the possible return values from the conditional function
//         [ECHO_AGENT as string]: ECHO_AGENT,
//         [END as string]: END,
//     } as Record<string, string> // Cast the entire mapping object
// );

// The echoAgent finishes the current flow
// workflow.addEdge(ECHO_AGENT, END);

// Compile the graph into a runnable app
export const app = workflow.compile(); 