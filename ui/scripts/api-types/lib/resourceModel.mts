// The model the type emitter renders: the API's exported resource model, read into TypeScript terms.

/** One JSON:API attribute: its TypeScript type plus how it reads off the wire. */
export type AttributeModel = {
  name: string;
  tsType: string; // "unknown" when the export could not type the value
  enumName?: string; // set → emitted as a named const; tsType still holds the inline union
  enumValues?: readonly string[];
  nullable: boolean;
  optional: boolean;
};

/** One JSON:API relationship: its target type plus its cardinality and requiredness. */
export type RelationshipModel = {
  name: string;
  target?: string; // absent when the export names none
  many: boolean;
  required: boolean;
};

/** One JSON:API resource type with its attributes and relationships in the export's order. */
export type TypeModel = {
  name: string;
  root: boolean;
  attributes: AttributeModel[];
  relationships: RelationshipModel[];
};

/** The whole resource surface, types in the export's order (sorted by name). */
export type ResourceModel = { types: TypeModel[] };
