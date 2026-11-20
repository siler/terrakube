import { message } from "antd";
import axiosInstance from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids } from "../api/fieldSelection";

// Only the children's ids are needed; the required parent linkage keeps each fieldset non-empty.
const ITEM_IDS = fields.item({ collection: ids });
const REFERENCE_IDS = fields.reference({ collection: ids });

// Deletes a variable collection: its variables and workspace references first, then the collection itself.
export const deleteCollection = async (orgid: string, id: string) => {
  const base = `organization/${orgid}/collection/${id}`;
  const collection = api.organization(orgid).collection(id);
  const sweep = async (path: string, noun: string, children: { id: string }[]) => {
    const results = await Promise.allSettled(
      children.map((child) => axiosInstance.delete(`${base}/${path}/${child.id}`))
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) {
      message.warning(`${failures} ${noun}(s) failed to delete`);
    }
  };
  await sweep("item", "variable", await collection.item().select(ITEM_IDS));
  await sweep("reference", "reference", await collection.reference().select(REFERENCE_IDS));
  await axiosInstance.delete(base);
};
