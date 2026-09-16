import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../../../frontend/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js";

const baseURL = process.env.WORDWEAVE_QA_BASE_URL ?? "http://localhost:6020";
const prototypeURL = "http://localhost:6010/prototype/index.html";
const run = process.env.WORDWEAVE_QA_RUN ?? "before";
if (!["before", "after"].includes(run)) throw new Error("Invalid run");
const testedImage = process.env.WORDWEAVE_QA_IMAGE;
if (!testedImage) throw new Error("WORDWEAVE_QA_IMAGE required");
const dir = dirname(fileURLToPath(import.meta.url));
const screenshots = join(dir, "screenshots", "cr024-dialog-spacing-" + run);
mkdirSync(screenshots, { recursive: true });
const checks = [];
const check = (name, actual, expected) => checks.push({
  name, actual, expected, status: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL",
});
async function metrics(page) {
  return page.getByRole("dialog").evaluate(dialog => {
    const fields = [...dialog.querySelectorAll(".field")].map(node => node.getBoundingClientRect());
    const toggle = dialog.querySelector(".switch").getBoundingClientRect();
    const notice = dialog.querySelector(".notice").getBoundingClientRect();
    return {
      fieldGaps: fields.slice(1).map((rect, index) => Math.round(rect.top - fields[index].bottom)),
      switchGap: Math.round(toggle.top - fields.at(-1).bottom),
      noticeGap: Math.round(notice.top - toggle.bottom),
    };
  });
}
const browser = await chromium.launch();
try {
  for (const locale of ["en-US", "zh-CN"]) {
    for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
      const contexts=[];
      try {
        const actual = await browser.newContext({baseURL,locale,viewport});
        contexts.push(actual);
        await actual.addCookies([{name:"wordweave_session",value:"admin",url:baseURL},{name:"wordweave_ui_locale",value:locale,url:baseURL}]);
        const prototype = await browser.newContext({locale,viewport});
        contexts.push(prototype);
        const page=await actual.newPage(), design=await prototype.newPage();
        await page.goto("/admin/models");
        await page.waitForFunction(()=>document.documentElement.dataset.appReady === "true");
        await design.goto(prototypeURL + "?page=PAGE-101&role=admin&state=default&locale=" + locale);
        await design.locator(".prototype-tools").evaluate(node=>{node.style.display="none";});
        for (const mode of ["add","edit"]) {
          const prefix=locale + " " + viewport.width + " " + mode;
          await page.locator(mode==="add"?".page-heading .button-primary":".model-row .button").first().click();
          await design.locator('[data-action="' + mode + '-model"]').first().click();
          check(prefix + " spacing vs prototype", await metrics(page), await metrics(design));
          const axe = await new AxeBuilder({page}).analyze();
          check(prefix + " Axe serious/critical", axe.violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>v.id), []);
          check(prefix + " horizontal overflow", await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)), 0);
          await page.screenshot({path:join(screenshots,"actual-"+mode+"-"+locale+"-"+viewport.width+".png"),fullPage:true});
          await design.screenshot({path:join(screenshots,"prototype-"+mode+"-"+locale+"-"+viewport.width+".png"),fullPage:true});
          await page.getByRole("dialog").locator(".dialog-footer button").first().click();
          await design.getByRole("dialog").locator(".dialog-footer button").first().click();
        }
      } catch(error) {
        checks.push({name:locale+" "+viewport.width+" execution",status:"FAIL",error:String(error)});
      } finally { for(const context of contexts) await context.close(); }
    }
  }
} finally { await browser.close(); }
const failed=checks.filter(c=>c.status==="FAIL");
const result={date:"2026-09-05",agent_name:"qa-quinn",tested_image:testedImage,run,verdict:failed.length?"FAIL":"PASS",totals:{checks:checks.length,passed:checks.length-failed.length,failed:failed.length},checks};
writeFileSync(join(dir,"cr024-dialog-spacing-"+run+"-results.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({verdict:result.verdict,totals:result.totals,failures:failed},null,2));
if(failed.length)process.exitCode=1;
