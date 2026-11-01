import { ButtonLink, EmptyState, PageHeader } from "../ui";

export function NotFound() {
  return (
    <>
      <PageHeader title="Nicht gefunden" back="/" />
      <main>
        <EmptyState
          icon="🔍"
          title="Seite nicht gefunden"
          text="Diese Seite gibt es nicht (mehr)."
          action={<ButtonLink to="/">Zur Startseite</ButtonLink>}
        />
      </main>
    </>
  );
}
