import { Component, type ComponentChildren } from "preact";
import { Banner, Button } from "./components.tsx";

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
      this.setState({ note: "This page was restored." });
    } catch {
      this.setState({ note: "Couldn't restore this page. Reload it to get the original back." });
    }
  };

  private reload = () => (this.props.onReload ?? (() => location.reload()))();

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="ui-boundary" role="alert">
        <Banner tone="error">Something went wrong in Skinly AI. Your page has not been changed by this.</Banner>
        <div class="ui-row">
          {this.props.onRestore && <Button kind="primary" onClick={() => void this.restore()}>Restore this page</Button>}
          <Button onClick={this.reload}>Reload this panel</Button>
        </div>
        <p role="status">{this.state.note}</p>
      </div>
    );
  }
}
