import { SimObject } from "../SimObject.js";
import { registerType } from "../ObjectRegistry.js";

export class staticNegativeCharge extends SimObject {
  static id = "staticNegativeCharge";
  static label = "Static Negative Charge";
  static ghostColor = 0x0000ff;
  static modelUrl = "./src/models/negativeCharge.glb";
  static chargeType = "negative";
  static isStatic = true;

  constructor(position) {
    super();
    if (position) this.mesh.position.copy(position);
  }
}
registerType(staticNegativeCharge);
