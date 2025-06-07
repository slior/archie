import { expect } from 'chai';
import sinon from 'sinon';
import { START, END, MemorySaver } from "@langchain/langgraph";
import { RunnableConfig, Runnable } from "@langchain/core/runnables";
import { 
    createWorkflow, 
    AppState, 
    ECHO_AGENT, 
    ANALYSIS_PREPARE, 
    ANALYSIS_INTERRUPT, 
    DOCUMENT_RETRIEVAL, 
    CONTEXT_BUILDING_AGENT,
    GRAPH_EXTRACTION,
    ANALYZE_FLOW,
    BUILD_CONTEXT_FLOW,
    Flow,
    Role
} from '../src/agents/graph';

// Define mock nodes
let echoAgentMock: sinon.SinonStub;
let analysisPrepareMock: sinon.SinonStub;
let analysisInterruptMock: sinon.SinonStub;
let documentRetrievalMock: sinon.SinonStub;
let contextBuildingAgentMock: sinon.SinonStub;
let graphExtractionMock: sinon.SinonStub;

// Define a helper to create a minimal AppState
const createInitialAppState = (overrides: Partial<AppState> = {}): AppState => ({
    userInput: "",
    response: "",
    fileContents: {},
    inputs: {},
    inputDirectoryPath: "",
    analysisHistory: [],
    analysisOutput: "",
    currentAnalysisQuery: "",
    modelName: "test-model",
    currentFlow: null,
    systemName: undefined,
    contextBuilderOutputContent: undefined,
    contextBuilderOutputFileName: undefined,
    ...overrides,
});

describe('Graph Echo Flow', () => {
    let app: any;
    let workflowInstance: any;

    beforeEach(() => {
        // Reset stubs before each test
        echoAgentMock = sinon.stub().resolves({ response: "mocked echo" });
        analysisPrepareMock = sinon.stub().resolves({});
        analysisInterruptMock = sinon.stub().resolves({});
        documentRetrievalMock = sinon.stub().resolves({});
        contextBuildingAgentMock = sinon.stub().resolves({});
        graphExtractionMock = sinon.stub().resolves({});

        const mockNodes = {
            [ECHO_AGENT]: echoAgentMock as any,
            [ANALYSIS_PREPARE]: analysisPrepareMock as any,
            [ANALYSIS_INTERRUPT]: analysisInterruptMock as any,
            [DOCUMENT_RETRIEVAL]: documentRetrievalMock as any,
            [GRAPH_EXTRACTION]: graphExtractionMock as any,
            [CONTEXT_BUILDING_AGENT]: contextBuildingAgentMock as any,
        };
        
        workflowInstance = createWorkflow(mockNodes);
        const checkpointer = new MemorySaver();
        app = workflowInstance.compile({ checkpointer });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should route to ECHO_AGENT and then END when userInput starts with "echo"', async () => {
        const initialState = createInitialAppState({
            userInput: "echo hello world",
        });

        const finalState = await app.invoke(initialState, { configurable: { thread_id: "test-echo-flow-1" } });

        expect(echoAgentMock.calledOnce).to.be.true;
        expect(echoAgentMock.firstCall.args[0].userInput).to.equal("echo hello world");
        
        // Ensure other primary flow starting nodes were not called
        expect(documentRetrievalMock.called).to.be.false;
        expect(analysisPrepareMock.called).to.be.false; 
        expect(contextBuildingAgentMock.called).to.be.false;

        // Check that the response from the mock echo agent is in the final state
        expect(finalState.response).to.equal("mocked echo");
    });

    it('should route to END if userInput does not match any specific command and no flow is set', async () => {
        const initialState = createInitialAppState({
            userInput: "some random command",
        });

        await app.invoke(initialState, { configurable: { thread_id: "test-echo-flow-2" } });

        expect(echoAgentMock.called).to.be.false;
        expect(documentRetrievalMock.called).to.be.false;
        expect(analysisPrepareMock.called).to.be.false;
        expect(contextBuildingAgentMock.called).to.be.false;
        expect(analysisInterruptMock.called).to.be.false;
    });
});

// Placeholder for other test suites
describe('Graph Analyze Flow Routing', () => {
    let app: any; 
    let workflowInstance: any; 

    beforeEach(() => {
        echoAgentMock = sinon.stub().resolves({ response: "mocked echo" });
        analysisPrepareMock = sinon.stub().resolves({ analysisOutput: "mocked analysis" }); // Ensure it can END
        analysisInterruptMock = sinon.stub().resolves({});
        documentRetrievalMock = sinon.stub().resolves({}); // Basic resolve for routing test
        contextBuildingAgentMock = sinon.stub().resolves({});
        graphExtractionMock = sinon.stub().resolves({});

        const mockNodes = {
            [ECHO_AGENT]: echoAgentMock as any, 
            [ANALYSIS_PREPARE]: analysisPrepareMock as any,
            [ANALYSIS_INTERRUPT]: analysisInterruptMock as any,
            [DOCUMENT_RETRIEVAL]: documentRetrievalMock as any,
            [GRAPH_EXTRACTION]: graphExtractionMock as any,
            [CONTEXT_BUILDING_AGENT]: contextBuildingAgentMock as any,
        };
        
        workflowInstance = createWorkflow(mockNodes);
        const checkpointer = new MemorySaver();
        app = workflowInstance.compile({ checkpointer });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should route START -> DOCUMENT_RETRIEVAL -> GRAPH_EXTRACTION -> ANALYSIS_PREPARE -> END when currentFlow is ANALYZE_FLOW', async () => {
        const initialState = createInitialAppState({
            userInput: "analyze this content",
            currentFlow: ANALYZE_FLOW,
        });

        const finalState = await app.invoke(initialState, { configurable: { thread_id: "test-analyze-flow-1" } });

        expect(documentRetrievalMock.calledOnce).to.be.true;
        expect(graphExtractionMock.calledOnce).to.be.true;
        expect(analysisPrepareMock.calledOnce).to.be.true;
        
        // Check call order
        sinon.assert.callOrder(documentRetrievalMock, graphExtractionMock, analysisPrepareMock);

        // Ensure other flows or echo were not triggered
        expect(echoAgentMock.called).to.be.false;
        expect(contextBuildingAgentMock.called).to.be.false;
        expect(analysisInterruptMock.called).to.be.false; // Not testing interrupt logic here

        // Check final state for expected output
        expect(finalState.analysisOutput).to.equal("mocked analysis");
    });
});

describe('Graph Build Context Flow Routing', () => {
    let app: any; 
    let workflowInstance: any; 

    beforeEach(() => {
        echoAgentMock = sinon.stub().resolves({ response: "mocked echo" });
        analysisPrepareMock = sinon.stub().resolves({}); 
        analysisInterruptMock = sinon.stub().resolves({});
        documentRetrievalMock = sinon.stub().resolves({}); 
        contextBuildingAgentMock = sinon.stub().resolves({ contextBuilderOutputContent: "mocked context" }); // Ensure it can END
        graphExtractionMock = sinon.stub().resolves({});

        const mockNodes = {
            [ECHO_AGENT]: echoAgentMock as any, 
            [ANALYSIS_PREPARE]: analysisPrepareMock as any,
            [ANALYSIS_INTERRUPT]: analysisInterruptMock as any,
            [DOCUMENT_RETRIEVAL]: documentRetrievalMock as any,
            [GRAPH_EXTRACTION]: graphExtractionMock as any,
            [CONTEXT_BUILDING_AGENT]: contextBuildingAgentMock as any,
        };
        
        workflowInstance = createWorkflow(mockNodes);
        const checkpointer = new MemorySaver();
        app = workflowInstance.compile({ checkpointer });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should route START -> DOCUMENT_RETRIEVAL -> GRAPH_EXTRACTION -> CONTEXT_BUILDING_AGENT -> END when currentFlow is BUILD_CONTEXT_FLOW', async () => {
        const initialState = createInitialAppState({
            userInput: "build context for this system",
            currentFlow: BUILD_CONTEXT_FLOW,
        });

        const finalState = await app.invoke(initialState, { configurable: { thread_id: "test-build-context-flow-1" } });

        expect(documentRetrievalMock.calledOnce).to.be.true;
        expect(graphExtractionMock.calledOnce).to.be.true;
        expect(contextBuildingAgentMock.calledOnce).to.be.true;
        
        sinon.assert.callOrder(documentRetrievalMock, graphExtractionMock, contextBuildingAgentMock);

        expect(echoAgentMock.called).to.be.false;
        expect(analysisPrepareMock.called).to.be.false;
        expect(analysisInterruptMock.called).to.be.false;

        expect(finalState.contextBuilderOutputContent).to.equal("mocked context");
    });
});

describe('Graph Analyze Flow Interrupt Logic', () => {
    let app: any; 
    let workflowInstance: any; 

    beforeEach(() => {
        echoAgentMock = sinon.stub().resolves({}); // Not relevant for this flow
        
        analysisPrepareMock = sinon.stub(); // Behavior defined per test
        analysisInterruptMock = sinon.stub().resolves({ userInput: "user response to interrupt" });
        documentRetrievalMock = sinon.stub().resolves({}); // Called once at the beginning
        contextBuildingAgentMock = sinon.stub().resolves({}); // Not relevant
        graphExtractionMock = sinon.stub().resolves({});

        const mockNodes = {
            [ECHO_AGENT]: echoAgentMock as any, 
            [ANALYSIS_PREPARE]: analysisPrepareMock as any,
            [ANALYSIS_INTERRUPT]: analysisInterruptMock as any,
            [DOCUMENT_RETRIEVAL]: documentRetrievalMock as any,
            [GRAPH_EXTRACTION]: graphExtractionMock as any,
            [CONTEXT_BUILDING_AGENT]: contextBuildingAgentMock as any,
        };
        
        workflowInstance = createWorkflow(mockNodes);
        const checkpointer = new MemorySaver();
        app = workflowInstance.compile({ checkpointer });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should route DR -> GE -> AP -> AI -> AP -> END for analyze flow interrupt', async () => {
        // DR = Document Retrieval, GE = Graph Extraction, AP = Analysis Prepare, AI = Analysis Interrupt
        analysisPrepareMock.onFirstCall().resolves({}); // No analysisOutput, should trigger interrupt
        analysisPrepareMock.onSecondCall().resolves({ analysisOutput: "final analysis from second call" }); // Has output, should END

        const initialState = createInitialAppState({
            userInput: "initial analyze request",
            currentFlow: ANALYZE_FLOW,
        });

        const finalState = await app.invoke(initialState, { configurable: { thread_id: "test-interrupt-flow-1" } });

        expect(documentRetrievalMock.calledOnce).to.be.true;
        expect(graphExtractionMock.calledOnce).to.be.true;
        expect(analysisPrepareMock.calledTwice).to.be.true;
        expect(analysisInterruptMock.calledOnce).to.be.true;

        // Verify call order using specific spy calls
        expect(documentRetrievalMock.firstCall.calledBefore(graphExtractionMock.firstCall), 'DR.call1 before GE.call1').to.be.true;
        expect(graphExtractionMock.firstCall.calledBefore(analysisPrepareMock.firstCall), 'GE.call1 before AP.call1').to.be.true;
        expect(analysisPrepareMock.firstCall.calledBefore(analysisInterruptMock.firstCall), 'AP.call1 before AI.call1').to.be.true;
        expect(analysisInterruptMock.firstCall.calledBefore(analysisPrepareMock.secondCall), 'AI.call1 before AP.call2').to.be.true;

        // Verify that the userInput from interrupt was passed to the second call of analysisPrepareMock
        const stateAfterInterrupt = analysisPrepareMock.secondCall.args[0];
        expect(stateAfterInterrupt.userInput).to.equal("user response to interrupt");
        // Also check that history or other relevant fields from interrupt are passed if applicable.
        // For now, checking userInput is primary for this test based on mock setup.

        // Ensure other flows were not triggered
        expect(echoAgentMock.called).to.be.false;
        expect(contextBuildingAgentMock.called).to.be.false;

        // Final output check
        expect(finalState.analysisOutput).to.equal("final analysis from second call");
    });
});
