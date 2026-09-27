import { useParams } from 'react-router-dom';
import { useExtensions } from '../extensions/ExtensionsProvider';
import { getBuiltinExtension } from '../extensions/registry';

/**
 * Core-owned route host for extension panels. Core keeps control:
 * the extension renders only if installed + enabled, and receives
 * nothing but its controlled ExtensionContext.
 */
export function ExtensionPanelRoute() {
  const { extensionId } = useParams<{ extensionId: string }>();
  const { extensions, loading } = useExtensions();
  const builtin = extensionId ? getBuiltinExtension(extensionId) : undefined;

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;

  const state = extensions.find((e) => e.id === extensionId);
  if (!builtin || !state || !state.enabled) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🧩</div>
          <h3>Extension not available</h3>
          <p>This extension is not installed or not enabled. Enable it from the Extensions page first.</p>
        </div>
      </div>
    );
  }

  const context = {
    extensionId: state.id,
    settings: state.settings,
    // The provider's gate is what extension code uses; route level re-checks too.
    hasPermission: (p: string) => state.grantedPermissions.includes(p as never) && state.permissions.includes(p as never),
  };
  const Panel = builtin.component;
  return <Panel context={context} />;
}
