import { sign } from '@telegram-apps/init-data-node';
import fs from 'fs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) process.exit(2);

const user = { id: 8013482840, first_name: 'Debra', last_name: 'Leong', language_code: 'en', allows_write_to_pm: true };

const p = new URLSearchParams();
p.set('user', JSON.stringify(user));
p.set('auth_date', String(Math.floor(Date.now()/1000)));

const init = p.toString();
const hash = sign(init, token);

fs.writeFileSync('/tmp/initdata.txt', init + '&hash=' + hash);
