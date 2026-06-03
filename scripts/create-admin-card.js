import { readConfig } from "../src/config.js";
import { createDb } from "../src/db.js";
import { createCardService } from "../src/cardService.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));

const config = readConfig();
const db = createDb(config.databasePath);
const service = createCardService({ db, defaultDurationDays: config.defaultDurationDays });

try {
  const card = service.createCard({
    cardKey: args.cardKey,
    phoneNumber: args.phone,
    smsApiUrl: args.api,
    durationDays: args.days ? Number(args.days) : undefined
  });
  console.log(JSON.stringify({
    cardKey: card.cardKey,
    phoneNumber: card.phoneNumber,
    durationDays: card.durationDays,
    status: card.status
  }, null, 2));
} finally {
  db.close();
}
