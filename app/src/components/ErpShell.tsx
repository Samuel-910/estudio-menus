import { isLeaf, routeIndex, type LeafNode, type MenuNode } from '../lib/catalog';
import type { MenuModel } from '../lib/menu';

interface Props {
  menu: MenuModel;
  expanded: Set<string>;
  route: string | null;
  header: React.ReactNode;
  banner?: React.ReactNode;
  message?: string | null;
  onToggle: (id: string, kind: 'group' | 'submenu', level: number) => void;
  onOpen: (leaf: LeafNode, source: 'menu' | 'bar', level: number) => void;
  onConfirm: () => void;
}

/** Interfaz simplificada del ERP: menú lateral jerárquico + contenido. */
export function ErpShell({ menu, expanded, route, header, banner, message, onToggle, onOpen, onConfirm }: Props) {
  const renderNode = (n: MenuNode, level: number) => {
    if (isLeaf(n)) {
      return (
        <button key={n.id} className={`menu-item level-${level} ${route === n.route ? 'active' : ''}`}
          data-kind="item" data-route={n.route} onClick={() => onOpen(n, 'menu', level)}>
          {n.title}
        </button>
      );
    }
    const open = expanded.has(n.id);
    return (
      <div key={n.id}>
        <button className={`menu-branch level-${level}`} data-kind="submenu" data-node={n.id}
          aria-expanded={open} onClick={() => onToggle(n.id, 'submenu', level)}>
          <span className="caret">{open ? '▾' : '▸'}</span>{n.title}
        </button>
        {open && n.children.map((c) => renderNode(c, level + 1))}
      </div>
    );
  };

  const info = route ? routeIndex[route] : null;

  return (
    <div className="erp">
      <aside className="erp-sidebar">
        <div className="erp-brand">ERP Artículos</div>
        {menu.bar.length > 0 && (
          <div className="erp-bar">
            <div className="erp-bar-title">Accesos rápidos</div>
            {menu.bar.map((leaf) => (
              <button key={leaf.id} className={`menu-item bar-item ${route === leaf.route ? 'active' : ''}`}
                data-kind="bar" data-route={leaf.route} onClick={() => onOpen(leaf, 'bar', 1)}>
                ★ {leaf.title}
              </button>
            ))}
          </div>
        )}
        <nav className="erp-menu">
          {menu.groups.map((g) => {
            const open = expanded.has(g.id);
            return (
              <div key={g.id} className="menu-group">
                <button className="menu-group-btn" data-kind="group" data-node={g.id} aria-expanded={open}
                  onClick={() => onToggle(g.id, 'group', 1)}>
                  <span className="caret">{open ? '▾' : '▸'}</span>{g.title}
                </button>
                {open && g.children.map((c) => renderNode(c, 2))}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="erp-main">
        <header className="erp-header">{header}</header>
        {banner}
        <section className="erp-content">
          {!info && (
            <div className="erp-home">
              <h2>Inicio</h2>
              <p>Usa el menú de la izquierda para abrir la función indicada.</p>
            </div>
          )}
          {info && (
            <div className="erp-page">
              <div className="breadcrumb">{info.path.join(' › ')}</div>
              <h2>{info.title}</h2>
              <div className="fake-form">
                <label>Fecha<input disabled value={new Date().toLocaleDateString('es-PE')} /></label>
                <label>Código<input disabled value="000123" /></label>
                <label>Observación<input disabled value="—" /></label>
              </div>
              <button className="btn primary" data-action="confirm" onClick={onConfirm}>Confirmar</button>
              {message && <div className="warn">{message}</div>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
