import dotenv from "dotenv";
import { startHttp } from "./transports/http.js";

dotenv.config();

startHttp().catch((error) => {
  console.error(error);
  process.exit(1);
});

