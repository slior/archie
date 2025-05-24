import path from 'path';
import { Relationship , Entity} from '../memory/memory_types';
import { MemoryService } from '../memory/MemoryService';
import { dbg } from '../utils';


const CONTENT_TRUNCATION_LIMIT = 1000;
/**
 * Summarizes the contents of multiple files into a single formatted string.
 * 
 * @param files - An object mapping file paths to their contents
 * @returns A formatted string containing summaries of all files, with each file's content
 *          truncated to 1000 characters if needed. Returns "No file content provided" if
 *          the files object is empty. Returns "No files provided." if files is undefined or null.
 * 
 * Each file summary is formatted as:
 * --- File: filename.ext ---
 * [file contents]
 * 
 * Files are separated by double newlines in the output.
 */
export function summarizeFiles(files?: Record<string, string>): string {
    if (!files || Object.keys(files).length === 0) return "No files provided.";

    const summaries = Object.entries(files).map(([filePath, content]) => {
        const fileName = path.basename(filePath);
        const truncatedContent = content.length > CONTENT_TRUNCATION_LIMIT ? content.substring(0, CONTENT_TRUNCATION_LIMIT) + "..." : content;
        return `--- File: ${fileName} ---
${truncatedContent}`;
    });

    return summaries.join("\n\n");
} 

/**
 * Interface representing the result of parsing an LLM response with agent and system sections.
 */
export interface ParsedLLMResponse {
    /** The agent's response to the user (content from <agent> tag) */
    agentResponse: string;
    /** Parsed system context containing entities and relationships (content from <system> tag) */
    systemContext: {
        entities: Entity[];
        relationships: Relationship[];
    } | null;
    /** Any warnings encountered during parsing */
    warnings: string[];
}

/**
 * Parses an LLM response that may contain <agent> and <system> tags.
 * 
 * The function expects the response to be in the format:
 * ```
 * <agent>
 * Agent response content here
 * </agent>
 * 
 * <system>
 * {
 *   "entities": [...],
 *   "relationships": [...]
 * }
 * </system>
 * ```
 * 
 * If either section is missing, the function will warn but not fail.
 * If the entire response lacks both tags, it treats the whole response as the agent response.
 * 
 * @param llmResponse - The raw response string from the LLM
 * @returns ParsedLLMResponse object containing the parsed agent response, system context, and any warnings
 */
export function parseLLMResponse(llmResponse: string): ParsedLLMResponse {
    const result: ParsedLLMResponse = {
        agentResponse: '',
        systemContext: null,
        warnings: []
    };

    // Check if the response contains the expected tags
    const hasAgentTag = llmResponse.includes('<agent>') && llmResponse.includes('</agent>');
    const hasSystemTag = llmResponse.includes('<system>') && llmResponse.includes('</system>');

    if (!hasAgentTag && !hasSystemTag) {
        // No tags found, treat entire response as agent response
        result.agentResponse = llmResponse.trim();
        result.warnings.push('No <agent> or <system> tags found in LLM response. Treating entire response as agent response.');
        return result;
    }

    // Extract agent section
    if (hasAgentTag) {
        const agentMatch = llmResponse.match(/<agent>([\s\S]*?)<\/agent>/);
        if (agentMatch) {
            result.agentResponse = agentMatch[1].trim();
        } else {
            result.warnings.push('Found <agent> tag but could not extract content properly.');
        }
    } else {
        result.warnings.push('No <agent> section found in LLM response.');
    }

    // Extract system section
    if (hasSystemTag) {
        const systemMatch = llmResponse.match(/<system>([\s\S]*?)<\/system>/);
        if (systemMatch) {
            const systemContent = systemMatch[1].trim();
            try {
                // Try to parse as JSON
                const parsed = JSON.parse(systemContent);
                
                // Validate the structure
                if (typeof parsed === 'object' && parsed !== null) {
                    // Process entities with defaults for missing fields
                    const entities: Entity[] = [];
                    if (Array.isArray(parsed.entities)) {
                        for (const entity of parsed.entities) {
                            if (typeof entity === 'object' && entity !== null && entity.name && entity.type) {
                                entities.push({
                                    name: entity.name,
                                    description: entity.description || '',
                                    type: entity.type,
                                    tags: Array.isArray(entity.tags) ? entity.tags : [],
                                    properties: entity.properties && typeof entity.properties === 'object' ? entity.properties : {}
                                });
                            } else {
                                result.warnings.push(`Skipping invalid entity: missing required name or type fields.`);
                            }
                        }
                    } else if (parsed.entities !== undefined) {
                        result.warnings.push('System context entities is not an array. Using empty array.');
                    }
                    
                    // Process relationships with defaults for missing fields
                    const relationships: Relationship[] = [];
                    if (Array.isArray(parsed.relationships)) {
                        for (const relationship of parsed.relationships) {
                            if (typeof relationship === 'object' && relationship !== null && 
                                relationship.from && relationship.to && relationship.type) {
                                relationships.push({
                                    from: relationship.from,
                                    to: relationship.to,
                                    type: relationship.type,
                                    properties: relationship.properties && typeof relationship.properties === 'object' ? relationship.properties : {}
                                });
                            } else {
                                result.warnings.push(`Skipping invalid relationship: missing required from, to, or type fields.`);
                            }
                        }
                    } else if (parsed.relationships !== undefined) {
                        result.warnings.push('System context relationships is not an array. Using empty array.');
                    }
                    
                    result.systemContext = {
                        entities,
                        relationships
                    };
                } else {
                    result.warnings.push('System context is not a valid object. Ignoring system context.');
                }
            } catch (parseError) {
                result.warnings.push(`Failed to parse system context as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Ignoring system context.`);
            }
        } else {
            result.warnings.push('Found <system> tag but could not extract content properly.');
        }
    } else if (hasAgentTag) {
        // Only warn about missing system tag if agent tag was present (indicating structured response was expected)
        result.warnings.push('No <system> section found in LLM response.');
    }

    return result;
}


/**
 * Processes an LLM response by logging warnings and updating memory service.
 * 
 * This function handles the complete processing of a parsed LLM response:
 * - Logs any warnings encountered during parsing
 * - Updates the memory service with entities and relationships from system context
 * 
 * @param parsedResponse - The parsed LLM response containing agent response, system context, and warnings
 * @param memoryService - The memory service instance to update
 * @returns The updated memory service instance (same instance, modified in place)
 */
export function processLLMResponse(
    parsedResponse: ParsedLLMResponse,
    memoryService: MemoryService
): MemoryService {
    // Log any warnings from parsing
    if (parsedResponse.warnings.length > 0) {
        parsedResponse.warnings.forEach(warning => {
            dbg(`Warning: ${warning}`);
        });
    }
    
    // Update memory service with entities and relationships if present
    return updateMemoryWithSystemContext(memoryService, parsedResponse.systemContext);
}

/**
 * Updates the memory service with entities and relationships from parsed system context.
 * 
 * This function processes the system context extracted from an LLM response and adds
 * the entities and relationships to the provided memory service. It handles errors
 * gracefully and provides debug logging for successful operations and warnings.
 * 
 * @param memoryService - The memory service instance to update
 * @param systemContext - The parsed system context containing entities and relationships, or null
 * @returns The updated memory service instance (same instance, modified in place)
 */
export function updateMemoryWithSystemContext(
    memoryService: MemoryService,
    systemContext: ParsedLLMResponse['systemContext']
): MemoryService {
    if (!systemContext) {
        return memoryService;
    }

    // Add entities to memory service
    if (systemContext.entities.length > 0) {
        for (const entity of systemContext.entities) {
            try {
                memoryService.addOrUpdateEntity(entity);
                dbg(`Added/updated entity: ${entity.name} (type: ${entity.type})`);
            } catch (error) {
                dbg(`Warning: Failed to add entity ${entity.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    
    // Add relationships to memory service
    if (systemContext.relationships.length > 0) {
        for (const relationship of systemContext.relationships) {
            try {
                const success = memoryService.addOrUpdateRelationship(relationship);
                if (success) {
                    dbg(`Added relationship: ${relationship.from} --[${relationship.type}]--> ${relationship.to}`);
                } else {
                    dbg(`Warning: Failed to add relationship from ${relationship.from} to ${relationship.to} of type ${relationship.type}`);
                }
            } catch (error) {
                dbg(`Warning: Error adding relationship from ${relationship.from} to ${relationship.to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }

    return memoryService;
}

const baseSystemPrompt = `
You are Archie, an AI assistant specialized in software architecture analysis.

# STRICT OUTPUT INSTRUCTIONS

You must stricly follow the instructions for the output format.
The output should be divided into 2 main parts, denoted by tags: <agent> ... </agent>, <system> ... </system>
The response in the <agent> part is the actual response to the user's request. It should follow any instructions given above, and contain the entire response to that.

In addition, any identified entities of the analyzed system should be output as "entities".
Any relationships between entities should be output as "relationships".
The output in the <system> tag should be in JSON format or the form:

'''
{
  "entities": [],
  "relationships": []
}
'''

## System Context Definition

The memory of the system is generally built as a directed graph where nodes are entities that play some role in the system, or its development.
Examples for entities could be: services, data stores, message queues, web pages, API gateways, libraries, etc.
Generally speaking, any technical software artifact that plays a role in some flow.

Entities can also be development process artifacts - things that shape how the system look, or help communicate about its structure.
Examples for this are requirement documents, design documents, design decisions (ADRs), bug/ticket, etc.

Each entity has:
- name: Mandatory. a string, has to be unique in the scope of the system.
- description: a string. Can be empty.
- type: mandatory. A string identifying the class of the entity. The type can be changed if an entity is updated.
- tags: list of non-empty strings. Can be an empty list. When updating, new tags are added; existing tags are not removed unless explicitly part of the update operation.
- 'properties': a dictionary of key-value pairs. Can be empty. When updating, new properties are added; existing properties with matching keys are overwritten by new values.

The nodes (entities) are connected among themselves by the edges - relationships.
Relationships are simply directed edges between the nodes, with a type.
Each relationship has:
- from: Madnatory. the name of the source of the relationship
- to: Mandatory. the name of the target of the relationship.
- type: Mandatory. the type of the relationship, identifying the class of relationship. a non-empty string.
- properties: a dictionary of key-value pairs. Can be empty. When updating, new properties are added; existing properties with matching keys are overwritten by new values.
`;

/**
 * Builds a system prompt for LLM calls that includes the base system prompt
 * and any available system context from memory.
 * 
 * @param memoryService - The memory service containing the current system context
 * @returns A complete system prompt string
 */
export function buildSystemPrompt(
  memoryService: MemoryService
): string {
  // Get base system prompt
  let systemMessage = baseSystemPrompt;
  
  // Add system context if available
  try {
    const contextString = memoryService.getContextAsString();
    if (contextString && contextString.trim() !== '{}') {
      systemMessage += `\n\nSystem Context (previous knowledge about this system):\n${contextString}`;
    }
  } catch (error) {
    console.warn('Failed to get system context:', error);
  }
  
  return systemMessage;
}