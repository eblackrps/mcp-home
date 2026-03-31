import dotenv from "dotenv";
import { startStdio } from "./transports/stdio.js";

dotenv.config();

startStdio().catch((error) => {
  console.error(error);
  process.exit(1);
});
