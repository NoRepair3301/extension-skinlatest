import { render } from "preact";
import { Popup } from "./Popup.tsx";
import "../../ui/tokens.css";
import "../../ui/ui.css";
import "./popup.css";

render(<Popup />, document.getElementById("app")!);
