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

// Define mockMemoryServiceInstance at a higher scope
let mockMemoryServiceInstance: MemoryService;

describe('Analyze Command (src/commands/analyze.ts)', () => {

  beforeEach(() => {
    mockMemoryServiceInstance = new MemoryService(); // Create fresh instance for each test

    // Stub utils used by the command
    sinon.stub(utils, 'dbg');
    sinon.stub(utils, 'say');
    

  });

  afterEach(() => {
    sinon.restore(); // Restores all stubs (including utils and MemoryService)
  });

  // --- Tests for readFiles (targeting the exported function from analyze.ts) ---
  describe('readFiles', () => {
    it('should read a single file and return its content', async () => {
        const dir = 'src';
        const filePath = 'src/file1.md';
        const resolvedPath = '/abs/path/to/src/file1.md';
        const fileContent = 'console.log("hello");';

        // Create mock functions for injection
        const mockResolve = sinon.stub().withArgs(dir,filePath).returns(resolvedPath);
        const mockReadFile = sinon.stub().withArgs(resolvedPath, 'utf-8').resolves(fileContent);
        const readdirFn = sinon.stub().withArgs(dir).resolves([filePath]);

        const result = await analyzeCmd.readFiles(dir, mockReadFile, mockResolve, readdirFn);

        expect(result).to.deep.equal({ [resolvedPath]: fileContent });
        expect(mockResolve.calledOnceWith(dir,filePath)).to.be.true;
        expect(mockReadFile.calledOnceWith(resolvedPath, 'utf-8')).to.be.true;
        expect(readdirFn.calledOnceWith(dir)).to.be.true;
    });

    it('should handle readFile error gracefully and return files read so far', async () => {
        const dir = 'abs';
        const filePath1 = 'good.txt';
        const resolvedPath1 = '/abs/good.txt';
        const fileContent1 = 'good content';
        const filePath2 = 'bad.txt';
        const resolvedPath2 = '/abs/bad.txt';
        const readError = new Error('File not found');
  
        const mockResolve = sinon.stub();
        mockResolve.withArgs(dir,filePath1).returns(resolvedPath1);
        mockResolve.withArgs(dir,filePath2).returns(resolvedPath2);
        const mockReadFile = sinon.stub();
        mockReadFile.withArgs(resolvedPath1, 'utf-8').resolves(fileContent1);
        mockReadFile.withArgs(resolvedPath2, 'utf-8').rejects(readError);
        const readdirFn = sinon.stub().withArgs(dir).resolves([filePath1, filePath2]);
        const result = await analyzeCmd.readFiles(dir, mockReadFile, mockResolve, readdirFn);
        
        expect(result).to.deep.equal({ [resolvedPath1]: fileContent1 }); 
      });

      it('should return an empty object if given an empty array', async () => {
        const mockResolve = sinon.stub();
        const mockReadFile = sinon.stub();

        const result = await analyzeCmd.readFiles('', mockReadFile, mockResolve);
        expect(result).to.deep.equal({});
        expect(mockResolve.notCalled).to.be.true;
        expect(mockReadFile.notCalled).to.be.true;
      });

    it('should read .txt and .md files from a directory', async () => {
      const dirPath = 'test/data';
      const dirents = ['file1.txt', 'image.png', 'notes.md', 'subfolder'];
      const resolvedPath1 = path.join(dirPath, 'file1.txt'); // Use path.join for consistency
      const resolvedPath2 = path.join(dirPath, 'notes.md');
      const fileContent1 = 'text content';
      const fileContent2 = '# Markdown content';

      // Create mock functions for injection
      const mockResolveFn = sinon.stub();
      mockResolveFn.withArgs(dirPath,dirents[0]).returns(resolvedPath1);
      mockResolveFn.withArgs(dirPath,dirents[2]).returns(resolvedPath2);
      
      const mockReaddir = sinon.stub().withArgs(dirPath).resolves(dirents);
      const mockReadFile = sinon.stub();
      mockReadFile.withArgs(resolvedPath1, 'utf-8').resolves(fileContent1);
      mockReadFile.withArgs(resolvedPath2, 'utf-8').resolves(fileContent2);

      const result = await analyzeCmd.readFiles(dirPath, mockReadFile, mockResolveFn, mockReaddir);

      expect(result).to.deep.equal({ 
        [resolvedPath1]: fileContent1,
        [resolvedPath2]: fileContent2
       });
      expect(mockReaddir.calledOnceWith(dirPath)).to.be.true;
      // readFile should only be called for .txt and .md files
      expect(mockReadFile.calledTwice).to.be.true;
      expect(mockReadFile.calledWith(resolvedPath1, 'utf-8')).to.be.true;
      expect(mockReadFile.calledWith(resolvedPath2, 'utf-8')).to.be.true;
    });

    it('should return empty object if directory contains no matching files', async () => {
        const dirPath = 'test/empty_or_no_match';
        const dirents = ['image.png', 'archive.zip'];
  
        const mockResolve = path.resolve;
        const mockReaddir = sinon.stub().withArgs(dirPath).resolves(dirents);
        const mockReadFile = sinon.stub(); // Should not be called
  
        const result = await analyzeCmd.readFiles(dirPath, mockReadFile, mockResolve, mockReaddir);
  
        expect(result).to.deep.equal({});
        expect(mockReaddir.calledOnceWith(dirPath)).to.be.true;
        expect(mockReadFile.notCalled).to.be.true;
      });

    it('should handle readFile error gracefully for one file and read others', async () => {
        const dirPath = 'test/mixed';
        const dirents = ['good.txt', 'bad.md', 'another_good.txt'];
        const resolvedGood1 = path.join(dirPath, 'good.txt');
        const resolvedBad = path.join(dirPath, 'bad.md');
        const resolvedGood2 = path.join(dirPath, 'another_good.txt');
        const contentGood1 = 'content1';
        const contentGood2 = 'content3';
        const readError = new Error('Permission denied');

        const mockResolveFn = sinon.stub();
        mockResolveFn.withArgs(dirPath,dirents[0]).returns(resolvedGood1);
        mockResolveFn.withArgs(dirPath,dirents[2]).returns(resolvedGood2);
        mockResolveFn.withArgs(dirPath,dirents[1]).returns(resolvedBad);

        const mockReaddir = sinon.stub().withArgs(dirPath).resolves(dirents);

        const mockReadFile = sinon.stub();
        mockReadFile.withArgs(resolvedGood1, 'utf-8').resolves(contentGood1);
        mockReadFile.withArgs(resolvedBad, 'utf-8').rejects(readError);
        mockReadFile.withArgs(resolvedGood2, 'utf-8').resolves(contentGood2);

        const result = await analyzeCmd.readFiles(dirPath, mockReadFile, mockResolveFn, mockReaddir);
        
        expect(result).to.deep.equal({ 
            [resolvedGood1]: contentGood1,
            [resolvedGood2]: contentGood2 // bad.md should be missing
        }); 
        expect(mockReaddir.calledOnce).to.be.true;
        expect(mockReadFile.callCount).to.equal(3);
      });

    it('should handle readdir error gracefully', async () => {
        const dirPath = 'test/nonexistent';
        const readDirError = new Error('Directory not found');

        const mockResolve = path.resolve;
        const mockReaddir = sinon.stub().withArgs(dirPath).rejects(readDirError);
        const mockReadFile = sinon.stub(); // Should not be called

        const result = await analyzeCmd.readFiles(dirPath, mockReadFile, mockResolve, mockReaddir);

        expect(result).to.deep.equal({});
        expect(mockReaddir.calledOnceWith(dirPath)).to.be.true;
        expect(mockReadFile.notCalled).to.be.true;
      });
  });

  describe('runAnalysis', () => {

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

      const result = await analyzeCmd.runGraph(input, config);

      expect(result).to.deep.equal({ interrupted: false, agentQuery: '' });
      expect(streamStub.calledOnceWith(input, config)).to.be.true;
      
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

      const result = await analyzeCmd.runGraph(input, config);

      expect(result).to.deep.equal({ interrupted: true, agentQuery: interruptQuery });
      expect(streamStub.calledOnceWith(input, config)).to.be.true;
      
    });

    it('should use default query if interrupt value is missing query field', async () => {
        const inputStream = mockStreamHelper([
          { __interrupt__: [{ type: 'interrupt', value: { someOtherData: 'foo' } }] } // Missing query
        ]);
        streamStub.returns(inputStream);
  
        const input: Input = { userInput: 'test' };
        const config = { configurable: { thread_id: 'test-id' } };
  
        const result = await analyzeCmd.runGraph(input, config);
  
        expect(result).to.deep.equal({ interrupted: true, agentQuery: 'Agent needs input.' }); 
      });

    it('should re-throw error if agentApp.stream fails', async () => {
      const streamError = new Error('Stream failed!');
      streamStub.rejects(streamError);

      const input: Input = { userInput: 'test' };
      const config = { configurable: { thread_id: 'test-id' } };

      try {
        await analyzeCmd.runGraph(input, config);
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
        expect((utils.say as sinon.SinonStub).calledWithMatch(`Analysis results saved to: ${resolvedPath}`)).to.be.true;
    });

    it('should write empty string if output is null/undefined', async () => {
        await analyzeCmd.persistFinalOutput(null as any, targetDir, mockResolve, mockWriteFile);
        expect(mockWriteFile.calledOnceWith(resolvedPath, '', 'utf-8')).to.be.true;

        await analyzeCmd.persistFinalOutput(undefined as any, targetDir, mockResolve, mockWriteFile);
        expect(mockWriteFile.calledWith(resolvedPath, '', 'utf-8')).to.be.true;
    });

    it('should log error if writeFile fails but not throw', async () => {
      const writeError = new Error('Disk full');
      mockWriteFile.rejects(writeError); // Configure the write stub to reject

      await analyzeCmd.persistFinalOutput(output, targetDir, mockResolve, mockWriteFile);

      expect(mockWriteFile.calledOnce).to.be.true;
      // Resolve should still be called
      expect(mockResolve.calledOnceWith(targetDir, 'analysis_result.md')).to.be.true;
      expect((utils.say as sinon.SinonStub).calledWithMatch('Analysis results saved to:')).to.be.false;
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

            const result = await analyzeCmd.runGraph(input, config);

            expect(mockStream.calledOnceWith(input, config)).to.be.true;
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

            const result = await analyzeCmd.runGraph(input, config);

            expect(mockStream.calledOnceWith(input, config)).to.be.true;
            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal(interruptQuery);
            expect((utils.dbg as sinon.SinonStub).calledWithMatch(interruptQuery)).to.be.true;
        });

         it('should handle interruption with default query if query field is missing', async () => {
            mockAgentStream = {
                async *[Symbol.asyncIterator]() {
                    yield { __interrupt__: [{ value: { other_data: 'stuff' } }] };
                }
            };
            mockStream.resolves(mockAgentStream);

            const result = await analyzeCmd.runGraph({}, {});

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
            const result = await analyzeCmd.runGraph({}, {});
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
            const result = await analyzeCmd.runGraph({}, {});
            expect(result.interrupted).to.be.true;
            expect(result.agentQuery).to.equal('Agent needs input.');
        });


        it('should rethrow errors from agentApp.stream', async () => {
            const streamError = new Error('Stream failed');
            mockStream.rejects(streamError);

            const input = { userInput: 'test' };
            const config = { configurable: { thread_id: 'graph-fail-thread' } };

            try {
                await analyzeCmd.runGraph(input, config);
                expect.fail('runGraph should have thrown');
            } catch (error: any) {
                expect(error).to.equal(streamError);
                
            }
        });
    });

})});