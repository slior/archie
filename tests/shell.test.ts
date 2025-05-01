import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as shell from '../src/cli/shell'; // Import all exports from shell.ts
import * as uuid from 'uuid';
import inquirer from 'inquirer'; // Import inquirer for mocking
import { AppState } from '../src/agents/graph'; // Import necessary types
import { Command } from '@langchain/langgraph'; // Import Command type

// Mock the agentApp
const mockAgentApp = {
  invoke: sinon.stub(),
};

// Mocking the module import requires a bit more setup, 
// typically using proxyquire or jest.mock. 
// For now, let's assume we can stub the functions directly if they are exported,
// or we modify the source to allow injection for testing.
// Let's try stubbing the exported functions directly where possible.

describe('Shell Module', () => {
  let consoleLogStub: sinon.SinonStub;
  let consoleDebugStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub console methods before each test
    consoleLogStub = sinon.stub(console, 'log');
    consoleDebugStub = sinon.stub(console, 'debug');

    // Reset the mock agentApp invoke history
    mockAgentApp.invoke.reset();
  });

  afterEach(() => {
    sinon.restore(); // Restore all stubs/spies/mocks after each test
  });

  describe('parseCommand', () => {
    it('should parse a command with no arguments', () => {
      const input = 'test';
      const expected = { command: 'test', args: [] };
      expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should parse a command with simple arguments', () => {
      const input = 'test arg1 arg2';
      const expected = { command: 'test', args: ['arg1', 'arg2'] };
      expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should parse a command with double-quoted arguments', () => {
      const input = 'test --query "hello world" --file "path/to/file.txt"';
      const expected = { command: 'test', args: ['--query', 'hello world', '--file', 'path/to/file.txt'] };
      expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should parse a command with single-quoted arguments', () => {
        const input = "test --query 'hello world' --file 'path/to/file.txt'";
        const expected = { command: 'test', args: ['--query', 'hello world', '--file', 'path/to/file.txt'] };
        expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should parse a command with mixed quoted and unquoted arguments', () => {
      const input = 'test arg1 "quoted arg" arg3 \'another quote\'';
      const expected = { command: 'test', args: ['arg1', 'quoted arg', 'arg3', 'another quote'] };
      expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should handle empty input string', () => {
      const input = '';
      const expected = { command: '', args: [] };
      expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should handle input with only spaces', () => {
        const input = '   ';
        // This behavior depends on the regex match. Let's assume it results in empty.
        // If the regex was `split(/\s+/)`, it might result in `['', '', '']`.
        // The current regex `/(?:[^\s"]+|"[^"]*")+/g` should return null -> `|| []` -> empty.
        const expected = { command: '', args: [] };
        expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should handle arguments containing special characters if not quoted', () => {
        const input = 'test arg1=value --flag';
        const expected = { command: 'test', args: ['arg1=value', '--flag'] };
        expect(shell.parseCommand(input)).to.deep.equal(expected);
    });

    it('should preserve special characters within quotes', () => {
        const input = 'test "arg with spaces=true" \'and=symbol$\'';
        const expected = { command: 'test', args: ['arg with spaces=true', 'and=symbol$'] };
        expect(shell.parseCommand(input)).to.deep.equal(expected);
    });
  });


  describe('getCommandInput', () => {
    it('should return the trimmed input from inquirer prompt', async () => {
      const mockInput = '  test command  ';
      const expectedOutput = 'test command';
      const promptStub = sinon.stub(inquirer, 'prompt').resolves({ command: mockInput });

      const result = await shell.getCommandInput();

      expect(result).to.equal(expectedOutput);
      expect(promptStub.calledOnce).to.be.true;
      // Check if the correct question was asked
      expect(promptStub.firstCall.args[0]).to.deep.equal([{ type: 'input', name: 'command', message: 'archie> ' }]);
    });

    it('should handle empty input from inquirer prompt', async () => {
        const mockInput = '';
        const expectedOutput = '';
        const promptStub = sinon.stub(inquirer, 'prompt').resolves({ command: mockInput });
  
        const result = await shell.getCommandInput();
  
        expect(result).to.equal(expectedOutput);
        expect(promptStub.calledOnce).to.be.true;
      });
  });

  // More tests for other functions will go here...

}); 