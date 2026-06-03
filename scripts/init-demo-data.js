import { createDb } from "../src/db.js";
import { createCardService } from "../src/cardService.js";
import { createSettingsService } from "../src/settingsService.js";

const db = createDb("./data/sms-mineapi.sqlite");
const service = createCardService({
  db,
  defaultDurationDays: 25,
  smsFetchTimeoutMs: 10000,
  fetchImpl: fetch
});
const settings = createSettingsService({
  db,
  fallbackAdminPassword: "Minier123"
});

db.prepare("DELETE FROM codes").run();
db.prepare("DELETE FROM cards").run();

service.createCard({
  cardKey: "TEST-OPEN-ARTIVIS",
  phoneNumber: "+10000000001",
  smsApiUrl: "http://localhost:7060/demo-sms",
  durationHours: 600,
  downstreamName: "Open Artivis Demo"
});

await settings.updateSettings({
  logoName: "SMS.MineApi",
  simName: "MINE SIM",
  footerCopyright: "SMS.MineApi.eu.cc | Powered By <b>Open Artivis</b>",
  systemName: "物理卡接码系统",
  adminTitle: "SMSMineAPI 物理卡接码系统",
  adminPassword: "Minier123"
});

db.close();
console.log("Demo data initialized: TEST-OPEN-ARTIVIS / Minier123");
