import { extension_helper } from "./helper";
require("arrive");
import {
  createOrGetBlockByTextInParentUid,
  createOrgetBlockChildrenByUid,
  createOrGetPageByName,
  getBlockTextByUid,
  onRouteChange,
} from "./roam-utils";
import { queryBlockDomFromRefDom } from "./roam-dom";
import { BlockRefContext } from "roam-types";

const log = (...args: any[]) => {
  if (logEnabled) console.log(...args);
};

const logEnabled = false;

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
const readConfig = debounce(() => {
  config = getAllBlockConfig();
}, 250);
const refreshBlockRefStatusOnDom = (dom: HTMLElement) => {
  const blockRefs = findAllBlockReferences(dom);
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

  async expandUp() {
    // write it to block
    await this._init();

    log("expandup");
    const value = getBlockTextByUid(this.valueBlockUid) || 0;
    const nextValue = +value + 1;
    this.update(nextValue);
  }

  async expandUpAll() {
    await this._init();
    this.update(Number.MAX_SAFE_INTEGER);
  }

  async reset() {
    await this._init();
    this.update(0);
  }

  async expandDown() {
    await this._init();
    const value = getBlockTextByUid(this.valueBlockUid) || 0;
    const nextValue = +value - 1;
    this.update(nextValue);
  }
}

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
  // console.log(` render block`);
  const update = () => {
    const els = queryBlockDomByUid(blockRefType.blockUid);
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

const commands = [
  {
    label: "Expand Reference: Full Path",
    onClick: async (context: BlockRefContext) => {
      // blockreferenceExpander.expandUpAll();
      new BlockReferenceExpander({
        uid: context["ref-uid"],
        blockUid: context["block-uid"],
      }).expandUpAll();
    },
  },
  {
    label: "Expand Reference: Restore",
    onClick: async (context: BlockRefContext) => {
      new BlockReferenceExpander({
        uid: context["ref-uid"],
        blockUid: context["block-uid"],
      }).reset();
    },
  },
  {
    label: "Expand Reference: Up 1 level",
    onClick: async (context: BlockRefContext) => {
      new BlockReferenceExpander({
        uid: context["ref-uid"],
        blockUid: context["block-uid"],
      }).expandUp();
    },
  },
  {
    label: "Expand Reference: Down 1 level",
    onClick: async (context: BlockRefContext) => {
      new BlockReferenceExpander({
        uid: context["ref-uid"],
        blockUid: context["block-uid"],
      }).expandDown();
    },
  },
];

commands.forEach((command) => {
  window.roamAlphaAPI.ui.blockRefContextMenu.addCommand({
    label: command.label,
    callback: command.onClick,
  });
});

extension_helper.on_uninstall(() => {
  commands.forEach((command) => {
    window.roamAlphaAPI.ui.blockRefContextMenu.removeCommand({
      label: command.label,
    });
  });
});

const EXPAND_EL_CLASS_NAME = "expand-references";
let mounted = false;

function MenuMain() {
  log("init preview for block references");
  readConfig();
  refreshPageBlockRefStatus();
  const unsubInputChange = observeInputChange();

  return () => {
    unsubInputChange();
  };
}

function onBlockInput() {
  const selectorStr = '[id^="block-input"]';
  let pendingUids = new WeakMap<HTMLElement, string>();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          //  console.log(entry.target.id + " 进入视口了", entry.target, pendingUids.get(entry.target as HTMLElement));
          refreshBlockByUid(pendingUids.get(entry.target as HTMLElement));
        }
      });
    },
    {
      threshold: 0.3, // 当元素有10%进入视口时触发
    }
  );

  const onBlockInputArrive = (e: HTMLElement) => {
    pendingUids.set(e, e.getAttribute("id").slice(-9));
    const blockrefs = e.querySelectorAll(`span.${BLOCK_CLASS_NAME}`);
    if (blockrefs.length <= 0) {
      return;
    }
    readConfig();
    observer.observe(e);
  };

  const onBlockInputLeave = (e: HTMLElement) => {
    pendingUids.delete(e);
    observer.unobserve(e);
  };

  return () => {
    document.arrive(selectorStr, onBlockInputArrive);
    document.leave(selectorStr, onBlockInputLeave);
    const unsubRouteChange = onRouteChange(() => {
      pendingUids = new WeakMap();
      readConfig();
      refreshBlockRefStatusOnDom(document.body);
    });
    return () => {
      document.unbindArrive(selectorStr, onBlockInputArrive);
      document.unbindLeave(selectorStr, onBlockInputLeave);
      unsubRouteChange();
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

export function init() {
  extension_helper.on_uninstall(MenuMain());
}
function debounce(fn: Function, delay: number) {
  let timer: any;
  return (...args: any[]) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
