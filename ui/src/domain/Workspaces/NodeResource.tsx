import { Avatar, Button, Card } from "antd";
import { memo } from "react";
import { HiOutlineExternalLink } from "react-icons/hi";
import { Handle, NodeProps, Position } from "reactflow";
import type { Resource, ResourceNodeData } from "../types.js";
import { getServiceIcon } from "./Icons.jsx";
import "./Workspaces.css";
const { Meta } = Card;

const NodeResource = memo(({ data, isConnectable }: NodeProps<ResourceNodeData>) => {
  const { showDrawer, ...resource } = data;
  return (
    <>
      <Handle
        type="source"
        position={Position.Top}
        className="state-diagram-handle"
        onConnect={(params) => console.log("handle onConnect", params)}
        isConnectable={isConnectable}
      />
      <Card className="state-diagram-node">
        <Meta
          avatar={GetResourceIcon(data)}
          title={
            <>
              {" "}
              <Button onClick={() => showDrawer(resource)} type="link">
                {data.name} &nbsp;
                <HiOutlineExternalLink />
              </Button>{" "}
            </>
          }
          description={data.type}
        />
      </Card>
      <Handle
        type="target"
        position={Position.Bottom}
        id="b"
        className="state-diagram-handle"
        isConnectable={isConnectable}
      />
    </>
  );
});
NodeResource.displayName = "NodeResource";

export default NodeResource;

const GetResourceIcon = (resource: Resource) => {
  const iconSource = getServiceIcon(resource.provider, resource.type);
  return <Avatar shape="square" size="large" src={iconSource} />;
};
