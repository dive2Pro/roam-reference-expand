import { extension_helper } from "./helper";
import { init } from "./reference-expand";
import "./style.css";

function onload({ extensionAPI }: { extensionAPI: RoamExtensionAPI }) {
  init(extensionAPI);
}

function onunload() {
  extension_helper.uninstall();
}

export default {
  onload,
  onunload,
};
