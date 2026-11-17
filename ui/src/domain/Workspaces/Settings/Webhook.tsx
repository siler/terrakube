import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Form, Popconfirm, Segmented, Select, Spin, Switch, message } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import { responseStatus } from "@/modules/api/errorStatus";
import { configuredBranch, isPlanOnlyTemplate } from "../../Jobs/planOnlyTemplate";
import { VcsTypeOrUnknown } from "../../types";
import { WebhookEventPathType, WebhookEventType } from "../../generated/apiResources";
import { api, fields } from "../../generated/apiPaths";
import type { AtomicOperation, AtomicOperationsBody, UpdateBody, WriteAttributes } from "../../api/writeBodies";
import type { Row } from "../../api/fieldSelection";
import type { OrgTemplateRow, WorkspacePageRow } from "../workspaceQuery";
import { atomicHeader } from "../Workspaces";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { IdField } from "@/components/settings/IdField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PatternListInput, PatternPlayground } from "./PatternListInput";
import { isValidRegex, joinList, looksLikeWildcard, splitList } from "./patterns";
import { isOneOf, isRecord, isStringArray } from "@/modules/utils/typeGuards";
import "./Webhook.css";

type PathMode = "any" | WebhookEventPathType;

const WEBHOOK_FIELDS = fields.webhook("remoteHookId", "migratedV2", "syncError");

const WEBHOOK_EVENT_FIELDS = fields.webhook_event(
  "priority",
  "event",
  "branch",
  "pathType",
  "path",
  "templateId",
  "prWorkflowEnabled",
  "prApplyEnabled"
);

/** A webhook trigger as this page lists and edits it. */
type WebhookEventRow = Row<typeof WEBHOOK_EVENT_FIELDS>;

// What a trigger looks like in the form. The API stores branches and paths as comma-separated strings and "any" as
// a catch-all pattern, so these are converted on load (fromEvent) and on save (toAttributes).
type Trigger = {
  id: string;
  event?: WebhookEventType;
  anyBranch: boolean;
  branches: string[];
  pathMode: PathMode;
  paths: string[];
  template?: string;
  prWorkflowEnabled: boolean;
  prApplyEnabled: boolean;
  created?: boolean;
};

// The triggers list and its editor use the room the page has; the ID fields above stay at reading width.
const WIDE = 1040;
const PATH_MODE_HELP: Record<PathMode, string> = {
  any: "Runs on every change.",
  [WebhookEventPathType.PATTERN]: "A changed file must match a path such as terraform/* or modules/**.",
  [WebhookEventPathType.REGEX]: "A changed file must match a regular expression.",
};
const ANY_BRANCH = ".*";
const ANY_PATH = "**";

const newTrigger = (overrides: Partial<Trigger> = {}): Trigger => ({
  id: crypto.randomUUID(),
  anyBranch: false,
  branches: [],
  pathMode: "any",
  paths: [],
  prWorkflowEnabled: false,
  prApplyEnabled: false,
  ...overrides,
});

const fromEvent = (event: WebhookEventRow): Trigger => {
  const pathType = event.pathType || WebhookEventPathType.REGEX;
  const anyBranch = (event.branch ?? "").trim() === ANY_BRANCH;
  const anyPath = pathType === WebhookEventPathType.PATTERN && (event.path ?? "").trim() === ANY_PATH;
  return {
    id: event.id,
    event: event.event,
    anyBranch,
    branches: anyBranch ? [] : splitList(event.branch),
    pathMode: anyPath ? "any" : pathType,
    paths: anyPath ? [] : splitList(event.path),
    template: event.templateId,
    prWorkflowEnabled: event.prWorkflowEnabled || false,
    prApplyEnabled: event.prApplyEnabled || false,
    created: true,
  };
};

const PATH_MODES = ["any", WebhookEventPathType.PATTERN, WebhookEventPathType.REGEX] as const;
const EVENT_TYPES = Object.values(WebhookEventType);

const isOptional = <T,>(value: unknown, guard: (v: unknown) => v is T): value is T | undefined =>
  value === undefined || guard(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

// The form store is untyped; its triggers are only what this page put there and the fields it renders.
const isTrigger = (value: unknown): value is Trigger =>
  isRecord(value) &&
  isString(value.id) &&
  isOptional(value.event, (v) => isOneOf(EVENT_TYPES, v)) &&
  isBoolean(value.anyBranch) &&
  isStringArray(value.branches) &&
  isOneOf(PATH_MODES, value.pathMode) &&
  isStringArray(value.paths) &&
  isOptional(value.template, isString) &&
  isBoolean(value.prWorkflowEnabled) &&
  isBoolean(value.prApplyEnabled) &&
  isOptional(value.created, isBoolean);

/** A trigger with every field the API requires. */
type CompleteTrigger = Trigger & { event: WebhookEventType; template: string };

const isComplete = (trigger: Trigger): trigger is CompleteTrigger => Boolean(trigger.event && trigger.template);

// A release has no changed files, so it never filters on paths.
const filtersPaths = (trigger: Trigger) => trigger.event !== WebhookEventType.RELEASE && trigger.pathMode !== "any";

// Triggers are checked from the lowest priority up, so the list order is the priority.
const toAttributes = (trigger: CompleteTrigger, position: number): WriteAttributes<"webhook_event"> => {
  const pathMode = filtersPaths(trigger) ? trigger.pathMode : "any";
  return {
    priority: position + 1,
    event: trigger.event,
    branch: trigger.anyBranch ? ANY_BRANCH : joinList(trigger.branches),
    path: pathMode !== "any" ? joinList(trigger.paths) : ANY_PATH,
    pathType: pathMode !== "any" ? pathMode : WebhookEventPathType.PATTERN,
    templateId: trigger.template,
    prWorkflowEnabled: trigger.prWorkflowEnabled || false,
    prApplyEnabled: trigger.prApplyEnabled || false,
  };
};

const EVENT_OPTIONS: { value: WebhookEventType; label: string }[] = [
  { value: WebhookEventType.PUSH, label: "Push" },
  { value: WebhookEventType.PULL_REQUEST, label: "Pull request" },
  { value: WebhookEventType.RELEASE, label: "Release" },
];

const eventLabel = (event?: WebhookEventType) =>
  EVENT_OPTIONS.find((option) => option.value === event)?.label ?? "New trigger";

const SHARED_WEBHOOK_VCS: VcsTypeOrUnknown[] = [
  VcsTypeOrUnknown.GITHUB,
  VcsTypeOrUnknown.GITLAB,
  VcsTypeOrUnknown.AZURE_SP_MI,
  VcsTypeOrUnknown.AZURE_DEVOPS,
];
// Explicitly drop Content-Type: Elide's Spring routing maps DELETE requests carrying
// "application/vnd.api+json" to its relationship-delete handler, which then rejects them.
const deleteHeaders = { headers: { "Content-Type": undefined } };

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
  orgTemplates: OrgTemplateRow[];
  vcsProvider?: VcsTypeOrUnknown;
  onWorkspaceUpdate?: () => void;
};

export const WorkspaceWebhook = ({
  organizationId,
  workspace,
  vcsProvider,
  orgTemplates,
  manageWorkspace,
  onWorkspaceUpdate,
}: Props) => {
  const workspaceId = workspace.id;
  const webhookId = workspace.webhook?.id;
  const hasVcs = Boolean(workspace.vcs?.id);
  const baseUrl = `organization/${organizationId}/workspace/${workspaceId}/webhook`;

  const [form] = Form.useForm<{ events: Trigger[] }>();
  const triggers: Trigger[] = Form.useWatch("events", { form, preserve: true }) ?? [];
  // Unlike the watched list, the store is current within the same event handler.
  const readTriggers = (): Trigger[] => {
    const value: unknown = form.getFieldValue("events");
    return Array.isArray(value) ? value.filter(isTrigger) : [];
  };
  const [loading, setLoading] = useState(Boolean(webhookId && hasVcs));
  const [saving, setSaving] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(Boolean(webhookId));
  const [remoteHookId, setRemoteHookId] = useState("");
  const [migratedV2, setMigratedV2] = useState(false);
  // Why the last background sync of the shared repository webhook failed, if it did.
  const [syncError, setSyncError] = useState("");
  // Only for a webhook that does not exist yet: create it as the shared repository webhook straight away.
  const [createShared, setCreateShared] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  // Save model: every change waits for "Save webhook", then deleted, edited and new triggers go in one
  // atomic request, so a failed save changes nothing.
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Trigger | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (!webhookId || !hasVcs) {
      return;
    }
    setLoading(true);
    const webhook = api.organization(organizationId).workspace(workspaceId).webhook(webhookId);
    Promise.all([webhook.select(WEBHOOK_FIELDS), webhook.events().select(WEBHOOK_EVENT_FIELDS)])
      .then(([webhookData, events]) => {
        setRemoteHookId(webhookData?.remoteHookId ?? "");
        setMigratedV2(webhookData?.migratedV2 || false);
        setSyncError(webhookData?.syncError || "");
        // Ascending, the order the API checks triggers in.
        form.setFieldsValue({ events: events.sort((a, b) => a.priority - b.priority).map(fromEvent) });
      })
      .catch((error) => message.error(`Couldn't load the webhook: ${getErrorMessage(error)}`))
      .finally(() => setLoading(false));
  }, [organizationId, workspaceId, webhookId, hasVcs, form]);

  const addTrigger = (trigger: Trigger = newTrigger()) => {
    form.setFieldValue("events", [...readTriggers(), trigger]);
    setExpanded((ids) => [...ids, trigger.id]);
  };

  const duplicateTrigger = (trigger: Trigger) => addTrigger({ ...trigger, id: crypto.randomUUID(), created: false });

  const removeTrigger = (trigger: Trigger) => {
    form.setFieldValue(
      "events",
      readTriggers().filter((t) => t.id !== trigger.id)
    );
    if (trigger.created) {
      setDeletedIds((ids) => [...ids, trigger.id]);
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const onEnabledChange = (checked: boolean) => {
    setWebhookEnabled(checked);
    if (checked && triggers.length === 0) {
      addTrigger();
    }
  };

  const disableWebhook = async () => {
    setConfirmDisable(false);
    setSaving(true);
    try {
      await axiosInstance.delete(`${baseUrl}/${webhookId}`, deleteHeaders);
      form.setFieldValue("events", []);
      setDeletedIds([]);
      message.success("Webhook deleted");
      onWorkspaceUpdate?.();
    } catch (error) {
      message.error(`Couldn't delete the webhook: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!webhookEnabled) {
      setConfirmDisable(true);
      return;
    }
    const value: unknown = form.getFieldValue("events");
    const stored: unknown[] = Array.isArray(value) ? value : [];
    const current = stored.filter(isTrigger);
    const events = current.filter(isComplete);
    // Field validation covers this, but a trigger must never be dropped or sent half-filled.
    if (events.length !== stored.length) {
      message.error("Choose an event and a template for every trigger.");
      setExpanded(current.filter((t) => !isComplete(t)).map((t) => t.id));
      return;
    }
    const newWebhookId = webhookId ?? crypto.randomUUID();
    const webhookOperation: AtomicOperation<"webhook"> = {
      op: webhookId ? "update" : "add",
      href: `/${baseUrl}`,
      data: {
        type: "webhook",
        id: newWebhookId,
        ...(!webhookId && createShared && { attributes: { migratedV2: true } }),
      },
    };
    const body: AtomicOperationsBody<"webhook" | "webhook_event"> = {
      "atomic:operations": [
        ...deletedIds.map((id): AtomicOperation<"webhook"> => ({
          op: "remove",
          href: `/${baseUrl}/${newWebhookId}/events/${id}`,
        })),
        webhookOperation,
        ...events.map((event, position): AtomicOperation<"webhook_event"> => ({
          op: event.created ? "update" : "add",
          href: event.created ? `/${baseUrl}/${newWebhookId}/events/${event.id}` : `/${baseUrl}/${newWebhookId}/events`,
          data: { type: "webhook_event", id: event.id, attributes: toAttributes(event, position) },
        })),
      ],
    };

    setSaving(true);
    try {
      const response = await axiosInstance.post("/operations", body, atomicHeader);
      if (response.status !== 200) {
        throw new Error(`Unexpected response ${response.status}`);
      }
      form.setFieldValue(
        "events",
        events.map((event) => ({ ...event, created: true }))
      );
      setDeletedIds([]);
      setExpanded([]);
      setCreateShared(false);
      message.success("Webhook saved");
      onWorkspaceUpdate?.();
    } catch (error) {
      message.error(
        responseStatus(error) === 424
          ? "The VCS connection can't manage webhooks on this repository. It needs Webhooks: write, and Pull requests: write to post plans."
          : `Couldn't save the webhook: ${getErrorMessage(error)}`
      );
    } finally {
      setSaving(false);
    }
  };

  // Both directions are one PATCH. Going back to a dedicated webhook creates it on the repository straight away,
  // so the new repository webhook ID is read again.
  const setShared = async (id: string, shared: boolean) => {
    setSaving(true);
    try {
      const body: UpdateBody<"webhook"> = {
        data: { type: "webhook", id, attributes: { migratedV2: shared } },
      };
      const response = await axiosInstance.patch(`${baseUrl}/${id}`, body, {
        headers: { "Content-Type": "application/vnd.api+json" },
      });
      if (response.status !== 200 && response.status !== 204) {
        throw new Error(`Unexpected response ${response.status}`);
      }
      setMigratedV2(shared);
      if (!shared) {
        const webhookData = await api
          .organization(organizationId)
          .workspace(workspaceId)
          .webhook(id)
          .select(WEBHOOK_FIELDS);
        setRemoteHookId(webhookData?.remoteHookId ?? "");
      }
      message.success(shared ? "Migrated to a shared webhook" : "Switched to a webhook for this workspace");
    } catch (error) {
      message.error(`Couldn't ${shared ? "migrate" : "switch"} the webhook: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  // A workspace that restricts apply to its configured branch does not start a run that can change infrastructure
  // from a pull request, or from a push to another branch. A release is not affected.
  const restrictApply = Boolean(workspace.restrictApplyToConfiguredBranch);
  const workspaceBranch = configuredBranch(workspace.branch);

  const restrictionNotice = (trigger: Trigger): string | null => {
    if (!restrictApply || !trigger.template || trigger.event === WebhookEventType.RELEASE) {
      return null;
    }
    const template = orgTemplates.find((t) => t.id === trigger.template);
    if (!template || isPlanOnlyTemplate(template.tcl ?? undefined)) {
      return null;
    }
    if (trigger.event === WebhookEventType.PULL_REQUEST) {
      return `This workspace only applies from ${workspaceBranch}, so a pull request can only run a plan-only template. This trigger will not start a run. Choose a plan-only template.`;
    }
    const otherBranches = trigger.anyBranch || trigger.branches.some((b) => configuredBranch(b) !== workspaceBranch);
    return otherBranches
      ? `This workspace only applies from ${workspaceBranch}. A push to any other branch this trigger matches will not start a run with this template.`
      : null;
  };

  const templateName = (id?: string) => orgTemplates.find((t) => t.id === id)?.name;

  const branchText = (trigger: Trigger) => (trigger.anyBranch ? "any branch" : trigger.branches.join(", "));

  const pathText = (trigger: Trigger) => {
    if (trigger.event === WebhookEventType.RELEASE) {
      return "";
    }
    if (trigger.pathMode === "any") {
      return "any file";
    }
    const [first, ...rest] = trigger.paths;
    return first ? `${first}${rest.length ? ` +${rest.length}` : ""}` : "";
  };

  const summaryText = (trigger: Trigger) =>
    [eventLabel(trigger.event), branchText(trigger), pathText(trigger)].filter(Boolean).join(" · ") +
    (trigger.template ? ` → ${templateName(trigger.template) ?? trigger.template}` : "");

  const header = (
    <SettingsPageHeader
      docUrl="https://docs.terrakube.io/user-guide/workspaces/webhooks"
      title="Webhook"
      description="Start runs automatically when the repository receives a push, pull request or release."
    />
  );

  if (!hasVcs) {
    return (
      <div>
        {header}
        <EmptyState description="Webhooks need a VCS connection. Connect this workspace to a VCS provider to start runs from repository events.">
          <Link to={`/organizations/${organizationId}/workspaces/${workspaceId}/settings/general`}>
            Choose a VCS provider in General settings
          </Link>
        </EmptyState>
      </div>
    );
  }

  const enabledHelp = webhookEnabled
    ? webhookId
      ? undefined
      : "A webhook is created on the repository when you save."
    : webhookId
      ? "Saving deletes the webhook from the repository."
      : undefined;

  return (
    <div>
      {header}
      <Spin spinning={loading}>
        <SettingsForm
          className="webhook-form"
          form={form}
          name="webhook"
          onFinish={save}
          onFinishFailed={({ errorFields }) => {
            const ids = errorFields
              .map((field) => {
                const index = field.name[1];
                return typeof index === "number" ? triggers[index]?.id : undefined;
              })
              .filter((id): id is string => Boolean(id));
            setExpanded((current) => [...new Set([...current, ...ids])]);
          }}
          saveLabel="Save webhook"
          saving={saving}
          saveDisabled={!manageWorkspace || (!webhookEnabled && !webhookId)}
        >
          <SettingsSection title="Repository webhook">
            <Form.Item label="Enable webhook" htmlFor="webhook-enabled" extra={enabledHelp}>
              <Switch
                id="webhook-enabled"
                checked={webhookEnabled}
                onChange={onEnabledChange}
                disabled={!manageWorkspace}
              />
            </Form.Item>
            {webhookEnabled && !webhookId && vcsProvider && SHARED_WEBHOOK_VCS.includes(vcsProvider) && (
              <Form.Item
                label="Shared webhook"
                extra="One webhook on the repository serves every workspace that uses it, instead of one webhook per workspace. You can switch back after saving."
              >
                <Checkbox
                  checked={createShared}
                  onChange={(e) => setCreateShared(e.target.checked)}
                  disabled={!manageWorkspace}
                >
                  Share one webhook across this repository
                </Checkbox>
              </Form.Item>
            )}
            {webhookEnabled && webhookId && migratedV2 && syncError && (
              <Alert
                type="warning"
                showIcon
                title="The repository webhook is not working"
                description={`${syncError} Save the webhook again to try again.`}
              />
            )}
            {webhookEnabled && webhookId && (
              <>
                <IdField id="webhook-id" label="Webhook ID" value={webhookId} copiedMessage="Webhook ID copied" />
                {migratedV2 ? (
                  <Form.Item label="Repository webhook">Shared with every workspace on this repository.</Form.Item>
                ) : (
                  remoteHookId && (
                    <IdField
                      id="webhook-remote-id"
                      label="Repository webhook ID"
                      value={remoteHookId}
                      copiedMessage="Repository webhook ID copied"
                    />
                  )
                )}
                {vcsProvider && SHARED_WEBHOOK_VCS.includes(vcsProvider) && (
                  <Form.Item
                    label="Shared webhook"
                    extra={
                      migratedV2
                        ? "One webhook on the repository serves every workspace that uses it. Switch back to give this workspace its own."
                        : "Replace this workspace's webhook with one webhook that serves every workspace that uses this repository."
                    }
                  >
                    <Popconfirm
                      title={migratedV2 ? "Switch to a webhook for this workspace?" : "Migrate to a shared webhook?"}
                      description={
                        migratedV2
                          ? "A webhook dedicated to this workspace is created on the repository now. Other workspaces keep the shared webhook."
                          : "This workspace's webhook is replaced by one webhook for the whole repository. Your triggers stay as they are."
                      }
                      okText={migratedV2 ? "Switch" : "Migrate"}
                      cancelText="Cancel"
                      onConfirm={() => setShared(webhookId, !migratedV2)}
                      disabled={!manageWorkspace}
                    >
                      <Button disabled={!manageWorkspace}>
                        {migratedV2 ? "Switch to a webhook for this workspace" : "Migrate to shared webhook"}
                      </Button>
                    </Popconfirm>
                  </Form.Item>
                )}
              </>
            )}
          </SettingsSection>

          {webhookEnabled && (
            <SettingsSection
              maxWidth={WIDE}
              title={`Triggers (${triggers.length})`}
              description="A trigger starts a run with its template when a matching repository event arrives. Triggers are checked from the top: the first one that matches starts the run, so put the most specific first."
            >
              <Form.List
                name="events"
                rules={[
                  {
                    validator: async (_, list?: Trigger[]) => {
                      if (!list?.length) {
                        throw new Error("Add at least one trigger.");
                      }
                    },
                  },
                ]}
              >
                {(fields, { move }, { errors }) => (
                  <>
                    {fields.length > 0 && (
                      <ul className="webhook-triggers">
                        {fields.map(({ key, name }) => {
                          const stored: unknown = form.getFieldValue(["events", name]);
                          const trigger = triggers[name] ?? (isTrigger(stored) ? stored : undefined);
                          if (!trigger) {
                            return null;
                          }
                          const open = expanded.includes(trigger.id);
                          const panelId = `webhook-trigger-${trigger.id}`;
                          const isRelease = trigger.event === WebhookEventType.RELEASE;
                          const meta = [
                            `Order ${name + 1}`,
                            !isRelease && trigger.pathMode === WebhookEventPathType.REGEX && "Regex paths",
                            !isRelease && trigger.pathMode === WebhookEventPathType.PATTERN && "Wildcard paths",
                            trigger.event === WebhookEventType.PULL_REQUEST &&
                              trigger.prWorkflowEnabled &&
                              "Plan posted on PRs",
                            trigger.event === WebhookEventType.PULL_REQUEST &&
                              trigger.prApplyEnabled &&
                              "Apply by comment",
                            !trigger.created && "Not saved",
                          ].filter(Boolean);
                          return (
                            <li key={key} className="webhook-trigger">
                              <div className="webhook-trigger-summary">
                                <div className="webhook-trigger-text">
                                  <span className="webhook-trigger-title">
                                    {eventLabel(trigger.event)}
                                    {branchText(trigger) && (
                                      <>
                                        {" · "}
                                        <span className="webhook-mono">{branchText(trigger)}</span>
                                      </>
                                    )}
                                    {pathText(trigger) && (
                                      <>
                                        {" · "}
                                        <span className="webhook-mono">{pathText(trigger)}</span>
                                      </>
                                    )}
                                    {trigger.template && <> → {templateName(trigger.template) ?? trigger.template}</>}
                                  </span>
                                  <span className="webhook-trigger-meta">{meta.join(" · ")}</span>
                                </div>
                                <div className="webhook-trigger-actions">
                                  <Button
                                    icon={<ArrowUpOutlined />}
                                    aria-label={`Check trigger ${name + 1} earlier`}
                                    disabled={!manageWorkspace || name === 0}
                                    onClick={() => move(name, name - 1)}
                                  />
                                  <Button
                                    icon={<ArrowDownOutlined />}
                                    aria-label={`Check trigger ${name + 1} later`}
                                    disabled={!manageWorkspace || name === fields.length - 1}
                                    onClick={() => move(name, name + 1)}
                                  />
                                  <Button
                                    aria-expanded={open}
                                    aria-controls={panelId}
                                    aria-label={`${open ? "Collapse" : "Edit"} trigger ${name + 1}`}
                                    onClick={() => toggleExpanded(trigger.id)}
                                  >
                                    {open ? "Collapse" : "Edit"}
                                  </Button>
                                  <Button
                                    icon={<CopyOutlined />}
                                    aria-label={`Duplicate trigger ${name + 1}`}
                                    disabled={!manageWorkspace}
                                    onClick={() => duplicateTrigger(trigger)}
                                  />
                                  <Button
                                    icon={<DeleteOutlined />}
                                    aria-label={`Delete trigger ${name + 1}`}
                                    disabled={!manageWorkspace}
                                    onClick={() =>
                                      trigger.created ? setPendingDelete(trigger) : removeTrigger(trigger)
                                    }
                                  />
                                </div>
                              </div>
                              <div id={panelId} className="webhook-trigger-fields" hidden={!open}>
                                <div className="webhook-when">
                                  <h5 className="webhook-group-title">When a repository event matches</h5>
                                  <div className="webhook-columns">
                                    <div className="webhook-column">
                                      <Form.Item
                                        name={[name, "event"]}
                                        label="Event"
                                        rules={[{ required: true, message: "Choose an event." }]}
                                      >
                                        <Select
                                          placeholder="Select an event"
                                          disabled={!manageWorkspace}
                                          options={EVENT_OPTIONS}
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        name={[name, "branches"]}
                                        label={isRelease ? "Release tags" : "Branches"}
                                        dependencies={[["events", name, "anyBranch"]]}
                                        extra={
                                          <>
                                            Regexes matching the whole{" "}
                                            {isRelease
                                              ? "tag"
                                              : trigger.event === WebhookEventType.PULL_REQUEST
                                                ? "PR source branch name"
                                                : "branch name"}
                                            : <code>main</code> only matches main, <code>release/.*</code> matches every
                                            release branch. Enter or comma adds another.
                                          </>
                                        }
                                        rules={[
                                          {
                                            validator: async (_, value?: string[]) => {
                                              if (form.getFieldValue(["events", name, "anyBranch"])) {
                                                return;
                                              }
                                              if (!value?.length) {
                                                throw new Error(
                                                  `Enter at least one ${isRelease ? "release tag" : "branch"} regex.`
                                                );
                                              }
                                              const bad = value.find((pattern) => !isValidRegex(pattern));
                                              if (bad) {
                                                throw new Error(`"${bad}" is not a valid regex.`);
                                              }
                                            },
                                          },
                                        ]}
                                      >
                                        <PatternListInput
                                          placeholder={
                                            trigger.anyBranch ? `Any ${isRelease ? "release tag" : "branch"}` : "main"
                                          }
                                          isValid={isValidRegex}
                                          disabled={!manageWorkspace || trigger.anyBranch}
                                        />
                                      </Form.Item>
                                      <Form.Item name={[name, "anyBranch"]} valuePropName="checked">
                                        <Checkbox disabled={!manageWorkspace}>
                                          Any {isRelease ? "release tag" : "branch"}
                                        </Checkbox>
                                      </Form.Item>
                                    </div>
                                    <div className="webhook-column">
                                      {!isRelease && (
                                        <Form.Item
                                          name={[name, "pathMode"]}
                                          label="Changed files"
                                          extra={PATH_MODE_HELP[trigger.pathMode]}
                                        >
                                          <Segmented
                                            block
                                            disabled={!manageWorkspace}
                                            options={[
                                              { value: "any", label: "Any file" },
                                              { value: WebhookEventPathType.PATTERN, label: "Wildcards" },
                                              { value: WebhookEventPathType.REGEX, label: "Regex" },
                                            ]}
                                          />
                                        </Form.Item>
                                      )}
                                      {filtersPaths(trigger) && (
                                        <Form.Item
                                          name={[name, "paths"]}
                                          label="Paths"
                                          extra={
                                            trigger.pathMode === WebhookEventPathType.REGEX ? (
                                              <>
                                                Match the whole path: <code>modules/.*</code>, not <code>modules/</code>
                                                . A comma starts the next path, so write <code>{"{2}"}</code>, not{" "}
                                                <code>{"{1,3}"}</code>.
                                              </>
                                            ) : (
                                              "Enter or comma adds another path."
                                            )
                                          }
                                          rules={[
                                            {
                                              validator: async (_, value?: string[]) => {
                                                if (!value?.length) {
                                                  throw new Error("Enter at least one path.");
                                                }
                                                const mode: unknown = form.getFieldValue(["events", name, "pathMode"]);
                                                const bad =
                                                  mode === WebhookEventPathType.REGEX &&
                                                  value.find((pattern) => !isValidRegex(pattern));
                                                if (bad) {
                                                  throw new Error(`"${bad}" is not a valid regex.`);
                                                }
                                              },
                                            },
                                            {
                                              warningOnly: true,
                                              validator: async (_, value?: string[]) => {
                                                const mode: unknown = form.getFieldValue(["events", name, "pathMode"]);
                                                const wildcard =
                                                  mode === WebhookEventPathType.REGEX &&
                                                  value?.find((pattern) => looksLikeWildcard(pattern));
                                                if (wildcard) {
                                                  throw new Error(
                                                    `In a regex, "${wildcard}" means a slash repeated, not any file. Use "${wildcard.replace(/\*+$/, ".*")}", or choose Wildcards.`
                                                  );
                                                }
                                              },
                                            },
                                          ]}
                                        >
                                          <PatternListInput
                                            placeholder={
                                              trigger.pathMode === WebhookEventPathType.REGEX
                                                ? "terraform/.*\\.tf"
                                                : "terraform/*"
                                            }
                                            isValid={(pattern) =>
                                              trigger.pathMode !== WebhookEventPathType.REGEX || isValidRegex(pattern)
                                            }
                                            disabled={!manageWorkspace}
                                          />
                                        </Form.Item>
                                      )}
                                    </div>
                                  </div>
                                  <PatternPlayground
                                    branchLabel={isRelease ? "Try a release tag" : "Try a branch name"}
                                    branches={trigger.anyBranch ? undefined : trigger.branches}
                                    paths={
                                      filtersPaths(trigger) && trigger.pathMode === WebhookEventPathType.REGEX
                                        ? trigger.paths
                                        : undefined
                                    }
                                  />
                                </div>
                                <div className="webhook-run">
                                  <h5 className="webhook-group-title">Then run</h5>
                                  <div className="webhook-columns">
                                    <div className="webhook-column">
                                      <Form.Item
                                        name={[name, "template"]}
                                        label="Template"
                                        rules={[{ required: true, message: "Choose a template." }]}
                                      >
                                        <Select
                                          placeholder="Select a template"
                                          disabled={!manageWorkspace}
                                          options={orgTemplates.map((t) => ({
                                            value: t.id,
                                            label: t.name,
                                          }))}
                                        />
                                      </Form.Item>
                                      {restrictionNotice(trigger) && (
                                        <Alert type="warning" showIcon title={restrictionNotice(trigger)} />
                                      )}
                                    </div>
                                    <div className="webhook-column">
                                      {trigger.event === WebhookEventType.PULL_REQUEST && (
                                        <>
                                          <Form.Item
                                            name={[name, "prWorkflowEnabled"]}
                                            valuePropName="checked"
                                            extra={
                                              <>
                                                Comments the plan on every pull request. Comment{" "}
                                                <code>terrakube plan</code> to run it again.
                                              </>
                                            }
                                          >
                                            <Checkbox
                                              disabled={!manageWorkspace}
                                              onChange={(e) => {
                                                if (!e.target.checked) {
                                                  form.setFieldValue(["events", name, "prApplyEnabled"], false);
                                                }
                                              }}
                                            >
                                              Post the plan on pull requests
                                            </Checkbox>
                                          </Form.Item>
                                          <Form.Item
                                            name={[name, "prApplyEnabled"]}
                                            valuePropName="checked"
                                            extra={
                                              <>
                                                Comment <code>terrakube apply</code> on the pull request to apply this
                                                workspace. Needs the plan on pull requests. The run skips the
                                                template&apos;s approval step, so on GitHub the author needs write
                                                access to the repository, and on GitLab the Developer role.
                                                {restrictApply &&
                                                  ` Not available while this workspace only applies from ${workspaceBranch}: merge the pull request to apply it.`}
                                              </>
                                            }
                                          >
                                            <Checkbox
                                              disabled={!manageWorkspace || !trigger.prWorkflowEnabled || restrictApply}
                                            >
                                              Allow apply from a pull request comment
                                            </Checkbox>
                                          </Form.Item>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Form.ErrorList errors={errors} />
                    <Button icon={<PlusOutlined />} onClick={() => addTrigger()} disabled={!manageWorkspace}>
                      Add trigger
                    </Button>
                  </>
                )}
              </Form.List>
            </SettingsSection>
          )}
        </SettingsForm>
      </Spin>

      <DeleteConfirmationModal
        open={pendingDelete !== null}
        title="Delete trigger"
        message={pendingDelete && `"${summaryText(pendingDelete)}" stops starting runs once you save the webhook.`}
        okText="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            removeTrigger(pendingDelete);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <DeleteConfirmationModal
        open={confirmDisable}
        title="Delete webhook"
        message={`The webhook and its ${triggers.length} trigger${triggers.length === 1 ? "" : "s"} are deleted from the repository. Repository events stop starting runs for this workspace.`}
        okText="Delete webhook"
        onConfirm={disableWebhook}
        onCancel={() => setConfirmDisable(false)}
      />
    </div>
  );
};
