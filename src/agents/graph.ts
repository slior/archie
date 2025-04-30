import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { echoAgentNode } from "./EchoAgentNode";
import { analysisPrepareNode } from "./AnalysisPrepareNode";
import { analysisInterruptNode } from "./AnalysisInterruptNode";
import { dbg } from "../cli/shell";

// Define node names as constants
const ECHO_AGENT = "echoAgent";
const ANALYSIS_PREPARE = "analysisPrepare";
const ANALYSIS_INTERRUPT = "analysisInterrupt";

type Role = 'user' | 'agent';

const CMD_ECHO = "echo";

// Define the state interface that will flow through the graph
export interface AppState {
  userInput: string;
  response: string; // Stores the latest response from an agent
  // Additions for Analysis Agent
  fileContents: Record<string, string>; // Content of input files, keyed by path
  analysisHistory: Array<{ role: Role; content: string }>; // Conversation history
  analysisOutput: string; // Final output from analysis agent
  currentAnalysisQuery: string; // Question posed by agent during interrupt

}

function shouldTriggerAnalysis(userInput: string): boolean {
    const analysisKeywords = ["analyze", "analysis", "review requirement", "start analysis"];
    return analysisKeywords.some(keyword => userInput.includes(keyword));
}

// Instantiate the graph
const workflow = new StateGraph<AppState>({
        channels: {
            //save the new user input
            userInput: { value: (currentState, update) => update !== undefined && update !== null ? update : currentState, default: () => "" },   
            response: { value: (x, y) => y, default: () => "" },                                        // Takes new response (used by echo)
            fileContents: { value: (x, y) => y ?? x, default: () => ({}) },                             // Persist, allow override
            analysisHistory: { value: (x, y) => (x || []).concat(y || []), default: () => ([]) },       // Append new messages
            analysisOutput: { value: (x, y) => y, default: () => "" },                                  // Takes new output
            currentAnalysisQuery: { value: (x, y) => y, default: () => "" },                            // Takes new query
        },
    })
    .addNode(ECHO_AGENT, echoAgentNode)
    .addNode(ANALYSIS_PREPARE, analysisPrepareNode)
    .addNode(ANALYSIS_INTERRUPT, analysisInterruptNode)
    
    // Make the conditional edge originate from START
    .addConditionalEdges(START, 
        (state: AppState) => { // Keep synchronous
            
            const userInput = state.userInput.toLowerCase();
            let nextNodeDecision: string;

            // Determine initial routing based on input
            switch (true) {
                case shouldTriggerAnalysis(userInput):
                    nextNodeDecision = ANALYSIS_PREPARE;
                    break;
                case userInput.startsWith(CMD_ECHO):
                    nextNodeDecision = ECHO_AGENT;
                    break;
                default:
                    nextNodeDecision = END;
                    break;
            }
            
            dbg(`Initial Routing Condition: Routing to ${nextNodeDecision}`); // Updated log message
            return nextNodeDecision;
        },
        {
            // Mapping destinations
            [ECHO_AGENT]: ECHO_AGENT,
            [ANALYSIS_PREPARE]: ANALYSIS_PREPARE,
            [END]: END,
        }
    )
    .addEdge(ECHO_AGENT, END)
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
    .addEdge(ANALYSIS_INTERRUPT, ANALYSIS_PREPARE) // After interrupt node, go back to the PREPARE node to process the resumed input
;

const checkpointer = new MemorySaver();
export const app = workflow.compile({ checkpointer }); 