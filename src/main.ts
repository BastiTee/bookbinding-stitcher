import "./style.css";
import { GridModel } from "./model";
import { buildUI } from "./ui";

const model = new GridModel({ width: 150, height: 40 });
buildUI(document.querySelector<HTMLDivElement>("#app")!, model);
