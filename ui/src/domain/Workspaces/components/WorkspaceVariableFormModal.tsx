import type { FormInstance } from "antd";
import { CrudFormModal } from "@/components/modals/CrudFormModal";
import { VariableFormFields } from "@/components/forms/VariableFormFields";
import { CreateVariableForm } from "@/domain/types";
import type { Category } from "@/domain/generated/apiResources";

const validateMessages = {
  required: "${label} is required!",
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  variableName?: string;
  category: Category | null;
  onCategoryChange: (value: Category) => void;
  form: FormInstance<CreateVariableForm>;
  onCancel: () => void;
  onSubmit: (values: CreateVariableForm) => void;
};

export default function WorkspaceVariableFormModal({
  open,
  mode,
  variableName,
  category,
  onCategoryChange,
  form,
  onCancel,
  onSubmit,
}: Props) {
  return (
    <CrudFormModal<CreateVariableForm>
      open={open}
      title={mode === "edit" ? "Edit variable " + variableName : "Add variable"}
      okText="Save variable"
      form={form}
      formName="create-org"
      onCancel={onCancel}
      onSubmit={onSubmit}
      validateMessages={validateMessages}
      initialValues={{ category: "TERRAFORM", hcl: false, sensitive: false }}
    >
      <VariableFormFields category={category ?? undefined} onCategoryChange={onCategoryChange} />
    </CrudFormModal>
  );
}
