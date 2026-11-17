import { apiUrl } from "@/config/apiUrls";
import { LeftOutlined } from "@ant-design/icons";
import { Alert, Spin } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import getUserFromStorage from "@/config/authUser";
import { axiosRegistry } from "@/config/axiosConfig";
import { isRecord } from "@/modules/utils/typeGuards";
import "./ApiDocsPage.css";

type RequestBuilder = {
  headers: { set: (name: string, value: string) => void };
};

function attachBearerToken({ requestBuilder }: { requestBuilder: RequestBuilder }) {
  const user = getUserFromStorage();
  if (user?.access_token) {
    requestBuilder.headers.set("Authorization", `Bearer ${user.access_token}`);
  }
}

export const ApiDocsPage = () => {
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    axiosRegistry
      .get<unknown>("/doc")
      .then((response) => {
        if (isRecord(response.data)) {
          setSpec(response.data);
        } else {
          setLoadFailed(true);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load API spec:", err);
        setLoadFailed(true);
      });
  }, []);

  const renderContent = () => {
    if (spec) {
      return (
        <ApiReferenceReact
          configuration={{
            content: spec,
            // The spec's `servers` entry is a relative path (Elide doesn't know its own public
            // hostname when generating it) - without this, Scalar resolves it against the docs
            // page's own origin instead of the API's.
            baseServerURL: apiUrl(""),
            onBeforeRequest: attachBearerToken,
          }}
        />
      );
    }
    if (loadFailed) {
      return <Alert type="error" title="Failed to load the API specification." showIcon />;
    }
    return (
      <div className="api-docs-loading">
        <Spin />
      </div>
    );
  };

  return (
    <div className="api-docs-page">
      <div className="api-docs-topbar">
        <Link to="/" className="api-docs-back-link">
          <LeftOutlined /> Back to Terrakube
        </Link>
      </div>
      <div className="api-docs-content">{renderContent()}</div>
    </div>
  );
};

export default ApiDocsPage;
