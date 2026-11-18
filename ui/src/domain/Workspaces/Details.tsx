import { apiUrl } from "@/config/apiUrls";
import { ApprovalAttribution } from "@/components/display/ApprovalAttribution";
import { matchDisplayCriteria } from "./actionCriteria";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import {
  ArrowRightOutlined,
  BranchesOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  LockOutlined,
  ProfileOutlined,
  ProjectOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Avatar, Button, Col, Empty, message, Row, Space, Table, Tabs, Typography, Modal } from "antd";

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCoalescedReload, useJobStatusSubscription, usePolling } from "../../hooks";
import { parseOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { BiTerminal } from "react-icons/bi";
import { FiGitCommit } from "react-icons/fi";
import { HiOutlineExternalLink } from "react-icons/hi";
import { Link, useParams } from "react-router-dom";
const ActionLoader = lazy(() => import("../../ActionLoader"));
import { ORGANIZATION_ARCHIVE, ORGANIZATION_NAME, WORKSPACE_ARCHIVE } from "../../config/actionTypes";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { CreateJob } from "../Jobs/Create";
import PolicyStatusTag from "@/components/display/PolicyStatusTag";
import { Resource, VcsTypeOrUnknown } from "../types.js";
import { CLIDriven } from "../Workspaces/CLIDriven";
import { ResourceDrawer } from "../Workspaces/ResourceDrawer";
import { RunTriggers } from "../Workspaces/RunTriggers";
import { Schedules } from "../Workspaces/Schedules";
import { Tags } from "../Workspaces/Tags";
import { Variables } from "../Workspaces/Variables";
import { getServiceIcon } from "./Icons.jsx";
import { getIaCIconById, getIaCNameById } from "./Workspaces";
import "./Workspaces.css";
import { UNLOCK_CONFIRM_TEXT } from "./Settings/lockingCopy";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import PageWrapper from "@/components/layout/PageWrapper/PageWrapper";
import { LinkButton } from "@/components/navigation/LinkButton";
import RunList from "@/modules/workspaces/components/RunList";
import WorkspaceStatusTag from "@/components/display/WorkspaceStatusTag";
import { and } from "../api/rsqlFilter";
import { api, fields } from "../generated/apiPaths";
import type { Row as ApiRow } from "../api/fieldSelection";
import type { UpdateBody } from "../api/writeBodies";

import {
  setupWorkspaceIncludes,
  isValidUrl,
  fixSshURL,
  StateOutputVariableWithName,
  CollectionVariableRow,
  GlobalVariableRow,
  NamedSchedule,
  WorkspaceHistoryRow,
  WorkspaceJobRow,
} from "./workspaceDataUtils";
import { outputCopyText } from "./stateModel";
import {
  ORG_TEMPLATE_FIELDS,
  OrgTemplateRow,
  toActionWorkspace,
  workspacePageQuery,
  workspacePageRequest,
  WorkspacePageRow,
  WorkspaceScheduleRow,
  WorkspaceVariableRow,
} from "./workspaceQuery";
import VcsLogo from "@/components/display/VcsLogo";
import { formatDateTime, formatDuration, relativeTime } from "@/modules/utils/dates";
import { computeWorkspaceMetrics, FINISHED_JOB_STATUSES } from "./workspaceMetrics";
import { selectCurrentRun } from "./currentRun";
import { CurrentRunApproval } from "./components/CurrentRunApproval";
const DetailsJob = lazy(() => import("../Jobs/Details").then((m) => ({ default: m.DetailsJob })));
const States = lazy(() => import("../Workspaces/States").then((m) => ({ default: m.States })));
const WorkspaceSettings = lazy(() =>
  import("./Settings/WorkspaceSettings").then((m) => ({ default: m.WorkspaceSettings }))
);

const { Paragraph } = Typography;

const PAGE_ACTION_FIELDS = fields.action("action", "displayCriteria", "type");

/** A workspace page action, with the settings its matching display criterion attaches. */
type PageAction = ApiRow<typeof PAGE_ACTION_FIELDS> & { settings?: Record<string, unknown> };

const WORKSPACE_SECTION_LABELS: Record<string, string> = {
  "1": "Overview",
  "2": "Runs",
  "3": "States",
  "4": "Variables",
  "5": "Schedules",
  "6": "Settings",
  "7": "Run triggers",
};

const WORKSPACE_SETTINGS_SECTION_LABELS: Record<string, string> = {
  general: "General",
  policies: "Policies",
  locking: "Locking",
  sshkey: "SSH key",
  webhook: "Webhook",
  notifications: "Notifications",
  "state-shared": "State shared",
  "team-access": "Team access",
  advanced: "Destruction and deletion",
};

type Props = {
  setOrganizationName: React.Dispatch<React.SetStateAction<string>>;
  setWorkspaceManageState: React.Dispatch<React.SetStateAction<boolean>>;
  selectedTab?: string;
  settingsSection?: string;
};

const SIDE_REQUEST_TIMEOUT_MS = 15_000;

// A typed query has no axios timeout, so a side request's limit is a signal that also aborts at the deadline.
const withTimeout = (parent: AbortSignal, ms: number) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) {
    abort();
  }
  parent.addEventListener("abort", abort);
  const timer = setTimeout(abort, ms);
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
};

type Params = {
  runid: string;
};

export const WorkspaceDetails = ({
  setOrganizationName,
  setWorkspaceManageState,
  selectedTab,
  settingsSection,
}: Props) => {
  const id = useRequiredParam("id");
  const organizationId = useRequiredParam("orgid");
  const { runid } = useParams<Params>();
  sessionStorage.setItem(ORGANIZATION_ARCHIVE, organizationId);
  sessionStorage.setItem(WORKSPACE_ARCHIVE, id);
  const [workspace, setWorkspace] = useState<WorkspacePageRow>();
  const [manageWorkspace, setManageWorkspace] = useState(false);
  const [manageState, setManageState] = useState(false);
  const [planJob, setPlanJob] = useState(false);
  const [approveJob, setApproveJob] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  // Tab collections stay null until a load for a tab that reads them lands.
  const [variables, setVariables] = useState<WorkspaceVariableRow[] | null>(null);
  const [collectionVariables, setCollectionVariables] = useState<CollectionVariableRow[]>([]);
  const [collectionEnvVariables, setCollectionEnvVariables] = useState<CollectionVariableRow[]>([]);
  const [globalVariables, setGlobalVariables] = useState<GlobalVariableRow[]>([]);
  const [globalEnvVariables, setGlobalEnvVariables] = useState<GlobalVariableRow[]>([]);
  const [history, setHistory] = useState<WorkspaceHistoryRow[]>([]);
  const [schedule, setSchedule] = useState<WorkspaceScheduleRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [resource, setResource] = useState<Resource>();
  const [envVariables, setEnvVariables] = useState<WorkspaceVariableRow[] | null>(null);
  const [jobs, setJobs] = useState<WorkspaceJobRow[] | null>(null);
  const [stateDetailsVisible, setStateDetailsVisible] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobVisible, setJobVisible] = useState(false);
  const [organizationNameLocal, setOrganizationNameLocal] = useState<string>();
  const [workspaceName, setWorkspaceName] = useState("...");
  const [activeKey, setActiveKey] = useState(selectedTab ?? "1");
  const [templates, setTemplates] = useState<OrgTemplateRow[] | null>(null);
  const [executionMode, setExecutionMode] = useState("...");
  const [vcsProvider, setVCSProvider] = useState<VcsTypeOrUnknown>(VcsTypeOrUnknown.UNKNOWN);
  const [resources, setResources] = useState<Resource[]>([]);
  const [outputs, setOutputs] = useState<StateOutputVariableWithName[]>([]);
  const [actions, setActions] = useState<PageAction[]>([]);
  const [contextState, setContextState] = useState({});
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const manageStateRequest = useRef<Promise<boolean>>(Promise.resolve(false));
  const currentStateId = useRef("");
  const variableSourcesKey = useRef<string | null>(null);
  const firstLoadPending = useRef(true);
  const workspaceRequests = useRef(new AbortController());
  // A queued or polled load runs after the render that scheduled it, so it reads the route it lands on from here.
  const requestedView = useRef({ tab: selectedTab ?? "1", runOpen: Boolean(runid) });
  useLayoutEffect(() => {
    requestedView.current = { tab: selectedTab ?? "1", runOpen: Boolean(runid) };
  }, [selectedTab, runid]);

  const runLink = (jobid: string) => `/organizations/${organizationId}/workspaces/${id}/runs/${jobid}`;

  const getOutputValueFromState = (outputName: string): string => outputCopyText(contextState, outputName);

  const outputColumns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a: StateOutputVariableWithName, b: StateOutputVariableWithName) => a.name.localeCompare(b.name),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      sorter: (a: StateOutputVariableWithName, b: StateOutputVariableWithName) => a.type.localeCompare(b.type),
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      render: (text: string, record: StateOutputVariableWithName) => (
        <Paragraph
          className="workspace-output-value"
          copyable={{ tooltips: false, text: getOutputValueFromState(record.name) }}
        >
          {text}
        </Paragraph>
      ),
    },
  ];

  const resourceColumns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a: Resource, b: Resource) => {
        const nameA =
          a.index !== undefined && a.index !== null
            ? typeof a.index === "string"
              ? `${a.name}["${a.index}"]`
              : `${a.name}[${a.index}]`
            : a.name;
        const nameB =
          b.index !== undefined && b.index !== null
            ? typeof b.index === "string"
              ? `${b.name}["${b.index}"]`
              : `${b.name}[${b.index}]`
            : b.name;
        return nameA.localeCompare(nameB);
      },
      render: (text: string, record: Resource) => {
        const displayName =
          record.index !== undefined && record.index !== null
            ? typeof record.index === "string"
              ? `${text}["${record.index}"]`
              : `${text}[${record.index}]`
            : text;
        return (
          <Button onClick={() => showDrawer(record)} type="link" className="resource-name-link" title={displayName}>
            <span className="resource-name-text">{displayName}</span>
            <HiOutlineExternalLink aria-hidden />
          </Button>
        );
      },
      width: "27%",
      ellipsis: true,
    },
    {
      title: "Provider",
      dataIndex: "provider",
      key: "provider",
      sorter: (a: Resource, b: Resource) => a.provider.localeCompare(b.provider),
      // Drop only the default registry host: "registry.terraform.io/hashicorp/null" reads "hashicorp/null".
      render: (text: string) => (
        <code className="resource-provider" title={text}>
          {text?.replace(/^registry\.(terraform\.io|opentofu\.org)\//, "")}
        </code>
      ),
      width: "25%",
      ellipsis: true,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      sorter: (a: Resource, b: Resource) => a.type.localeCompare(b.type),
      render: (text: string, record: Resource) => (
        <span className="resource-type" title={text}>
          <img src={getServiceIcon(record.provider, record.type)} alt="" width={16} height={16} />
          <span>{text}</span>
        </span>
      ),
      width: "27%",
      ellipsis: true,
    },
    {
      title: "Module",
      dataIndex: "module",
      key: "module",
      ellipsis: true,
    },
  ];

  const loadTemplates = (workspaceSignal: AbortSignal) => {
    const deadline = withTimeout(workspaceSignal, SIDE_REQUEST_TIMEOUT_MS);
    api
      .organization(organizationId)
      .template()
      .select(ORG_TEMPLATE_FIELDS)
      .signal(deadline.signal)
      .then(
        (orgTemplates) => {
          if (!workspaceSignal.aborted) {
            setTemplates(orgTemplates);
          }
        },
        (err) => {
          if (!workspaceSignal.aborted) {
            console.error("Failed to load org templates:", err);
            setTemplates((current) => current ?? []);
          }
        }
      )
      .then(deadline.release);
  };

  const showDrawer = (record: Resource) => {
    setOpen(true);
    setResource(record);
  };

  const workspaceSettingsPath = `/organizations/${organizationId}/workspaces/${id}/settings`;

  const fetchActions = async () => {
    try {
      const fetchedActions = await api
        .action()
        .select(PAGE_ACTION_FIELDS)
        .where((action) => and(action.active.eq(true), action.type.in(["Workspace/Action"])));
      setActions(fetchedActions);
    } catch (error) {
      console.error("Error fetching actions:", error);
    }
  };

  const changeJob = (id: string) => {
    setJobId(id);
    setJobVisible(true);
    setActiveKey("2");
  };

  const loadPermissionSet = (workspaceSignal: AbortSignal): Promise<boolean> => {
    if (!id) {
      setPermissionsLoaded(true);
      return Promise.resolve(false);
    }
    // The workspace endpoint already folds in the organization permissions.
    const url = `${apiUrl("")}/access-token/v1/teams/permissions/organization/${organizationId}/workspace/${id}`;
    return axiosInstance
      .get<unknown>(url, { signal: workspaceSignal, timeout: SIDE_REQUEST_TIMEOUT_MS })
      .then((response) => {
        if (workspaceSignal.aborted) {
          return false;
        }
        const permissions = parseOrgPermissions(response.data);
        setManageState(permissions.manageState);
        setManageWorkspace(permissions.manageWorkspace);
        setPlanJob(permissions.planJob);
        setApproveJob(permissions.approveJob);
        return permissions.manageState;
      })
      .catch((err) => {
        if (!workspaceSignal.aborted) {
          console.error("Failed to load workspace permissions:", err);
        }
        return false;
      })
      .finally(() => {
        if (!workspaceSignal.aborted) {
          setPermissionsLoaded(true);
        }
      });
  };

  const loadWorkspace = async (isCurrent: () => boolean, signal: AbortSignal) => {
    try {
      const request = workspacePageRequest(requestedView.current.tab, requestedView.current.runOpen);
      const page = await workspacePageQuery(organizationId, id, request).load(signal);
      if (!isCurrent()) {
        return;
      }
      setWorkspace(page.workspace);

      await setupWorkspaceIncludes(page, {
        axiosInstance,
        manageState: manageStateRequest.current,
        currentStateId,
        variableSourcesKey,
        isCurrent,
        signal,
        setVariables,
        setJobs,
        setEnvVariables,
        setHistory,
        setSchedule,
        setVCSProvider,
        setResources,
        setOutputs,
        setContextState,
        setCollectionVariables,
        setCollectionEnvVariables,
        setGlobalVariables,
        setGlobalEnvVariables,
      });
      if (!isCurrent()) {
        return;
      }

      const { organization, project } = page.workspace;
      if (organization) {
        setOrganizationName(organization.name);
        sessionStorage.setItem(ORGANIZATION_NAME, organization.name);
      }

      setProjectName(project?.name ?? null);
      setProjectId(project?.id ?? null);
      setOrganizationNameLocal(sessionStorage.getItem(ORGANIZATION_NAME) ?? undefined);
      setWorkspaceName(page.workspace.name);
      setExecutionMode(page.workspace.executionMode ?? "remote");
      if (firstLoadPending.current) {
        firstLoadPending.current = false;
        if (runid) {
          changeJob(runid);
        }
        fetchActions();
      }
      setLoadError(null);
    } catch (err) {
      if (isCurrent()) {
        setLoadError(getErrorMessage(err));
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  };

  const workspaceReload = useCoalescedReload(loadWorkspace);

  const reloadVariables = () => {
    variableSourcesKey.current = null;
    workspaceReload.reload();
  };

  useEffect(() => {
    const requests = new AbortController();
    workspaceRequests.current = requests;
    setLoading(true);
    setLoadError(null);
    firstLoadPending.current = true;
    currentStateId.current = "";
    variableSourcesKey.current = null;
    setJobs(null);
    setVariables(null);
    setEnvVariables(null);
    setSchedule(null);
    setCollectionVariables([]);
    setCollectionEnvVariables([]);
    setGlobalVariables([]);
    setGlobalEnvVariables([]);
    manageStateRequest.current = loadPermissionSet(requests.signal);
    workspaceReload.reload();
    loadTemplates(requests.signal);
    return () => {
      requests.abort();
      workspaceReload.cancel();
    };
  }, [id]);

  useEffect(() => {
    setWorkspaceManageState(manageState);
  }, [manageState, setWorkspaceManageState]);

  useEffect(() => {
    setActiveKey(selectedTab ?? "1");
  }, [selectedTab]);

  // Tabs share one mounted page, so entering one revalidates what it shows while the previous data stays up.
  useEffect(() => {
    if (firstLoadPending.current) {
      return;
    }
    if (selectedTab === "4") {
      variableSourcesKey.current = null;
    }
    manageStateRequest.current = loadPermissionSet(workspaceRequests.current.signal);
    loadTemplates(workspaceRequests.current.signal);
    fetchActions();
    workspaceReload.reload();
  }, [selectedTab, settingsSection]);

  // Keep the Runs view in sync with the URL: viewing /runs/:runid shows that job's
  // details, but navigating back to the bare /runs list (e.g. via the sidebar) must
  // reset jobVisible, otherwise it stays stuck showing the last-viewed job forever.
  const previousRunid = useRef(runid);
  useEffect(() => {
    if (runid) {
      setJobId(runid);
      setJobVisible(true);
    } else {
      setJobVisible(false);
    }
    // Leaving a run for the list stays on the Runs tab, so no tab entry reloads the jobs the run view skipped.
    if (previousRunid.current && !runid && selectedTab === "2" && !firstLoadPending.current) {
      workspaceReload.reload();
    }
    previousRunid.current = runid;
  }, [runid]);

  usePolling(
    () => {
      // Org-level variables can change under an open Variables tab; elsewhere they aren't shown.
      if (activeKey === "4") {
        variableSourcesKey.current = null;
      }
      workspaceReload.reload();
    },
    { interval: 10000, enabled: Boolean(id), immediate: false }
  );

  // The poll stays as a fallback for a dropped WebSocket. Events are debounced because a run passes through
  // several statuses in quick succession and one reload covers them all.
  useJobStatusSubscription({
    workspaceId: id ?? "",
    enabled: Boolean(id),
    onEvent: () => workspaceReload.reloadSoon(),
  });

  const [lockModal, lockModalContext] = Modal.useModal();

  // Unlocking asks the same question as the Locking settings page; locking from the header stays one click.
  const confirmLockButton = (locked: boolean) => {
    if (!locked) {
      handleLockButton(false);
      return;
    }
    lockModal.confirm({
      title: `Unlock ${workspaceName}?`,
      content: UNLOCK_CONFIRM_TEXT,
      okText: "Unlock workspace",
      cancelText: "Cancel",
      onOk: () => handleLockButton(true),
    });
  };

  const handleLockButton = (locked: boolean) => {
    if (!id) {
      message.error(`Workspace ${locked ? "unlock" : "lock"} failed: no workspace is selected`);
      return;
    }
    const body: UpdateBody<"workspace"> = {
      data: {
        type: "workspace",
        id,
        attributes: {
          locked: !locked,
        },
      },
    };
    axiosInstance
      .patch(`organization/${organizationId}/workspace/${id}`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        workspaceReload.reload();
        const newstatus = locked ? "unlocked" : "locked";
        message.success("Workspace " + newstatus + " successfully");
      })
      .catch((error: unknown) => {
        const newstatus = locked ? "unlock" : "lock";
        message.error("Workspace " + newstatus + " failed: " + getErrorMessage(error));
      });
  };

  const currentRun = selectCurrentRun(jobs ?? []);
  const latestJob = currentRun?.job;
  const runCardTitle = currentRun?.active ? "Current run" : "Latest run";
  const metrics = computeWorkspaceMetrics(jobs ?? []);
  const templateName = (templateId?: string | null) => templates?.find((t) => t.id === templateId)?.name;
  const namedSchedules = useMemo<NamedSchedule[] | undefined>(
    () =>
      schedule?.map((item) => ({
        ...item,
        name: templates?.find((t) => t.id === item.templateReference)?.name ?? "",
      })),
    [schedule, templates]
  );

  const runCardFallback =
    jobs === null ? (
      <LoadingFallback />
    ) : (
      <div className="latest-run latest-run--empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={manageWorkspace ? "No runs yet. Use Run now above to trigger your first plan." : "No runs yet."}
        />
      </div>
    );

  const renderSection = (workspace: WorkspacePageRow) => {
    switch (activeKey) {
      case "1":
        return (
          <Row>
            <Col span={18} className="workspace-overview-main">
              {workspace.source === "empty" && workspace.branch === "remote-content" && workspace.history.length < 1 ? (
                <CLIDriven organizationName={organizationNameLocal} workspaceName={workspaceName} />
              ) : (
                <div>
                  <div className="latest-run-header">
                    <Typography.Title level={3}>{runCardTitle}</Typography.Title>
                    {jobs && jobs.length > 0 && (
                      <Link to={`/organizations/${organizationId}/workspaces/${id}/runs`}>
                        View all runs <ArrowRightOutlined aria-hidden />
                      </Link>
                    )}
                  </div>
                  {latestJob ? (
                    <article className="latest-run" aria-label={runCardTitle}>
                      <div className="latest-run-title">
                        <Typography.Title level={4}>
                          <Link
                            to={runLink(latestJob.id)}
                            onClick={() => changeJob(latestJob.id)}
                            title={latestJob.title}
                          >
                            {latestJob.title}
                          </Link>
                        </Typography.Title>
                        <WorkspaceStatusTag status={latestJob.status} />
                      </div>
                      <p className="latest-run-byline">
                        <Avatar size={20} shape="square" icon={<UserOutlined />} />
                        <span>
                          <strong>{latestJob.createdBy}</strong> triggered a run {latestJob.latestChange} via{" "}
                          <strong>{latestJob.via || "UI"}</strong>
                          {latestJob.commitId && latestJob.commitId !== "000000000" && (
                            <>
                              {" · "}
                              <FiGitCommit aria-label="commit" /> <code>{latestJob.commitId.substring(0, 7)}</code>
                            </>
                          )}{" "}
                          <ApprovalAttribution approvedBy={latestJob.approvedBy} approvedAt={latestJob.approvedAt} />
                        </span>
                      </p>
                      <dl className="latest-run-facts">
                        <div>
                          <dt>Template</dt>
                          <dd>{templateName(latestJob.templateReference) ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Policy checks</dt>
                          <dd>
                            <PolicyStatusTag
                              status={workspace.policyComplianceStatus}
                              organizationId={organizationId}
                              workspaceId={id}
                              clickable
                            />
                          </dd>
                        </div>
                        <div>
                          <dt>Duration</dt>
                          <dd>
                            {FINISHED_JOB_STATUSES.includes(latestJob.status)
                              ? (formatDuration(latestJob.createdDate, latestJob.updatedDate) ?? "—")
                              : "In progress"}
                          </dd>
                        </div>
                        <div>
                          <dt>Run</dt>
                          <dd>
                            <code>#{latestJob.id}</code>
                          </dd>
                        </div>
                      </dl>
                      {currentRun && currentRun.queuedBehind.length > 0 && (
                        <p className="latest-run-queued">
                          <Link to={`/organizations/${organizationId}/workspaces/${id}/runs`}>
                            {currentRun.queuedBehind.length === 1
                              ? "1 more run queued behind this one"
                              : `${currentRun.queuedBehind.length} more runs queued behind this one`}
                          </Link>
                        </p>
                      )}
                      {currentRun?.active && (
                        <div className="latest-run-approval">
                          <CurrentRunApproval
                            organizationId={organizationId}
                            jobId={latestJob.id}
                            status={latestJob.status}
                            canApprove={approveJob}
                            permissionsLoaded={permissionsLoaded}
                            approvalTeam={latestJob.approvalTeam}
                            onChanged={workspaceReload.reload}
                          />
                        </div>
                      )}
                      <div className="latest-run-actions">
                        <LinkButton to={runLink(latestJob.id)} onClick={() => changeJob(latestJob.id)}>
                          See details
                        </LinkButton>
                      </div>
                    </article>
                  ) : (
                    runCardFallback
                  )}
                  <Tabs
                    type="card"
                    className="workspace-overview-tabs"
                    items={[
                      {
                        label: `Resources (${resources.length})`,
                        key: "1",
                        // Fills the column; scrolls only when it is narrower than 560px.
                        children: (
                          <Table size="middle" dataSource={resources} columns={resourceColumns} scroll={{ x: 560 }} />
                        ),
                      },
                      {
                        label: `Outputs (${outputs.length})`,
                        key: "2",
                        children: (
                          <Table
                            size="middle"
                            dataSource={outputs}
                            columns={outputColumns}
                            scroll={{ x: "max-content" }}
                          />
                        ),
                      },
                    ]}
                  />

                  <ResourceDrawer resource={resource} workspace={workspace} setOpen={setOpen} open={open} />
                </div>
              )}
            </Col>
            <Col span={6}>
              <aside className="workspace-rail" aria-label="Workspace details">
                <ul className="workspace-rail-facts">
                  <li>
                    {workspace.branch !== "remote-content" && isValidUrl(fixSshURL(workspace.source)) ? (
                      <>
                        <VcsLogo type={vcsProvider} />
                        <a href={fixSshURL(workspace.source)} target="_blank" rel="noreferrer">
                          {new URL(fixSshURL(workspace.source))?.pathname?.replace(".git", "")?.substring(1)}
                        </a>
                      </>
                    ) : (
                      <>
                        <BiTerminal aria-hidden />
                        <span>CLI/API-driven workflow</span>
                      </>
                    )}
                  </li>
                  {workspace.branch && workspace.branch !== "remote-content" && (
                    <li>
                      <BranchesOutlined aria-hidden />
                      <span className="workspace-rail-label">Branch:</span>
                      <code>{workspace.branch}</code>
                    </li>
                  )}
                  <li>
                    <ThunderboltOutlined aria-hidden />
                    <span className="workspace-rail-label">Execution mode:</span>
                    <Link to={`/organizations/${organizationId}/workspaces/${id}/settings/general`}>
                      {executionMode === "..." ? "..." : executionMode.charAt(0).toUpperCase() + executionMode.slice(1)}
                    </Link>
                  </li>
                  {workspace.folder && (
                    <li>
                      <FolderOutlined aria-hidden />
                      <span className="workspace-rail-label">Working directory:</span>
                      <code>{workspace.folder}</code>
                    </li>
                  )}
                  <li>
                    <ProjectOutlined aria-hidden />
                    <span className="workspace-rail-label">Project:</span>
                    {projectName && projectId ? (
                      <Link to={`/organizations/${organizationId}/projects/${projectId}`}>{projectName}</Link>
                    ) : (
                      <span>None</span>
                    )}
                  </li>
                </ul>
                {metrics && (
                  <section className="workspace-rail-section" aria-labelledby="workspace-rail-metrics">
                    <Typography.Title level={4} id="workspace-rail-metrics">
                      Metrics{" "}
                      <span className="workspace-rail-heading-note">
                        (last {metrics.runCount === 1 ? "run" : `${metrics.runCount} runs`})
                      </span>
                    </Typography.Title>
                    <dl className="workspace-rail-metrics">
                      <div>
                        <dt>Average run duration</dt>
                        <dd>{metrics.averageDuration ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Failed runs</dt>
                        <dd>{metrics.failedRuns}</dd>
                      </div>
                      <div>
                        <dt>Last success</dt>
                        <dd>
                          {metrics.lastSuccessfulRun ? (
                            <time
                              dateTime={metrics.lastSuccessfulRun}
                              title={formatDateTime(metrics.lastSuccessfulRun)}
                            >
                              {relativeTime(metrics.lastSuccessfulRun)}
                            </time>
                          ) : (
                            "None"
                          )}
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}
                <section className="workspace-rail-section" aria-labelledby="workspace-rail-tags">
                  <Typography.Title level={4} id="workspace-rail-tags">
                    Tags
                  </Typography.Title>
                  <Tags organizationId={organizationId} workspaceId={id} manageWorkspace={manageWorkspace} />
                </section>
              </aside>
            </Col>
          </Row>
        );
      case "2":
        if (jobVisible && jobId) {
          return (
            <Suspense fallback={<LoadingFallback />}>
              <DetailsJob key={jobId} jobId={jobId} workspaceName={workspaceName} canApprove={approveJob} />
            </Suspense>
          );
        }
        if (jobs === null) {
          return <LoadingFallback />;
        }
        return <RunList jobs={jobs} templates={templates} onRunClick={changeJob} runLink={runLink} />;
      case "3":
        return (
          <Suspense fallback={<LoadingFallback />}>
            <States
              history={history}
              setStateDetailsVisible={setStateDetailsVisible}
              stateDetailsVisible={stateDetailsVisible}
              workspace={workspace}
              onRollback={workspaceReload.reload}
              manageState={manageState}
            />
          </Suspense>
        );
      case "4":
        if (variables === null || envVariables === null) {
          return <LoadingFallback />;
        }
        return (
          <Variables
            vars={variables}
            env={envVariables}
            manageWorkspace={manageWorkspace}
            collectionVars={collectionVariables}
            collectionEnvVars={collectionEnvVariables}
            globalVariables={globalVariables}
            globalEnvVariables={globalEnvVariables}
            reload={reloadVariables}
          />
        );
      case "5":
        return templates && namedSchedules ? (
          <Schedules schedules={namedSchedules} manageWorkspace={manageWorkspace} reload={workspaceReload.reload} />
        ) : (
          <p>Loading...</p>
        );
      case "7":
        return (
          <RunTriggers
            organizationId={organizationId}
            workspaceId={id}
            workspaceName={workspaceName}
            manageWorkspace={manageWorkspace}
          />
        );
      case "6":
        return (
          <Suspense fallback={<LoadingFallback />}>
            <WorkspaceSettings
              organizationId={organizationId}
              workspace={workspace}
              vcsProvider={vcsProvider}
              orgTemplates={templates ?? []}
              manageWorkspace={manageWorkspace}
              planJob={planJob}
              onWorkspaceUpdate={workspaceReload.reload}
              activeSection={settingsSection || "general"}
            />
          </Suspense>
        );
      default:
        return null;
    }
  };

  const pageBreadcrumbs = [
    { label: organizationNameLocal ?? "", path: `/organizations/${organizationId}/workspaces` },
    { label: "Workspaces", path: `/organizations/${organizationId}/workspaces` },
    { label: workspaceName, path: `/organizations/${organizationId}/workspaces/${id}` },
    ...(activeKey === "6" && settingsSection
      ? [
          { label: "Settings", path: `/organizations/${organizationId}/workspaces/${id}/settings/general` },
          { label: WORKSPACE_SETTINGS_SECTION_LABELS[settingsSection] ?? "General" },
        ]
      : [{ label: WORKSPACE_SECTION_LABELS[activeKey ?? "1"] ?? "Overview" }]),
  ];

  const isSettings = activeKey === "6";
  // Settings pages drop the header entirely; General settings shows the ID as a field.
  const showWorkspaceId = !isSettings;

  const actionWorkspace = useMemo(() => workspace && toActionWorkspace(workspace), [workspace]);

  const pageActions =
    !loading && workspace && !isSettings ? (
      <Space orientation="horizontal">
        {actions &&
          actions
            .flatMap((action): PageAction[] => {
              if (!action.displayCriteria) {
                return [action];
              }
              const settings = matchDisplayCriteria(action.displayCriteria, {
                workspace: actionWorkspace,
                state: contextState,
                resources: resources,
                apiUrl: apiUrl(""),
                settings: action.settings,
              });
              return settings ? [{ ...action, settings }] : [];
            })
            .filter((action) => action.type === "Workspace/Action")
            .map((action, index) => (
              <Suspense key={index} fallback={<LoadingFallback />}>
                <ActionLoader
                  action={action.action}
                  context={{
                    workspace: actionWorkspace,
                    state: contextState,
                    resources: resources,
                    apiUrl: apiUrl(""),
                    settings: action.settings,
                  }}
                />
              </Suspense>
            ))}
        <Button
          type="default"
          htmlType="button"
          onClick={() => confirmLockButton(workspace.locked)}
          icon={workspace.locked ? <UnlockOutlined aria-hidden /> : <LockOutlined aria-hidden />}
          disabled={!manageWorkspace}
        >
          {workspace.locked ? "Unlock" : "Lock"}
        </Button>
        <CreateJob
          changeJob={changeJob}
          planJob={planJob}
          resources={resources}
          templates={templates}
          onOpen={() => loadTemplates(workspaceRequests.current.signal)}
          disabledReason={
            workspace.source === "empty" && workspace.branch === "remote-content"
              ? "This CLI/API driven workspace has no applied configuration yet. Upload and apply a configuration with the terraform CLI/API before using Run now."
              : undefined
          }
        />
      </Space>
    ) : undefined;

  return (
    <PageWrapper
      title={workspaceName}
      showTitle={!isSettings}
      breadcrumbs={pageBreadcrumbs}
      error={
        loadError
          ? { title: loadError.includes("permission") ? "Access Denied" : "Error", message: loadError }
          : undefined
      }
      loading={!loadError && (loading || !workspace)}
      loadingText="Loading Workspace..."
      actions={pageActions}
    >
      {lockModalContext}
      {workspace && (
        <div className="orgWrapper">
          <Space className="workspace-details" orientation="vertical">
            {showWorkspaceId && (
              <Paragraph className="workspace-id" copyable={{ text: id, tooltips: false }}>
                <Typography.Text type="secondary"> ID: {id} </Typography.Text>
              </Paragraph>
            )}
            {isSettings ? null : workspace.description === "" ? (
              <Link className="workspace-button" to={workspaceSettingsPath} onClick={() => setActiveKey("6")}>
                Add workspace description
              </Link>
            ) : (
              <Typography.Text type="secondary">{workspace.description}</Typography.Text>
            )}
            {!isSettings && (
              <div className="workspace-status-strip">
                <Typography.Text>
                  {workspace.locked ? (
                    <>
                      <LockOutlined /> Locked
                    </>
                  ) : (
                    <>
                      <UnlockOutlined /> Unlocked
                    </>
                  )}
                </Typography.Text>
                <PolicyStatusTag
                  status={workspace.policyComplianceStatus}
                  organizationId={organizationId}
                  workspaceId={id}
                  clickable
                />
                <Typography.Text>
                  <ProfileOutlined /> Resources <span className="workspace-status-value">{resources.length}</span>
                </Typography.Text>
                <span className="workspace-status-iac">
                  {getIaCIconById(workspace.iacType)}
                  <Typography.Text>
                    {getIaCNameById(workspace.iacType)}{" "}
                    <Link to={workspaceSettingsPath} onClick={() => setActiveKey("6")} className="workspace-button">
                      {workspace.terraformVersion}
                    </Link>
                  </Typography.Text>
                </span>
                <Typography.Text>
                  <ClockCircleOutlined /> Updated{" "}
                  <span className="workspace-status-value">
                    {relativeTime(workspace.lastJobDate) ?? "never executed"}
                  </span>
                </Typography.Text>
                {workspace.locked && (
                  <Alert
                    className="workspace-status-lock"
                    title="Lock Description"
                    description={workspace.lockDescription}
                    type="warning"
                    showIcon
                  />
                )}
              </div>
            )}
          </Space>

          {renderSection(workspace)}
        </div>
      )}
    </PageWrapper>
  );
};
