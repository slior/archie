import { expect } from 'chai';
import sinon from 'sinon';
import { graphExtractionNode } from '../src/agents/GraphExtractionNode';
import { AppState } from '../src/agents/graph';
import { MemoryService } from '../src/memory/MemoryService';

describe('GraphExtractionNode', () => {
    let memoryService: MemoryService;
    let addOrUpdateEntityStub: sinon.SinonStub;
    let addOrUpdateRelationshipStub: sinon.SinonStub;
    let getContextAsStringStub: sinon.SinonStub;
    let getCurrentStateStub: sinon.SinonStub;

    beforeEach(() => {
        memoryService = MemoryService.fromState(undefined);
        addOrUpdateEntityStub = sinon.stub(memoryService, 'addOrUpdateEntity').returns(true); // Return true for "new entity"
        addOrUpdateRelationshipStub = sinon.stub(memoryService, 'addOrUpdateRelationship').returns(true); // Return true for success
        getContextAsStringStub = sinon.stub(memoryService, 'getContextAsString').returns('{"entities": [], "relationships": []}');
        getCurrentStateStub = sinon.stub(memoryService, 'getCurrentState').returns({ entities: [], relationships: [] }); // Mock getCurrentState
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('successful graph extraction with mock data', () => {
        it('should extract entities and relationships from documents', async () => {
            // Mock LLMGraphTransformer
            const mockGraphDocument = {
                nodes: [
                    {
                        id: 'TestService',
                        type: 'service',
                        properties: { description: 'A test service' }
                    },
                    {
                        id: 'TestDatabase',
                        type: 'database',
                        properties: { description: 'A test database' }
                    }
                ],
                relationships: [
                    {
                        source: { id: 'TestService' },
                        target: { id: 'TestDatabase' },
                        type: 'depends-on',
                        properties: { strength: 'high' }
                    }
                ]
            };

            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([mockGraphDocument])
            };

            // Create constructor mocks that return the mocked instances
            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'This is test content about a service and database.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            // Pass the mocked constructors to the function
            const result = await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(addOrUpdateEntityStub.callCount).to.equal(2);
            expect(addOrUpdateRelationshipStub.callCount).to.equal(1);
            expect(getCurrentStateStub.called).to.be.true;
            expect(result.system_context).to.deep.equal({ entities: [], relationships: [] });
        });
    });

    describe('error handling', () => {
        it('should handle API failures gracefully', async () => {
            const consoleSpy = sinon.spy(console, 'warn');

            // Create mocks that will throw an error to simulate API failure
            const ChatOpenAIMock = sinon.stub().throws(new Error('API connection failed')) as any;
            const LLMGraphTransformerMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'This is test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            // Simulate API failure by passing mocks that throw errors
            const result = await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(consoleSpy.called).to.be.true;
            expect(result).to.deep.equal(initialState); // Should return unchanged state on error
        });

        it('should handle empty results gracefully', async () => {
            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([])
            };

            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'This is test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            const result = await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(addOrUpdateEntityStub.called).to.be.false;
            expect(addOrUpdateRelationshipStub.called).to.be.false;
            expect(result.system_context).to.deep.equal({ entities: [], relationships: [] });
        });
    });

    describe('data transformation', () => {
        it('should map Node to Entity correctly', async () => {
            const mockGraphDocument = {
                nodes: [
                    {
                        id: 'TestService',
                        type: 'service',
                        properties: { description: 'A test service', version: '1.0' }
                    }
                ],
                relationships: []
            };

            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([mockGraphDocument])
            };

            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'Test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(addOrUpdateEntityStub.calledOnce).to.be.true;
            const entityCall = addOrUpdateEntityStub.firstCall.args[0];
            expect(entityCall.name).to.equal('testservice');
            expect(entityCall.type).to.equal('service');
            expect(entityCall.description).to.equal('A test service');
            expect(entityCall.properties).to.deep.equal({ description: 'A test service', version: '1.0' });
            expect(entityCall.tags).to.deep.equal([]);
        });

        it('should map Relationship correctly', async () => {
            const mockGraphDocument = {
                nodes: [
                    { id: 'ServiceA', type: 'service' },
                    { id: 'ServiceB', type: 'service' }
                ],
                relationships: [
                    {
                        source: { id: 'ServiceA' },
                        target: { id: 'ServiceB' },
                        type: 'calls',
                        properties: { frequency: 'high' }
                    }
                ]
            };

            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([mockGraphDocument])
            };

            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'Test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(addOrUpdateRelationshipStub.calledOnce).to.be.true;
            const relationshipCall = addOrUpdateRelationshipStub.firstCall.args[0];
            expect(relationshipCall.from).to.equal('servicea');
            expect(relationshipCall.to).to.equal('serviceb');
            expect(relationshipCall.type).to.equal('calls');
            expect(relationshipCall.properties).to.deep.equal({ frequency: 'high' });
        });
    });

    describe('MemoryService integration', () => {
        it('should call MemoryService methods and serialize result', async () => {
            const mockGraphDocument = {
                nodes: [
                    { id: 'TestEntity', type: 'concept' }
                ],
                relationships: []
            };

            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([mockGraphDocument])
            };

            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'Test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-3.5-turbo",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            const result = await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            expect(addOrUpdateEntityStub.called).to.be.true;
            expect(getCurrentStateStub.called).to.be.true;
            expect(result.system_context).to.be.an('object');
        });
    });

    describe('LLM configuration reuse', () => {
        it('should use modelName from state', async () => {
            const mockGraphDocument = {
                nodes: [],
                relationships: []
            };

            const llmGraphTransformerMock = {
                convertToGraphDocuments: sinon.stub().resolves([mockGraphDocument])
            };

            const LLMGraphTransformerMock = sinon.stub().returns(llmGraphTransformerMock) as any;
            const ChatOpenAIMock = sinon.stub().returns({}) as any;

            const initialState: AppState = {
                userInput: "test",
                response: "",
                fileContents: {},
                inputs: {
                    'test.txt': 'Test content.'
                },
                inputDirectoryPath: "/test/path",
                analysisHistory: [],
                analysisOutput: "",
                currentAnalysisQuery: "",
                modelName: "gpt-4",
                currentFlow: null,
                systemName: undefined,
                contextBuilderOutputContent: undefined,
                contextBuilderOutputFileName: undefined
            };

            const config = {
                configurable: {
                    memoryService: memoryService
                }
            };

            // This test verifies the modelName is used and passed to ChatOpenAI constructor
            const result = await graphExtractionNode(initialState, config, ChatOpenAIMock, LLMGraphTransformerMock);

            // Verify ChatOpenAI was called with the correct model name
            expect(ChatOpenAIMock.calledOnce).to.be.true;
            const chatOpenAIArgs = ChatOpenAIMock.firstCall.args[0];
            expect(chatOpenAIArgs.modelName).to.equal("gpt-4");
            expect(result).to.be.an('object');
        });
    });
}); 