import { apiUrl } from "@/config/apiUrls";
import { Avatar, Col, Drawer, Row, Space, Tabs } from "antd";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { and } from "../api/rsqlFilter";
import { api, fields } from "../generated/apiPaths";
import type { Row as ApiRow } from "../api/fieldSelection";
import { Resource } from "../types.js";
import { toActionWorkspace, type WorkspacePageRow } from "./workspaceQuery";
import { getServiceIcon } from "./Icons.jsx";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import "./Workspaces.css";
import { matchDisplayCriteria } from "./actionCriteria";

const ActionLoader = lazy(() => import("../../ActionLoader"));

const DRAWER_ACTION_FIELDS = fields.action("action", "displayCriteria", "type", "label");

/** A resource drawer action, with the settings its matching display criterion attaches. */
type DrawerAction = ApiRow<typeof DRAWER_ACTION_FIELDS> & { settings?: Record<string, unknown> };

type Props = {
  open: boolean;
  setOpen: (val: boolean) => void;
  resource?: Resource;
  workspace: WorkspacePageRow;
};

export const ResourceDrawer = ({ open, resource, setOpen, workspace }: Props) => {
  const [drawerOpen, setDrawerOpen] = useState(open);
  const [actions, setActions] = useState<DrawerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const actionWorkspace = useMemo(() => toActionWorkspace(workspace), [workspace]);

  const context = {
    state: resource,
    apiUrl: apiUrl(""),
    workspace: actionWorkspace,
  };

  useEffect(() => {
    const fetchActions = async () => {
      try {
        setLoading(true);
        const fetchedActions: DrawerAction[] = await api
          .action()
          .select(DRAWER_ACTION_FIELDS)
          .where((action) =>
            and(
              action.active.eq(true),
              action.type.in(["Workspace/ResourceDrawer/Action", "Workspace/ResourceDrawer/Tab"])
            )
          );

        const filteredActions = fetchedActions.flatMap((action): DrawerAction[] => {
          if (!action.displayCriteria) {
            return [action];
          }
          const settings = matchDisplayCriteria(action.displayCriteria, context);
          return settings ? [{ ...action, settings }] : [];
        });

        setActions(filteredActions);
      } catch (error) {
        console.error("Error fetching actions:", error);
      } finally {
        setLoading(false);
      }
    };

    setDrawerOpen(open);
    // Every workspace page mounts this drawer closed; the actions only matter once it opens.
    if (open) {
      void fetchActions();
    }
  }, [open, resource]);

  const onClose = () => {
    setOpen(false);
    setDrawerOpen(false);
  };

  return (
    <Drawer
      width={640}
      title={
        resource && (
          <>
            <Avatar shape="square" size="small" src={getServiceIcon(resource.provider, resource.type)} />{" "}
            {resource.index !== undefined && resource.index !== null
              ? typeof resource.index === "string"
                ? `${resource.name}["${resource.index}"]`
                : `${resource.name}[${resource.index}]`
              : resource.name}
          </>
        )
      }
      placement="right"
      onClose={onClose}
      open={drawerOpen}
    >
      {loading ? (
        <LoadingFallback />
      ) : (
        <Suspense fallback={<LoadingFallback />}>
          <Space size={10} className="resource-drawer-body" orientation="vertical">
            <Row>
              <Col span={24}>
                <Space size={5} orientation="horizontal">
                  {actions &&
                    actions
                      .filter((action) => action.type === "Workspace/ResourceDrawer/Action")
                      .map((action, index) => (
                        <ActionLoader
                          key={index}
                          action={action.action}
                          context={{ ...context, settings: action.settings }}
                        />
                      ))}
                </Space>
              </Col>
            </Row>

            <Tabs
              defaultActiveKey="1"
              items={[
                ...actions
                  .filter((action) => action.type === "Workspace/ResourceDrawer/Tab")
                  .map((action, index) => ({
                    key: `tab-${index + 1}`,
                    label: action.label,
                    children: (
                      <ActionLoader
                        key={index}
                        action={action.action}
                        context={{ ...context, settings: action.settings }}
                      />
                    ),
                  })),
              ]}
            />
          </Space>
        </Suspense>
      )}
    </Drawer>
  );
};
