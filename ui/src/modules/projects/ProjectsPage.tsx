import { Button, Flex, Form, Input, Modal, Table, message, type TableColumnsType } from "antd";
import axios from "axios";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageWrapper from "@/components/layout/PageWrapper/PageWrapper";
import projectService, { type Project } from "./projectService";
import useApiRequest from "@/modules/api/useApiRequest";
import { ORGANIZATION_NAME } from "../../config/actionTypes";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { PermissionErrorMessage } from "@/components/feedback/PermissionErrorMessage";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import { isRecord } from "@/modules/utils/typeGuards";
import "./Projects.css";

type Props = {
  organizationName: string;
  setOrganizationName: React.Dispatch<React.SetStateAction<string>>;
};

type ProjectForm = {
  name: string;
  description?: string;
};

export default function ProjectsPage({ organizationName, setOrganizationName }: Props) {
  const id = useRequiredParam("id");
  const { permissions } = useOrgPermissions(id);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<ProjectForm>();

  const { loading, execute, error } = useApiRequest({
    action: () => projectService.listProjects(id),
    onReturn: (data) => {
      setProjects(data);
      setCurrentPage(1);
      const stored = sessionStorage.getItem(ORGANIZATION_NAME);
      if (stored) setOrganizationName(stored);
    },
  });

  useEffect(() => {
    execute();
  }, [id]);

  const openCreate = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await projectService.createProject(id, values);
      setSearch("");
      message.success("Project created");
      setModalOpen(false);
      execute();
    } catch (err) {
      // antd rejects validateFields with the field errors, which the form already shows inline.
      if (isRecord(err) && err.errorFields) {
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        message.error(<PermissionErrorMessage action="create projects" permission="Manage Workspaces" />);
      } else {
        message.error(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumnsType<Project> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_, record) => (
        <Button type="link" className="projects-name-link">
          <Link to={`/organizations/${id}/projects/${record.id}`}>{record.name}</Link>
        </Button>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
  ];

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(normalizedSearch));

  return (
    <PageWrapper
      title="Projects"
      subTitle={`Projects in the ${organizationName} organization`}
      loadingText="Loading projects..."
      loading={loading}
      error={error}
      breadcrumbs={[
        { label: organizationName, path: "/" },
        { label: "Projects", path: `/organizations/${id}/projects` },
      ]}
      actions={
        <Button icon={<PlusOutlined />} type="primary" onClick={openCreate} disabled={!permissions.manageWorkspace}>
          New project
        </Button>
      }
    >
      {!loading && projects.length === 0 ? (
        <Flex justify="center">
          <EmptyState description="You have not created any projects yet. Projects let you group related workspaces together.">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!permissions.manageWorkspace}>
              Create a new project
            </Button>
          </EmptyState>
        </Flex>
      ) : (
        <>
          <Input
            aria-label="Search projects by name"
            placeholder="Search projects"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            allowClear
            className="projects-search-input"
          />
          <Table
            dataSource={filteredProjects}
            columns={columns}
            rowKey="id"
            locale={{ emptyText: <EmptyState description="No projects found" /> }}
            pagination={{
              showSizeChanger: true,
              defaultPageSize: 10,
              current: currentPage,
              onChange: setCurrentPage,
            }}
          />
        </>
      )}
      <Modal
        title="New project"
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="Create"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
}
