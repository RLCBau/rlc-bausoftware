import { NavLink } from "react-router-dom";

export type SidebarSection = {
  id: string;
  title: string;
  emoji?: string;
  subs: {
    id: string;
    title: string;
  }[];
};

type Props = {
  sections: SidebarSection[];
};

export default function Sidebar({ sections }: Props) {
  return (
    <aside
      style={{
        width: 300,
        padding: 12,
        borderRight: "1px solid var(--border)",
        height: "100vh",
        overflowY: "auto",
      }}
    >
      {sections.map((section) => (
        <div key={section.id} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {section.emoji ? `${section.emoji} ` : ""}
            {section.title}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {section.subs.map((sub) => (
              <li key={sub.id} style={{ marginBottom: 6 }}>
                <NavLink
                  to={`/${section.id}/${sub.id}`}
                  className={({ isActive }) =>
                    `link ${isActive ? "active" : ""}`
                  }
                >
                  {sub.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}





