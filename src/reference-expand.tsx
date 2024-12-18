import { extension_helper } from "./helper";
import ReactDOM from "react-dom";
import { Menu, MenuItem } from "@blueprintjs/core";
require("arrive");
import createOverlayObserver from "roamjs-components/dom/createOverlayObserver";
import {
  MouseEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createOrGetBlockByTextInParentUid,
  createOrgetBlockChildrenByUid,
  createOrGetPageByName,
  getBlockTextByUid,
  onRouteChange,
} from "./roam-utils";
import { queryBlockDomFromRefDom } from "./roam-dom";

const log = (...args: any[]) => {
  if (logEnabled) console.log(...args);
};

const logEnabled = false;

const combineString = (ary: string[]) => {
  log(ary, " = ary ");
  return ary.join("");
};

export const getStrFromUid = (uid: string) => {
  const result = window.roamAlphaAPI.data.pull("[*]", [":block/uid", `${uid}`]);
  return result[":node/title"] || result[":block/string"];
};

type ReversePullBlock = {
  ":block/uid": string;
  ":block/string": string;
  ":node/title": string;
  ":block/_children": ReversePullBlock[];
};

const getStrFromParentsOf = (blockUid: string): string[] => {
  const result = window.roamAlphaAPI.pull(
    `
        [
            :block/uid
            :block/string
            :node/title
            {:block/_children ...}
        ]
    `,
    [":block/uid", `${blockUid}`]
  ) as unknown as ReversePullBlock;

  if (result) {
    let strs: string[] = [];
    let ary = result[":block/_children"];
    while (ary && ary.length) {
      const block = ary[0];
      strs.unshift(block[":block/string"] || block[":node/title"]);
      ary = block[":block/_children"];
    }
    return strs;
  }
  return [];
};

const lookdownStrByBlockUid = (uid: string, level: number) => {
  //   const result = lookdownBlockWithLevelStructureByBlock(uid, level);
};
const lookupStrByBlockUid = (uid: string, level: number) => {
  const strs = getStrFromParentsOf(uid);
  log(level, " --- level");
  if (level === 0) {
    return [];
  }
  return strs.slice(-1 * level);
};

const BLOCK_CLASS_NAME = "rm-block-ref";
const BLOCK_REF_ATTRIBUTE_NAME = "data-uid";
/**
 *
 * block struction:
 *
 * - the uid of block where the expanded block was on
 *  - expanded block ref:
 *      - up level
 *      - down level
 */
const BLOCK_REFERENCE_CONFIG_PAGE = "roam/reference extends/config";

const EVERY_BLOCK_HAS_ATRRIBUTE = "data-page-links";

type RefInfo = {
  refUid: string;
  up: number;
  down: number;
};

type BlockConfig = {
  uid: string;
  string: string;
  children: BlockConfig[];
};

type BlockWithLevelStructure = {
  title: string;
  uid: string;
  children: BlockConfig[];
};

const getLevelStringBy = (level: number): string => {
  if (level == 0) {
    return `[*]`;
  }

  return `[* {:block/children ${getLevelStringBy(level - 1)}}] `;
};

// FIXME: for now it just fixed in level 3
const getBlockWithLevelStructureByPageTitle = (
  title: string,
  level = 3
): BlockWithLevelStructure | undefined => {
  const result = window.roamAlphaAPI.q(
    `[
      :find
        (pull ?e ${getLevelStringBy(level)})
      :where
      [?e :node/title "${title}"]
    ]`
  ) as unknown as BlockWithLevelStructure[][];

  if (result?.length) {
    return result[0][0];
  }
};

const getAllBlockConfig = (): BlockWithLevelStructure["children"] => {
  const result = getBlockWithLevelStructureByPageTitle(
    BLOCK_REFERENCE_CONFIG_PAGE
  );
  return result?.children;
};

type BlockRefType = {
  uid: string;
  blockUid: string;
  el?: HTMLElement;
};

const getRefUidFromSpan = (span: HTMLElement) => {
  return span.getAttribute(BLOCK_REF_ATTRIBUTE_NAME);
};

// the blocks on the screen, and not just in roam-article
const findAllBlockReferences = (dom: HTMLElement): BlockRefType[] => {
  const blockrefs = dom.querySelectorAll(`span.${BLOCK_CLASS_NAME}`);
  return [...blockrefs].map((spanEl: HTMLElement) => {
    log(spanEl, spanEl.closest(`[${EVERY_BLOCK_HAS_ATRRIBUTE}]`), "target");
    return {
      el: spanEl,
      uid: getRefUidFromSpan(spanEl),
      blockUid: queryBlockDomFromRefDom(spanEl),
    };
  });
};

const isEqual = (a: unknown, b: unknown) => {
  return String(a) === String(b);
};

// TODO: avoid [*]((()))

type ExpandInfo = {
  up: string;
  uid: string;
  //   down: string;
};

const getBlockConfigFromConfig = (
  info: BlockRefType,
  config: BlockConfig[]
): ExpandInfo | undefined => {
  const found = config.find((item) => isEqual(item.string, info.blockUid));
  if (found) {
    const refConfig = found.children.find((item) =>
      isEqual(item.string, info.uid)
    );
    log(found, refConfig, " ---@");
    return {
      up: refConfig.children[0].string,
      uid: refConfig.children[0].uid,
      //   down: refConfig.children[1].string,
    };
  }
};

const refreshBlockByUid = (uid: string) => {
  const doms = queryBlockDomByUid(uid);
  doms.forEach((dom) => {
    refreshBlockRefStatusOnDom(dom as HTMLElement);
  });
};
let config: BlockWithLevelStructure["children"];
const readConfig = () => {
  config = getAllBlockConfig()
}
const refreshBlockRefStatusOnDom = (dom: HTMLElement) => {
  const blockRefs = findAllBlockReferences(dom);
  log(blockRefs, " -- refs", dom);
  config &&
    blockRefs.forEach((item) => {
      const refConfig = getBlockConfigFromConfig(item, config);
      log(refConfig, item, config, " = ref config");
      if (!refConfig) {
        return;
      }
      renderBlock(item, refConfig);
    });
};

const refreshPageBlockRefStatus = () => {
  refreshBlockRefStatusOnDom(document.body);
};

const ensureConfigBlock = async (config: BlockRefType): Promise<string> => {
  try {
    const uid = await createOrGetPageByName(BLOCK_REFERENCE_CONFIG_PAGE);

    const blockUidBlockUid = await createOrGetBlockByTextInParentUid(
      config.blockUid,
      uid
    );
    const refUidblockUid = await createOrGetBlockByTextInParentUid(
      config.uid,
      blockUidBlockUid
    );
    const upBlockUid = await createOrgetBlockChildrenByUid(refUidblockUid, "0");

    log(refUidblockUid, "refUidblockUid", upBlockUid);
    return upBlockUid;
  } catch (e) {
    console.error(e);
  }
};

const updateBlockTextByUid = (text: string, uid: string) => {
  window.roamAlphaAPI.updateBlock({
    block: {
      uid,
      string: text,
    },
  });
};

class BlockReferenceExpander {
  config: BlockRefType;
  valueBlockUid: string;
  maxLevel: number;

  constructor(config: BlockRefType) {
    this.config = config;
    this._init();
  }

  private async _init() {
    this.valueBlockUid = await ensureConfigBlock(this.config);
    this.maxLevel = await getBlockParentsLevel(this.config.uid);
  }

  private update(nextValue: number) {
    nextValue = Math.max(0, nextValue);
    nextValue = Math.min(this.maxLevel, nextValue);

    updateBlockTextByUid(nextValue + "", this.valueBlockUid);

    setTimeout(() => {
      renderBlock(
        { blockUid: this.config.blockUid, uid: this.config.uid },
        { up: nextValue + "", uid: this.valueBlockUid }
      );
    });
  }

  expandUp() {
    // write it to block
    log("expandup");
    const value = getBlockTextByUid(this.valueBlockUid) || 0;
    const nextValue = +value + 1;
    this.update(nextValue);
  }

  expandUpAll() {
    this.update(Number.MAX_SAFE_INTEGER);
  }

  reset() {
    this.update(0);
  }

  expandDown() {
    const value = getBlockTextByUid(this.valueBlockUid) || 0;
    const nextValue = +value - 1;
    this.update(nextValue);
  }
}

const isHoverBlockReference = (e: HTMLElement): boolean => {
  return e.className?.includes?.(BLOCK_CLASS_NAME);
};

const getBlockRefIdFromSpan = (e: { target: HTMLSpanElement }) => {
  return e.target.getAttribute(BLOCK_REF_ATTRIBUTE_NAME);
};

const getBlockParentsLevel = (uid: string): number => {
  return window.roamAlphaAPI.q(
    `[:find ?e :where [?b :block/uid "${uid}"] [?b :block/parents ?p] [?p :block/uid ?e]]`
  ).length;
};

const queryBlockDomByUid = (uid: string) =>
  document.querySelectorAll(`[id$="${uid}"]`);

const renderBlock = async (
  blockRefType: BlockRefType,
  expandInfo: ExpandInfo
) => {
  console.log(` render block`);
  const update = () => {
    const els = queryBlockDomByUid(blockRefType.blockUid);
    const refString = getBlockTextByUid(blockRefType.uid);
    const { up } = expandInfo;
    const lookupStr = lookupStrByBlockUid(blockRefType.uid, Number(up)).map(
      (s, index) => {
        return `<span class="rm-expand-item rm-expand-level-${index}">${s} <span>></span> </span>`;
      }
    );
    els.forEach((el) => {
      const targetEl = el.querySelector(`.${BLOCK_CLASS_NAME}`) as HTMLElement;
      if (targetEl.querySelector(".extended")) {
        targetEl.removeChild(targetEl.querySelector(".extended"));
      }

      const fragment = document.createElement("span");
      fragment.className = "extended";
      lookupStr.forEach((str) => {
        const span = document.createElement("span");
        span.innerHTML = str;
        fragment.appendChild(span);
      });
      targetEl.insertBefore(fragment, targetEl.firstChild);
    });
  };
  update();
};

const mountMenu = (config: BlockRefType) => {
  const blockreferenceExpander = new BlockReferenceExpander(config);
  function App() {
    const [show, setShow] = useState(0);
    return (
      <MenuItem
        active={false}
        tagName="span"
        icon="arrows-vertical"
        text="Expand Reference"
        popoverProps={{
          isOpen: [undefined, undefined, false][show],
          onClose(event) {
            // console.log("close");
            if (show === 0) {
              setShow(2);
            }
          },
          onInteraction(nextOpenState, e?) {
            // console.log("next-", nextOpenState, show);
            if (show === 2) {
              setShow(1);
            }
          },
        }}
      >
        <MenuItem
          icon="expand-all"
          text="Full Path"
          onClick={() => blockreferenceExpander.expandUpAll()}
        />
        <MenuItem
          icon="collapse-all"
          text="Restore"
          onClick={() => blockreferenceExpander.reset()}
        />
        <MenuItem
          icon="small-plus"
          text="Up 1 level"
          onClick={() => blockreferenceExpander.expandUp()}
        />
        <MenuItem
          icon="small-minus"
          text="Down 1 level"
          onClick={() => blockreferenceExpander.expandDown()}
        />
      </MenuItem>
    );
  }
  return ReactDOM.render(<App />, config.el);
};

const isRefMenu = (dom: HTMLElement): boolean => {
  return (
    dom.querySelector(".bp3-fill.bp3-text-overflow-ellipsis")?.innerHTML ===
    "Jump to block"
  );
};

const EXPAND_EL_CLASS_NAME = "expand-references";
let mounted = false;

const observeRefMenuOpen = () => {
  let info: BlockRefType;
  const observer = createOverlayObserver((mutations) => {
    mutations.find((mutation) => {
      const li = mutation.target as HTMLElement;
      if (isRefMenu(li) && !mounted) {
        log("ahahah");
        mounted = true;
        const menuEl = li.querySelector(".bp3-menu");
        if (!menuEl || menuEl.querySelector(`.${EXPAND_EL_CLASS_NAME}`)) {
          return;
        }
        const liAnchor = document.createElement("section");
        liAnchor.className = EXPAND_EL_CLASS_NAME;
        menuEl.insertBefore(liAnchor, menuEl.lastElementChild);
        setTimeout(() => {
          mountMenu({
            ...info,
            el: liAnchor,
          });
        });
      }
    });
  });
  const roamApp = document.querySelector(".roam-app");
  const fn = (_e: Event) => {
    const e = _e as any as MouseEvent;
    // prevent the browser's native context menu
    e.preventDefault();
    let target = e.target as HTMLElement;
    if (!isHoverBlockReference(target)) {
      return;
    }

    const uid = getRefUidFromSpan(e.target as HTMLElement);

    log("eee----2 ", uid, e.target);
    if (!uid) {
      return;
    }
    info = {
      uid,
      blockUid: queryBlockDomFromRefDom(target),
    };
  };

  roamApp.addEventListener("mouseover", fn);
  return () => {
    roamApp.removeEventListener("mouseover", fn);
    observer.disconnect();
  };
};

function MenuMain() {
  log("init preview for block references");
  readConfig();
  refreshPageBlockRefStatus();
  const unsubInputChange = observeInputChange();
  const unsubRouteChange = onRouteChange(() =>
    { 
      readConfig()
      refreshBlockRefStatusOnDom(document.body) }
  );
  const unsubRefMenuOpen = observeRefMenuOpen();
  return () => {
    unsubInputChange();
    unsubRouteChange();
    unsubRefMenuOpen();
  };
}

function onBlockInput() {
  const selectorStr = '[id^="block-input"]';
  const pendingUids = new Map<string, number>();
  let running = false
  function start() {
    running = true
    if(
      pendingUids.size > 0
    ) {
      const uid = [...pendingUids.keys()][0];
      refreshBlockByUid(uid);
      pendingUids.delete(uid);
      requestAnimationFrame(start);
      return
    } 
    running = false
  }
  let idleId = requestAnimationFrame(start);

  const onBlockInputArrive = (e: HTMLElement) => {
    pendingUids.set(e.getAttribute("id").slice(-9), 1);
     if (running) {
       return;
     }
    readConfig();

    start()

  };

  const onBlockInputLeave = (e: HTMLElement) => {
    const uid = e.getAttribute("id").slice(-9);
    pendingUids.delete(uid);
  };

  return () => {
    document.arrive(selectorStr, onBlockInputArrive);
    document.leave(selectorStr, onBlockInputLeave);
    return () => {
      document.unbindArrive(selectorStr, onBlockInputArrive);
      document.unbindLeave(selectorStr, onBlockInputLeave);
      cancelIdleCallback(idleId);
    };
  };
}

function observeInputChange() {
  let blockUid = "";
  const id = "textarea.rm-block-input";
  const onLeave = () => {
    let id = blockUid;
    setTimeout(() => {
      refreshBlockByUid(id);
    }, 0);
  };
  const onArrive = () => {
    blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
  };

  document.leave(id, onLeave);
  document.arrive(id, onArrive);
  const onMountElLeave = () => {
    mounted = false;
  };
  document.leave(`.${EXPAND_EL_CLASS_NAME}`, onMountElLeave);
  const unsubBlockInput = onBlockInput()();
  return () => {
    document.unbindLeave(id, onArrive);
    document.unbindLeave(id, onLeave);
    unsubBlockInput();
    document.unbindLeave(`.${EXPAND_EL_CLASS_NAME}`, onMountElLeave);
  };
}

export function init(extensionAPI: RoamExtensionAPI) {
  extension_helper.on_uninstall(MenuMain());
}
