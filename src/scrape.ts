import { chromium, type Page, type Browser } from "playwright";
import fs from "node:fs/promises";

interface ScrapeOptions {
  usernameToScrape: string;
  lastSeenPostId: string;
}

async function login(page: Page) {
  await page
    .getByRole("link", { name: /Log in/i })
    .first()
    .click();
  await page.getByLabel("Phone number, username, or").click();
  await page.getByLabel("Phone number, username, or").fill(LOGIN_INFO.username);
  await page.getByLabel("Phone number, username, or").press("Tab");
  await page.getByLabel("Password").fill(LOGIN_INFO.password);
  await page.getByLabel("Password").press("Enter");
  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForLoadState("networkidle");
}

async function getPhotos(page: Page, postUrl: string) {
  await page.locator(`a[href="${postUrl}"]`).click();
  const currentPostId = postUrl.split("/p/")[1].split("/")[0];
  const photosThisPost: string[] = [];
  const caption = await page.locator('[role="dialog"] h1').innerText();
  let newPhotos = [];
  do {
    const allPhotoUrls = await Promise.all(
      (
        await page.locator('[role="dialog"] img[alt^="Photo by"]').all()
      ).map((p) => p.getAttribute("src"))
    );
    newPhotos = allPhotoUrls.filter(
      (p) => p && photosThisPost.indexOf(p) === -1
    ) as string[];
    console.log("new photos", newPhotos);
    photosThisPost.push(...newPhotos);
    try {
      await page
        .getByRole("article")
        .getByLabel("Next")
        .click({ delay: 100, timeout: 300 });
    } catch (err) {
      console.log("No next button found, breaking");
      break;
    }
  } while (newPhotos.length > 0);
  await page.getByRole("button", { name: "Close" }).click();

  return {
    currentPostId,
    photosThisPost,
    caption,
  };
}

async function scrape(browser: Browser, options: ScrapeOptions) {
  const page = await browser.newPage();
  await page.goto(`https://www.instagram.com/${options.usernameToScrape}/`);
  await page.waitForLoadState("networkidle");
  await login(page);
  const runData = {
    posts: [] as {
      postId: string;
      photosThisPost: string[];
      caption: string;
    }[],
    lastSeenPostId: options.lastSeenPostId,
  };
  const postUrls = (
    await Promise.all(
      (
        await page.locator('a[href^="/p"]').all()
      ).map((el) => el.getAttribute("href"))
    )
  ).filter(Boolean) as string[];
  console.log("post urls", postUrls);
  const lastSeenIx = postUrls.findIndex((href) =>
    href.includes(options.lastSeenPostId)
  );
  console.log(
    "found last seen index",
    lastSeenIx,
    "in",
    postUrls.length,
    "posts"
  );
  console.log(postUrls);
  const newPosts = lastSeenIx === -1 ? postUrls : postUrls.slice(0, lastSeenIx);

  for (const postUrl of newPosts) {
    const { currentPostId, photosThisPost, caption } = await getPhotos(
      page,
      postUrl
    );
    runData.lastSeenPostId = currentPostId;
    runData.posts.push({
      postId: currentPostId,
      photosThisPost,
      caption,
    });
  }
  console.log(runData);
  return runData;
}

const LOGIN_INFO = {
  username: process.env.INSTAGRAM_USERNAME!,
  password: process.env.INSTAGRAM_PASSWORD!,
};

interface Account {
  usernameToScrape: string;
  webhookUrl: string;
}

async function postToSlack(
  webhookUrl: string,
  post: { caption: string; postId: string }
) {
  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `${post.caption}\nhttps://www.instagram.com/p/${post.postId}/`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${post.caption}\n<https://www.instagram.com/p/${post.postId}/|view on instagram>`,
          },
        },
      ],
    }),
  });
}

async function scrapeAndPostToSlack(browser: Browser, account: Account) {
  const lastRun: string = JSON.parse(
    await fs.readFile(`./data/${account.usernameToScrape}.json`, "utf-8")
  ).lastSeenPostId;
  if (!lastRun) {
    console.log(`No last run found for ${account.usernameToScrape}, skipping`);
    return;
  }
  const results = await scrape(browser, {
    usernameToScrape: account.usernameToScrape,
    lastSeenPostId: lastRun,
  });
  await fs.writeFile(
    `./data/${account.usernameToScrape}.json`,
    JSON.stringify(results, null, 2),
    { encoding: "utf-8" }
  );

  await Promise.all(
    results.posts.map((post) => postToSlack(account.webhookUrl, post))
  );
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const accounts = JSON.parse(
    await fs.readFile("./data/accounts.json", "utf-8")
  );
  for (const account of accounts) {
    await scrapeAndPostToSlack(browser, account);
  }
  await browser.close();
}

main();
