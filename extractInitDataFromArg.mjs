import { validate } from '@telegram-apps/init-data-node';
import dotenv from 'dotenv';
dotenv.config();

const initDataRaw = process.argv[2];
const botToken = process.env.BOT_TOKEN;

try {
  const result = validate(initDataRaw, botToken);
  console.log('✅ Verified:', result.user);
} catch (err) {
  console.error('❌ Verification failed:', err.message);
}
