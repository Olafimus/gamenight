import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IoArrowBack } from "react-icons/io5";
import logo from "../assets/brand/logo-icon.png";
import styles from "./PageHeader.module.css";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";

export interface PageHeaderProps {
  title: string;
  /** Show a back button. A string navigates there; true navigates one step back in history. */
  back?: string | boolean;
  /** Right-aligned actions (IconButtons, Dropdown trigger ...). */
  actions?: ReactNode;
}

/** Sticky page header: logo icon + gold wordmark (home link) left, title, optional back button and actions. */
export function PageHeader({ title, back, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className={styles.header}>
      {back ? (
        <IconButton label="Zurück" onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}>
          <IoArrowBack />
        </IconButton>
      ) : null}
      <Tooltip content="Zur Startseite" side="bottom">
        <Link to="/" className={styles.logo} aria-label="Gamenight – zur Startseite">
          <img src={logo} alt="" />
          <span className={styles.wordmark} aria-hidden="true">
            Gamenight
          </span>
        </Link>
      </Tooltip>
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
