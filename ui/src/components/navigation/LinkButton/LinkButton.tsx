import { Button } from "antd";
import type { ButtonProps } from "antd";
import { useHref, useNavigate } from "react-router-dom";

type Props = Omit<ButtonProps, "href"> & {
  to: string;
};

export default function LinkButton({ to, onClick, ...buttonProps }: Props) {
  const href = useHref(to);
  const navigate = useNavigate();

  return (
    <Button
      {...buttonProps}
      href={buttonProps.disabled ? undefined : href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
