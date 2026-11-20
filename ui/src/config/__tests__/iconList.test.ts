import { CheckOutlined } from "@ant-design/icons";
import { FaBuilding } from "react-icons/fa6";
import { FallbackIcon, getFaIcon, getIcon } from "../iconList";

describe("getIcon", () => {
  it("returns the named Ant Design icon", () => {
    expect(getIcon("CheckOutlined")).toBe(CheckOutlined);
  });

  it("falls back for unknown names", () => {
    expect(getIcon("NoSuchIcon")).toBe(FallbackIcon);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "falls back for inherited property name %s",
    (name) => {
      expect(getIcon(name)).toBe(FallbackIcon);
    }
  );
});

describe("getFaIcon", () => {
  it("returns the named FontAwesome icon", () => {
    expect(getFaIcon("FaBuilding")).toBe(FaBuilding);
  });

  it.each(["constructor", "toString", "__proto__", "valueOf"])("falls back for inherited property name %s", (name) => {
    expect(getFaIcon(name)).toBe(FallbackIcon);
  });
});
