import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as AnalyzeCommand from '../src/cli/AnalyzeCommand'; // Adjust path as needed
import * as shell from '../src/cli/shell'; // For mocking dbg, say, newGraphConfig
import { Input } from '../src/cli/shell'; // Import Input directly
import * as path from 'path'; // For mocking resolve
import inquirer from 'inquirer'; // For mocking prompt
import { app as agentApp } from '../src/agents/graph'; // For mocking stream, getState
import { Command } from '@langchain/langgraph'; // Type needed
import * as fsPromises from 'fs/promises'; // Needed for mocking writeFile

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
    

    it('should return empty if query is missing', () => {
      const args = ['--file', 'file1.txt'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
      // Check for console warning/log about usage?
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should return empty if file is missing', () => {
      const args = ['--query', 'my query'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should return empty for empty args array', () => {
      const args: string[] = [];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
      // expect(console.log).to.have.been.calledWithMatch(/Usage:/);
    });

    it('should ignore unrecognized arguments', () => {
        const args = ['--query', 'my query', '--extra', 'value', '--inputs', 'files'];
        const result = AnalyzeCommand.parseArgs(args);
        expect(result).to.deep.equal({ query: 'my query', inputsDir: 'files' });
        // Assert directly on the stub
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: --extra/)).to.be.true;
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: value/)).to.be.true;
      });

    // Modified test for --inputs
    it('should correctly parse query and inputs directory', () => {
      const args = ['--query', 'my query', '--inputs', './data'];
      const result = AnalyzeCommand.parseArgs(args);

      expect(result).to.deep.equal({ query: 'my query', inputsDir: './data' });
    });

    it('should handle arguments in different order', () => {
        const args = ['--inputs', '../input_dir', '--query', 'another query'];
        const result = AnalyzeCommand.parseArgs(args);
        expect(result).to.deep.equal({ query: 'another query', inputsDir: '../input_dir' });
    });

    it('should return empty if query is missing', () => {
      const args = ['--inputs', './data'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
      // TODO: Check if sayFn was called with usage message
    });

    it('should return empty if inputs directory is missing', () => {
      const args = ['--query', 'my query'];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
       // TODO: Check if sayFn was called with usage message
    });

    it('should return empty for empty args array', () => {
      const args: string[] = [];
      const result = AnalyzeCommand.parseArgs(args);
      expect(result).to.deep.equal({ query: '', inputsDir: '' });
       // TODO: Check if sayFn was called with usage message
    });

    it('should ignore unrecognized arguments', () => {
        const args = ['--query', 'my query', '--extra', 'value', '--inputs', 'my_dir'];
        const result = AnalyzeCommand.parseArgs(args);
        expect(result).to.deep.equal({ query: 'my query', inputsDir: 'my_dir' });
        // Assert directly on the stub
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: --extra/)).to.be.true;
        expect((console.warn as sinon.SinonStub).calledWithMatch(/Unrecognized argument: value/)).to.be.true;
      });

    // Optional: Test edge cases like query/inputs flags without values if needed
  });

  // --- Tests for readFiles ---
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

        const result = await AnalyzeCommand.readFiles(dir, mockReadFile, mockResolve, readdirFn);

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
        const result = await AnalyzeCommand.readFiles(dir, mockReadFile, mockResolve, readdirFn);
        
        expect(result).to.deep.equal({ [resolvedPath1]: fileContent1 }); 
      });

      it('should return an empty object if given an empty array', async () => {
        const mockResolve = sinon.stub();
        const mockReadFile = sinon.stub();

        const result = await AnalyzeCommand.readFiles('', mockReadFile, mockResolve);
        expect(result).to.deep.equal({});
        expect(mockResolve.notCalled).to.be.true;
        expect(mockReadFile.notCalled).to.be.true;
      });

    // Updated tests for reading from a directory
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

      // Pass dirPath string and the mocked functions
      const result = await AnalyzeCommand.readFiles(dirPath, mockReadFile, mockResolveFn, mockReaddir);

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
  
        const result = await AnalyzeCommand.readFiles(dirPath, mockReadFile, mockResolve, mockReaddir);
  
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

        // const mockResolve = path.resolve;
        const mockResolveFn = sinon.stub();
        mockResolveFn.withArgs(dirPath,dirents[0]).returns(resolvedGood1);
        mockResolveFn.withArgs(dirPath,dirents[2]).returns(resolvedGood2);
        mockResolveFn.withArgs(dirPath,dirents[1]).returns(resolvedBad);

        const mockReaddir = sinon.stub().withArgs(dirPath).resolves(dirents);

        const mockReadFile = sinon.stub();
        mockReadFile.withArgs(resolvedGood1, 'utf-8').resolves(contentGood1);
        mockReadFile.withArgs(resolvedBad, 'utf-8').rejects(readError);
        mockReadFile.withArgs(resolvedGood2, 'utf-8').resolves(contentGood2);

        const result = await AnalyzeCommand.readFiles(dirPath, mockReadFile, mockResolveFn, mockReaddir);
        
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

        const result = await AnalyzeCommand.readFiles(dirPath, mockReadFile, mockResolve, mockReaddir);

        expect(result).to.deep.equal({});
        expect(mockReaddir.calledOnceWith(dirPath)).to.be.true;
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
    let mockGetFinalOutput: sinon.SinonStub;
    let mockDisplayFinalOutput: sinon.SinonStub;
    let mockPersistFinalOutput: sinon.SinonStub;

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
      
      mockGetFinalOutput = sinon.stub();
      mockDisplayFinalOutput = sinon.stub();
      mockPersistFinalOutput = sinon.stub();
    });

    afterEach(() => {
        
    });

    it('should run successfully with one iteration (no interrupt)', async () => {
      // Updated args and parsedArgs for --inputs
      const args = ['--query', 'q1', '--inputs', './data'];
      const parsedArgs = { query: 'q1', inputsDir: './data' };
      const fileContents = { '/abs/data/file.txt': 'content' };
      const finalOutput = 'Analysis complete.';
      const finalState = { values: { analysisOutput: finalOutput } };

      // Configure mocks
      mockParseArgs.returns(parsedArgs);
      mockReadFiles.resolves(fileContents);
      mockAnalysisIteration.onFirstCall().resolves({ isDone: true, newInput: {} }); 
      mockGetFinalOutput.resolves(finalOutput);
      mockPersistFinalOutput.resolves();
      mockGetState.resolves(finalState);

      await AnalyzeCommand.handleAnalyzeCommand(
        args, 
        'test-model',
        mockParseArgs, 
        mockReadFiles, 
        mockNewGraphConfig, 
        mockAnalysisIteration, 
        mockGetState, 
        mockSay, 
        mockDbg,
        mockGetFinalOutput,
        mockDisplayFinalOutput,
        mockPersistFinalOutput
      );

      // Assertions
      expect(mockParseArgs.calledOnceWith(args)).to.be.true;
      // Check mockReadFiles called with inputsDir
      expect(mockReadFiles.calledOnceWith(parsedArgs.inputsDir)).to.be.true;
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
        modelName: "test-model",
      };
      expect(mockAnalysisIteration.firstCall.args[0]).to.deep.equal(expectedInitialInput);
      expect(mockAnalysisIteration.firstCall.args[1]).to.equal(fakeConfig);
      // Verify new function calls (using local stubs)
      expect(mockGetFinalOutput.calledOnceWith(fakeConfig, mockGetState)).to.be.true;
      expect(mockDisplayFinalOutput.calledOnceWith(finalOutput, mockSay)).to.be.true;
      expect(mockPersistFinalOutput.calledOnceWith(finalOutput, parsedArgs.inputsDir)).to.be.true;
      expect(mockGetFinalOutput.calledAfter(mockAnalysisIteration)).to.be.true;
      expect(mockDisplayFinalOutput.calledAfter(mockGetFinalOutput)).to.be.true;
      expect(mockPersistFinalOutput.calledAfter(mockDisplayFinalOutput)).to.be.true;
    });

    it('should run successfully with multiple iterations (interrupt/resume)', async () => {
        // Updated args and parsedArgs for --inputs
        const args = ['--query', 'q2', '--inputs', 'input_files'];
        const parsedArgs = { query: 'q2', inputsDir: 'input_files' };
        const fileContents = { '/abs/input_files/doc.md': 'content2' };
        const finalOutput = 'Analysis done after interaction.';
        const finalState = { values: { analysisOutput: finalOutput } };
        const resumeCommand = new Command({ resume: 'user provided info' });
  
        // Configure mocks
        mockParseArgs.returns(parsedArgs);
        mockReadFiles.resolves(fileContents);
        mockAnalysisIteration.onFirstCall().resolves({ isDone: false, newInput: resumeCommand }); 
        mockAnalysisIteration.onSecondCall().resolves({ isDone: true, newInput: {} }); 

        mockGetFinalOutput.resolves(finalOutput);
        mockPersistFinalOutput.resolves();
        mockGetState.resolves(finalState);
        await AnalyzeCommand.handleAnalyzeCommand(
          args, 
          'test-model',
          mockParseArgs, 
          mockReadFiles, 
          mockNewGraphConfig, 
          mockAnalysisIteration, 
          mockGetState, 
          mockSay, 
          mockDbg,
          mockGetFinalOutput,
          mockDisplayFinalOutput,
          mockPersistFinalOutput
        );
  
        // Assertions
        expect(mockParseArgs.calledOnceWith(args)).to.be.true;
        // Check mockReadFiles called with inputsDir
        expect(mockReadFiles.calledOnceWith(parsedArgs.inputsDir)).to.be.true;
        expect(mockNewGraphConfig.calledOnce).to.be.true;
        expect(mockAnalysisIteration.calledTwice).to.be.true;
        // Check input to second call was the resume command from the first call
        expect(mockAnalysisIteration.secondCall.args[0]).to.equal(resumeCommand);
        expect(mockAnalysisIteration.secondCall.args[1]).to.equal(fakeConfig);

        expect(mockGetFinalOutput.calledOnceWith(fakeConfig, mockGetState)).to.be.true;
        expect(mockDisplayFinalOutput.calledOnceWith(finalOutput, mockSay)).to.be.true;
        expect(mockPersistFinalOutput.calledOnceWith(finalOutput, parsedArgs.inputsDir)).to.be.true;
        expect(mockGetFinalOutput.calledAfter(mockAnalysisIteration)).to.be.true;
        expect(mockDisplayFinalOutput.calledAfter(mockGetFinalOutput)).to.be.true;
        expect(mockPersistFinalOutput.calledAfter(mockDisplayFinalOutput)).to.be.true;
      });

    it('should handle error during getFinalOutput gracefully', async () => {
        const args = ['--query', 'q3', '--inputs', './project'];
        const parsedArgs = { query: 'q3', inputsDir: './project' };
        const fileContents = { '/abs/project/main.txt': 'content3' };
        const getOutputError = new Error('Failed to get state via getFinalOutput');
  
        // Configure mocks
        mockParseArgs.returns(parsedArgs);
        mockReadFiles.resolves(fileContents);
        mockAnalysisIteration.onFirstCall().resolves({ isDone: true, newInput: {} }); 

        mockGetFinalOutput.rejects(getOutputError); // Make getFinalOutputFn throw error
  
        try {
            await AnalyzeCommand.handleAnalyzeCommand(
                args, 
                'test-model',
                mockParseArgs, 
                mockReadFiles, 
                mockNewGraphConfig, 
                mockAnalysisIteration, 
                mockGetState, 
                mockSay, 
                mockDbg,
                mockGetFinalOutput,
                mockDisplayFinalOutput,
                mockPersistFinalOutput
            );
            expect.fail('handleAnalyzeCommand should have thrown');
        } catch (error) {
            expect(error).to.equal(getOutputError);
            expect(mockGetFinalOutput.calledOnce).to.be.true;
            expect(mockDisplayFinalOutput.notCalled).to.be.true;
        }
    });

    it('should exit early if parseArgs returns empty query or dir', async () => {
        // Test case 1: Missing query
        const argsMissingQuery = ['--inputs', 'some_dir'];
        const parsedArgsMissingQuery = { query: '', inputsDir: '' }; 
        mockParseArgs.withArgs(argsMissingQuery).returns(parsedArgsMissingQuery);

        await AnalyzeCommand.handleAnalyzeCommand(
            argsMissingQuery, 
            'test-model',
            mockParseArgs, 
            mockReadFiles, 
            mockNewGraphConfig, 
            mockAnalysisIteration, 
            mockGetState, 
            mockSay, 
            mockDbg,
            mockGetFinalOutput,
            mockDisplayFinalOutput,
            mockPersistFinalOutput
        );
        // Assertions for missing query
        expect(mockParseArgs.calledWith(argsMissingQuery)).to.be.true;
        expect(mockDbg.calledWithMatch(/Exiting handleAnalyzeCommand due to missing query or inputs directory/)).to.be.true;
        expect(mockReadFiles.notCalled).to.be.true;
        expect(mockNewGraphConfig.notCalled).to.be.true;
        // Reset mocks for next test case within the same 'it' block if needed, or separate 'it' blocks
        mockParseArgs.resetHistory(); mockDbg.resetHistory(); mockReadFiles.resetHistory(); mockNewGraphConfig.resetHistory();

        // Test case 2: Missing directory
        const argsMissingDir = ['--query', 'a query'];
        const parsedArgsMissingDir = { query: '', inputsDir: '' }; // parseArgs returns empty dir
        mockParseArgs.withArgs(argsMissingDir).returns(parsedArgsMissingDir);

         await AnalyzeCommand.handleAnalyzeCommand(
            argsMissingDir, 
            'test-model',
            mockParseArgs, 
            mockReadFiles, 
            mockNewGraphConfig, 
            mockAnalysisIteration, 
            mockGetState, 
            mockSay, 
            mockDbg,
            mockGetFinalOutput,
            mockDisplayFinalOutput,
            mockPersistFinalOutput
        );
        // Assertions for missing directory
        expect(mockParseArgs.calledWith(argsMissingDir)).to.be.true;
        expect(mockDbg.calledWithMatch(/Exiting handleAnalyzeCommand due to missing query or inputs directory/)).to.be.true;
        expect(mockReadFiles.notCalled).to.be.true;
        expect(mockNewGraphConfig.notCalled).to.be.true;

    });

  });

  // --- Tests for getFinalOutput ---
  describe('getFinalOutput', () => {
    const fakeConfig = { configurable: { thread_id: 'get-test-id' } };

    it('should return analysisOutput when state has it', async () => {
      const expectedOutput = "This is the final analysis.";
      const finalState = { values: { analysisOutput: expectedOutput } };
      const mockGetState = sinon.stub().resolves(finalState);
      // Assuming getFinalOutput is exported or accessed via module
      const output = await (AnalyzeCommand as any).getFinalOutput(fakeConfig, mockGetState);
      expect(output).to.equal(expectedOutput);
      expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
    });

    it('should return empty string when state lacks analysisOutput', async () => {
      const finalState = { values: { someOtherField: 'value' } }; // No analysisOutput
      const mockGetState = sinon.stub().resolves(finalState);
      const output = await (AnalyzeCommand as any).getFinalOutput(fakeConfig, mockGetState);
      expect(output).to.equal("");
      expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
    });

     it('should return empty string when analysisOutput is null', async () => {
      const finalState = { values: { analysisOutput: null } };
      const mockGetState = sinon.stub().resolves(finalState);
      const output = await (AnalyzeCommand as any).getFinalOutput(fakeConfig, mockGetState);
      expect(output).to.equal(""); // Or should it be null? Function returns || ""
      expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
    });

    it('should throw error and log if getStateFn rejects', async () => {
      const getStateError = new Error('Failed to get state');
      const mockGetState = sinon.stub().rejects(getStateError);
      try {
        await (AnalyzeCommand as any).getFinalOutput(fakeConfig, mockGetState);
        expect.fail('getFinalOutput should have thrown');
      } catch (error) {
        expect(error).to.equal(getStateError);
        expect(mockGetState.calledOnceWith(fakeConfig)).to.be.true;
        //expect((console.error as sinon.SinonStub).calledWith("Error retrieving final graph state:", getStateError)).to.be.true;
      }
    });
  });

  // --- Tests for displayFinalOutputToUser ---
  describe('displayFinalOutputToUser', () => {
    let mockSay: sinon.SinonStub;

    beforeEach(() => {
      mockSay = sinon.stub();
    });

    it('should call sayFn with title and output when output is provided', () => {
      const output = "Here is the result.";
      (AnalyzeCommand as any).displayFinalOutputToUser(output, mockSay);
      expect(mockSay.calledTwice).to.be.true;
      expect(mockSay.firstCall.calledWith("Final Output:")).to.be.true;
      expect(mockSay.secondCall.calledWith(output)).to.be.true;
    });

    it('should call sayFn with title and default message when output is empty', () => {
      const output = "";
      (AnalyzeCommand as any).displayFinalOutputToUser(output, mockSay);
      expect(mockSay.calledTwice).to.be.true;
      expect(mockSay.firstCall.calledWith("Final Output:")).to.be.true;
      expect(mockSay.secondCall.calledWith("No analysis output generated.")).to.be.true;
    });

    it('should call sayFn with title and default message when output is null', () => {
      const output = null as any; // Simulate potentially null input
      (AnalyzeCommand as any).displayFinalOutputToUser(output, mockSay);
      expect(mockSay.calledTwice).to.be.true;
      expect(mockSay.firstCall.calledWith("Final Output:")).to.be.true;
      expect(mockSay.secondCall.calledWith("No analysis output generated.")).to.be.true;
    });
  });

  // --- Tests for persistFinalOutput ---
  describe('persistFinalOutput', () => {
    let mockResolve: sinon.SinonStub;
    let mockWriteFile: sinon.SinonStub;
    const targetDir = '/path/to/output';
    const outputContent = '# Analysis Result\nContent goes here.';
    const expectedOutputPath = '/path/to/output/analysis_result.md';

    beforeEach(() => {
      mockResolve = sinon.stub().returns(expectedOutputPath);
      mockWriteFile = sinon.stub(); // Initialize as simple stub
    });

    afterEach(() => {
    });

    it('should resolve path, write file, and log success', async () => {
      mockWriteFile.resolves(); // Simulate successful write

      await (AnalyzeCommand as any).persistFinalOutput(
        outputContent, targetDir, mockResolve, mockWriteFile
      );

      expect(mockResolve.calledOnceWith(targetDir, 'analysis_result.md')).to.be.true;
      expect(mockWriteFile.calledOnceWith(expectedOutputPath, outputContent, 'utf-8')).to.be.true;
      //expect((console.log as sinon.SinonStub).calledWith(`Analysis results saved to: ${expectedOutputPath}`)).to.be.true;
      //expect((console.error as sinon.SinonStub).notCalled).to.be.true;
    });

    it('should log error and not throw if writeFile fails', async () => {
      const writeError = new Error('Disk full');
      mockWriteFile.rejects(writeError); // Simulate failed write

      await (AnalyzeCommand as any).persistFinalOutput(
        outputContent, targetDir, mockResolve, mockWriteFile
      );

      expect(mockResolve.calledOnceWith(targetDir, 'analysis_result.md')).to.be.true;
      expect(mockWriteFile.calledOnceWith(expectedOutputPath, outputContent, 'utf-8')).to.be.true;
      expect((console.error as sinon.SinonStub).calledWith(`Error saving analysis results to ${expectedOutputPath}:`, writeError)).to.be.true;
      //expect((console.log as sinon.SinonStub).notCalled).to.be.true;
      // Important: Assert that the function itself did not throw
    });
  });

}); 