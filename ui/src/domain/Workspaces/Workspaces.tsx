import { IconContext } from "react-icons";
import { SiTerraform } from "react-icons/si";
import { withBasePath } from "../../config/basePath";

export const genericHeader = {
  headers: {
    "Content-Type": "application/vnd.api+json",
  },
};

export { validateTerraformVersion } from "@/modules/workspaces/utils/versionValidation";

// A git URL over https or ssh, or "empty" for a CLI-driven workspace.
export const gitRepoUrlPattern = new RegExp(
  "(empty)|(((git|ssh|http(s)?)|(git@[\\w\\.\\-]+))(:(//)?)([\\w\\.@\\:/\\-~]+)(\\.git)?(/)?)"
);

export function compareVersions(a: string, b: string) {
  if (a === b) {
    return 0;
  }
  const splitA = a
    .replace("v", "")
    .split(".")
    .map((x) => parseInt(x));
  const splitB = b
    .replace("v", "")
    .split(".")
    .map((x) => parseInt(x));
  const length = Math.max(splitA.length, splitB.length);
  for (let i = 0; i < length; i++) {
    if (splitA[i] > splitB[i] || (splitA[i] === splitB[i] && isNaN(splitB[i + 1]))) {
      return 1;
    }
    if (splitA[i] < splitB[i] || (splitA[i] === splitB[i] && isNaN(splitA[i + 1]))) {
      return -1;
    }
  }
  // TODO: Check
  return -2;
}

export const atomicHeader = {
  headers: {
    "content-type": 'application/vnd.api+json;ext="https://jsonapi.org/ext/atomic"',
    accept: 'application/vnd.api+json;ext="https://jsonapi.org/ext/atomic"',
  },
};

export const getIaCIconById = (id: string) => {
  const item = iacTypes.find((iacType) => iacType.id === id);
  return item ? item.icon : null;
};
export const getIaCNameById = (id: string) => {
  const item = iacTypes.find((iacType) => iacType.id === id);
  return item ? item.name : null;
};

export const iacTypes = [
  {
    id: "terraform",
    name: "Terraform",
    description: "Create an empty template. So you can define your template from scratch.",
    icon: (
      <IconContext.Provider value={{ size: "1.4em" }}>
        <SiTerraform />
      </IconContext.Provider>
    ),
  },
  {
    id: "tofu",
    name: "OpenTofu",
    icon: <img width="18px" src={withBasePath("/providers/opentofu.png")} alt="OpenTofu" />,
  },
];
