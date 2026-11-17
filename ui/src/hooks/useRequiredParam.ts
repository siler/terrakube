import { useParams } from "react-router-dom";

/** Reads a route parameter the matched route always defines; a missing one means the route table is wrong. */
export const useRequiredParam = (name: string): string => {
  const value = useParams()[name];
  if (!value) {
    throw new Error(`Route parameter "${name}" is missing`);
  }
  return value;
};
