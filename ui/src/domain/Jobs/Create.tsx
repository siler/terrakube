import { DeleteOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { createdResourceId } from "@/domain/api/parseDocument";
import { Alert, Button, Collapse, Form, Input, Select, Tooltip, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ORGANIZATION_ARCHIVE, WORKSPACE_ARCHIVE } from "../../config/actionTypes";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "@/domain/generated/apiPaths";
import type { CreateBody } from "@/domain/api/writeBodies";
import type { Row } from "@/domain/api/fieldSelection";
import { Resource } from "../types";
import { buildResourceOptions } from "../Workspaces/workspaceDataUtils";
import type { OrgTemplateRow } from "../Workspaces/workspaceQuery";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import { CrudFormModal } from "@/components/modals/CrudFormModal";
import { RadioChoices } from "@/components/settings/RadioChoices";
import { configuredBranch, isPlanOnlyTemplate } from "./planOnlyTemplate";
import "./runTokens.css";
import "./Create.css";

const validateMessages = { required: "${label} is required" };

const isDestroyTemplate = (template: OrgTemplateRow) => Boolean(template.name?.includes("Destroy"));

const WORKSPACE_FIELDS = fields.workspace("branch", "defaultTemplate", "restrictApplyToConfiguredBranch");
type RunWorkspaceRow = Row<typeof WORKSPACE_FIELDS>;

const CLI_TEMPLATE_NAMES = ["Terraform-Plan/Apply-Cli", "Terraform-Plan/Destroy-Cli"];

const templateLabel = (template: OrgTemplateRow) =>
  isDestroyTemplate(template) ? (
    <span className="run-template--destroy">
      <DeleteOutlined aria-hidden /> {template.name}
    </span>
  ) : (
    template.name
  );

type Props = {
  changeJob: (id: string) => void;
  planJob?: boolean;
  // When set, "Run now" is disabled and this message explains why (e.g. a CLI/API
  // workspace that has no applied configuration to re-run yet).
  disabledReason?: string;
  // The workspace's current state resources, offered as selectable options for
  // Target/Replace resources below (in addition to freely typing an address).
  resources?: Resource[];
  /** Organization templates from the parent, null while it loads them. */
  templates: OrgTemplateRow[] | null;
  /** Called as the dialog opens, so the parent can refresh templates someone else may have changed. */
  onOpen?: () => void;
};

type CreateJobForm = {
  templateId: string;
  branchName: string;
  targetAddrs?: string[];
  replaceAddrs?: string[];
};

export const CreateJob = ({
  changeJob,
  planJob = true,
  disabledReason,
  resources,
  templates: organizationTemplates,
  onOpen,
}: Props) => {
  const navigate = useNavigate();
  const workspaceId = sessionStorage.getItem(WORKSPACE_ARCHIVE);
  const organizationId = sessionStorage.getItem(ORGANIZATION_ARCHIVE);
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm<CreateJobForm>();
  const [defaultTemplate, setDefaultTemplate] = useState<string>();
  const [branchName, setBranchName] = useState("");
  const [restrictApply, setRestrictApply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loading = organizationTemplates === null;
  const templates = useMemo(
    () => (organizationTemplates ?? []).filter((item) => !CLI_TEMPLATE_NAMES.includes(item.name ?? "")),
    [organizationTemplates]
  );
  const resourceOptions = useMemo(() => buildResourceOptions(resources ?? []), [resources]);
  const selectedBranch = Form.useWatch("branchName", form);
  // A workspace that restricts apply to its configured branch only runs plan-only templates on another branch.
  // An empty branch box means the workspace branch, as it does for the API.
  const effectiveBranch = selectedBranch?.trim() ? selectedBranch : branchName;
  const onOtherBranch = restrictApply && configuredBranch(effectiveBranch) !== configuredBranch(branchName);
  const availableTemplates = useMemo(
    () => (onOtherBranch ? templates.filter((item) => isPlanOnlyTemplate(item.tcl ?? undefined)) : templates),
    [onOtherBranch, templates]
  );
  const selectedTemplate = Form.useWatch("templateId", form);

  // Also covers a selected template that a refresh shows was deleted.
  useEffect(() => {
    if (loading || (!onOtherBranch && !selectedTemplate)) {
      return;
    }
    if (!availableTemplates.some((item) => item.id === selectedTemplate)) {
      form.setFieldsValue({ templateId: availableTemplates[0]?.id });
    }
  }, [loading, onOtherBranch, availableTemplates, selectedTemplate, form]);

  const onCancel = () => {
    setVisible(false);
  };

  useEffect(() => {
    void loadBranch();
  }, [organizationId]);

  const loadBranch = async () => {
    if (!organizationId || !workspaceId) {
      return;
    }
    try {
      const workspace: RunWorkspaceRow = await api
        .organization(organizationId)
        .workspace(workspaceId)
        .select(WORKSPACE_FIELDS);
      // Runs use the first entry of the workspace branch, so that is the one to offer.
      const firstBranch = configuredBranch(workspace.branch);
      setDefaultTemplate(workspace.defaultTemplate ?? undefined);
      setBranchName(firstBranch);
      setRestrictApply(Boolean(workspace.restrictApplyToConfiguredBranch));
      form.setFieldsValue({ templateId: workspace.defaultTemplate ?? undefined, branchName: firstBranch });
    } catch (error) {
      message.error(`Could not load the workspace branch: ${getErrorMessage(error)}`);
    }
  };

  const onCreate = (values: CreateJobForm) => {
    if (!organizationId || !workspaceId) {
      message.error("Could not start the run: no workspace is selected");
      return;
    }
    // Close modal immediately — don't make user wait
    setVisible(false);
    setSubmitting(true);

    const body: CreateBody<"job"> = {
      data: {
        type: "job",
        attributes: {
          templateReference: values.templateId,
          overrideBranch: values.branchName,
          via: "UI",
          targetAddrs: values.targetAddrs?.length ? values.targetAddrs : undefined,
          replaceAddrs: values.replaceAddrs?.length ? values.replaceAddrs : undefined,
        },
        relationships: {
          workspace: {
            data: {
              type: "workspace",
              id: workspaceId,
            },
          },
        },
      },
    };

    axiosInstance
      .post<unknown>(`organization/${organizationId}/job`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then((response) => {
        setSubmitting(false);
        const newJobId = createdResourceId(response.data);
        if (newJobId == null) {
          message.error("Could not start the run: the server did not return the new run id");
          return;
        }
        changeJob(newJobId);

        navigate(`/organizations/${organizationId}/workspaces/${workspaceId}/runs/${newJobId}`);
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        message.error(`Could not start the run: ${getErrorMessage(error)}`);
      });
  };

  return (
    <div>
      <Tooltip title={disabledReason}>
        <Button
          type="primary"
          htmlType="button"
          onClick={() => {
            void loadBranch();
            onOpen?.();
            setVisible(true);
          }}
          icon={<PlayCircleOutlined />}
          disabled={!planJob || submitting || !!disabledReason}
          loading={submitting}
        >
          Run now
        </Button>
      </Tooltip>

      <CrudFormModal<CreateJobForm>
        open={visible}
        title="Start a run"
        okText="Start run"
        form={form}
        formName="create-run"
        validateMessages={validateMessages}
        onCancel={onCancel}
        onSubmit={(values) => {
          form.resetFields();
          onCreate(values);
        }}
      >
        {onOtherBranch && !loading && availableTemplates.length === 0 && (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message="No plan-only templates available in this organization"
            description={`This workspace only allows plan runs on branches other than ${configuredBranch(branchName)}. Create a plan-only template, or use the workspace branch.`}
          />
        )}
        <Form.Item name="templateId" label="Template" rules={[{ required: true }]} initialValue={defaultTemplate}>
          {loading ? (
            <LoadingFallback />
          ) : availableTemplates.length <= 3 ? (
            <RadioChoices
              options={availableTemplates.map((item) => ({
                value: item.id,
                label: templateLabel(item),
                help: isDestroyTemplate(item) ? "Destroys every resource this workspace manages." : item.description,
              }))}
            />
          ) : (
            <Select options={availableTemplates.map((item) => ({ value: item.id, label: templateLabel(item) }))} />
          )}
        </Form.Item>
        <Form.Item
          name="branchName"
          label="Branch"
          extra={
            onOtherBranch
              ? `This workspace only allows plan runs on branches other than ${configuredBranch(branchName)}, so only plan-only templates are offered.`
              : restrictApply
                ? `This workspace only allows plan runs on branches other than ${configuredBranch(branchName)}. Leave it as is to run a template that applies.`
                : "The run uses this branch instead of the workspace default. Leave it as is for CLI-driven workspaces."
          }
          initialValue={branchName}
        >
          <Input />
        </Form.Item>
        <Collapse
          ghost
          className="run-create-options"
          items={[
            {
              key: "additionalPlanningOptions",
              label: "Additional planning options",
              children: (
                <>
                  <Form.Item
                    name="targetAddrs"
                    label="Target resources"
                    extra="Only these resources and their dependencies are planned. Type an address and press Enter to add it."
                  >
                    <Select
                      mode="tags"
                      tokenSeparators={[","]}
                      placeholder="Select or type a resource address"
                      options={resourceOptions}
                    />
                  </Form.Item>
                  <Form.Item
                    name="replaceAddrs"
                    label="Replace resources"
                    extra="These resources are destroyed and created again on apply, even if nothing changed."
                  >
                    <Select
                      mode="tags"
                      tokenSeparators={[","]}
                      placeholder="Select or type a resource address"
                      options={resourceOptions}
                    />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </CrudFormModal>
    </div>
  );
};
