/**
 * Represents a single entity in the system's memory.
 */
export interface Entity {
  /** A unique identifier for the entity (e.g., component name, concept ID). */
  name: string;
  /** An optional human-readable label. */
  label?: string;
  /** The type of the entity (e.g., 'component', 'requirement', 'decision'). */
  entityType: string;
  /** A list of observations or facts about this entity. */
  observations: string[];
}

/**
 * Represents a relationship between two entities.
 */
export interface Relation {
  /** The name of the source entity for the relation. Must match the 'name' of an existing Entity. */
  from: string;
  /** The name of the target entity for the relation. Must match the 'name' of an existing Entity. */
  to: string;
  /** A label describing the nature of the relationship (e.g., 'depends_on', 'implements', 'contains'). */
  label: string;
  /** A list of observations or facts about this specific relationship. */
  observations: string[];
}

/**
 * Defines the overall structure of the memory state stored in memory.json.
 */
export interface MemoryState {
  /** A list of all known entities. */
  entities: Entity[];
  /** A list of all known relationships between entities. */
  relations: Relation[];
} 