import { Form, Input, Radio, Select, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { SiGit } from "react-icons/si";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useOrganizationName } from "@/hooks/useOrganizationName";
import axios from "axios";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { createdResourceId } from "@/domain/api/parseDocument";
import { api, fields } from "../generated/apiPaths";
import type { CreateBody, Linkage } from "../api/writeBodies";
import type { Row } from "../api/fieldSelection";
import { MODULE_SYSTEM_PATTERN } from "./moduleValidation";
import PageWrapper from "@/components/layout/PageWrapper/PageWrapper";
import { PermissionErrorMessage } from "@/components/feedback/PermissionErrorMessage";
import VcsLogo from "@/components/display/VcsLogo";
import { SettingsForm } from "@/components/settings/SettingsForm";
import "../Settings/VCS.css";
import "./Module.css";

const validateMessages = {
  required: "${label} is required",
  types: {
    url: "${label} is not a valid Git URL",
  },
};

type CreateModuleForm = {
  connection: string;
  name: string;
  description: string;
  provider: string;
  source: string;
  folder?: string;
  tagPrefix?: string;
  sshKey?: string;
};

type Params = {
  orgid: string;
};

// Plain Git: no VCS connection; private repositories authenticate with an SSH key instead.
const GIT = "git";

// The form shows the connections' names and logos, and the SSH keys' names.
const SSH_FIELDS = fields.ssh("name");
const VCS_FIELDS = fields.vcs("name", "vcsType");
type SshRow = Row<typeof SSH_FIELDS>;
type VcsRow = Row<typeof VCS_FIELDS>;

export const CreateModule = () => {
  const { orgid } = useParams<Params>();
  const organizationName = useOrganizationName(orgid) ?? "";
  const [form] = Form.useForm<CreateModuleForm>();
  const connection = Form.useWatch("connection", form) ?? GIT;
  const [sshKeys, setSSHKeys] = useState<SshRow[]>([]);
  const [vcs, setVCS] = useState<VcsRow[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!orgid) return;
    api.organization(orgid).ssh().select(SSH_FIELDS).then(setSSHKeys);
    api.organization(orgid).vcs().select(VCS_FIELDS).then(setVCS);
  }, [orgid]);

  // "terraform-aws-vpc.git" names the module "vpc" for the "aws" provider; fill in what is still empty.
  const fillFromSource = () => {
    const source: unknown = form.getFieldValue("source");
    if (typeof source !== "string") return;
    const match = source.match(/terraform-([^-/]+)-([^/]+?)(?:\.git)?\/?$/);
    if (!match) return;
    if (!form.getFieldValue("provider")) form.setFieldsValue({ provider: match[1] });
    if (!form.getFieldValue("name")) form.setFieldsValue({ name: match[2] });
  };

  const onFinish = (values: CreateModuleForm) => {
    const vcsId = values.connection !== GIT ? values.connection : "";
    const sshKey = values.connection === GIT ? values.sshKey : undefined;
    const relationships: Linkage<"module"> | undefined = vcsId
      ? { vcs: { data: { type: "vcs", id: vcsId } } }
      : sshKey
        ? { ssh: { data: { type: "ssh", id: sshKey } } }
        : undefined;
    const body: CreateBody<"module"> = {
      data: {
        type: "module",
        attributes: {
          name: values.name,
          description: values.description,
          provider: values.provider,
          source: values.source,
          folder: values.folder != null ? values.folder : null,
          tagPrefix: values.tagPrefix != null ? values.tagPrefix : null,
        },
        ...(relationships && { relationships }),
      },
    };

    setSaving(true);
    axiosInstance
      .post<unknown>(`organization/${orgid}/module`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then((response) => {
        if (response.status !== 201) {
          return;
        }
        const id = createdResourceId(response.data);
        navigate(id ? `/organizations/${orgid}/registry/${id}` : `/organizations/${orgid}/registry`);
      })
      .catch((error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          message.error(<PermissionErrorMessage action="create Modules" permission="Manage Modules" />);
        } else {
          message.error(getErrorMessage(error));
        }
      })
      .finally(() => setSaving(false));
  };

  const selectedVcs = vcs.find((item) => item.id === connection);

  return (
    <PageWrapper
      title="Publish a module"
      subTitle={`The module is added to the private registry of ${organizationName}.`}
      breadcrumbs={[
        { label: organizationName, path: "/" },
        { label: "Registry", path: `/organizations/${orgid}/registry` },
        { label: "Publish module" },
      ]}
      width="form"
    >
      <SettingsForm
        form={form}
        name="create-module"
        onFinish={onFinish}
        validateMessages={validateMessages}
        initialValues={{ connection: GIT }}
        saveLabel="Publish module"
        saving={saving}
      >
        <Typography.Title level={2} className="registry-form-section">
          Source
        </Typography.Title>
        <Form.Item
          name="connection"
          label="Connection"
          extra={
            <>
              {selectedVcs
                ? `Terrakube reads the repository through the ${selectedVcs.name} connection.`
                : "Terrakube clones the repository directly. Private repositories need an SSH key."}{" "}
              <Link to={`/organizations/${orgid}/settings/vcs/new`}>Connect a new VCS provider</Link>
            </>
          }
        >
          <Radio.Group className="vcs-provider-tiles">
            <Radio value={GIT} className="vcs-provider-tile">
              <span className="vcs-provider-tile-icon" aria-hidden="true">
                <SiGit />
              </span>
              Git URL
            </Radio>
            {vcs.map((item) => (
              <Radio key={item.id} value={item.id} className="vcs-provider-tile">
                <span className="vcs-provider-tile-icon" aria-hidden="true">
                  <VcsLogo type={item.vcsType} size={28} />
                </span>
                {item.name}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
        {connection === GIT && (
          <Form.Item
            name="sshKey"
            label="SSH key"
            extra="Used to clone the repository. The repository URL must then use SSH, for example git@github.com:org/terraform-aws-vpc.git."
          >
            <Select
              allowClear
              placeholder="None, the repository is public"
              options={sshKeys.map((key) => ({ value: key.id, label: key.name ?? undefined }))}
            />
          </Form.Item>
        )}
        <Form.Item
          name="source"
          label="Repository URL"
          extra="An HTTPS or SSH Git URL. A repository named terraform-<provider>-<name> fills in the provider and name below."
          rules={[
            {
              required: true,
              pattern: new RegExp("((git|ssh|http(s)?)|(git@[\\w\\.\\-]+))(:(//)?)([\\w\\.@\\:/\\-~]+)(\\.git)?(/)?"),
            },
          ]}
        >
          <Input
            className="registry-mono-input"
            onBlur={fillFromSource}
            placeholder="https://github.com/org/terraform-aws-vpc.git"
          />
        </Form.Item>

        <Typography.Title level={2} className="registry-form-section">
          Module
        </Typography.Title>
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true }, { max: 32, message: "Use at most 32 characters" }]}
          extra="Usually what the module creates, for example vpc. It becomes part of the module address."
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="provider"
          label="Provider"
          rules={[
            { required: true },
            {
              pattern: MODULE_SYSTEM_PATTERN,
              message: "Provider must contain only letters and digits (max 64 characters).",
            },
          ]}
          extra="The last part of the module address, letters and digits only, for example aws (not aws-ecs). It is not taken from the repository name."
        >
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item
          name="folder"
          label="Folder (optional)"
          extra="The module's folder inside the repository. Leave empty when the module is at the root."
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="tagPrefix"
          label="Tag prefix (optional)"
          extra="Only tags that start with this prefix, for example vmlinux/, become versions. Leave empty unless the repository holds several modules."
        >
          <Input />
        </Form.Item>
      </SettingsForm>
    </PageWrapper>
  );
};
