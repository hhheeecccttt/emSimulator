import { SimObject } from "../SimObject.js";
import { registerType } from "../ObjectRegistry.js";

export class staticPositiveCharge extends SimObject {
  static id = "staticPositiveCharge";
  static label = "Static Positive Charge";
  static ghostColor = 0xff0000;
  static modelUrl = "./src/models/positiveCharge.glb";
  static chargeType = "positive";
  static isStatic = true;

  constructor(position) {
    super();
    if (position) this.mesh.position.copy(position);
  }
}
registerType(staticPositiveCharge);
