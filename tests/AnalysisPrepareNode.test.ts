import { expect } from 'chai';
import { describe, it } from 'mocha';
// import { summarizeFiles } from '../src/agents/AnalysisPrepareNode';
import { summarizeFiles } from '../src/agents/agentUtils';
import { parseLLMResponse, ParsedLLMResponse, updateMemoryWithSystemContext, processLLMResponse } from '../src/agents/AnalysisPrepareNode';
import { MemoryService } from '../src/memory/MemoryService';
import { DEFAULT_MEMORY_STATE } from '../src/memory/memory_types';
// path.basename is used by summarizeFiles, so its behavior is implicitly tested.


describe('summarizeFiles from AnalysisPrepareNode', () => {

    const FILE_SIZE_THRESHOLD = 1000;  

    it('should return "No files provided." for an empty input object', () => {
        expect(summarizeFiles({})).to.equal("No files provided.");
    });

    it('should correctly summarize a single file with content less than 1000 characters', () => {
        const files = { "file1.txt": "This is short content." };
        const expected = "--- File: file1.txt ---\nThis is short content.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should correctly summarize and truncate a single file with content more than 1000 characters', () => {
        const longContent = "a".repeat(FILE_SIZE_THRESHOLD + 1);
        const files = { "file2.txt": longContent };
        const expectedTruncatedContent = "a".repeat(FILE_SIZE_THRESHOLD) + "...";
        const expected = `--- File: file2.txt ---\n${expectedTruncatedContent}`;
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should correctly summarize multiple files with mixed content lengths', () => {
        const longContent = "b".repeat(FILE_SIZE_THRESHOLD + 1);
        const files = {
            "alpha.txt": "Content of alpha.",
            "beta/gamma.md": "Content of gamma, which is a bit longer.",
            "delta.log": longContent
        };
        const expectedTruncatedLongContent = "b".repeat(FILE_SIZE_THRESHOLD) + "...";
        const expected = `--- File: alpha.txt ---\nContent of alpha.

--- File: gamma.md ---
Content of gamma, which is a bit longer.

--- File: delta.log ---
${expectedTruncatedLongContent}`;
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should use the basename of the file path for the file name in the summary', () => {
        const files = { "/some/complex/path/to/document.pdf": "PDF content here." };
        const expected = "--- File: document.pdf ---\nPDF content here.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should handle filenames with spaces or special characters if path.basename handles them', () => {
        const files = { "my file with spaces.txt": "Content." };
        const expected = "--- File: my file with spaces.txt ---\nContent.";
        expect(summarizeFiles(files)).to.equal(expected);
    });

    it('should handle an empty file content string', () => {
        const files = { "empty.txt": "" };
        const expected = "--- File: empty.txt ---\n";
        expect(summarizeFiles(files)).to.equal(expected);
    });
});

describe('parseLLMResponse from AnalysisPrepareNode', () => {

    it('should parse a complete response with both agent and system sections', () => {
        const response = `<agent>
Hello! I can help you with this analysis. Let me ask some clarifying questions.
</agent>

<system>
{
  "entities": [
    {
      "name": "UserService",
      "description": "Handles user authentication",
      "type": "service",
      "tags": ["auth", "core"],
      "properties": {"port": 8080}
    }
  ],
  "relationships": [
    {
      "from": "UserService",
      "to": "Database",
      "type": "depends-on",
      "properties": {"connection": "postgres"}
    }
  ]
}
</system>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('Hello! I can help you with this analysis. Let me ask some clarifying questions.');
        expect(result.systemContext).to.not.be.null;
        expect(result.systemContext?.entities).to.have.lengthOf(1);
        expect(result.systemContext?.entities[0].name).to.equal('UserService');
        expect(result.systemContext?.relationships).to.have.lengthOf(1);
        expect(result.systemContext?.relationships[0].from).to.equal('UserService');
        expect(result.warnings).to.have.lengthOf(0);
    });

    it('should handle response with only agent section', () => {
        const response = `<agent>
This is just an agent response without system context.
</agent>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('This is just an agent response without system context.');
        expect(result.systemContext).to.be.null;
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('No <system> section found');
    });

    it('should handle response with only system section', () => {
        const response = `<system>
{
  "entities": [],
  "relationships": []
}
</system>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('');
        expect(result.systemContext).to.not.be.null;
        expect(result.systemContext?.entities).to.have.lengthOf(0);
        expect(result.systemContext?.relationships).to.have.lengthOf(0);
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('No <agent> section found');
    });

    it('should handle response without any tags (fallback to entire response as agent)', () => {
        const response = 'This is just a plain response without any XML tags.';

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('This is just a plain response without any XML tags.');
        expect(result.systemContext).to.be.null;
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('No <agent> or <system> tags found');
    });

    it('should handle malformed JSON in system section', () => {
        const response = `<agent>
Agent response here.
</agent>

<system>
{ "entities": [ malformed json
</system>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('Agent response here.');
        expect(result.systemContext).to.be.null;
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('Failed to parse system context as JSON');
    });

    it('should handle system context with missing properties (provides defaults)', () => {
        const response = `<agent>
Agent response.
</agent>

<system>
{
  "entities": [{"name": "Service", "type": "service"}],
  "relationships": [{"from": "A", "to": "B", "type": "calls"}]
}
</system>`;

        const result = parseLLMResponse(response);

        expect(result.systemContext).to.not.be.null;
        expect(result.systemContext?.entities).to.have.lengthOf(1);
        expect(result.systemContext?.entities[0]).to.deep.equal({
            name: 'Service',
            description: '', // Default value
            type: 'service',
            tags: [], // Default value
            properties: {} // Default value
        });
        expect(result.systemContext?.relationships).to.have.lengthOf(1);
        expect(result.systemContext?.relationships[0]).to.deep.equal({
            from: 'A',
            to: 'B',
            type: 'calls',
            properties: {} // Default value
        });
    });

    it('should handle system context with non-array entities/relationships', () => {
        const response = `<agent>
Agent response.
</agent>

<system>
{
  "entities": "not an array",
  "relationships": "also not an array"
}
</system>`;

        const result = parseLLMResponse(response);

        expect(result.systemContext).to.not.be.null;
        expect(result.systemContext?.entities).to.have.lengthOf(0);
        expect(result.systemContext?.relationships).to.have.lengthOf(0);
        expect(result.warnings).to.have.lengthOf(2);
        expect(result.warnings).to.include('System context entities is not an array. Using empty array.');
        expect(result.warnings).to.include('System context relationships is not an array. Using empty array.');
    });

    it('should trim whitespace from extracted content', () => {
        const response = `<agent>
   
   Spaced agent response   
   
</agent>

<system>
   
{
  "entities": [],
  "relationships": []
}
   
</system>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('Spaced agent response');
        expect(result.systemContext).to.not.be.null;
    });

    it('should skip invalid entities and relationships with warnings', () => {
        const response = `<agent>
Agent response.
</agent>

<system>
{
  "entities": [
    {"name": "ValidEntity", "type": "service"},
    {"name": "InvalidEntity"},
    {"type": "service"}
  ],
  "relationships": [
    {"from": "A", "to": "B", "type": "calls"},
    {"from": "A", "type": "calls"},
    {"to": "B", "type": "calls"}
  ]
}
</system>`;

        const result = parseLLMResponse(response);

        expect(result.systemContext).to.not.be.null;
        expect(result.systemContext?.entities).to.have.lengthOf(1);
        expect(result.systemContext?.entities[0].name).to.equal('ValidEntity');
        expect(result.systemContext?.relationships).to.have.lengthOf(1);
        expect(result.systemContext?.relationships[0].from).to.equal('A');
        
        expect(result.warnings).to.have.lengthOf(4);
        expect(result.warnings).to.include('Skipping invalid entity: missing required name or type fields.');
        expect(result.warnings).to.include('Skipping invalid relationship: missing required from, to, or type fields.');
    });
});

describe('updateMemoryWithSystemContext from AnalysisPrepareNode', () => {

    it('should return the same memory service when system context is null', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const result = updateMemoryWithSystemContext(memoryService, null);
        
        expect(result).to.equal(memoryService);
        expect(result.getCurrentState().entities).to.have.lengthOf(0);
        expect(result.getCurrentState().relationships).to.have.lengthOf(0);
    });

    it('should add entities and relationships to memory service', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const systemContext = {
            entities: [
                {
                    name: 'TestService',
                    description: 'A test service',
                    type: 'service',
                    tags: ['test'],
                    properties: { port: 8080 }
                },
                {
                    name: 'TestDatabase',
                    description: 'A test database',
                    type: 'database',
                    tags: ['storage'],
                    properties: { host: 'localhost' }
                }
            ],
            relationships: [
                {
                    from: 'TestService',
                    to: 'TestDatabase',
                    type: 'depends-on',
                    properties: { connection: 'tcp' }
                }
            ]
        };

        const result = updateMemoryWithSystemContext(memoryService, systemContext);

        expect(result).to.equal(memoryService); // Same instance
        expect(result.getCurrentState().entities).to.have.lengthOf(2);
        expect(result.getCurrentState().relationships).to.have.lengthOf(1);
        
        // Check entities were added correctly
        const testService = result.findEntityByName('TestService');
        expect(testService).to.not.be.undefined;
        expect(testService?.type).to.equal('service');
        
        const testDatabase = result.findEntityByName('TestDatabase');
        expect(testDatabase).to.not.be.undefined;
        expect(testDatabase?.type).to.equal('database');
        
        // Check relationship was added correctly
        const relationships = result.findRelations({ from: 'TestService', to: 'TestDatabase' });
        expect(relationships).to.have.lengthOf(1);
        expect(relationships[0].type).to.equal('depends-on');
    });

    it('should handle empty entities and relationships arrays', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const systemContext = {
            entities: [],
            relationships: []
        };

        const result = updateMemoryWithSystemContext(memoryService, systemContext);

        expect(result).to.equal(memoryService);
        expect(result.getCurrentState().entities).to.have.lengthOf(0);
        expect(result.getCurrentState().relationships).to.have.lengthOf(0);
    });

    it('should reject relationships when entities do not exist', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const systemContext = {
            entities: [
                {
                    name: 'ExistingService',
                    description: 'An existing service',
                    type: 'service',
                    tags: [],
                    properties: {}
                }
            ],
            relationships: [
                {
                    from: 'ExistingService',
                    to: 'NonExistentService',
                    type: 'depends-on',
                    properties: {}
                }
            ]
        };

        const result = updateMemoryWithSystemContext(memoryService, systemContext);

        expect(result.getCurrentState().entities).to.have.lengthOf(1);
        expect(result.getCurrentState().relationships).to.have.lengthOf(0); // Relationship should be rejected
    });
});

describe('processLLMResponse from AnalysisPrepareNode', () => {

    it('should process a complete LLM response with warnings and system context', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const parsedResponse: ParsedLLMResponse = {
            agentResponse: 'Agent response here',
            systemContext: {
                entities: [
                    {
                        name: 'TestService',
                        description: 'A test service',
                        type: 'service',
                        tags: ['test'],
                        properties: { port: 8080 }
                    }
                ],
                relationships: []
            },
            warnings: ['Warning: This is a test warning', 'Warning: Another test warning']
        };

        const result = processLLMResponse(parsedResponse, memoryService);

        expect(result).to.equal(memoryService); // Same instance
        expect(result.getCurrentState().entities).to.have.lengthOf(1);
        expect(result.findEntityByName('TestService')).to.not.be.undefined;
    });

    it('should process response with warnings but no system context', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const parsedResponse: ParsedLLMResponse = {
            agentResponse: 'Agent response here',
            systemContext: null,
            warnings: ['Warning: No system context provided']
        };

        const result = processLLMResponse(parsedResponse, memoryService);

        expect(result).to.equal(memoryService);
        expect(result.getCurrentState().entities).to.have.lengthOf(0);
        expect(result.getCurrentState().relationships).to.have.lengthOf(0);
    });

    it('should process response with no warnings', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const parsedResponse: ParsedLLMResponse = {
            agentResponse: 'Agent response here',
            systemContext: {
                entities: [],
                relationships: []
            },
            warnings: []
        };

        const result = processLLMResponse(parsedResponse, memoryService);

        expect(result).to.equal(memoryService);
        expect(result.getCurrentState().entities).to.have.lengthOf(0);
        expect(result.getCurrentState().relationships).to.have.lengthOf(0);
    });

    it('should process response with both entities and relationships', () => {
        const memoryService = MemoryService.fromState(DEFAULT_MEMORY_STATE);
        const parsedResponse: ParsedLLMResponse = {
            agentResponse: 'Analysis complete',
            systemContext: {
                entities: [
                    {
                        name: 'ServiceA',
                        description: 'First service',
                        type: 'service',
                        tags: [],
                        properties: {}
                    },
                    {
                        name: 'ServiceB', 
                        description: 'Second service',
                        type: 'service',
                        tags: [],
                        properties: {}
                    }
                ],
                relationships: [
                    {
                        from: 'ServiceA',
                        to: 'ServiceB',
                        type: 'calls',
                        properties: {}
                    }
                ]
            },
            warnings: ['Warning: Example warning']
        };

        const result = processLLMResponse(parsedResponse, memoryService);

        expect(result).to.equal(memoryService);
        expect(result.getCurrentState().entities).to.have.lengthOf(2);
        expect(result.getCurrentState().relationships).to.have.lengthOf(1);
        
        const serviceA = result.findEntityByName('ServiceA');
        const serviceB = result.findEntityByName('ServiceB');
        expect(serviceA).to.not.be.undefined;
        expect(serviceB).to.not.be.undefined;
        
        const relationships = result.findRelations({ from: 'ServiceA', to: 'ServiceB' });
        expect(relationships).to.have.lengthOf(1);
        expect(relationships[0].type).to.equal('calls');
    });
}); 