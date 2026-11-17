import { GitlabOutlined, GithubOutlined } from "@ant-design/icons";
import { IconContext } from "react-icons";
import { SiBitbucket, SiGit } from "react-icons/si";
import { VscAzureDevops } from "react-icons/vsc";
import { VcsTypeOrUnknown } from "@/domain/types";
import "./VcsLogo.css";

type Props = {
  type?: VcsTypeOrUnknown;
  size?: number;
};

export default function VcsLogo({ type, size = 18 }: Props) {
  // size is a prop, so it reaches the stylesheet as a custom property.
  const sizeVar: React.CSSProperties = { "--vcs-logo-size": `${size}px` };
  switch (type) {
    case VcsTypeOrUnknown.GITLAB:
      return <GitlabOutlined className="vcs-logo-icon" style={sizeVar} />;
    case VcsTypeOrUnknown.BITBUCKET:
      return (
        <IconContext.Provider value={{ size: `${size}px` }}>
          <SiBitbucket />
          &nbsp;
        </IconContext.Provider>
      );
    case VcsTypeOrUnknown.AZURE_DEVOPS:
      return (
        <IconContext.Provider value={{ size: `${size}px` }}>
          <VscAzureDevops />
          &nbsp;
        </IconContext.Provider>
      );
    case VcsTypeOrUnknown.GITHUB:
      return <GithubOutlined className="vcs-logo-icon" style={sizeVar} />;

    default:
      return <SiGit size={size} />;
  }
}
