import { useEffect, useState } from 'react'
import type { TreeNode, WorkspaceRoot } from '../app/types'
import { fileNameFromPath } from '../lib/document'

type WorkspaceSidebarProps = {
  workspaces: WorkspaceRoot[]
  selectedPath: string | null
  recents: {
    files: string[]
    workspaces: string[]
  }
  onActivateNode: (node: TreeNode) => void | Promise<void>
  onSelectPath: (path: string) => void
  onOpenWorkspace: () => void
  onOpenRecentPath: (path: string) => void | Promise<void>
  onCreateNote: (path: string) => void
  onCreateFolder: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
}

type ContextMenu = {
  x: number
  y: number
  path: string
  isWorkspaceRoot: boolean
}

export function WorkspaceSidebar({
  workspaces,
  selectedPath,
  recents,
  onActivateNode,
  onSelectPath,
  onOpenWorkspace,
  onOpenRecentPath,
  onCreateNote,
  onCreateFolder,
  onRename,
  onDelete,
}: WorkspaceSidebarProps) {
  const [menu, setMenu] = useState<ContextMenu | null>(null)

  useEffect(() => {
    if (!menu) {
      return
    }

    const onAnyClick = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('mousedown', onAnyClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onAnyClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const recentPaths = [...recents.workspaces, ...recents.files].slice(0, 8)

  return (
    <div className="workspace-sidebar">
      <section className="sidebar-card">
        <div className="sidebar-card__head">
          <h3>Folders</h3>
          <button type="button" className="ghost-button ghost-button--sm" onClick={onOpenWorkspace}>
            Open
          </button>
        </div>

        {workspaces.length === 0 ? (
          <p className="sidebar-empty">No folders open.</p>
        ) : (
          <div>
            {workspaces.map((workspace) => (
              <div key={workspace.path} className="workspace-root">
                <button
                  type="button"
                  className="workspace-root__name"
                  data-active={selectedPath === workspace.path}
                  onClick={() => onSelectPath(workspace.path)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onSelectPath(workspace.path)
                    setMenu({
                      x: event.clientX,
                      y: event.clientY,
                      path: workspace.path,
                      isWorkspaceRoot: true,
                    })
                  }}
                >
                  {workspace.name}
                </button>
                <WorkspaceTree
                  nodes={workspace.tree}
                  selectedPath={selectedPath}
                  onActivateNode={onActivateNode}
                  onSelectPath={onSelectPath}
                  onContextMenu={(event, node) => {
                    event.preventDefault()
                    onSelectPath(node.path)
                    setMenu({
                      x: event.clientX,
                      y: event.clientY,
                      path: node.path,
                      isWorkspaceRoot: false,
                    })
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {recentPaths.length > 0 && (
        <section className="sidebar-card">
          <div className="sidebar-card__head">
            <h3>Recent</h3>
          </div>
          <div className="recent-list">
            {recentPaths.map((path) => (
              <button
                key={path}
                type="button"
                title={path}
                onClick={() => void onOpenRecentPath(path)}
              >
                {fileNameFromPath(path)}
              </button>
            ))}
          </div>
        </section>
      )}

      {menu && (
        <div
          role="menu"
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCreateNote(menu.path)
              setMenu(null)
            }}
          >
            New note
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCreateFolder(menu.path)
              setMenu(null)
            }}
          >
            New folder
          </button>
          {!menu.isWorkspaceRoot && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRename(menu.path)
                setMenu(null)
              }}
            >
              Rename…
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDelete(menu.path)
              setMenu(null)
            }}
          >
            {menu.isWorkspaceRoot ? 'Remove from sidebar' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

type WorkspaceTreeProps = {
  nodes: TreeNode[]
  selectedPath: string | null
  onActivateNode: (node: TreeNode) => void | Promise<void>
  onSelectPath: (path: string) => void
  onContextMenu: (event: React.MouseEvent, node: TreeNode) => void
}

function WorkspaceTree({
  nodes,
  selectedPath,
  onActivateNode,
  onSelectPath,
  onContextMenu,
}: WorkspaceTreeProps) {
  return (
    <ul className="workspace-tree">
      {nodes.map((node) => (
        <li key={node.path} className="tree-node">
          <button
            type="button"
            className="tree-node__button"
            data-active={selectedPath === node.path}
            onClick={() => {
              onSelectPath(node.path)
              void onActivateNode(node)
            }}
            onContextMenu={(event) => onContextMenu(event, node)}
          >
            <span className="tree-node__glyph">{node.kind === 'directory' ? '▾' : '·'}</span>
            <span className="tree-node__label">{node.name}</span>
          </button>
          {node.kind === 'directory' && node.children.length > 0 && (
            <div className="tree-node__children">
              <WorkspaceTree
                nodes={node.children}
                selectedPath={selectedPath}
                onActivateNode={onActivateNode}
                onSelectPath={onSelectPath}
                onContextMenu={onContextMenu}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
