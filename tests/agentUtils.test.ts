import { expect } from 'chai';
import { describe, it } from 'mocha';
import { parseLLMResponse, ParsedLLMResponse } from '../src/agents/agentUtils';

describe('parseLLMResponse from agentUtils', () => {

    it('should parse a complete response with both agent and system sections', () => {
        const response = `<agent>
Hello! I can help you analyze this system.
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

        expect(result.agentResponse).to.equal('Hello! I can help you analyze this system.');
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

    it('should handle empty string response', () => {
        const response = '';

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('');
        expect(result.systemContext).to.be.null;
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('No <agent> or <system> tags found');
    });

    it('should handle non-object JSON in system section', () => {
        const response = `<agent>
Agent response.
</agent>

<system>
"this is a string, not an object"
</system>`;

        const result = parseLLMResponse(response);

        expect(result.agentResponse).to.equal('Agent response.');
        expect(result.systemContext).to.be.null;
        expect(result.warnings).to.have.lengthOf(1);
        expect(result.warnings[0]).to.include('System context is not a valid object');
    });

    it('should handle system section with null entities/relationships', () => {
        const response = `<agent>
Agent response.
</agent>

<system>
{
  "entities": null,
  "relationships": null
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
}); 