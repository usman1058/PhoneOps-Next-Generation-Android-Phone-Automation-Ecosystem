import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const DEVICE_ID = "d94998b3-3c44-48d0-a36b-dd759700c942";

// every 15 seconds
const body = JSON.stringify({
  name: "Scheduled Test",
  deviceId: DEVICE_ID,
  steps: [{ action: "home" }],
  schedule: "*/15 * * * * *",
});
const r = await fetch(`${BASE}/api/tasks`, { method: "POST", headers: H, body });
const task = await r.json();
console.log("create scheduled task:", r.status, task.id);
if (r.status !== 201) process.exit(1);

let seenScheduleRun = false;
for (let i = 0; i < 16; i++) {
  await new Promise((res) => setTimeout(res, 5000));
  const runs = await (await fetch(`${BASE}/api/tasks/${task.id}/runs`, { headers: H })).json();
  const schedRuns = runs.filter((run) => run.triggeredBy === "schedule");
  if (schedRuns.length > 0) {
    seenScheduleRun = true;
    console.log("schedule run detected after", (i + 1) * 5, "s");
    for (const run of schedRuns) {
      console.log(`  run ${run.status} triggeredBy=${run.triggeredBy} results=${JSON.stringify(run.stepResults)}`);
    }
    break;
  }
  console.log(`poll ${(i + 1) * 5}s: ${runs.length} run(s), none scheduled yet`);
}

// cleanup
const del = await fetch(`${BASE}/api/tasks/${task.id}`, { method: "DELETE", headers: H });
console.log("cleanup delete:", del.status);
process.exit(seenScheduleRun ? 0 : 1);
