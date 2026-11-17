import { ComponentType } from "react";
import { isRecord } from "./modules/utils/typeGuards";

/** Data handed to every action; its shape is defined per action type by the page that mounts it. */
export type ActionContext = Record<string, unknown>;

/** A user-written action component compiled at runtime. */
export type ActionComponent = ComponentType<{ context: ActionContext }>;

/** Narrows the value an action's source evaluated to: a function component, or a memo/forwardRef wrapper object. */
export const isActionComponent = (value: unknown): value is ActionComponent =>
  typeof value === "function" || (isRecord(value) && typeof value.$$typeof === "symbol");
