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
    <aside className="rlc-migrated-ui-sidebar-tsx-1574">







      
      {sections.map((section) =>
      <div key={section.id} className="rlc-migrated-ui-sidebar-tsx-1575">
          <div className="rlc-migrated-ui-sidebar-tsx-1576">
            {section.emoji ? `${section.emoji} ` : ""}
            {section.title}
          </div>

          <ul className="rlc-migrated-ui-sidebar-tsx-1577">
            {section.subs.map((sub) =>
          <li key={sub.id} className="rlc-migrated-ui-sidebar-tsx-1578">
                <NavLink
              to={`/${section.id}/${sub.id}`}
              className={({ isActive }) =>
              `link ${isActive ? "active" : ""}`
              }>
              
                  {sub.title}
                </NavLink>
              </li>
          )}
          </ul>
        </div>
      )}
    </aside>);

}
