import { DynamicCharge } from "./DynamicCharge.js";
import { registerType } from "../ObjectRegistry.js";

export class positiveCharge extends DynamicCharge {
  static id = "positiveCharge";
  static label = "Positive Charge";
  static ghostColor = 0xff0000;
  static modelUrl = "./src/models/positiveCharge.glb";
  static chargeType = "positive";
  static scale = 0.5;
}
registerType(positiveCharge);
