type Props = {
  breadcrumb?: string;
  title: string;
  subtitle?: string;
};

export default function PageHeader({ breadcrumb, title, subtitle }: Props) {
  return (
    <header className="rlc-page-hero">
      {breadcrumb ? <div className="rlc-page-hero__eyebrow">{breadcrumb}</div> : null}
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}
