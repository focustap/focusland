import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE", msg.text());
});

await page.goto("http://127.0.0.1:4173/#/rooftop-preview", { waitUntil: "networkidle" });
await page.screenshot({ path: "C:/Users/Ben/Documents/GitHub/focusland/tmp/rooftop-title.png", fullPage: true });

await page.keyboard.press("Space");
await page.waitForTimeout(1800);
await page.screenshot({ path: "C:/Users/Ben/Documents/GitHub/focusland/tmp/rooftop-run.png", fullPage: true });

await browser.close();
