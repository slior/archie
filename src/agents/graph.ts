import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { echoAgentNode } from "./EchoAgentNode";
import { supervisorNode } from "./SupervisorNode";
import { analysisAgentNode } from "./AnalysisAgentNode";

// Define node names as constants
const SUPERVISOR = "supervisor";
const ECHO_AGENT = "echoAgent";
const ANALYSIS_AGENT = "analysisAgent";

// Define the state interface that will flow through the graph
export interface AppState {
  userInput: string;
  response: string; // Stores the latest response from an agent
  // Additions for Analysis Agent
  fileContents: Record<string, string>; // Content of input files, keyed by path
  analysisHistory: Array<{ role: 'user' | 'agent'; content: string }>; // Conversation history
  analysisOutput: string; // Final output from analysis agent
  currentAnalysisQuery: string; // Question posed by agent during interrupt
  // TODO: Add conversation history, memory access, etc.
}

// Instantiate the graph
const workflow = new StateGraph<AppState>({
        channels: {
            userInput: { value: (x, y) => y, default: () => "" }, // Take new input, clear after use by node
            response: { value: (x, y) => y, default: () => "" }, // Takes new response (used by echo)
            fileContents: { value: (x, y) => y ?? x, default: () => ({}) }, // Persist, allow override
            analysisHistory: { value: (x, y) => (x || []).concat(y || []), default: () => ([]) }, // Append new messages
            analysisOutput: { value: (x, y) => y, default: () => "" }, // Takes new output
            currentAnalysisQuery: { value: (x, y) => y, default: () => "" }, // Takes new query
        },
    })
    .addNode(SUPERVISOR, supervisorNode)
    .addNode(ECHO_AGENT, echoAgentNode)
    .addNode(ANALYSIS_AGENT, analysisAgentNode)
    .addEdge(START, SUPERVISOR)
    .addConditionalEdges(SUPERVISOR, 
        async (state: AppState) => {
            const { nextNode } = await supervisorNode(state);
            return nextNode;
        },
        {
            [ECHO_AGENT]: ECHO_AGENT,
            [ANALYSIS_AGENT]: ANALYSIS_AGENT,
            [END]: END,
        }
    )
    .addEdge(ECHO_AGENT, END)
    .addEdge(ANALYSIS_AGENT, END)
;

// Instantiate a checkpointer (MemorySaver is simple, in-memory)
const checkpointer = new MemorySaver();

// Compile the graph into a runnable app, including the checkpointer
export const app = workflow.compile({ checkpointer }); 