import { FileJpgOutlined } from "@ant-design/icons";
import { Dropdown, message } from "antd";
import { toJpeg, toPng, toSvg } from "html-to-image";
import { BsFiletypeJson, BsFiletypePng, BsFiletypeSvg } from "react-icons/bs";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";

type Props = {
  stateUrl: string;
  manageState: boolean;
};

const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 768;

export const DownloadState = ({ stateUrl, manageState }: Props) => {
  function downloadImage(dataUrl: string, fileName: string) {
    const a = document.createElement("a");
    a.setAttribute("download", fileName);
    a.setAttribute("href", dataUrl);
    a.click();
  }

  const exportDiagram = (render: typeof toPng, fileName: string, backgroundColor?: string) => {
    const diagram = document.querySelector(".react-flow__renderer");
    if (!(diagram instanceof HTMLElement)) {
      message.error("The state diagram is not shown, so it cannot be exported");
      return;
    }
    render(diagram, {
      backgroundColor,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      style: {
        width: IMAGE_WIDTH.toString(),
        height: IMAGE_HEIGHT.toString(),
      },
    })
      .then((dataUrl) => {
        downloadImage(dataUrl, fileName);
      })
      .catch((error: unknown) => {
        message.error("Exporting the state diagram failed: " + getErrorMessage(error));
      });
  };

  const downloadPNG = () => exportDiagram(toPng, "terrakube-state-diagram.png");

  const downloadJPG = () => exportDiagram(toJpeg, "terrakube-state-diagram.jpg", "white");

  const downloadSVG = () => exportDiagram(toSvg, "terrakube-state-diagram.svg");

  const downloadJSON = () => {
    axiosInstance
      .request<Blob>({ url: stateUrl, method: "GET", responseType: "blob" })
      .then((response) => {
        const href = window.URL.createObjectURL(response.data);

        const anchorElement = document.createElement("a");

        anchorElement.href = href;
        anchorElement.download = "terrakube-state.json";

        document.body.appendChild(anchorElement);
        anchorElement.click();

        document.body.removeChild(anchorElement);
        window.URL.revokeObjectURL(href);
      })
      .catch((error: unknown) => {
        message.error("Downloading the state failed: " + getErrorMessage(error));
      });
  };

  const handleButtonClick = () => {
    downloadJSON();
  };

  const handleMenuClick = (e: { key: string }) => {
    switch (e.key) {
      case "1":
        downloadJSON();
        break;
      case "2":
        downloadPNG();
        break;
      case "3":
        downloadJPG();
        break;
      case "4":
        downloadSVG();
        break;
      default:
        downloadJSON();
        break;
    }
  };

  const items = [
    {
      label: "Download JSON",
      key: "1",
      icon: <BsFiletypeJson />,
    },
    {
      label: "Download JPEG",
      key: "3",
      icon: <FileJpgOutlined />,
    },
    {
      label: "Download PNG",
      key: "2",
      icon: <BsFiletypePng />,
    },
    {
      label: "Download SVG",
      key: "4",
      icon: <BsFiletypeSvg />,
    },
  ];

  const menuProps = {
    items,
    onClick: handleMenuClick,
  };

  return (
    <Dropdown.Button menu={menuProps} onClick={handleButtonClick} disabled={!manageState}>
      Download
    </Dropdown.Button>
  );
};
