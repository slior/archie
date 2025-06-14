import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Input } from '../src/commands/analyze';
import * as path from 'path'; // For mocking resolve
import inquirer from 'inquirer'; // For mocking prompt
import { app as agentApp, AppState } from '../src/agents/graph';
import { Command } from '@langchain/langgraph';
import { MemoryService } from '../src/memory/MemoryService';
import * as utils from '../src/utils';
import { StateSnapshot } from '@langchain/langgraph';
import * as analyzeCmd from '../src/commands/analyze';
import { PromptService } from '../src/services/PromptService';

// Define mockMemoryServiceInstance at a higher scope
let mockMemoryServiceInstance: MemoryService;

describe('Analyze Command (src/commands/analyze.ts)', () => {

  beforeEach(() => {
    mockMemoryServiceInstance = MemoryService.fromState(undefined); // Create fresh instance for each test

    // Stub utils used by the command
    sinon.stub(utils, 'dbg');
    sinon.stub(utils, 'say');
    

  });

  afterEach(() => {
    sinon.restore(); // Restores all stubs (including utils and MemoryService)
  });



  describe('runAnalysis', () => {

    it('should accept empty query and proceed with validation only checking inputsDir', async () => {
      const emptyQuery = '';
      const inputsDir = './test-inputs';
      const modelName = 'test-model';
      const promptService = new PromptService();

      // Mock the dependencies 
      const mockNewGraphConfig = sinon.stub().returns({ configurable: { thread_id: 'test-thread' } });
      const mockAnalysisIteration = sinon.stub().resolves({ isDone: true, newInput: {} });
      const mockGetState = sinon.stub().resolves({ values: { analysisOutput: 'test output' } });
      const mockGetFinalOutput = sinon.stub().resolves('test final output');
      const mockDisplayFinalOutput = sinon.stub();
      const mockPersistFinalOutput = sinon.stub().resolves();

      const result = await analyzeCmd.runAnalysis(
        emptyQuery,
        inputsDir,
        modelName,
        mockMemoryServiceInstance,
        promptService,
        mockNewGraphConfig,
        mockAnalysisIteration,
        mockGetState,
        mockGetFinalOutput,
        mockDisplayFinalOutput,
        mockPersistFinalOutput
      );

      // Should not fail validation since query is no longer required
      expect(mockNewGraphConfig.calledOnce).to.be.true;
      expect(mockAnalysisIteration.calledOnce).to.be.true;
      expect(result).to.be.an('object');
    });

    it('should fail validation when inputsDir is empty', async () => {
      const query = 'test query';
      const emptyInputsDir = '';
      const modelName = 'test-model';
      const promptService = new PromptService();

      const result = await analyzeCmd.runAnalysis(
        query,
        emptyInputsDir,
        modelName,
        mockMemoryServiceInstance,
        promptService
      );

      // Should fail validation and return empty object
      expect(result).to.deep.equal({});
      expect((utils.say as sinon.SinonStub).calledWithMatch('Analysis requires a working directory')).to.be.true;
    });

    // Helper function to create an async generator for mocking streams
  async function* mockStreamHelper(chunks: any[]) {
    for (const chunk of chunks) {
        yield chunk;
        // Add a small delay to simulate async nature if needed, or just yield
        await new Promise(resolve => setTimeout(resolve, 0)); 
    }
  }
  
  describe('runGraph', () => {
    let streamStub: sinon.SinonStub;

    beforeEach(() => {
      // Stub agentApp.stream before each test in this block
      // Note: This assumes agentApp is mutable or we use a tool like proxyquire.
      // If agentApp is a const import, direct stubbing might fail.
      streamStub = sinon.stub(agentApp, 'stream');
    });

    it('should return interrupted=false when stream completes without interrupt', async () => {
      const inputStream = mockStreamHelper([{ node: 'output', value: 'final' }]);
      streamStub.returns(inputStream);
      
      const input: Input = { userInput: 'test' };
      const config = { configurable: { thread_id: 'test-id' } };

      const promptService = new PromptService();
      const result = await analyzeCmd.runGraph(input, config, promptService);

      expect(result).to.deep.equal({ interrupted: false, agentQuery: '' });
      // expect(streamStub.calledOnceWith(input, config)).to.be.true;
      expect(streamStub.calledOnce).to.be.true;
      
    });

    it('should return interrupted=true and agentQuery when stream interrupts', async () => {
      const interruptQuery = 'Please provide more details.';
      const inputStream = mockStreamHelper([
        { node: 'step1', value: 'working...' },
        { __interrupt__: [{ type: 'interrupt', value: { query: interruptQuery } }] }
      ]);
      streamStub.returns(inputStream);

      const input: Input = { userInput: 'test' }; // Use directly imported Input type
      const config = { configurable: { thread_id: 'test-id' } };

      const promptService = new PromptService();
      const result = await analyzeCmd.runGraph(input, config, promptService);

      expect(result).to.deep.equal({ interrupted: true, agentQuery: interruptQuery });
      // expect(streamStub.calledOnceWith(input, config)).to.be.true;
      expect(streamStub.calledOnce).to.be.true;
      
    });

    it('should use default query if interrupt value is missing query field', async () => {
        const inputStream = mockStreamHelper([
          { __interrupt__: [{ type: 'interrupt', value: { someOtherData: 'foo' } }] } // Missing query
        ]);
        streamStub.returns(inputStream);
  
        const input: Input = { userInput: 'test' };
        const config = { configurable: { thread_id: 'test-id' } };
  
        const promptService = new PromptService();
        const result = await analyzeCmd.runGraph(input, config, promptService);
  
        expect(result).to.deep.equal({ interrupted: true, agentQuery: 'Agent needs input.' }); 
      });

    it('should re-throw error if agentApp.stream fails', async () => {
      const streamError = new Error('Stream failed!');
      streamStub.rejects(streamError);

      const input: Input = { userInput: 'test' };
      const config = { configurable: { thread_id: 'test-id' } };

      const promptService = new PromptService();
      try {
        await analyzeCmd.runGraph(input, config, promptService);
        expect.fail('runGraph should have thrown an error');
      } catch (error) {
        expect(error).to.equal(streamError);
        
      }
    });

  });

  describe('analysisIteration', () => {
    let mockRunGraph: sinon.SinonStub;
    let mockPrompt: sinon.SinonStub;

    beforeEach(() => {
        mockRunGraph = sinon.stub(analyzeCmd, 'runGraph');
        mockPrompt = sinon.stub(inquirer, 'prompt');
    });

    it('should handle interruption: call runGraph, prompt user, return resume command', async () => {
        const initialInput = { userInput: 'start' };
        const config = { configurable: { thread_id: 'iter-thread' } };
        const agentQuery = 'Need more info';
        const userResponse = 'Here is info';

        mockRunGraph.resolves({ interrupted: true, agentQuery: agentQuery });
        mockPrompt.resolves({ userResponse: userResponse });

        const result = await analyzeCmd.analysisIteration(
            initialInput as Input,
            config,
            new PromptService(),
            mockRunGraph,
            mockPrompt
        );

        expect(mockRunGraph.calledOnceWith(initialInput, config)).to.be.true;
        expect((utils.say as sinon.SinonStub).calledWithMatch(agentQuery)).to.be.true;
        expect(mockPrompt.calledOnce).to.be.true;
        expect(result.isDone).to.be.false;
        expect(result.newInput).to.be.instanceOf(Command);
        const commandPayload = (result.newInput as Command).resume;
        expect(commandPayload).to.deep.equal(userResponse);
        expect((utils.dbg as sinon.SinonStub).calledWithMatch('Resuming analysis')).to.be.true;
    });

    it('should handle no interruption: call runGraph, return done', async () => {
        const initialInput = { userInput: 'start' };
        const config = { configurable: { thread_id: 'iter-thread-done' } };

        mockRunGraph.resolves({ interrupted: false, agentQuery: '' });

        const result = await analyzeCmd.analysisIteration(
            initialInput as Input,
            config,
            new PromptService(),
            mockRunGraph,
            mockPrompt
        );

        expect(mockRunGraph.calledOnceWith(initialInput, config)).to.be.true;
        expect(mockPrompt.notCalled).to.be.true;
        expect(result.isDone).to.be.true;
        expect(result.newInput).to.equal(initialInput);
        expect((utils.dbg as sinon.SinonStub).calledWithMatch('Graph execution completed')).to.be.true;
    });

     it('should handle interruption with empty user response', async () => {
        const initialInput = { userInput: 'start' };
        const config = { configurable: { thread_id: 'iter-thread-empty' } };
        const agentQuery = 'Need more info';

        mockRunGraph.resolves({ interrupted: true, agentQuery: agentQuery });
        mockPrompt.resolves({ userResponse: '' });

        const result = await analyzeCmd.analysisIteration(
            initialInput as Input,
            config,
            new PromptService(),
            mockRunGraph, 
            mockPrompt
        );

        expect(result.isDone).to.be.false;
        const commandPayload = (result.newInput as Command).resume;
        expect(commandPayload).to.deep.equal('');
        expect((utils.dbg as sinon.SinonStub).calledWithMatch('Resuming analysis')).to.be.true;
    });

});

  describe('getFinalOutput', () => {
    let mockGetState: sinon.SinonStub;

    beforeEach(() => {
        mockGetState = sinon.stub(agentApp, 'getState');
    });

    it('should return analysisOutput from state values', async () => {
        const config = { configurable: { thread_id: 'final-state-thread' } };
        const output = 'This is the final analysis.';
        const mockState: StateSnapshot = {
             values: { analysisOutput: output } as AppState,
             next: [], config: {}, tasks: []
        };
        mockGetState.resolves(mockState);
        const result = await analyzeCmd.getFinalOutput(config, agentApp.getState.bind(agentApp));
        expect(result).to.equal(output);
        expect(mockGetState.calledOnceWith(config)).to.be.true;
    });

    it('should return empty string if analysisOutput is missing', async () => {
        const config = { configurable: { thread_id: 'final-state-missing' } };
        mockGetState.resolves({ values: { response: 'some other field' } }); // analysisOutput is missing

        const result = await analyzeCmd.getFinalOutput(config, mockGetState);

        expect(result).to.equal('');
        expect(mockGetState.calledOnceWith(config)).to.be.true;
    });

    it('should return empty string if state values are null/undefined', async () => {
        const config = { configurable: { thread_id: 'final-state-null' } };
        mockGetState.resolves({ values: null as any }); // values is null

        const result = await analyzeCmd.getFinalOutput(config, mockGetState);

        expect(result).to.equal(''); // Uses nullish coalescing
    });

    it('should return empty string and log error if getState fails', async () => {
        const config = { configurable: { thread_id: 'final-state-fail' } };
        const getStateError = new Error('Failed to get state');
        mockGetState.rejects(getStateError);

        const result = await analyzeCmd.getFinalOutput(config, mockGetState);
        
        expect(result).to.equal(''); // Returns empty string on error
        
    });
});

  describe('displayFinalOutputToUser', () => {
    it('should call say with header and output', () => {
        const output = 'Analysis complete.';
        analyzeCmd.displayFinalOutputToUser(output);
        expect((utils.say as sinon.SinonStub).calledWithMatch('--- Final Analysis Output ---')).to.be.true;
        expect((utils.say as sinon.SinonStub).calledWith(output)).to.be.true;
        expect((utils.say as sinon.SinonStub).calledWithMatch('-----------------------------')).to.be.true;
    });

    it('should call say with placeholder if output is empty', () => {
        analyzeCmd.displayFinalOutputToUser('');
        expect((utils.say as sinon.SinonStub).calledWithMatch('--- Final Analysis Output ---')).to.be.true;
        expect((utils.say as sinon.SinonStub).calledWith('No analysis output generated.')).to.be.true;
        expect((utils.say as sinon.SinonStub).calledWithMatch('-----------------------------')).to.be.true;
    });

    it('should call say with placeholder if output is null/undefined', () => {
        analyzeCmd.displayFinalOutputToUser(null as any);
        expect((utils.say as sinon.SinonStub).calledWith('No analysis output generated.')).to.be.true;
        analyzeCmd.displayFinalOutputToUser(undefined as any);
        expect((utils.say as sinon.SinonStub).calledWith('No analysis output generated.')).to.be.true;
    });
});

  describe('persistFinalOutput', () => {
    let mockWriteFile: sinon.SinonStub;
    let mockResolve: sinon.SinonStub;

    const targetDir = './results';
    const output = 'Final analysis content.';
    const resolvedPath = '/abs/path/results/analysis_result.md';

    beforeEach(() => {
        // Create standalone stubs for dependencies, leveraging DI
        mockWriteFile = sinon.stub().resolves(); 
        mockResolve = sinon.stub().returns(resolvedPath); // Standalone stub for resolve
    });

    it('should resolve path and write output to file', async () => {
        await analyzeCmd.persistFinalOutput(output, targetDir, mockResolve, mockWriteFile);

        expect(mockResolve.calledOnceWith(targetDir, 'analysis_result.md')).to.be.true;
        expect(mockWriteFile.calledOnceWith(resolvedPath, output, 'utf-8')).to.be.true;
        // expect((utils.say as sinon.SinonStub).calledWithMatch(`Analysis results saved to: ${resolvedPath}`)).to.be.true;
    });

    it('should write empty string if output is null/undefined', async () => {
        await analyzeCmd.persistFinalOutput(null as any, targetDir, mockResolve, mockWriteFile);
        expect(mockWriteFile.calledOnceWith(resolvedPath, '', 'utf-8')).to.be.true;

        await analyzeCmd.persistFinalOutput(undefined as any, targetDir, mockResolve, mockWriteFile);
        expect(mockWriteFile.calledWith(resolvedPath, '', 'utf-8')).to.be.true;
    });

    it('should re-throw error if writeFile fails', async () => {
      const writeError = new Error('Disk full');
      mockWriteFile.rejects(writeError); // Configure the write stub to reject

      try {
        await analyzeCmd.persistFinalOutput(output, targetDir, mockResolve, mockWriteFile);
        // If persistFinalOutput completes without throwing, this line will be reached, failing the test.
        expect.fail('Expected persistFinalOutput to throw an error, but it completed successfully.');
      } catch (error) {
        // Assert that the caught error is the exact error instance we expect.
        expect(error).to.equal(writeError);
      }

      // Verify that resolve was called before the attempt to write.
      expect(mockResolve.calledOnceWith(targetDir, 'analysis_result.md')).to.be.true;
      // Verify that writeFile was attempted with the correct arguments.
      expect(mockWriteFile.calledOnceWith(resolvedPath, output, 'utf-8')).to.be.true;
      
      // Verify that the success message was not logged because an error occurred.
      // The actual message from utils.persistOutput on success is "Output saved to: ${outputPath}"
      expect((utils.say as sinon.SinonStub).calledWithMatch(`Output saved to: ${resolvedPath}`)).to.be.false;
    });
  });

  describe('runGraph', () => {
        let mockStream: sinon.SinonStub;
        let mockAgentStream: any; // Mock readable stream

        beforeEach(() => {
            // Basic mock stream setup
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { event: 'on_tool_start', data: { input: 'foo' }, name: 'tool1' };
                    yield { event: 'on_chat_model_stream', data: { chunk: { message: { content: 'Hello' } } } };
                    yield { event: 'on_tool_end', name: 'tool1' };
                }
            };
            mockStream = sinon.stub(agentApp, 'stream').resolves(mockAgentStream);
        });

        it('should call agentApp.stream and iterate through events without interruption', async () => {
            const input = { userInput: 'test' };
            const config = { configurable: { thread_id: 'graph-thread' } };

            const result = await analyzeCmd.runGraph(input, config, new PromptService());

            // expect(mockStream.calledOnceWith(input, config)).to.be.true;
            expect(mockStream.calledOnce).to.be.true;
            expect(result.interrupted).to.be.false;
            expect(result.agentQuery).to.equal('');
        });

        it('should detect interruption from stream chunk', async () => {
            const interruptQuery = 'Clarification needed';
            // Mock stream that yields an interrupt chunk
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { event: 'on_tool_start', data: { input: 'foo' }, name: 'tool1' };
                    yield { __interrupt__: [{ value: { query: interruptQuery } }] }; // Interrupt chunk
                    yield { event: 'on_tool_end', name: 'tool1' }; // This won't be reached due to break
                }
            };
            mockStream.resolves(mockAgentStream);

            const input = { userInput: 'test' };
            const config = { configurable: { thread_id: 'graph-interrupt-thread' } };

            const result = await analyzeCmd.runGraph(input, config, new PromptService());

            // expect(mockStream.calledOnceWith(input, config)).to.be.true;
            expect(mockStream.calledOnce).to.be.true;
            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal(interruptQuery);
        });

         it('should handle interruption with default query if query field is missing', async () => {
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { __interrupt__: [{ value: { other_data: 'stuff' } }] };
                }
            };
            mockStream.resolves(mockAgentStream);

            const result = await analyzeCmd.runGraph({}, {configurable: {thread_id: 'test-id'}}, new PromptService());

            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal('Agent needs input.');
        });

         it('should handle interruption with default query if value is missing', async () => {
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { __interrupt__: [{}] }; // Value missing
                }
            };
            mockStream.resolves(mockAgentStream);
            const result = await analyzeCmd.runGraph({}, {configurable: {thread_id: 'test-id'}}, new PromptService());
            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal('Agent needs input.');
        });

         it('should handle interruption with default query if interrupt array is empty', async () => {
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { __interrupt__: [] }; // Empty array
                }
            };
            mockStream.resolves(mockAgentStream);
            const result = await analyzeCmd.runGraph({}, {configurable: {thread_id: 'test-id'}}, new PromptService());
            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal('Agent needs input.');
        });


        it('should rethrow errors from agentApp.stream', async () => {
            const streamError = new Error('Stream failed');
            mockStream.rejects(streamError);

            const input = { userInput: 'test' };
            const config = { configurable: { thread_id: 'graph-fail-thread' } };

            try {
                await analyzeCmd.runGraph(input, config, new PromptService());
                expect.fail('runGraph should have thrown');
            } catch (error: any) {
                expect(error).to.equal(streamError);
                
            }
        });
    });

})});