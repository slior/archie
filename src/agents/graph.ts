import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
// import { JsonFileStore } from "@langchain/langgraph/stores/file"; // Remove or comment out this line
// import { JsonCheckpoint } from "@langchain/core/runnables/graph"; // Try JsonCheckpoint from core/runnables/graph
import { echoAgentNode } from "./EchoAgentNode";
import { supervisorNode } from "./SupervisorNode";
// Restore analysis node imports
import { analysisPrepareNode } from "./AnalysisPrepareNode";
import { analysisInterruptNode } from "./AnalysisInterruptNode";

// Define node names as constants
const SUPERVISOR = "supervisor";
const ECHO_AGENT = "echoAgent";
const ANALYSIS_PREPARE = "analysisPrepare";
const ANALYSIS_INTERRUPT = "analysisInterrupt"; // Restore

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
            userInput: { value: (x, y) => y !== undefined && y !== null ? y : x, default: () => "" },
            response: { value: (x, y) => y, default: () => "" }, // Takes new response (used by echo)
            fileContents: { value: (x, y) => y ?? x, default: () => ({}) }, // Persist, allow override
            analysisHistory: { value: (x, y) => (x || []).concat(y || []), default: () => ([]) }, // Append new messages
            analysisOutput: { value: (x, y) => y, default: () => "" }, // Takes new output
            currentAnalysisQuery: { value: (x, y) => y, default: () => "" }, // Takes new query
        },
    })
    .addNode(SUPERVISOR, supervisorNode)
    .addNode(ECHO_AGENT, echoAgentNode)
    // Restore analysis nodes
    .addNode(ANALYSIS_PREPARE, analysisPrepareNode)
    .addNode(ANALYSIS_INTERRUPT, analysisInterruptNode)
    .addEdge(START, SUPERVISOR)
    // Keep supervisor conditional edge synchronous, remove temporary override
    .addConditionalEdges(SUPERVISOR, 
        (state: AppState) => { // Keep synchronous
            // Replicate supervisor's decision logic synchronously
            const userInput = state.userInput.toLowerCase();
            const analysisKeywords = ["analyze", "analysis", "review requirement", "start analysis"];
            const triggerAnalysis = analysisKeywords.some(keyword => userInput.includes(keyword));
            let nextNodeDecision: string;

            if (triggerAnalysis) {
                nextNodeDecision = ANALYSIS_PREPARE;
            } else if (userInput.startsWith("echo")) {
                 nextNodeDecision = ECHO_AGENT;
            } else {
                nextNodeDecision = END;
            }
            
            console.log(`Supervisor Condition: Routing to ${nextNodeDecision}`);
            return nextNodeDecision; // Return ANALYSIS_PREPARE, ECHO_AGENT, or END
        },
        {
            [ECHO_AGENT]: ECHO_AGENT,
            [ANALYSIS_PREPARE]: ANALYSIS_PREPARE, // Restore mapping
            [END]: END,
        }
    )
    .addEdge(ECHO_AGENT, END)
    // Restore analysis edges (ensure condition after prepare is also sync)
    .addConditionalEdges(ANALYSIS_PREPARE,
        (state: AppState) => { // Keep synchronous 
            if (state.analysisOutput) {
                return END;
            } else {
                return ANALYSIS_INTERRUPT;
            }
        },
        {
            [END]: END,
            [ANALYSIS_INTERRUPT]: ANALYSIS_INTERRUPT
        }
    )
    // After interrupt node, go back to the PREPARE node to process the resumed input
    .addEdge(ANALYSIS_INTERRUPT, ANALYSIS_PREPARE)
;

// Restore checkpointer
const checkpointer = new MemorySaver();

// Compile the graph with checkpointer
export const app = workflow.compile({ checkpointer }); 