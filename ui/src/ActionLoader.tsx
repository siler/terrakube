import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from "react";
import { SiDocker, SiGithub, SiGooglecloud, SiGrafana, SiKubernetes, SiPrometheus, SiTerraform } from "react-icons/si";
import { VscAzure } from "react-icons/vsc";
import { antdIcons, getIcon } from "./config/iconList";
import axiosInstance from "./config/axiosConfig";
import { reportDeprecatedScope } from "./modules/actions/deprecations";
import { ActionComponent, ActionContext, isActionComponent } from "./actionComponent";

// Heavy deps (sucrase, antd, dayjs, luxon, react-markdown, react-vis)
// are loaded lazily inside loadComponent() — they would otherwise dominate the main bundle.
// Compiled components are cached by action string so re-renders skip the transpile step entirely.
const compiledComponentCache = new Map<string, ActionComponent>();
// react-icons are statically imported by name so the bundler tree-shakes them down to a
// handful of icons instead of pulling the entire react-icons/si set (~2500 icons / 5 MB).
const exposedReactIcons = {
  SiDocker,
  SiGithub,
  SiGooglecloud,
  SiGrafana,
  SiKubernetes,
  SiPrometheus,
  SiTerraform,
  VscAzure,
} as const;

// List of antd components to consider for dynamic importing
const antdComponents = [
  "Affix",
  "Anchor",
  "AutoComplete",
  "Alert",
  "Avatar",
  "BackTop",
  "Badge",
  "Breadcrumb",
  "Button",
  "Calendar",
  "Card",
  "Collapse",
  "Carousel",
  "Cascader",
  "Checkbox",
  "Col",
  "ConfigProvider",
  "DatePicker",
  "Descriptions",
  "Divider",
  "Dropdown",
  "Drawer",
  "Empty",
  "Form",
  "Input",
  "InputNumber",
  "Layout",
  "List",
  "message",
  "Menu",
  "Mentions",
  "Modal",
  "Statistic",
  "notification",
  "PageHeader",
  "Pagination",
  "Popconfirm",
  "Popover",
  "Progress",
  "Radio",
  "Rate",
  "Result",
  "Row",
  "Select",
  "Skeleton",
  "Slider",
  "Space",
  "Spin",
  "Steps",
  "Switch",
  "Table",
  "Transfer",
  "Tree",
  "TreeSelect",
  "Tabs",
  "Tag",
  "TimePicker",
  "Timeline",
  "Tooltip",
  "Typography",
  "Upload",
];

const antdIconNames = Object.keys(antdIcons).filter((name) => name.endsWith("Outlined"));

const getRequiredAntdComponents = (componentString: string) =>
  antdComponents.filter((component) => componentString.includes(component));

const getRequiredAntdIcons = (componentString: string) =>
  antdIconNames.filter((icon) => componentString.includes(icon));

const pickAntdComponents = (mod: Record<string, unknown>, names: string[]) => {
  const out: Record<string, unknown> = {};
  for (const name of names) out[name] = mod[name];
  return out;
};

const resolveAntdIcons = (names: string[]) => {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    out[name] = getIcon(name);
  }
  return out;
};

const pickReactIcons = (componentString: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(exposedReactIcons).filter(([name]) => componentString.includes(name)));

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>An error occurred while rendering this action.</div>;
    }

    return this.props.children;
  }
}

const ActionLoader = ({ action, context }: { action: string; context: ActionContext }) => {
  const [Component, setComponent] = useState<ActionComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadComponent = async () => {
      try {
        const cached = compiledComponentCache.get(action);
        if (cached) {
          if (cancelled) return;
          setComponent(() => cached);
          setError(null);
          return;
        }

        const componentString = decodeURIComponent(escape(window.atob(action)));

        // All heavy deps loaded lazily so they stay out of the main bundle.
        const [{ transform }, antd, reactVis, ReactMarkdownModule, luxon, dayjsModule] = await Promise.all([
          import("sucrase"),
          import("antd"),
          import("react-vis"),
          import("react-markdown"),
          // Deprecated for actions; only fetched for the ones that still use it.
          /\bDateTime\b/.test(componentString) ? import("luxon") : null,
          import("dayjs"),
        ]);
        await import("react-vis/dist/style.css");

        if (cancelled) return;

        const DateTime = luxon?.DateTime;
        const dayjs = dayjsModule.default;
        reportDeprecatedScope(componentString, action);
        const { default: ReactMarkdown } = ReactMarkdownModule;
        const antdExports: Record<string, unknown> = { ...antd };
        const { Panel } = antd.Collapse;
        const { Paragraph, Text } = antd.Typography;
        const { RangePicker } = antd.DatePicker;
        const { Crosshair, Hint, HorizontalGridLines, LineSeries, VerticalGridLines, XAxis, XYPlot, YAxis } = reactVis;

        const requiredAntdComponents = getRequiredAntdComponents(componentString);
        const requiredAntdIcons = getRequiredAntdIcons(componentString);

        const importedAntdComponents = pickAntdComponents(antdExports, requiredAntdComponents);
        const importedIcons = resolveAntdIcons(requiredAntdIcons);
        const importedReactIcons = pickReactIcons(componentString);

        // Bind the component before transpiling. Sucrase prepends helper
        // functions when the action uses optional chaining or nullish
        // coalescing, so the transpiled output is no longer a single
        // expression and can't be wrapped in `return (...)` afterwards.
        const componentExpression = componentString.trim().replace(/;+\s*$/, "");
        const transpiledCode = transform(`const __ActionComponent = (${componentExpression}\n);`, {
          transforms: ["jsx"],
          production: true,
        }).code;

        const scopeContext: Record<string, unknown> = {
          React,
          useEffect,
          useState,
          Panel,
          Paragraph,
          Text,
          XYPlot,
          LineSeries,
          XAxis,
          YAxis,
          Hint,
          Crosshair,
          HorizontalGridLines,
          VerticalGridLines,
          axiosInstance,
          RangePicker,
          DateTime, // deprecated, see modules/actions/deprecations.ts
          dayjs,
          ReactMarkdown,
          ...antdExports,
          ...importedAntdComponents,
          ...importedIcons,
          ...importedReactIcons,
        };

        const functionParams = Object.keys(scopeContext);
        const functionArgs = functionParams.map((key) => scopeContext[key]);

        const createComponent = new Function(...functionParams, `${transpiledCode}\nreturn __ActionComponent;`);
        const component: unknown = Reflect.apply(createComponent, undefined, functionArgs);
        if (!isActionComponent(component)) {
          throw new Error("action did not evaluate to a React component");
        }

        compiledComponentCache.set(action, component);

        if (cancelled) return;
        setComponent(() => component);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Error creating component:", err);
        setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    loadComponent();
    return () => {
      cancelled = true;
    };
  }, [action]);

  if (error) {
    return <div className="error-message">Error loading component: {error}</div>;
  }

  if (!Component) {
    return <div>Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <Component context={context} />
    </ErrorBoundary>
  );
};

export default ActionLoader;
