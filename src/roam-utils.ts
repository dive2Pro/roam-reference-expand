const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createPageByTitle = async (title: string) => {
  try {
    let uid = window.roamAlphaAPI.q(`
    [
      :find [?id ...]
      :where
        [?b :block/string ?s]
        [?b :block/uid ?id]
        [(clojure.string/blank? ?s )]
    ]
`)?.[0] as unknown as string;
    const page = title;

    if (uid) {
      window.roamAlphaAPI.updateBlock({
        block: { string: `[[${page}]]`, uid: uid },
      });
    } else {
      uid = generateId();
      const todayUid = window.roamAlphaAPI.util.dateToPageUid(new Date());
      window.roamAlphaAPI.createBlock({
        location: { "parent-uid": todayUid, order: 10000 },
        block: { string: `[[${page}]]`, uid },
      });
    }

    await delay(10);
    window.roamAlphaAPI.updateBlock({ block: { uid: uid, string: "" } });
  } catch (e) {}
};

const createPage = async (title: string) => {
  try {
    // await window.roamAlphaAPI.createPage({ page: { title: title } });
    await createPageByTitle(title)
  } catch (e) {}
};
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";

export const generateId = () => {
  return window.roamAlphaAPI.util.generateUID();
};

export const createOrGetPageByName = async (title: string): Promise<string> => {
  await createPage(title);
  return getPageUidByPageTitle(title);
};

export const createOrgetBlockChildrenByUid = async (
  uid: string,
  defaultText = ""
): Promise<string> => {
  const result = await window.roamAlphaAPI.q(`
    [
    :find [?e]
    :where
    [?b :block/uid "${uid}"]
    [?b :block/children ?cr]
    [?cr :block/uid ?e]
    ]
`);
  if (result) {
    return result[0] as any as string;
  }
  return await createOrGetBlockByTextInParentUid(defaultText, uid);
};

export const createOrGetBlockByTextInParentUid = async (
  text: string,
  uid: string
) => {
  const result = await window.roamAlphaAPI.q(`
    [
        :find [?e]
        :where
        [?b :block/uid "${uid}"]
        [?b :block/children ?cr]
        [?cr :block/string ?crs]
        [(= ?crs "${text}")]
        [?cr :block/uid ?e]
    ]
`);
  if (result) {
    return result[0] as any as string;
  }
  const _id = generateId();
  await window.roamAlphaAPI.createBlock({
    block: {
      uid: _id,
      string: text,
    },
    location: {
      "parent-uid": uid,
      order: Number.MAX_SAFE_INTEGER,
    },
  });
  return _id;
};

export const onRouteChange = (cb: () => void) => {
  const onhashchange = window.onhashchange?.bind(window);

  window.onhashchange = (evt) => {
    onhashchange?.call(window, evt);
    setTimeout(() => {
      cb();
    }, 200);
  };
  return () => {
    window.onhashchange = onhashchange;
  };
};

export const getPagesBaseonString = async (str: string) => {
  const result = await window.roamAlphaAPI.q(`
 [
  :find ?title:name ?title:uid ?time:date
  :where 
  [?page :node/title ?title:name]
  [?page :block/uid ?title:uid]
  [?page :edit/time ?time:date]
  [(clojure.string/starts-with? ?title:name "${str}")]] 
  `);
  return result as [string, string][];
};

export const getCurrentPageUid = async () => {
  const blockOrPageUid =
    await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
  let pageUid = (await window.roamAlphaAPI.q(
    `[
      :find [?e]
      :in $ ?id
      :where
        [?b :block/uid ?id]
        [?b :block/page ?p]
        [?p :block/uid ?e]
      ]
      `,
    blockOrPageUid
  )?.[0]) as unknown as string;

  return pageUid || blockOrPageUid;
};

export async function openPageByTitle(title: string) {
  await createPage(title);

  window.roamAlphaAPI.ui.mainWindow.openPage({
    page: { title: title },
  });
}

export const getBlockTextByUid = (uid: string) => {
  const [result] = window.roamAlphaAPI.q(
    `[:find [?e] :where [?b :block/uid "${uid}"] [?b :block/string ?e]]`
  );
  return (result as any as string) || "";
};
