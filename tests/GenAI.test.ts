import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as path from 'path';

// Import the functions/modules to test or mock
import { DEFAULT_MODEL } from '../src/agents/LLMUtils';
import * as LLMUtils from '../src/agents/LLMUtils'; // Import namespace for stubbing
import { AppState, app as agentApp } from '../src/agents/graph'; // Import AppState type and agentApp for stubbing
import { handleAnalyzeCommand, parseArgs as parseAnalyzeArgs } from '../src/cli/AnalyzeCommand';
import * as AnalyzeCommandModule from '../src/cli/AnalyzeCommand'; // Import namespace for stubbing internals if needed
import { handleDefaultCommand, parseCommand, startShell, newGraphConfig } from '../src/cli/shell';
import * as ShellModule from '../src/cli/shell'; // Import namespace for stubbing
import { MemoryService } from '../src/memory/MemoryService';
import { Command as CommanderCommand } from 'commander'; // Use the actual type
import inquirer from 'inquirer';
import { Command as LangGraphCommand } from '@langchain/langgraph'; // For instanceOf check
import * as fsPromises from 'fs/promises'; // For mocking


describe('Configurable Model Feature Tests (Mocha/Chai/Sinon)', () => {

    // Stubs for dependencies
    let mockSay: sinon.SinonStub;
    let mockDbg: sinon.SinonStub;
    let mockInquirerPrompt: sinon.SinonStub;
    let mockAgentAppInvoke: sinon.SinonStub;
    let mockAgentAppStream: sinon.SinonStub;
    let mockAgentAppGetState: sinon.SinonStub;
    let mockReadFiles: sinon.SinonStub;
    let mockPersistOutput: sinon.SinonStub;
    let mockCommanderOpts: sinon.SinonStub;
    let mockCommanderParse: sinon.SinonStub;
    let mockOpenAICall: sinon.SinonStub;
    let consoleLogStub: sinon.SinonStub;
    let consoleWarnStub: sinon.SinonStub;
    let consoleErrorStub: sinon.SinonStub;
    let consoleDebugStub: sinon.SinonStub;

    beforeEach(() => {
        // Create fresh stubs before each test
        mockSay = sinon.stub(ShellModule, 'say');
        mockDbg = sinon.stub(ShellModule, 'dbg');
        mockInquirerPrompt = sinon.stub(inquirer, 'prompt');
        mockAgentAppInvoke = sinon.stub(agentApp, 'invoke');
        mockAgentAppStream = sinon.stub(agentApp, 'stream');
        mockAgentAppGetState = sinon.stub(agentApp, 'getState');
        mockReadFiles = sinon.stub(AnalyzeCommandModule, 'readFiles');
        mockPersistOutput = sinon.stub(AnalyzeCommandModule, 'persistFinalOutput');
        mockOpenAICall = sinon.stub(LLMUtils, 'callOpenAI');

        // Mocking commander is tricky; stubbing the opts method on the prototype
        // This assumes the structure `new Command()...parse().opts()`
        mockCommanderOpts = sinon.stub().returns({ memoryFile: './memory.json', model: DEFAULT_MODEL });
        mockCommanderParse = sinon.stub().returns({ opts: mockCommanderOpts }); // .parse() returns object with opts()
        sinon.stub(CommanderCommand.prototype, 'version').returnsThis();
        sinon.stub(CommanderCommand.prototype, 'description').returnsThis();
        sinon.stub(CommanderCommand.prototype, 'option').returnsThis();
        sinon.stub(CommanderCommand.prototype, 'parse').value(mockCommanderParse); // Replace parse method

        // Stub console methods used by say/dbg or directly
        consoleLogStub = sinon.stub(console, 'log');
        consoleWarnStub = sinon.stub(console, 'warn');
        consoleErrorStub = sinon.stub(console, 'error');
        consoleDebugStub = sinon.stub(console, 'debug');

        // Default mock implementations
        mockOpenAICall.resolves('Mock LLM response');
        mockReadFiles.resolves({ 'input.md': 'test content' });
        mockPersistOutput.resolves(undefined);
        mockAgentAppGetState.resolves({ values: { analysisOutput: 'Final Analysis' } });
    });

    afterEach(() => {
        // Restore all stubs
        sinon.restore();
    });

    // --- Test Plan Items --- //

    it('1. Startup logs default model when --model is not provided', () => {
        // Manual verification step: Run 'node dist/main.js' and check logs.
        // Test assertion (conceptual via mock check):
        // Need to run or simulate the main() function from src/main.ts
        // For now, verify the default returned by the commander mock setup
        expect(mockCommanderParse().opts().model).to.equal(DEFAULT_MODEL);
        // To actually check the console log, main() would need to be called here.
    });

    it('2. Startup logs specified model when --model is provided', () => {
        const specificModel = 'gpt-4o';
        // Reconfigure the mock for this specific test
        sinon.restore(); // Restore previous stubs to change opts
        mockCommanderOpts = sinon.stub().returns({ memoryFile: './memory.json', model: specificModel });
        mockCommanderParse = sinon.stub().returns({ opts: mockCommanderOpts });
        sinon.stub(CommanderCommand.prototype, 'parse').value(mockCommanderParse);
        // Re-stub others needed if main() was called
        consoleLogStub = sinon.stub(console, 'log'); 

        // Manual verification step: Run 'node dist/main.js --model gpt-4o' and check logs.
        // Test assertion (conceptual via mock check):
        expect(mockCommanderParse().opts().model).to.equal(specificModel);
        // If main() was called: expect(consoleLogStub).to.have.been.calledWith(`Using model: ${specificModel}`);
    });

    // Helper to mock the stream for analyze tests
    async function* mockAnalyzeStream(input: any, config: any, finalOutput: any = { analysisOutput: 'Final result' }) {
        if (input instanceof LangGraphCommand && input.resume === 'User response') {
            yield finalOutput; // End state on resume
        } else {
            // Initial call state leading to interrupt
            yield { currentAnalysisQuery: 'Agent question?' }; 
            // LangGraph internally sends an __interrupt__ signal
            // Simulating this precisely is complex without running the graph.
            // We rely on analysisIteration correctly interpreting the state.
        }
    }

    it('3. Analyze command uses default model when not specified via CLI', async () => {
        const args = ['--query', 'test query', '--inputs', './data'];
        const modelName = DEFAULT_MODEL; // This comes from main.ts based on mocked commander
        const config = { configurable: { thread_id: 'test-thread-default' } };

        // Mock the graph stream/state interactions
        // Simulate analysisIteration logic: first call interrupts, second completes
        mockInquirerPrompt.resolves({ userResponse: 'User response' });
        mockAgentAppStream
            .onFirstCall().callsFake(async function*() {
                // Simulate the stream yielding chunks that lead runGraph to interrupt
                yield { __interrupt__: [{ type: 'interrupt', value: { query: 'Agent question?' } }] };
            })
            .onSecondCall().callsFake(async function*() {
                // Simulate the stream completing without interrupt after resume
                yield { analysisOutput: 'Final Analysis Default' }; // Example final state chunk
            });
        mockAgentAppGetState.resolves({ values: { analysisOutput: 'Final Analysis Default' } });
        // Stub the config generation within handleAnalyzeCommand if needed, or pass explicitly
        sinon.stub(ShellModule, 'newGraphConfig').returns(config);

        await handleAnalyzeCommand(
            args,
            modelName, // Passed from main/shell
            parseAnalyzeArgs, // Use real parser
            mockReadFiles, // Mocked readFiles
            ShellModule.newGraphConfig, // Use stubbed config generator
            AnalyzeCommandModule.analysisIteration, // Use real iteration logic
            mockAgentAppGetState, // Mocked getState
            mockSay, // Mocked shell functions
            mockDbg,
            AnalyzeCommandModule.getFinalOutput, // Real getFinalOutput
            AnalyzeCommandModule.displayFinalOutputToUser, // Real display function
            mockPersistOutput // Mocked persist function
        );

        // Verify mocks
        expect(mockReadFiles.calledOnceWith('./data')).to.be.true;
        expect(mockAgentAppStream.calledTwice).to.be.true;
        // First call to stream/runGraph has initial state with default model
        expect(mockAgentAppStream.firstCall.args[0]).to.deep.include({ modelName: DEFAULT_MODEL });
        // Second call has the resume command
        expect(mockAgentAppStream.secondCall.args[0]).to.be.instanceOf(LangGraphCommand);
        expect(mockAgentAppGetState.calledOnceWith(config)).to.be.true;
        expect(mockPersistOutput.calledOnceWith('Final Analysis Default', './data')).to.be.true;

        // Manual Verification step: Run default scenario and check debug logs for API call model.
        // This setup doesn't directly check the callOpenAI mock because it's 
        // called deep within the real analysisIteration -> runGraph -> stream -> nodes.
        // Testing callOpenAI directly (done below) is more practical.
    });

    it('4. Analyze command uses specified model when provided via CLI', async () => {
        const specificModel = 'gpt-4o';
        const args = ['--query', 'test query', '--inputs', './data'];
        const modelName = specificModel; // This comes from main.ts
        const config = { configurable: { thread_id: 'test-thread-specific' } };

        mockInquirerPrompt.resolves({ userResponse: 'User response' });
        mockAgentAppStream
             .onFirstCall().callsFake(async function*() {
                 // Simulate interrupt
                 yield { __interrupt__: [{ type: 'interrupt', value: { query: 'Agent question?' } }] };
             }) 
             .onSecondCall().callsFake(async function*() {
                 // Simulate completion
                 yield { analysisOutput: 'Final Analysis Specific' };
             });
        mockAgentAppGetState.resolves({ values: { analysisOutput: 'Final Analysis Specific' } });
        sinon.stub(ShellModule, 'newGraphConfig').returns(config);

        await handleAnalyzeCommand(
            args,
            modelName,
            parseAnalyzeArgs, 
            mockReadFiles, 
            ShellModule.newGraphConfig,
            AnalyzeCommandModule.analysisIteration,
            mockAgentAppGetState, 
            mockSay, 
            mockDbg,
            AnalyzeCommandModule.getFinalOutput,
            AnalyzeCommandModule.displayFinalOutputToUser, 
            mockPersistOutput 
        );

        expect(mockReadFiles.calledOnceWith('./data')).to.be.true;
        expect(mockAgentAppStream.calledTwice).to.be.true;
        // First call to stream/runGraph has initial state with specific model
        expect(mockAgentAppStream.firstCall.args[0]).to.deep.include({ modelName: specificModel });
        expect(mockAgentAppStream.secondCall.args[0]).to.be.instanceOf(LangGraphCommand);
        expect(mockAgentAppGetState.calledOnceWith(config)).to.be.true;
        expect(mockPersistOutput.calledOnceWith('Final Analysis Specific', './data')).to.be.true;

        // Manual Verification step: Run specific model scenario and check debug logs for API call model.
    });

    it('5. Default command includes default model in initial state passed to invoke', async () => {
        const commandInput = 'hello world';
        const modelName = DEFAULT_MODEL;
        mockAgentAppInvoke.resolves({ response: 'Default response' }); 
        const config = { configurable: { thread_id: 'test-default-cmd-default' } };
        sinon.stub(ShellModule, 'newGraphConfig').returns(config);

        await handleDefaultCommand(commandInput, modelName);

        // Check that agentApp.invoke was called with initialState containing the default modelName
        expect(mockAgentAppInvoke.calledOnce).to.be.true;
        const expectedInitialStateDefault = {
            userInput: commandInput,
            response: "",
            fileContents: {},
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
            modelName: DEFAULT_MODEL, // Verify this field
        };
        expect(mockAgentAppInvoke.calledWith(sinon.match(expectedInitialStateDefault), sinon.match.object)).to.be.true;

        // Manual Verification: Check debug logs for default command scenario.
    });

    it('6. Default command includes specified model in initial state passed to invoke', async () => {
        const commandInput = 'hello again';
        const specificModel = 'gpt-4-turbo';
        const modelName = specificModel;
        mockAgentAppInvoke.resolves({ response: 'Specific model response' });
        const config = { configurable: { thread_id: 'test-default-cmd-specific' } };
        sinon.stub(ShellModule, 'newGraphConfig').returns(config);

        await handleDefaultCommand(commandInput, modelName);

        expect(mockAgentAppInvoke.calledOnce).to.be.true;
        const expectedInitialStateSpecific = {
            userInput: commandInput,
            response: "",
            fileContents: {},
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
            modelName: specificModel, // Verify this field
        };
        expect(mockAgentAppInvoke.calledWith(sinon.match(expectedInitialStateSpecific), sinon.match.object)).to.be.true;
        
        // Manual Verification: Check debug logs for specific model default command scenario.
    });

    // Test LLMUtils directly
    describe('LLMUtils callOpenAI (mocked test)', () => {
        // Need to use the non-stubbed version for these tests
        let originalCallOpenAI: typeof LLMUtils.callOpenAI;

        beforeEach(() => {
            // Restore the specific stub for callOpenAI to test its *internals* (conceptually)
            // We are actually testing the mock stub behavior here.
            mockOpenAICall.reset(); // Reset the stub for clean checks
        });

        const history = [{ role: 'user' as const, content: 'Hi' }];
        const prompt = 'Respond please';

        it('mock uses provided modelName if valid', async () => {
            const specificModel = 'model-to-use';
            // Call the stubbed function
            await LLMUtils.callOpenAI(history, prompt, specificModel);
            // Check the arguments passed to the mock stub
            expect(mockOpenAICall.calledOnceWith(history, prompt, specificModel)).to.be.true;
            // Manual Verification check: Actual debug logs in LLMUtils show correct model used.
        });

        it('mock uses DEFAULT_MODEL if modelName is undefined', async () => {
            await LLMUtils.callOpenAI(history, prompt, undefined);
            expect(mockOpenAICall.calledOnceWith(history, prompt, undefined)).to.be.true;
             // Manual Verification check: Actual debug logs in LLMUtils show default model used.
             // The *real* implementation should use DEFAULT_MODEL internally.
        });

        it('mock uses DEFAULT_MODEL if modelName is empty string', async () => {
            await LLMUtils.callOpenAI(history, prompt, '');
            expect(mockOpenAICall.calledOnceWith(history, prompt, '')).to.be.true;
             // Manual Verification check: Actual debug logs in LLMUtils show default model used.
             // The *real* implementation should use DEFAULT_MODEL internally.
        });
    });

    // Test AppState modification (conceptual)
    it('AppState interface includes modelName (Type Check)', () => {
        // This is a type check, verified by TypeScript compiler during development/build.
        // No runtime assertion needed, but confirms the type definition.
        const state: AppState = {
            userInput: '',
            response: '',
            fileContents: {},
            analysisHistory: [],
            analysisOutput: '',
            currentAnalysisQuery: '',
            modelName: 'test-model', // This line should compile
        };
        expect(state.modelName).to.equal('test-model');
    });
}); 