import { hashPin, verifyPin } from "./pin.js";

const pin = "1234";
const stored = hashPin(pin);
console.log("Generated:", stored);

const ok = verifyPin("1234", stored);
console.log("Verify OK:", ok);

const bad = verifyPin("9999", stored);
console.log("Verify BAD:", bad);


