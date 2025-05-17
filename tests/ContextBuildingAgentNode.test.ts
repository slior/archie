import { expect } from 'chai';
import sinon from 'sinon';
import { contextBuildingAgentNode } from '../src/agents/ContextBuildingAgentNode';
import { AppState, Role } from '../src/agents/graph';
import * as LLMUtils from '../src/agents/LLMUtils';
import * as AgentUtils from '../src/agents/agentUtils';
import { PromptService } from '../src/services/PromptService';
import { AppRunnableConfig, AppGraphConfigurable } from '../src/utils';

describe('ContextBuildingAgentNode', () => {
    let sandbox: sinon.SinonSandbox;
    let callTheLLMMock: sinon.SinonStub;
    let summarizeFilesMock: sinon.SinonStub;
    let getFormattedPromptMock: sinon.SinonStub;
    
    let mockPromptService: sinon.SinonStubbedInstance<PromptService>;

    const baseConfig: AppRunnableConfig = {
        configurable: {
            thread_id: 'test-thread',
            promptService: undefined as any as PromptService,
        }
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        callTheLLMMock = sandbox.stub(LLMUtils, 'callTheLLM');
        summarizeFilesMock = sandbox.stub(AgentUtils, 'summarizeFiles');
        
        mockPromptService = sandbox.createStubInstance(PromptService);
        getFormattedPromptMock = mockPromptService.getFormattedPrompt;
    });

    afterEach(() => {
        sandbox.restore();
    });

    const baseState: AppState = {
        userInput: 'build_context: TestSystem',
        inputs: { 'file1.txt': 'content1', 'file2.md': 'content2' },
        systemName: 'TestSystem',
        modelName: 'test-model',
        currentFlow: 'build_context',
        inputDirectoryPath: '/test/dir',
        response: '',
        fileContents: {},
        analysisHistory: [],
        analysisOutput: '',
        currentAnalysisQuery: '',
        contextBuilderOutputContent: '',
        contextBuilderOutputFileName: '',
    };

    it('should successfully build context and return correct state update', async () => {
        const fakeSummaries = 'Summary of file1 and file2';
        const fakePrompt = 'Generated prompt for TestSystem';
        const fakeLLMResponse = 'LLM generated context for TestSystem';
        const expectedOutputFileName = 'TestSystem_context.md';

        summarizeFilesMock.returns(fakeSummaries);
        getFormattedPromptMock.resolves(fakePrompt);
        callTheLLMMock.resolves(fakeLLMResponse);

        const configWithMock: AppRunnableConfig = {
            configurable: {
                thread_id: 'test-thread',
                promptService: mockPromptService
            }
        };

        const result = await contextBuildingAgentNode(baseState, configWithMock);

        expect(summarizeFilesMock.calledOnceWithExactly(baseState.inputs)).to.be.true;
        expect(getFormattedPromptMock.calledOnceWithExactly('ContextBuildingAgentNode', 'context_build', {
            systemName: baseState.systemName,
            fileSummaries: fakeSummaries,
        })).to.be.true;
        expect(callTheLLMMock.calledOnceWithExactly([], fakePrompt, baseState.modelName)).to.be.true;
        expect(result.contextBuilderOutputContent).to.equal(fakeLLMResponse);
        expect(result.contextBuilderOutputFileName).to.equal(expectedOutputFileName);
        expect(result.userInput).to.equal("");
    });

    it('should throw an error if PromptService is not available in config', async () => {
        const configWithoutPromptService: AppRunnableConfig = {
            configurable: { thread_id: 'test-thread', promptService: undefined as any }
        };
        try {
            await contextBuildingAgentNode(baseState, configWithoutPromptService);
            expect.fail('Should have thrown an error due to missing PromptService');
        } catch (error: any) {
            expect(error.message).to.equal('Critical Error: PromptService not available in ContextBuildingAgentNode.');
        }
    });

    it('should throw an error if state.inputs is missing or empty', async () => {
        const stateWithEmptyInputs: AppState = { ...baseState, inputs: {} };
        const configWithMock: AppRunnableConfig = { configurable: { thread_id: 'test-thread', promptService: mockPromptService }};
        try {
            await contextBuildingAgentNode(stateWithEmptyInputs, configWithMock);
            expect.fail('Should have thrown an error due to empty inputs');
        } catch (error: any) {
            expect(error.message).to.equal('Critical Error: Input documents (state.inputs) were not found or are empty. Context building cannot proceed.');
        }
        
        const stateWithUndefinedInputs: AppState = { ...baseState, inputs: undefined as any };
        try {
            await contextBuildingAgentNode(stateWithUndefinedInputs, configWithMock);
            expect.fail('Should have thrown an error due to undefined inputs');
        } catch (error: any) {
            expect(error.message).to.equal('Critical Error: Input documents (state.inputs) were not found or are empty. Context building cannot proceed.');
        }
    });

    it('should throw an error if state.systemName is missing', async () => {
        const stateWithoutSystemName: AppState = { ...baseState, systemName: undefined };
        const configWithMock: AppRunnableConfig = { configurable: { thread_id: 'test-thread', promptService: mockPromptService }};
        try {
            await contextBuildingAgentNode(stateWithoutSystemName, configWithMock);
            expect.fail('Should have thrown an error due to missing systemName');
        } catch (error: any) {
            expect(error.message).to.equal('Critical Error: System name (state.systemName) not found. Context building cannot proceed.');
        }
    });

    it('should throw an error if callTheLLM fails', async () => {
        summarizeFilesMock.returns('Some summaries');
        getFormattedPromptMock.resolves('Some prompt');
        const llmError = new Error('LLM API is down');
        callTheLLMMock.rejects(llmError);
        const configWithMock: AppRunnableConfig = { configurable: { thread_id: 'test-thread', promptService: mockPromptService }};

        try {
            await contextBuildingAgentNode(baseState, configWithMock);
            expect.fail('Should have thrown an error due to LLM failure');
        } catch (error: any) {
            expect(error.message).to.equal(`LLM communication or processing failed during context building for ${baseState.systemName}. Original error: ${llmError.message}`);
        }
    });

    it('should throw an error if promptService.getFormattedPrompt fails', async () => {
        summarizeFilesMock.returns('Some summaries');
        const promptServiceError = new Error('Prompt formatting failed');
        getFormattedPromptMock.rejects(promptServiceError);
        callTheLLMMock.resolves('This should not be called');
        const configWithMock: AppRunnableConfig = { configurable: { thread_id: 'test-thread', promptService: mockPromptService }};

        try {
            await contextBuildingAgentNode(baseState, configWithMock);
            expect.fail('Should have thrown an error due to PromptService failure');
        } catch (error: any) {
            expect(error.message).to.contain('LLM communication or processing failed during context building');
            expect(error.message).to.contain(promptServiceError.message);
        }
        expect(callTheLLMMock.notCalled).to.be.true;
    });
}); 