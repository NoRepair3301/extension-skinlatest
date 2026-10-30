import { Component, type ComponentChildren } from "preact";
import { Banner, Button } from "./components.tsx";
import { S } from "./strings.ts";

interface Props {
  children?: ComponentChildren;
  /** Puts the page back as it was. Shown as "Restore this page" when given (the popup). */
  onRestore?: () => Promise<void>;
  /** Reload the panel; defaults to location.reload. */
  onReload?: () => void;
}

interface State {
  failed: boolean;
  note: string;
}

/** A crash in our own UI shows a calm message and the way out, never a blank panel. Nothing about the crash is logged or sent. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, note: "" };

  static override getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  private restore = async () => {
    try {
      await this.props.onRestore?.();
      this.setState({ note: S.boundary.restored });
    } catch {
      this.setState({ note: S.boundary.restoreFailed });
    }
  };

  private reload = () => (this.props.onReload ?? (() => location.reload()))();

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="ui-boundary" role="alert">
        <Banner tone="error">{S.boundary.message}</Banner>
        <div class="ui-row">
          {this.props.onRestore && <Button kind="primary" onClick={() => void this.restore()}>{S.boundary.restore}</Button>}
          <Button onClick={this.reload}>{S.boundary.reload}</Button>
        </div>
        <p role="status">{this.state.note}</p>
      </div>
    );
  }
}
