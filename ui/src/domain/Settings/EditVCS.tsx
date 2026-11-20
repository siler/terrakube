import { Form, Input, Spin, message } from "antd";
import { useEffect, useState } from "react";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import type { FormValues, UpdateBody, WriteAttributes } from "../api/writeBodies";
import { VcsConnectionType } from "../generated/apiResources";
import { VcsTypeExtended } from "../types";
import "./Settings.css";
import "./components/ResourceCard.css";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { IdField } from "@/components/settings/IdField";
import {
  getCallbackUrl,
  getClientIdName,
  getDocsUrl,
  getSecretIdName,
  getVcsTypeExtended,
  usesFixedUrls,
  validatePrivateKeyFormat,
  validateUrlFormat,
  vcsLabel,
} from "./vcsProviders";

type Props = {
  vcsId: string;
  setMode: (mode: "list" | "new" | "edit") => void;
  loadVCS: () => void;
};

type EditVcsForm = Pick<FormValues<"vcs">, "name" | "clientId" | "clientSecret" | "privateKey" | "endpoint" | "apiUrl">;

// Only what the form reads; the secrets stay blank on load, so they are not requested.
const VCS_EDIT_FIELDS = fields.vcs("name", "vcsType", "connectionType", "endpoint", "apiUrl", "clientId", "callback");

export const EditVCS = ({ vcsId, setMode, loadVCS }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vcsTypeExtended, setVcsTypeExtended] = useState<VcsTypeExtended>(VcsTypeExtended.GITHUB);
  const [connectionType, setConnectionType] = useState<VcsConnectionType>(VcsConnectionType.OAUTH);
  const [callbackId, setCallbackId] = useState(vcsId);
  const [form] = Form.useForm<EditVcsForm>();

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const vcs = await api.organization(orgid).vcs(vcsId).select(VCS_EDIT_FIELDS);
        const connectionType = vcs.connectionType;
        setVcsTypeExtended(getVcsTypeExtended(vcs.vcsType, connectionType, vcs.endpoint));
        setConnectionType(connectionType);
        setCallbackId(vcs.callback ?? vcsId);
        form.setFieldsValue({
          name: vcs.name,
          endpoint: vcs.endpoint ?? "",
          apiUrl: vcs.apiUrl ?? "",
          clientId: vcs.clientId ?? "",
          clientSecret: "",
          privateKey: "",
        });
      } catch (err) {
        message.error(`Could not load the VCS provider: ${getErrorMessage(err)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [vcsId]);

  const fixedUrls = usesFixedUrls(vcsTypeExtended);

  const onFinish = async (values: EditVcsForm) => {
    const attributes: WriteAttributes<"vcs"> = {
      name: values.name,
      endpoint: fixedUrls ? undefined : values.endpoint,
      apiUrl: fixedUrls ? undefined : values.apiUrl,
      clientId: values.clientId,
    };
    if (connectionType === VcsConnectionType.OAUTH && values.clientSecret) {
      attributes.clientSecret = values.clientSecret;
    }
    if (connectionType === VcsConnectionType.STANDALONE && values.privateKey) {
      attributes.privateKey = values.privateKey;
    }

    setSaving(true);
    const body: UpdateBody<"vcs"> = { data: { type: "vcs", id: vcsId, attributes } };
    try {
      await axiosInstance.patch(`organization/${orgid}/vcs/${vcsId}`, body, {
        headers: { "Content-Type": "application/vnd.api+json" },
      });
      message.success("VCS provider updated");
      loadVCS();
      setMode("list");
    } catch (err: unknown) {
      message.error(`Could not update the VCS provider: ${getErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const secretHidden =
    connectionType !== VcsConnectionType.OAUTH ||
    vcsTypeExtended === VcsTypeExtended.AZURE_DEVOPS ||
    vcsTypeExtended === VcsTypeExtended.AZURE_DEVOPS_SERVER;
  const label = vcsLabel(vcsTypeExtended);

  return (
    <Spin spinning={loading}>
      <SettingsPageHeader
        docUrl={getDocsUrl(vcsTypeExtended)}
        title="Edit VCS provider"
        description={`Update the ${label} credentials Terrakube uses to read your repositories.`}
        divider={false}
      />
      <SettingsForm form={form} onFinish={onFinish} saveLabel="Update VCS provider" saving={saving}>
        <IdField id="vcs-id" value={vcsId} copiedMessage="VCS provider ID copied" />
        <IdField id="vcs-callback-url" label="Callback URL" value={getCallbackUrl(callbackId)} />
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="clientId"
          label={getClientIdName(vcsTypeExtended, connectionType)}
          rules={[{ required: true, message: `${getClientIdName(vcsTypeExtended, connectionType)} is required` }]}
        >
          <Input className="resource-mono" />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label="HTTPS URL"
          hidden={fixedUrls}
          rules={[{ required: !fixedUrls, message: "HTTPS URL is required" }, { validator: validateUrlFormat }]}
        >
          <Input className="resource-mono" />
        </Form.Item>
        <Form.Item
          name="apiUrl"
          label="API URL"
          hidden={fixedUrls}
          rules={[{ required: !fixedUrls, message: "API URL is required" }, { validator: validateUrlFormat }]}
        >
          <Input className="resource-mono" />
        </Form.Item>
        <Form.Item
          name="clientSecret"
          label={getSecretIdName(vcsTypeExtended, connectionType)}
          hidden={secretHidden}
          extra="Leave blank to keep the current secret."
        >
          <Input.Password className="resource-mono" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="privateKey"
          label={getSecretIdName(vcsTypeExtended, connectionType)}
          hidden={connectionType === VcsConnectionType.OAUTH}
          extra="Leave blank to keep the current private key."
          rules={[{ validator: validatePrivateKeyFormat }]}
        >
          <Input.TextArea className="resource-mono" placeholder="-----BEGIN PRIVATE KEY-----" rows={8} />
        </Form.Item>
      </SettingsForm>
    </Spin>
  );
};
