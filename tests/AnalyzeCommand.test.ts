import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as AnalyzeCommand from '../src/cli/AnalyzeCommand'; // Adjust path as needed
import * as shell from '../src/cli/shell'; // For mocking dbg, say, newGraphConfig
import { Input } from '../src/cli/shell'; // Import Input directly
import * as fs from 'fs/promises'; // For mocking readFile
import * as path from 'path'; // For mocking resolve
import inquirer from 'inquirer'; // For mocking prompt
import { app as agentApp } from '../src/agents/graph'; // For mocking stream, getState
import { Command } from '@langchain/langgraph'; // Type needed

describe('AnalyzeCommand Module', () => {

  beforeEach(() => {
    // Optional: Setup stubs used across multiple tests, e.g., console logs
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(console, 'warn');
    sinon.stub(console, 'debug'); // Or stub shell.dbg if preferred
  });

  afterEach(() => {
    // Restore all stubs created by Sinon
    sinon.restore();
  });

  // --- Tests for parseArgs ---
  describe('parseArgs', () => {
    it('should correctly parse query and single file', () => {
      const args = ['--query', 'my query', '--file', 'file1.txt'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: 'my query', files: ['file1.txt'] });
    });

    it('should correctly parse query and multiple files', () => {
      const args = ['--query', 'another query', '--file', 'file1.txt', '--file', 'file2.js'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: 'another query', files: ['file1.txt', 'file2.js'] });
    });

    it('should handle arguments in different order', () => {
        const args = ['--file', 'file1.txt', '--query', 'my query', '--file', 'file2.js'];
        const result = AnalyzeCommand.parseArgs(args);
        expect(result).to.deep.equal({ query: 'my query', files: ['file1.txt', 'file2.js'] });
    });

    it('should return empty if query is missing', () => {
      const args = ['--file', 'file1.txt'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', files: [] });
      // Check for console warning/log about usage?
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should return empty if file is missing', () => {
      const args = ['--query', 'my query'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', files: [] });
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should return empty for empty args array', () => {
      const args: string[] = [];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', files: [] });
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should ignore unrecognized arguments', () => {
        const args = ['--query', 'my query', '--extra', 'value', '--file', 'file1.txt'];
        const result = AnalyzeCommand.parseArgs(args);
        expect(result).to.deep.equal({ query: 'my query', files: ['file1.txt'] });
        // Assert directly on the stub
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: --extra/)).to.be.true;
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: value/)).to.be.true;
      });

    // Optional: Test edge cases like query/file flags without values if needed
  });

  // --- Tests for readFiles ---
  describe('readFiles', () => {
    it('should read a single file and return its content', async () => {
      const filePath = 'src/file1.ts';
      const resolvedPath = '/abs/path/to/src/file1.ts';
      const fileContent = 'console.log("hello");';

      // Create mock functions for injection
      const mockResolve = sinon.stub().withArgs(filePath).returns(resolvedPath);
      const mockReadFile = sinon.stub().withArgs(resolvedPath, 'utf-8').resolves(fileContent);

      const result = await AnalyzeCommand.readFiles([filePath], mockReadFile, mockResolve);

      expect(result).to.deep.equal({ [resolvedPath]: fileContent });
      expect(mockResolve.calledOnceWith(filePath)).to.be.true;
      expect(mockReadFile.calledOnceWith(resolvedPath, 'utf-8')).to.be.true;
    });

    it('should read multiple files and return their contents', async () => {
      const filePath1 = 'path/file1.txt';
      const resolvedPath1 = '/abs/path/file1.txt';
      const fileContent1 = 'content1';
      const filePath2 = '../file2.js';
      const resolvedPath2 = '/abs/another/file2.js';
      const fileContent2 = 'content2';

      const mockResolve = sinon.stub();
      mockResolve.withArgs(filePath1).returns(resolvedPath1);
      mockResolve.withArgs(filePath2).returns(resolvedPath2);
      const mockReadFile = sinon.stub();
      mockReadFile.withArgs(resolvedPath1, 'utf-8').resolves(fileContent1);
      mockReadFile.withArgs(resolvedPath2, 'utf-8').resolves(fileContent2);

      const result = await AnalyzeCommand.readFiles([filePath1, filePath2], mockReadFile, mockResolve);

      expect(result).to.deep.equal({
        [resolvedPath1]: fileContent1,
        [resolvedPath2]: fileContent2,
      });
      expect(mockResolve.calledTwice).to.be.true;
      expect(mockReadFile.calledTwice).to.be.true;
    });

    it('should handle readFile error gracefully and return files read so far', async () => {
        const filePath1 = 'good.txt';
        const resolvedPath1 = '/abs/good.txt';
        const fileContent1 = 'good content';
        const filePath2 = 'bad.txt';
        const resolvedPath2 = '/abs/bad.txt';
        const readError = new Error('File not found');
  
        const mockResolve = sinon.stub();
        mockResolve.withArgs(filePath1).returns(resolvedPath1);
        mockResolve.withArgs(filePath2).returns(resolvedPath2);
        const mockReadFile = sinon.stub();
        mockReadFile.withArgs(resolvedPath1, 'utf-8').resolves(fileContent1);
        mockReadFile.withArgs(resolvedPath2, 'utf-8').rejects(readError);
  
        const result = await AnalyzeCommand.readFiles([filePath1, filePath2], mockReadFile, mockResolve);
        
        expect(result).to.deep.equal({ [resolvedPath1]: fileContent1 }); 
        expect((console.error as sinon.SinonStub).calledWithMatch(/Error reading input files:.+File not found/)).to.be.true;
      });

      it('should return an empty object if given an empty array', async () => {
        const mockResolve = sinon.stub();
        const mockReadFile = sinon.stub();

        const result = await AnalyzeCommand.readFiles([], mockReadFile, mockResolve);
        expect(result).to.deep.equal({});
        expect(mockResolve.notCalled).to.be.true;
        expect(mockReadFile.notCalled).to.be.true;
      });
  });

  // Helper function to create an async generator for mocking streams
  async function* mockStreamHelper(chunks: any[]) {
    for (const chunk of chunks) {
        yield chunk;
        // Add a small delay to simulate async nature if needed, or just yield
        await new Promise(resolve => setTimeout(resolve, 0)); 
    }
  }

  // --- Tests for runGraph ---
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
      
      const input: Input = { userInput: 'test' }; // Use directly imported Input type
      const config = { configurable: { thread_id: 'test-id' } };

      const result = await AnalyzeCommand.runGraph(input, config);

      expect(result).to.deep.equal({ interrupted: false, agentQuery: '' });
      expect(streamStub.calledOnceWith(input, config)).to.be.true;
      expect((console.debug as sinon.SinonStub).calledWithMatch(/chunk:/)).to.be.true; // Check if dbg was called
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

      const result = await AnalyzeCommand.runGraph(input, config);

      expect(result).to.deep.equal({ interrupted: true, agentQuery: interruptQuery });
      expect(streamStub.calledOnceWith(input, config)).to.be.true;
      // Check dbg calls for chunk and interrupt query
      expect((console.debug as sinon.SinonStub).calledWithMatch(/chunk:.*step1/)).to.be.true;
      expect((console.debug as sinon.SinonStub).calledWithMatch(/chunk:.*__interrupt__/)).to.be.true;
      expect((console.debug as sinon.SinonStub).calledWithMatch(`agentQuery: ${interruptQuery}`)).to.be.true;
    });

    it('should use default query if interrupt value is missing query field', async () => {
        const inputStream = mockStreamHelper([
          { __interrupt__: [{ type: 'interrupt', value: { someOtherData: 'foo' } }] } // Missing query
        ]);
        streamStub.returns(inputStream);
  
        const input: Input = { userInput: 'test' }; // Use directly imported Input type
        const config = { configurable: { thread_id: 'test-id' } };
  
        const result = await AnalyzeCommand.runGraph(input, config);
  
        expect(result).to.deep.equal({ interrupted: true, agentQuery: 'Agent needs input.' }); 
      });

    it('should re-throw error if agentApp.stream fails', async () => {
      const streamError = new Error('Stream failed!');
      streamStub.rejects(streamError);

      const input: Input = { userInput: 'test' }; // Use directly imported Input type
      const config = { configurable: { thread_id: 'test-id' } };

      try {
        await AnalyzeCommand.runGraph(input, config);
        expect.fail('runGraph should have thrown an error');
      } catch (error) {
        expect(error).to.equal(streamError);
        // Assert directly on the stub using calledWith for exact arguments
        expect((console.error as sinon.SinonStub).calledWith("Error during agent graph stream:", streamError)).to.be.true;
      }
    });
  });

  // --- Tests for analysisIteration ---
  describe('analysisIteration', () => {
    // Mocks will be created inside tests now
    // let runGraphStub: sinon.SinonStub;
    // let promptStub: sinon.SinonStub;
    
    // beforeEach(() => {
      // Remove stubs from here
      // runGraphStub = sinon.stub(AnalyzeCommand, 'runGraph');
      // promptStub = sinon.stub(inquirer, 'prompt');
    // });

    it('should prompt user and return Command input when runGraph interrupts', async () => {
      const agentQuery = 'What is the context?';
      const userResponse = 'This is the context.';
      const initialInput: Input = { userInput: 'start' };
      const config = { configurable: { thread_id: 'iter-test-1' } };

      // Create mock functions for injection
      const mockRunGraph = sinon.stub().resolves({ interrupted: true, agentQuery: agentQuery });
      const mockPrompt = sinon.stub().resolves({ userResponse: userResponse });
      const mockSay = sinon.stub();
      const mockDbg = sinon.stub();

      const result = await AnalyzeCommand.analysisIteration(
        initialInput, config, mockRunGraph, mockPrompt, mockSay, mockDbg
      );

      // Verify mocks were called
      expect(mockRunGraph.calledOnceWith(initialInput, config)).to.be.true;
      expect(mockSay.calledWith(`\nAgent: ${agentQuery}`)).to.be.true;
      expect(mockPrompt.calledOnceWith([{ type: 'input', name: 'userResponse', message: 'Your response: ' }])).to.be.true;
      const expectedCommand = new Command({ resume: userResponse });
      expect(mockDbg.calledWithMatch("Resuming with Command.")).to.be.true;
      // Verify result
      expect(result.isDone).to.be.false;
      expect(result.newInput).to.be.instanceOf(Command);
      expect((result.newInput as Command).resume).to.equal(userResponse);
    });

    it('should return isDone=true and original input when runGraph does not interrupt', async () => {
      const initialInput: Input = { userInput: 'start' };
      const config = { configurable: { thread_id: 'iter-test-2' } };

      // Create mock functions for injection
      const mockRunGraph = sinon.stub().resolves({ interrupted: false, agentQuery: '' });
      const mockPrompt = sinon.stub(); // Should not be called
      const mockSay = sinon.stub();
      const mockDbg = sinon.stub(); // Should not be called

      const result = await AnalyzeCommand.analysisIteration(
        initialInput, config, mockRunGraph, mockPrompt, mockSay, mockDbg
      );

      // Verify mocks were called (or not called)
      expect(mockRunGraph.calledOnceWith(initialInput, config)).to.be.true;
      expect(mockSay.calledWith('\n--- Analysis Complete ---')).to.be.true;
      expect(mockPrompt.notCalled).to.be.true;
      expect(mockDbg.notCalled).to.be.true;
      // Verify result
      expect(result.isDone).to.be.true;
      expect(result.newInput).to.deep.equal(initialInput);
    });
  });

  // --- Tests for handleAnalyzeCommand ---
  describe('handleAnalyzeCommand', () => {
    let mockParseArgs: sinon.SinonStub;
    let mockReadFiles: sinon.SinonStub;
    let mockNewGraphConfig: sinon.SinonStub;
    let mockAnalysisIteration: sinon.SinonStub;
    let mockGetState: sinon.SinonStub;
    let mockSay: sinon.SinonStub;
    let mockDbg: sinon.SinonStub;
    const fakeConfig = { configurable: { thread_id: 'handle-cmd-test-id' } };

    beforeEach(() => {
      // Create fresh stubs for each test
      mockParseArgs = sinon.stub();
      mockReadFiles = sinon.stub();
      mockNewGraphConfig = sinon.stub().returns(fakeConfig);
      mockAnalysisIteration = sinon.stub();
      mockGetState = sinon.stub();
      mockSay = sinon.stub();
      mockDbg = sinon.stub();
    });

    it('should run successfully with one iteration (no interrupt)', async () => {
      const args = ['--query', 'q1', '--file', 'f1.txt'];
      const parsedArgs = { query: 'q1', files: ['f1.txt'] };
      const fileContents = { '/abs/f1.txt': 'content' };
      const finalOutput = 'Analysis complete.';
      const finalState = { values: { analysisOutput: finalOutput } };

      // Configure mocks
      mockParseArgs.returns(parsedArgs);
      mockReadFiles.resolves(fileContents);
      // Mock analysisIteration to return done=true on first call
      mockAnalysisIteration.onFirstCall().resolves({ isDone: true, newInput: {} }); 
      mockGetState.resolves(finalState);

      await AnalyzeCommand.handleAnalyzeCommand(
        args, mockParseArgs, mockReadFiles, mockNewGraphConfig, 
        mockAnalysisIteration, mockGetState, mockSay, mockDbg
      );

      // Assertions
      expect(mockParseArgs.calledOnceWith(args)).to.be.true;
      expect(mockReadFiles.calledOnceWith(parsedArgs.files)).to.be.true;
      expect(mockNewGraphConfig.calledOnce).to.be.true;
      expect(mockDbg.calledWithMatch(`Starting analysis with thread ID: ${fakeConfig.configurable.thread_id}`)).to.be.true;
      expect(mockAnalysisIteration.calledOnce).to.be.true;
      // Check the input to analysisIteration on its first call
      const expectedInitialInput = {
        userInput: `analyze: ${parsedArgs.query}`,
        fileContents: fileContents,
        analysisHistory: [],
        analysisOutput: "",
        currentAnalysisQuery: "",
        response: "",
      };
      expect(mockAnalysisIteration.firstCall.args[0]).to.deep.equal(expectedInitialInput);
      expect(mockAnalysisIteration.firstCall.args[1]).to.equal(fakeConfig);
      expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
      expect(mockSay.calledWith('Final Output:')).to.be.true;
      expect(mockSay.calledWith(finalOutput)).to.be.true;
    });

    it('should run successfully with multiple iterations (interrupt/resume)', async () => {
        const args = ['--query', 'q2', '--file', 'f2.txt'];
        const parsedArgs = { query: 'q2', files: ['f2.txt'] };
        const fileContents = { '/abs/f2.txt': 'content2' };
        const finalOutput = 'Analysis done after interaction.';
        const finalState = { values: { analysisOutput: finalOutput } };
        const resumeCommand = new Command({ resume: 'user provided info' });
  
        // Configure mocks
        mockParseArgs.returns(parsedArgs);
        mockReadFiles.resolves(fileContents);
        // First call: interrupt, return resume command
        mockAnalysisIteration.onFirstCall().resolves({ isDone: false, newInput: resumeCommand }); 
        // Second call: done, return final state (input here might be resumeCommand or {})
        mockAnalysisIteration.onSecondCall().resolves({ isDone: true, newInput: {} }); 
        mockGetState.resolves(finalState);
  
        await AnalyzeCommand.handleAnalyzeCommand(
          args, mockParseArgs, mockReadFiles, mockNewGraphConfig, 
          mockAnalysisIteration, mockGetState, mockSay, mockDbg
        );
  
        // Assertions
        expect(mockParseArgs.calledOnceWith(args)).to.be.true;
        expect(mockReadFiles.calledOnceWith(parsedArgs.files)).to.be.true;
        expect(mockNewGraphConfig.calledOnce).to.be.true;
        expect(mockAnalysisIteration.calledTwice).to.be.true;
        // Check input to second call was the resume command from the first call
        expect(mockAnalysisIteration.secondCall.args[0]).to.equal(resumeCommand);
        expect(mockAnalysisIteration.secondCall.args[1]).to.equal(fakeConfig);
        expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
        expect(mockSay.calledWith('Final Output:')).to.be.true;
        expect(mockSay.calledWith(finalOutput)).to.be.true;
      });

    it('should handle error during getState gracefully', async () => {
        const args = ['--query', 'q3', '--file', 'f3.txt'];
        const parsedArgs = { query: 'q3', files: ['f3.txt'] };
        const fileContents = { '/abs/f3.txt': 'content3' };
        const getStateError = new Error('Failed to get state');
  
        // Configure mocks
        mockParseArgs.returns(parsedArgs);
        mockReadFiles.resolves(fileContents);
        mockAnalysisIteration.onFirstCall().resolves({ isDone: true, newInput: {} }); 
        mockGetState.rejects(getStateError); // Make getState throw error
  
        try {
            await AnalyzeCommand.handleAnalyzeCommand(
                args, mockParseArgs, mockReadFiles, mockNewGraphConfig, 
                mockAnalysisIteration, mockGetState, mockSay, mockDbg
            );
            expect.fail('handleAnalyzeCommand should have thrown');
        } catch (error) {
            expect(error).to.equal(getStateError);
            // Verify console.error was called (assuming it's not mocked away elsewhere)
            expect((console.error as sinon.SinonStub).calledWith("Error retrieving final graph state:", getStateError)).to.be.true;
            // Verify final output was not printed
            expect(mockSay.calledWith('Final Output:')).to.be.false;
        }
    });

    it('should exit early if parseArgs returns empty query', async () => {
        const args = ['--file', 'onlyfile.txt']; // Missing query
        const parsedArgs = { query: '', files: [] }; // Simulate parsing failure

        mockParseArgs.returns(parsedArgs);

        await AnalyzeCommand.handleAnalyzeCommand(
            args, mockParseArgs, mockReadFiles, mockNewGraphConfig, 
            mockAnalysisIteration, mockGetState, mockSay, mockDbg
        );

        // Assertions
        expect(mockParseArgs.calledOnceWith(args)).to.be.true;
        expect(mockDbg.calledWithMatch(/Exiting handleAnalyzeCommand/)).to.be.true;
        // Ensure other functions were NOT called
        expect(mockReadFiles.notCalled).to.be.true;
        expect(mockNewGraphConfig.notCalled).to.be.true;
        expect(mockAnalysisIteration.notCalled).to.be.true;
        expect(mockGetState.notCalled).to.be.true;
        expect(mockSay.notCalled).to.be.true;
    });

  });

}); 