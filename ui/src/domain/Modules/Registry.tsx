import { Flex, Input, Pagination, Segmented, Spin, Typography } from "antd";
import { CloudUploadOutlined, ExportOutlined, SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import PageWrapper from "@/components/layout/PageWrapper/PageWrapper";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/navigation/LinkButton";
import { ModuleList } from "./ModuleList";
import ModuleTable from "./components/ModuleTable";
import { ProviderList } from "../Providers/ProviderList";
import ProviderTable from "../Providers/components/ProviderTable";
import { ORGANIZATION_ARCHIVE, ORGANIZATION_NAME } from "../../config/actionTypes";
import { api } from "../generated/apiPaths";
import { FlatModule, MODULE_FIELDS } from "./moduleFields";
import { FlatProvider, PROVIDER_FIELDS } from "../Providers/providerFields";
import { useOrganizationName } from "@/hooks/useOrganizationName";
import { ErrorInformation } from "@/modules/api/types";
import ListViewToggle from "@/components/display/ListViewToggle/ListViewToggle";
import { getStoredListViewMode, ListViewMode } from "@/components/display/ListViewToggle/listViewPreference";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { compareVersionsDesc } from "./registryHelpers";
import "./Module.css";

const PAGE_SIZE = 10;

const matches = (item: { name: string; description?: string | null }, filter: string) =>
  item.name.toLowerCase().includes(filter) || !!item.description?.toLowerCase().includes(filter);

type Params = {
  orgid: string;
};

type RegistryTab = "modules" | "providers";

// Pairs each tab with its own row type so the list components get correctly typed rows without casts.
type RegistryView =
  | { kind: "modules"; total: number; filtered: FlatModule[] }
  | { kind: "providers"; total: number; filtered: FlatProvider[] };

type Props = {
  organizationName: string;
  setOrganizationName: React.Dispatch<React.SetStateAction<string>>;
};

async function fetchModules(orgId: string): Promise<FlatModule[]> {
  return api.organization(orgId).module().select(MODULE_FIELDS);
}

async function fetchProviders(orgId: string): Promise<FlatProvider[]> {
  const providers = await api.organization(orgId).provider().select(PROVIDER_FIELDS);
  return providers.map(({ version, ...provider }) => ({
    ...provider,
    latestVersion: (version ?? []).map((v) => v.versionNumber).sort(compareVersionsDesc)[0],
  }));
}

export const Registry = ({ setOrganizationName, organizationName }: Props) => {
  const { orgid } = useParams<Params>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);
  // undefined until the tab's data has been fetched
  const [modules, setModules] = useState<FlatModule[]>();
  const [providers, setProviders] = useState<FlatProvider[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorInformation | undefined>(undefined);
  const [listViewMode, setListViewMode] = useState<ListViewMode>(() => getStoredListViewMode());
  const { permissions } = useOrgPermissions();

  // Track which data has been loaded to avoid re-fetching
  const modulesLoaded = useRef(false);
  const providersLoaded = useRef(false);

  const activeTab: RegistryTab = searchParams.get("tab") === "providers" ? "providers" : "modules";
  const fetchedOrganizationName = useOrganizationName(orgid);

  useEffect(() => {
    if (fetchedOrganizationName) {
      sessionStorage.setItem(ORGANIZATION_NAME, fetchedOrganizationName);
      setOrganizationName(fetchedOrganizationName);
    }
  }, [fetchedOrganizationName]);

  const loadModules = useCallback(async () => {
    if (!orgid || modulesLoaded.current) return;
    try {
      const data = await fetchModules(orgid);
      setModules(data);
      modulesLoaded.current = true;
    } catch (err) {
      console.error("Failed to load modules:", err);
      setError({ title: "Failed to load modules" });
    }
  }, [orgid]);

  const loadProviders = useCallback(async () => {
    if (!orgid || providersLoaded.current) return;
    try {
      const data = await fetchProviders(orgid);
      setProviders(data);
      providersLoaded.current = true;
    } catch (err) {
      console.error("Failed to load providers:", err);
      setError({ title: "Failed to load providers" });
    }
  }, [orgid]);

  // On mount: fetch data for the active tab
  useEffect(() => {
    if (!orgid) return;
    sessionStorage.setItem(ORGANIZATION_ARCHIVE, orgid);
    modulesLoaded.current = false;
    providersLoaded.current = false;

    const init = async () => {
      setLoading(true);
      setError(undefined);
      try {
        if (activeTab === "providers") {
          setProviders(await fetchProviders(orgid));
          providersLoaded.current = true;
        } else {
          setModules(await fetchModules(orgid));
          modulesLoaded.current = true;
        }
      } catch {
        setError({ title: "Failed to load registry data" });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [orgid]);

  // Lazy load the other tab's data on first switch, whether from the control or Back/Forward.
  useEffect(() => {
    if (loading) return;
    if (activeTab === "providers") {
      loadProviders();
    } else {
      loadModules();
    }
  }, [activeTab, loading, loadModules, loadProviders]);

  const handleTabChange = (key: RegistryTab) => {
    setSearchParams({ tab: key });
    setPage(1);
  };

  const filter = searchFilter.trim().toLowerCase();
  const isModules = activeTab === "modules";
  const buildView = (): RegistryView | undefined => {
    if (isModules) {
      return modules && { kind: "modules", total: modules.length, filtered: modules.filter((m) => matches(m, filter)) };
    }
    return (
      providers && {
        kind: "providers",
        total: providers.length,
        filtered: providers.filter((p) => matches(p, filter)),
      }
    );
  };
  const view = buildView();
  const pageOf = <T,>(rows: T[]) => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const noun = isModules ? "modules" : "providers";

  const publishButton = permissions.manageModule && (
    <LinkButton type="primary" icon={<CloudUploadOutlined />} to={`/organizations/${orgid}/registry/create`}>
      Publish module
    </LinkButton>
  );
  const searchButton = (type?: "primary") => (
    <LinkButton
      type={type}
      icon={<SearchOutlined />}
      to={`/organizations/${orgid}/registry/search${isModules ? "" : "?tab=providers"}`}
    >
      Search public registry
    </LinkButton>
  );

  const renderItems = () => {
    if (!view) return <Spin className="registry-loading" />;
    if (view.total === 0) {
      return (
        <EmptyState
          description={
            isModules
              ? `There are no modules in ${organizationName} yet. Publish one from a Git repository, or add one from the public registry.`
              : `There are no providers in ${organizationName} yet. Add one from the public registry.`
          }
        >
          {isModules && publishButton ? publishButton : searchButton("primary")}
        </EmptyState>
      );
    }
    if (view.filtered.length === 0) {
      return <EmptyState description={`No ${noun} match "${searchFilter.trim()}".`} />;
    }
    if (listViewMode === "compact") {
      return view.kind === "modules" ? (
        <ModuleTable modules={view.filtered} />
      ) : (
        <ProviderTable providers={view.filtered} />
      );
    }
    return (
      <>
        {view.kind === "modules" ? (
          <ModuleList modules={pageOf(view.filtered)} />
        ) : (
          <ProviderList providers={pageOf(view.filtered)} />
        )}
        <Pagination
          className="registry-pagination"
          current={page}
          pageSize={PAGE_SIZE}
          total={view.filtered.length}
          onChange={setPage}
          hideOnSinglePage
        />
      </>
    );
  };

  return (
    <PageWrapper
      title="Registry"
      loadingText="Loading registry..."
      loading={loading}
      error={error}
      breadcrumbs={[
        { label: organizationName, path: "/" },
        { label: "Registry", path: `/organizations/${orgid}/registry` },
      ]}
      actions={
        <Flex gap="small" align="center" wrap>
          {searchButton()}
          {publishButton}
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary" className="registry-intro">
        Private modules and providers that workspaces in {organizationName} can use.{" "}
        <Typography.Link
          href="https://docs.terrakube.io/user-guide/private-registry"
          target="_blank"
          rel="noopener noreferrer"
        >
          Documentation <ExportOutlined aria-label="opens in a new tab" />
        </Typography.Link>
      </Typography.Paragraph>
      <div className="registry-filter">
        <Segmented<RegistryTab>
          aria-label="Show"
          value={activeTab}
          onChange={handleTabChange}
          options={[
            { label: "Modules", value: "modules" },
            { label: "Providers", value: "providers" },
          ]}
        />
        <Input
          aria-label={`Search ${noun}`}
          placeholder={`Search ${noun} by name or description`}
          prefix={<SearchOutlined />}
          allowClear
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value);
            setPage(1);
          }}
          className="registry-search"
        />
        <ListViewToggle value={listViewMode} onChange={setListViewMode} />
      </div>
      {view && view.total > 0 && (
        <Typography.Title level={2} className="registry-count">
          {isModules ? "Modules" : "Providers"} ({view.filtered.length})
        </Typography.Title>
      )}
      {renderItems()}
    </PageWrapper>
  );
};
