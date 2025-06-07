import { RunnableConfig } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";

import { AppState } from "./graph";
import { Entity, Relationship, MemoryState } from "../memory/memory_types";
import { MemoryService } from "../memory/MemoryService";
import { DEFAULT_MODEL_NAME, OPENAI_API_KEY_ENV_VAR, OPENAI_BASE_URL_ENV_VAR } from "./llmConstants";
import { AppGraphConfigurable, dbg, say } from "../utils";
import { Node, Relationship as GraphDocumentRelationship } from "@langchain/community/graphs/document";


const MAX_TOKENS_FOR_GRAPH_EXTRACTION = 1500;
const GRAPH_EXTRACTION_TEMPERATURE = 0.7;

/**
 * Normalizes entity names to avoid duplicates with different casing/spacing.
 * @param name - The entity name to normalize
 * @returns Normalized entity name (lowercase, trimmed)
 */
function normalizeEntityName(name: string): string {
    return name.toLowerCase().trim();
}

// Type definitions for dependency injection
type ChatOpenAIConstructor = typeof ChatOpenAI;
type LLMGraphTransformerConstructor = typeof LLMGraphTransformer;

/**
 * GraphExtractionNode extracts knowledge graphs from documents using LLMGraphTransformer.
 * 
 * This node:
 * - Takes document inputs from DocumentRetrievalNode
 * - Uses LangChain's LLMGraphTransformer to extract entities and relationships
 * - Maps the extracted data to Archie's Entity and Relationship types
 * - Updates the MemoryService with the extracted knowledge
 * - Handles errors gracefully without failing the overall flow
 * 
 * @param state - Current AppState containing inputs and configuration
 * @param config - LangGraph configuration including MemoryService
 * @param ChatOpenAIClass - ChatOpenAI constructor (for dependency injection)
 * @param LLMGraphTransformerClass - LLMGraphTransformer constructor (for dependency injection)
 * @returns Updated AppState with knowledge graph data integrated into memory
 */
export async function graphExtractionNode(
    state: AppState,
    config?: RunnableConfig,
    ChatOpenAIClass: ChatOpenAIConstructor = ChatOpenAI,
    LLMGraphTransformerClass: LLMGraphTransformerConstructor = LLMGraphTransformer
): Promise<Partial<AppState>> {
    dbg("--- Graph Extraction Node Starting ---");
    
    try {

        const llmGraphTransformer = initializeLLGraphTransformer(state, ChatOpenAIClass, LLMGraphTransformerClass);
        dbg("LLMGraphTransformer initialized successfully");
        
        if (!state.inputs || Object.keys(state.inputs).length === 0) { // No input documents found, skipping graph extraction
            dbg("No input documents found, skipping graph extraction");
            return currentStateFromConfig(state, config);
        }
        
        const documents: Document[] = convertDocumentsToLangChainDocuments(state);
        dbg(`Converted ${documents.length} documents for graph extraction`);
        
        const graphDocuments = await llmGraphTransformer.convertToGraphDocuments(documents);
        
        if (!graphDocuments || graphDocuments.length === 0) {
            dbg("No graph documents extracted from inputs");
            return currentStateFromConfig(state, config);
        }
        
        dbg(`Successfully extracted ${graphDocuments.length} graph documents`);
        
        const totalNodes = graphDocuments.reduce((sum, doc) => sum + doc.nodes.length, 0);
        const totalRelationships = graphDocuments.reduce((sum, doc) => sum + doc.relationships.length, 0);
        dbg(`Total extracted: ${totalNodes} nodes, ${totalRelationships} relationships`);
    
        const entities: Entity[] = [];
        const relationships: Relationship[] = [];
        
        for (const graphDoc of graphDocuments) {
            let docEntities = graphDoc.nodes.map(graphDocNodeToEntity);
            let docRelationships = graphDoc.relationships.map(graphDocRelationshipToRelationship);
            entities.push(...docEntities);
            relationships.push(...docRelationships);
        }
        
        dbg(`Transformation complete: ${entities.length} entities, ${relationships.length} relationships`);
        
        const updatedMemoryState = updateMemoryState(entities, relationships, state, config);
        
        return {
            ...state,
            system_context: updatedMemoryState
        };
        
    } catch (error: any) {
        // Log specific errors with console.warn (as required)
        console.warn(`Graph extraction failed: ${error.message}`);
        dbg(`Graph extraction error details: ${error.stack || error}`);
        
        // Categorize and handle different types of errors
        if (error.message?.includes('API key')) {
            console.warn("Graph extraction error: OpenAI API key configuration issue");
        } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
            console.warn("Graph extraction error: Network connectivity issue");
        } else if (error.message?.includes('transform') || error.message?.includes('parse')) {
            console.warn("Graph extraction error: Data transformation issue");
        } else {
            console.warn("Graph extraction error: Unknown error during knowledge graph extraction");
        }
        
        // Return unchanged state - never throw exceptions that would break the flow
        dbg("Returning unchanged state due to graph extraction failure");
        return state;
    }
} 

/**
 * Sets up and configures a ChatOpenAI model instance for graph extraction.
 * 
 * @param state - The application state containing model configuration
 * @param ChatOpenAIClass - Constructor for ChatOpenAI implementation
 * @returns Configured ChatOpenAI instance
 * @throws Error if OpenAI API key is not configured
 */
function setupChatModel(state: AppState, ChatOpenAIClass: ChatOpenAIConstructor): ChatOpenAI {
    // Validate API key configuration
    const apiKey = process.env[OPENAI_API_KEY_ENV_VAR];
    if (!apiKey) {
        throw new Error(`OpenAI API key (${OPENAI_API_KEY_ENV_VAR}) is not set in environment variables.`);
    }

    // Get model name from state or use default
    const modelName = state.modelName || DEFAULT_MODEL_NAME;
    dbg(`Using model for graph extraction: ${modelName}`);

    // Configure ChatOpenAI with standard settings
    const chatModelConfig: any = {
        modelName,
        openAIApiKey: apiKey,
        temperature: GRAPH_EXTRACTION_TEMPERATURE,
        maxTokens: MAX_TOKENS_FOR_GRAPH_EXTRACTION
    };

    // Configure custom base URL if specified
    const baseURL = process.env[OPENAI_BASE_URL_ENV_VAR];
    if (baseURL) {
        dbg(`Using custom base URL: ${baseURL}`);
        chatModelConfig.configuration = { baseURL };
    }

    return new ChatOpenAIClass(chatModelConfig);
}

function updateMemoryState(entities: Entity[], relationships: Relationship[], state: AppState, config?: RunnableConfig) : Readonly<MemoryState>{
    const memoryService = getOrCreateMemoryService(state, config);
        
    const { entitiesAdded, entitiesUpdated } = addEntitiesToMemoryService(entities, memoryService);
    
    const { relationshipsAdded } = addRelationshipsToMemoryService(relationships, memoryService);
    
    dbg(`Memory update complete: ${entitiesAdded} entities added, ${entitiesUpdated} entities updated, ${relationshipsAdded} relationships added`);
    say(`Graph extraction complete: Added ${entitiesAdded} entities and ${relationshipsAdded} relationships to memory`);
    
    const updatedMemoryState = memoryService.getCurrentState();
    return updatedMemoryState;
}

/**
 * Initializes and configures an LLMGraphTransformer instance for graph extraction.
 * 
 * @param state - The application state containing model configuration
 * @param ChatOpenAIClass - Constructor for ChatOpenAI implementation
 * @param LLMGraphTransformerClass - Constructor for LLMGraphTransformer implementation
 * @returns Configured LLMGraphTransformer instance
 */
function initializeLLGraphTransformer(
    state: AppState, 
    ChatOpenAIClass: ChatOpenAIConstructor, 
    LLMGraphTransformerClass: LLMGraphTransformerConstructor
): LLMGraphTransformer {
    const chatModel = setupChatModel(state, ChatOpenAIClass);
    const llmGraphTransformer = new LLMGraphTransformerClass({
        llm: chatModel,
        allowedNodes: [], // Allow all node types
        allowedRelationships: [], // Allow all relationship types
        strictMode: true
    });
    return llmGraphTransformer;
}

/**
 * Creates a new state object by merging the current state with the system context from memory service.
 * 
 * @param state - The current application state
 * @param config - Optional configuration object that may contain memory service
 * @returns A new state object with updated system context
 */
function currentStateFromConfig(state: AppState, config?: RunnableConfig): Partial<AppState> {
    const memoryService = getOrCreateMemoryService(state, config);
    return {
        ...state,
        system_context: memoryService.getCurrentState()
    };
}

/**
 * Retrieves an existing memory service from config or creates a new one from state.
 * 
 * @param state - The application state containing system context
 * @param config - Optional configuration that may contain a memory service
 * @returns The existing or newly created MemoryService instance
 */
function getOrCreateMemoryService(state: AppState, config?: RunnableConfig): MemoryService {
    const configurable = config?.configurable as any;
    return configurable?.memoryService || MemoryService.fromState(state.system_context);
}

/**
 * Converts the input documents from the application state into LangChain Document objects.
 * Each document is created with metadata including the source filename and extraction timestamp.
 * 
 * @param state - The application state containing input documents
 * @returns Array of LangChain Document objects
 */
function convertDocumentsToLangChainDocuments(state: AppState): Document[] {
    return Object.entries(state.inputs).map(([filename, content]) => {
        return new Document({
            pageContent: content,
            metadata: { 
                source: filename,
                extractedAt: new Date().toISOString()
            }
        });
    });
}

/**
 * Converts a graph document node into an Entity object.
 * 
 * @param node - The graph document node to convert
 * @returns An Entity object with normalized name, type, description, properties and empty tags
 */
function graphDocNodeToEntity(node: Node): Entity {
    return {
        name: normalizeEntityName(String(node.id)),
        type: node.type || 'concept',
        description: node.properties?.description || '',
        properties: node.properties || {},
        tags: [] // Empty for now (future enhancement)
    };
}

/**
 * Converts a graph document relationship into a Relationship object.
 * 
 * @param relationship - The graph document relationship to convert
 * @returns A Relationship object with normalized source and target names, type, and properties
 */
function graphDocRelationshipToRelationship(relationship: GraphDocumentRelationship) : Relationship
{
    return {
        from: normalizeEntityName(String(relationship.source.id)),
        to: normalizeEntityName(String(relationship.target.id)),
        type: relationship.type,
        properties: relationship.properties || {}
    };
}

/**
 * Adds or updates entities in the memory service and tracks the number of additions and updates.
 * 
 * @param entities - Array of Entity objects to add or update
 * @param memoryService - The memory service instance to use for storage
 * @returns Object containing counts of entities added and updated
 */
function addEntitiesToMemoryService(entities: Entity[], memoryService: MemoryService) : { entitiesAdded: number, entitiesUpdated: number }
{
    let entitiesAdded = 0;
    let entitiesUpdated = 0;
    for (const entity of entities) {
        const isNew = memoryService.addOrUpdateEntity(entity);
        if (isNew) {
            entitiesAdded++;
        } else {
            entitiesUpdated++;
        }
    }
    return { entitiesAdded, entitiesUpdated };
}

/**
 * Adds or updates relationships in the memory service and tracks the number of successful additions.
 * 
 * @param relationships - Array of Relationship objects to add or update
 * @param memoryService - The memory service instance to use for storage
 * @returns Object containing count of relationships successfully added
 */
function addRelationshipsToMemoryService(relationships: Relationship[], memoryService: MemoryService) : { relationshipsAdded: number }
{
    let relationshipsAdded = 0;
    for (const relationship of relationships) {
        try {
            const success = memoryService.addOrUpdateRelationship(relationship);
            if (success) {
                relationshipsAdded++;
            }
            // Note: failed relationships are already logged by MemoryService
        } catch (error: any) {
            console.warn(`Failed to add/update relationship ${relationship.from} -> ${relationship.to}: ${error.message}`);
            // Continue processing other relationships
        }
    }
    return { relationshipsAdded };
}