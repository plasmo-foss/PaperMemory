var paperTitles = {};
var titleUpdates = {};

const knownPageHasUrl = (url) => {
    const pdfPages = Object.values(global.knownPaperPages).map((v) => v.reverse()[0]);
    return pdfPages.some((p) => url.includes(p));
};

const isPdf = (url) => {
    return url.endsWith(".pdf") || url.includes("openreview.net/pdf");
};

const fetchPWCId = async (arxivId, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxivId) {
        pwcPath += new URLSearchParams({ arxiv_id: arxivId });
    } else if (title) {
        pwcPath += new URLSearchParams({ title });
    }
    const json = await $.getJSON(pwcPath);

    if (json["count"] !== 1) return;
    return json["results"][0]["id"];
};

const findCodesForPaper = async (request) => {
    let arxivId, title;
    if (request.paper.source === "arxiv") {
        arxivId = request.paper.id.split("-").reverse()[0];
    } else {
        title = request.paper.title;
    }
    const pwcId = await fetchPWCId(arxivId, title);

    if (!pwcId) return;

    const codePath = `https://paperswithcode.com/api/v1/papers/${pwcId}/repositories/`;

    const response = await fetch(codePath);
    console.log("codePath: ", codePath);
    const json = await response.json();

    if (json["count"] < 1) return;

    let codes = json["results"];
    const officials = codes.filter((c) => c["is_official"]);
    console.log("All codes for paper:", codes);
    if (officials.length > 0) {
        codes = officials;
        console.log("Selecting official codes only:", codes);
    }
    codes.sort((a, b) => b.stars - a.stars);
    return codes[0];
};

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === "update-title") {
        console.log("Background message options:");
        console.log({ options: request.options });
        const { title, url } = request.options;
        paperTitles[url] = title.replaceAll('"', "'");
    } else if (request.type === "tabID") {
        sendResponse({ tabID: sender.tab.id, success: true });
        return true;
    } else if (request.type === "papersWithCode") {
        findCodesForPaper(request).then((code) => {
            console.log("Discovered code:", code);
            sendResponse({
                codeLink: code.url,
                success: true,
            });
        });
        return true;
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const paperTitle = paperTitles[tab.url];
    if (!titleUpdates.hasOwnProperty(tabId)) titleUpdates[tabId] = 0;
    if (titleUpdates[tabId] > 9) {
        if (titleUpdates[tabId] == 10) {
            console.log(
                "WARNING: max number of title titleUpdates reached. This is a logic failure in PaperMemory. Please open an issue at https://github.com/vict0rsch/PaperMemory"
            );
            titleUpdates[tabId] += 1;
        }
        return; // in case of logic failure on different browsers, prevent infinite loop
    }
    if (
        paperTitle && // title from content_script message is set
        changeInfo.title && // change is about title
        !knownPageHasUrl(changeInfo.title) && // ignore event triggered by `document.title=''` which sets title to url
        changeInfo.title !== paperTitle && // there is a new title
        isPdf(tab.url) // only valid for pdfs
    ) {
        console.log(`Updating pdf file name to "${paperTitle}"`);

        // https://stackoverflow.com/questions/69406482/window-title-is-not-changed-after-pdf-is-loaded
        chrome.tabs.executeScript(tabId, {
            code: `document.title=''; document.title="${paperTitle}"`,
            runAt: "document_start",
        });
        titleUpdates[tabId] += 1;
    }
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    // https://stackoverflow.com/a/50548409/3867406
    // read changeInfo data and do something with it
    // like send the new url to contentscripts.js
    if (changeInfo.url) {
        chrome.tabs.sendMessage(tabId, {
            message: "hello!",
            url: changeInfo.url,
        });
    }
});
